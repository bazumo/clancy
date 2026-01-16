/**
 * Comprehensive E2E tests for the proxy server
 * Tests all combinations of:
 * - Protocol: HTTP, HTTPS (native TLS), HTTPS (uTLS)
 * - Compression: none, gzip, deflate, br, zstd
 * - Transfer mode: content-length, chunked
 * - SSE streaming
 * - Various body sizes
 *
 * Uses cartesian product to generate all test combinations programmatically.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import http from 'http'
import https from 'https'
import { gzipSync, deflateSync, brotliCompressSync } from 'zlib'
import { ZstdCodec } from 'zstd-codec'
import net from 'net'
import tls from 'tls'
import { spawn, ChildProcess } from 'child_process'
import forge from 'node-forge'
import path from 'path'
import { fileURLToPath } from 'url'
import type { Flow } from '../shared/types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ============================================================================
// Types
// ============================================================================

type Compression = 'none' | 'gzip' | 'deflate' | 'br' | 'zstd'

// Initialize zstd compressor
let zstdSimple: { compress: (data: Uint8Array) => Uint8Array } | null = null
const zstdReady = new Promise<void>((resolve) => {
  ZstdCodec.run((zstd: { Simple: new () => { compress: (data: Uint8Array) => Uint8Array } }) => {
    zstdSimple = new zstd.Simple()
    resolve()
  })
})
type TransferMode = 'content-length' | 'chunked'
type Protocol = 'http' | 'https'

interface TestCase {
  protocol: Protocol
  compression: Compression
  transferMode: TransferMode
  bodySize: number
}

interface ReceivedRequest {
  method: string
  url: string
  headers: http.IncomingHttpHeaders
  body: string
}

// ============================================================================
// Cartesian Product Helper
// ============================================================================

function cartesian<T extends Record<string, unknown[]>>(options: T): Array<{ [K in keyof T]: T[K][number] }> {
  const keys = Object.keys(options) as (keyof T)[]
  const values = keys.map(k => options[k])
  const result: Array<{ [K in keyof T]: T[K][number] }> = []

  function generate(index: number, current: Partial<{ [K in keyof T]: T[K][number] }>) {
    if (index === keys.length) {
      result.push(current as { [K in keyof T]: T[K][number] })
      return
    }
    for (const value of values[index]) {
      generate(index + 1, { ...current, [keys[index]]: value })
    }
  }
  generate(0, {})
  return result
}

// ============================================================================
// Test Infrastructure
// ============================================================================

function generateCert() {
  const pki = forge.pki
  const keys = pki.rsa.generateKeyPair(2048)
  const cert = pki.createCertificate()
  cert.publicKey = keys.publicKey
  cert.serialNumber = '01'
  cert.validity.notBefore = new Date()
  cert.validity.notAfter = new Date()
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1)
  const attrs = [{ name: 'commonName', value: 'localhost' }]
  cert.setSubject(attrs)
  cert.setIssuer(attrs)
  cert.sign(keys.privateKey)
  return {
    key: pki.privateKeyToPem(keys.privateKey),
    cert: pki.certificateToPem(cert)
  }
}

function compress(data: string | Buffer, encoding: Compression): Buffer {
  const buf = typeof data === 'string' ? Buffer.from(data) : data
  switch (encoding) {
    case 'gzip': return gzipSync(buf)
    case 'deflate': return deflateSync(buf)
    case 'br': return brotliCompressSync(buf)
    case 'zstd': {
      if (!zstdSimple) throw new Error('zstd not initialized')
      return Buffer.from(zstdSimple.compress(new Uint8Array(buf)))
    }
    default: return buf
  }
}

// ============================================================================
// Shared State
// ============================================================================

const PROXY_PORT = 19095
let httpTargetPort: number
let httpsTargetPort: number
let httpTargetServer: http.Server
let httpsTargetServer: https.Server
let proxyProcess: ChildProcess | null = null
let receivedRequests: ReceivedRequest[] = []
let currentTlsProvider: 'native' | 'utls' = 'native'

// ============================================================================
// Request Handler (shared by HTTP and HTTPS servers)
// ============================================================================

function createRequestHandler(req: http.IncomingMessage, res: http.ServerResponse) {
  const chunks: Buffer[] = []
  req.on('data', (chunk) => chunks.push(chunk))
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf-8')
    const url = new URL(req.url || '/', 'http://localhost')
    const params = url.searchParams

    receivedRequests.push({
      method: req.method || 'GET',
      url: req.url || '/',
      headers: req.headers,
      body
    })

    const compression = (params.get('compression') || 'none') as Compression
    const transferMode = (params.get('transfer') || 'content-length') as TransferMode
    const responseSize = parseInt(params.get('size') || '0')
    const isSSE = params.get('sse') === 'true'
    const sseCount = parseInt(params.get('sseCount') || '3')

    if (isSSE) {
      // Build SSE body with multiple events
      let sseBody = ''
      for (let i = 1; i <= sseCount; i++) {
        sseBody += `event: message\ndata: {"count":${i},"total":${sseCount}}\n\n`
      }

      const headers: http.OutgoingHttpHeaders = {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }

      // Support compression for SSE
      if (compression !== 'none') {
        const compressedBody = compress(sseBody, compression)
        headers['Content-Encoding'] = compression

        // Check if chunked transfer is requested
        if (transferMode === 'chunked') {
          headers['Transfer-Encoding'] = 'chunked'
          res.writeHead(200, headers)
          // Send compressed data in chunks (simulating real-world chunked + compressed SSE)
          const chunkSize = Math.max(1, Math.ceil(compressedBody.length / 3))
          let offset = 0
          const sendChunk = () => {
            if (offset < compressedBody.length) {
              res.write(compressedBody.slice(offset, offset + chunkSize))
              offset += chunkSize
              setImmediate(sendChunk)
            } else {
              res.end()
            }
          }
          sendChunk()
        } else {
          headers['Content-Length'] = compressedBody.length
          res.writeHead(200, headers)
          res.end(compressedBody)
        }
      } else {
        // Uncompressed - stream events
        res.writeHead(200, headers)
        let count = 0
        const interval = setInterval(() => {
          count++
          res.write(`event: message\ndata: {"count":${count},"total":${sseCount}}\n\n`)
          if (count >= sseCount) {
            clearInterval(interval)
            res.end()
          }
        }, 20)
      }
      return
    }

    let responseBody: string
    if (url.pathname === '/echo') {
      responseBody = JSON.stringify({
        method: req.method,
        path: url.pathname,
        receivedBody: body,
        receivedBodyLength: body.length
      })
    } else if (params.has('size')) {
      responseBody = 'x'.repeat(responseSize)
    } else {
      responseBody = JSON.stringify({ ok: true, path: url.pathname })
    }

    const compressedBody = compress(responseBody, compression)
    const headers: http.OutgoingHttpHeaders = {
      'Content-Type': responseBody.startsWith('{') ? 'application/json' : 'text/plain'
    }

    if (compression !== 'none') {
      headers['Content-Encoding'] = compression
    }

    if (transferMode === 'chunked') {
      headers['Transfer-Encoding'] = 'chunked'
    } else {
      headers['Content-Length'] = compressedBody.length
    }

    res.writeHead(200, headers)

    if (transferMode === 'chunked') {
      const chunkSize = Math.max(1, Math.ceil(compressedBody.length / 3))
      let offset = 0
      const sendChunk = () => {
        if (offset < compressedBody.length) {
          res.write(compressedBody.slice(offset, offset + chunkSize))
          offset += chunkSize
          setImmediate(sendChunk)
        } else {
          res.end()
        }
      }
      sendChunk()
    } else {
      res.end(compressedBody)
    }
  })
}

// ============================================================================
// Proxy Management
// ============================================================================

async function startProxy(tlsProvider: 'native' | 'utls'): Promise<void> {
  if (proxyProcess) {
    proxyProcess.kill('SIGTERM')
    await new Promise(resolve => setTimeout(resolve, 500))
    proxyProcess = null
  }

  currentTlsProvider = tlsProvider

  return new Promise((resolve, reject) => {
    const tsxPath = path.join(__dirname, '..', 'node_modules', '.bin', 'tsx')
    const serverPath = path.join(__dirname, 'index.ts')

    proxyProcess = spawn(tsxPath, [serverPath, '-p', String(PROXY_PORT), '-t', tlsProvider], {
      cwd: path.join(__dirname, '..'),
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let started = false
    proxyProcess.stdout?.on('data', (data) => {
      if (!started && data.toString().includes('Claudeoscope proxy running')) {
        started = true
        setTimeout(resolve, 300)
      }
    })

    proxyProcess.stderr?.on('data', () => {})

    setTimeout(() => {
      if (!started) reject(new Error('Proxy failed to start'))
    }, 10000)
  })
}

// ============================================================================
// HTTP Clients
// ============================================================================

interface RequestOptions {
  method?: string
  path?: string
  query?: Record<string, string>
  headers?: Record<string, string>
  body?: string
  timeout?: number
}

interface Response {
  status: number
  headers: http.IncomingHttpHeaders
  body: string
}

async function makeHttpRequest(options: RequestOptions = {}): Promise<Response> {
  const { method = 'GET', path = '/', query = {}, headers = {}, body, timeout = 10000 } = options
  const queryStr = Object.entries(query).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
  const fullPath = queryStr ? `${path}?${queryStr}` : path
  const targetUrl = `http://localhost:${httpTargetPort}${fullPath}`

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(`Timeout`)), timeout)

    const req = http.request({
      hostname: 'localhost',
      port: PROXY_PORT,
      path: targetUrl,
      method,
      headers: { ...headers, Host: `localhost:${httpTargetPort}` }
    }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => {
        clearTimeout(timeoutId)
        resolve({
          status: res.statusCode || 500,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf-8')
        })
      })
    })

    req.on('error', (err) => {
      clearTimeout(timeoutId)
      reject(err)
    })

    if (body) req.write(body)
    req.end()
  })
}

async function makeHttpsRequest(options: RequestOptions = {}): Promise<Response> {
  const { method = 'GET', path = '/', query = {}, headers = {}, body, timeout = 10000 } = options
  const queryStr = Object.entries(query).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
  const fullPath = queryStr ? `${path}?${queryStr}` : path

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(`Timeout`)), timeout)

    const connectReq = http.request({
      hostname: 'localhost',
      port: PROXY_PORT,
      method: 'CONNECT',
      path: `localhost:${httpsTargetPort}`
    })

    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        clearTimeout(timeoutId)
        reject(new Error(`CONNECT failed: ${res.statusCode}`))
        return
      }

      const tlsSocket = tls.connect({ socket, rejectUnauthorized: false, servername: 'localhost' })

      tlsSocket.on('secureConnect', () => {
        let httpReq = `${method} ${fullPath} HTTP/1.1\r\n`
        httpReq += `Host: localhost:${httpsTargetPort}\r\n`
        for (const [k, v] of Object.entries(headers)) httpReq += `${k}: ${v}\r\n`
        if (body) httpReq += `Content-Length: ${Buffer.byteLength(body)}\r\n`
        httpReq += `Connection: close\r\n\r\n`

        tlsSocket.write(httpReq)
        if (body) tlsSocket.write(body)
      })

      let responseData = Buffer.alloc(0)
      let headersParsed = false
      let expectedLength = -1
      let bodyStartIndex = -1
      let statusCode = 0
      let responseHeaders: http.IncomingHttpHeaders = {}

      tlsSocket.on('data', (chunk) => {
        responseData = Buffer.concat([responseData, chunk])

        if (!headersParsed) {
          const headerEnd = responseData.indexOf('\r\n\r\n')
          if (headerEnd !== -1) {
            headersParsed = true
            bodyStartIndex = headerEnd + 4
            const headerStr = responseData.slice(0, headerEnd).toString('utf-8')
            const lines = headerStr.split('\r\n')
            const statusMatch = lines[0].match(/HTTP\/[\d.]+ (\d+)/)
            statusCode = statusMatch ? parseInt(statusMatch[1]) : 500

            for (let i = 1; i < lines.length; i++) {
              const idx = lines[i].indexOf(':')
              if (idx > 0) responseHeaders[lines[i].slice(0, idx).toLowerCase()] = lines[i].slice(idx + 1).trim()
            }

            const cl = responseHeaders['content-length']
            if (cl) expectedLength = parseInt(cl as string)
            checkComplete()
          }
        } else {
          checkComplete()
        }
      })

      function checkComplete() {
        if (!headersParsed) return
        if (expectedLength >= 0 && responseData.length - bodyStartIndex >= expectedLength) finish()
      }

      function finish() {
        clearTimeout(timeoutId)
        tlsSocket.destroy()
        const bodyBuf = responseData.slice(bodyStartIndex, bodyStartIndex + (expectedLength >= 0 ? expectedLength : responseData.length - bodyStartIndex))
        resolve({ status: statusCode, headers: responseHeaders, body: bodyBuf.toString('utf-8') })
      }

      tlsSocket.on('end', finish)
      tlsSocket.on('error', (err) => { clearTimeout(timeoutId); reject(err) })
    })

    connectReq.on('error', (err) => { clearTimeout(timeoutId); reject(err) })
    connectReq.end()
  })
}

async function clearProxyState(): Promise<void> {
  await fetch(`http://localhost:${PROXY_PORT}/api/flows`, { method: 'DELETE' })
}

// ============================================================================
// Test Configuration
// ============================================================================

const COMPRESSIONS: Compression[] = ['none', 'gzip', 'deflate', 'br', 'zstd']
const TRANSFER_MODES: TransferMode[] = ['content-length', 'chunked']
const BODY_SIZES = [100, 5000]

const testCases = cartesian({
  protocol: ['http', 'https'] as Protocol[],
  compression: COMPRESSIONS,
  transferMode: TRANSFER_MODES,
  bodySize: BODY_SIZES
})

// ============================================================================
// Tests
// ============================================================================

describe('E2E Proxy Tests - Native TLS', () => {
  beforeAll(async () => {
    await zstdReady
    httpTargetServer = http.createServer(createRequestHandler)
    await new Promise<void>(resolve => httpTargetServer.listen(0, () => {
      httpTargetPort = (httpTargetServer.address() as net.AddressInfo).port
      resolve()
    }))

    const creds = generateCert()
    httpsTargetServer = https.createServer(creds, createRequestHandler)
    await new Promise<void>(resolve => httpsTargetServer.listen(0, () => {
      httpsTargetPort = (httpsTargetServer.address() as net.AddressInfo).port
      resolve()
    }))

    await startProxy('native')
  }, 30000)

  afterAll(async () => {
    proxyProcess?.kill('SIGTERM')
    await new Promise(resolve => setTimeout(resolve, 300))
    await new Promise<void>(resolve => httpTargetServer.close(() => resolve()))
    await new Promise<void>(resolve => httpsTargetServer.close(() => resolve()))
  })

  beforeEach(() => { receivedRequests = [] })

  describe('Response combinations (cartesian product)', () => {
    for (const tc of testCases) {
      const { protocol, compression, transferMode, bodySize } = tc
      const testName = `[${protocol}] ${compression} + ${transferMode} (${bodySize}b)`

      it(testName, async () => {
        const makeRequest = protocol === 'http' ? makeHttpRequest : makeHttpsRequest
        const response = await makeRequest({
          path: '/test',
          query: { compression, transfer: transferMode, size: String(bodySize) }
        })

        expect(response.status).toBe(200)
        expect(response.body.length).toBe(bodySize)
        expect(response.body).toBe('x'.repeat(bodySize))
        expect(receivedRequests).toHaveLength(1)
        receivedRequests = []
      })
    }
  })

  describe('Request body sizes', () => {
    for (const protocol of ['http', 'https'] as Protocol[]) {
      for (const size of [10, 1000, 50000]) {
        it(`[${protocol}] POST ${size}b body`, async () => {
          const makeRequest = protocol === 'http' ? makeHttpRequest : makeHttpsRequest
          const body = JSON.stringify({ data: 'x'.repeat(size) })

          const response = await makeRequest({
            method: 'POST',
            path: '/echo',
            headers: { 'Content-Type': 'application/json' },
            body
          })

          expect(response.status).toBe(200)
          const data = JSON.parse(response.body)
          expect(data.receivedBodyLength).toBe(body.length)
          receivedRequests = []
        })
      }
    }
  })

  describe('SSE streaming', () => {
    // Test SSE without compression
    for (const protocol of ['http', 'https'] as Protocol[]) {
      it(`[${protocol}] should stream SSE events (uncompressed)`, async () => {
        const makeRequest = protocol === 'http' ? makeHttpRequest : makeHttpsRequest
        await clearProxyState()

        const response = await makeRequest({
          path: '/stream',
          query: { sse: 'true', sseCount: '5' },
          timeout: 15000
        })

        expect(response.status).toBe(200)
        expect(response.headers['content-type']).toContain('text/event-stream')
        const events = response.body.split('\n\n').filter(e => e.includes('data:'))
        expect(events.length).toBeGreaterThanOrEqual(5)

        // Verify events stored
        const flowsRes = await fetch(`http://localhost:${PROXY_PORT}/api/flows`)
        const flowsData = await flowsRes.json()
        const sseFlow = flowsData.flows.find((f: Flow) => f.isSSE)
        if (sseFlow) {
          const eventsRes = await fetch(`http://localhost:${PROXY_PORT}/api/flows/${sseFlow.id}/events`)
          const eventsData = await eventsRes.json()
          expect(eventsData.count).toBeGreaterThanOrEqual(5)
        }
      })
    }

    // Test SSE with all compression types and transfer modes (cartesian product)
    const sseCompressions: Compression[] = ['gzip', 'deflate', 'br', 'zstd']
    const sseTransferModes: TransferMode[] = ['content-length', 'chunked']
    for (const protocol of ['http', 'https'] as Protocol[]) {
      for (const compression of sseCompressions) {
        for (const transferMode of sseTransferModes) {
          it(`[${protocol}] should handle SSE with ${compression} + ${transferMode}`, async () => {
            const makeRequest = protocol === 'http' ? makeHttpRequest : makeHttpsRequest
            await clearProxyState()

            const response = await makeRequest({
              path: '/stream',
              query: { sse: 'true', sseCount: '5', compression, transfer: transferMode },
              timeout: 15000
            })

            expect(response.status).toBe(200)
            expect(response.headers['content-type']).toContain('text/event-stream')

            // Body should be decompressed and contain all events
            const events = response.body.split('\n\n').filter(e => e.includes('data:'))
            expect(events.length).toBe(5)

            // Verify each event has correct structure
            for (let i = 0; i < events.length; i++) {
              expect(events[i]).toContain('event: message')
              expect(events[i]).toContain(`"count":${i + 1}`)
            }

            // Verify events were parsed and stored by proxy
            const flowsRes = await fetch(`http://localhost:${PROXY_PORT}/api/flows`)
            const flowsData = await flowsRes.json()
            const sseFlow = flowsData.flows.find((f: Flow) => f.isSSE)
            expect(sseFlow).toBeDefined()

            const eventsRes = await fetch(`http://localhost:${PROXY_PORT}/api/flows/${sseFlow.id}/events`)
            const eventsData = await eventsRes.json()
            expect(eventsData.count).toBe(5)

            // Verify each parsed event
            for (let i = 0; i < eventsData.events.length; i++) {
              const event = eventsData.events[i]
              expect(event.event).toBe('message')
              const data = JSON.parse(event.data)
              expect(data.count).toBe(i + 1)
              expect(data.total).toBe(5)
            }
          })
        }
      }
    }
  })

  describe('Flow storage', () => {
    it('should store flow with correct data', async () => {
      await clearProxyState()
      const body = JSON.stringify({ test: 'storage' })
      await makeHttpsRequest({ method: 'POST', path: '/echo', headers: { 'Content-Type': 'application/json' }, body })

      const flowsRes = await fetch(`http://localhost:${PROXY_PORT}/api/flows`)
      const flowsData = await flowsRes.json()
      expect(flowsData.count).toBe(1)
      expect(flowsData.flows[0].request.body).toBe(body)
      expect(flowsData.flows[0].response.status).toBe(200)
    })

    it('should store decompressed response', async () => {
      await clearProxyState()
      await makeHttpsRequest({ path: '/test', query: { compression: 'gzip', size: '500' } })

      const flowsRes = await fetch(`http://localhost:${PROXY_PORT}/api/flows`)
      const flowsData = await flowsRes.json()
      expect(flowsData.flows[0].response.body.length).toBe(500)
    })
  })
})

describe('E2E Proxy Tests - uTLS', () => {
  beforeAll(async () => {
    await zstdReady
    httpTargetServer = http.createServer(createRequestHandler)
    await new Promise<void>(resolve => httpTargetServer.listen(0, () => {
      httpTargetPort = (httpTargetServer.address() as net.AddressInfo).port
      resolve()
    }))

    const creds = generateCert()
    httpsTargetServer = https.createServer(creds, createRequestHandler)
    await new Promise<void>(resolve => httpsTargetServer.listen(0, () => {
      httpsTargetPort = (httpsTargetServer.address() as net.AddressInfo).port
      resolve()
    }))

    await startProxy('utls')
  }, 30000)

  afterAll(async () => {
    proxyProcess?.kill('SIGTERM')
    await new Promise(resolve => setTimeout(resolve, 300))
    await new Promise<void>(resolve => httpTargetServer.close(() => resolve()))
    await new Promise<void>(resolve => httpsTargetServer.close(() => resolve()))
  })

  beforeEach(() => { receivedRequests = [] })

  describe('HTTPS with uTLS (cartesian product)', () => {
    const httpsTestCases = testCases.filter(tc => tc.protocol === 'https')

    for (const tc of httpsTestCases) {
      const { compression, transferMode, bodySize } = tc
      const testName = `${compression} + ${transferMode} (${bodySize}b)`

      it(testName, async () => {
        const response = await makeHttpsRequest({
          path: '/test',
          query: { compression, transfer: transferMode, size: String(bodySize) }
        })

        expect(response.status).toBe(200)
        expect(response.body.length).toBe(bodySize)
        expect(response.body).toBe('x'.repeat(bodySize))
        receivedRequests = []
      })
    }
  })

  describe('Request body sizes', () => {
    for (const size of [10, 1000, 50000]) {
      it(`POST ${size}b body`, async () => {
        const body = JSON.stringify({ data: 'x'.repeat(size) })
        const response = await makeHttpsRequest({
          method: 'POST',
          path: '/echo',
          headers: { 'Content-Type': 'application/json' },
          body
        })

        expect(response.status).toBe(200)
        const data = JSON.parse(response.body)
        expect(data.receivedBodyLength).toBe(body.length)
        receivedRequests = []
      })
    }
  })

  describe('SSE streaming', () => {
    it('should stream SSE events', async () => {
      await clearProxyState()
      const response = await makeHttpsRequest({
        path: '/stream',
        query: { sse: 'true', sseCount: '5' },
        timeout: 15000
      })

      expect(response.status).toBe(200)
      const events = response.body.split('\n\n').filter(e => e.includes('data:'))
      expect(events.length).toBeGreaterThanOrEqual(5)
    })
  })
})
