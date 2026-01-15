/**
 * Comprehensive E2E tests for the proxy server
 * Tests compression (gzip, deflate, br, none), chunked/content-length, SSE
 * Verifies flows and events are stored correctly
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import http from 'http'
import https from 'https'
import { gzipSync, deflateSync, brotliCompressSync } from 'zlib'
import net from 'net'
import tls from 'tls'
import { spawn, ChildProcess } from 'child_process'
import forge from 'node-forge'
import path from 'path'
import { fileURLToPath } from 'url'
import type { Flow, SSEEvent } from '../shared/types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ============================================================================
// Types
// ============================================================================

type Compression = 'none' | 'gzip' | 'deflate' | 'br'
type TransferMode = 'content-length' | 'chunked'

interface TestConfig {
  compression: Compression
  transferMode: TransferMode
  bodySize?: number
  description?: string
}

interface ReceivedRequest {
  method: string
  url: string
  headers: http.IncomingHttpHeaders
  body: string
}

interface ProxyState {
  flows: Flow[]
  events: Record<string, SSEEvent[]>
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
    default: return buf
  }
}

// ============================================================================
// Test Setup
// ============================================================================

const PROXY_PORT = 19095
let targetPort: number
let targetServer: https.Server
let proxyProcess: ChildProcess | null = null
let receivedRequests: ReceivedRequest[] = []

function createTargetServer(): https.Server {
  const creds = generateCert()

  return https.createServer(creds, (req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf-8')
      const url = new URL(req.url || '/', 'https://localhost')
      const params = url.searchParams

      receivedRequests.push({
        method: req.method || 'GET',
        url: req.url || '/',
        headers: req.headers,
        body
      })

      // Parse test parameters from URL
      const compression = (params.get('compression') || 'none') as Compression
      const transferMode = (params.get('transfer') || 'content-length') as TransferMode
      const responseSize = parseInt(params.get('size') || '0')
      const isSSE = params.get('sse') === 'true'
      const sseCount = parseInt(params.get('sseCount') || '3')

      // Handle SSE
      if (isSSE) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        })
        let count = 0
        const interval = setInterval(() => {
          count++
          res.write(`event: message\ndata: {"count":${count},"total":${sseCount}}\n\n`)
          if (count >= sseCount) {
            clearInterval(interval)
            res.end()
          }
        }, 20)
        return
      }

      // Build response body
      let responseBody: string
      if (url.pathname === '/echo') {
        responseBody = JSON.stringify({
          method: req.method,
          path: url.pathname,
          receivedBody: body,
          receivedBodyLength: body.length,
          headers: req.headers
        })
      } else if (params.has('size')) {
        // Explicit size parameter - can be 0 for empty body
        responseBody = 'x'.repeat(responseSize)
      } else {
        responseBody = JSON.stringify({ ok: true, path: url.pathname })
      }

      // Compress if needed
      const compressedBody = compress(responseBody, compression)

      // Build headers
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
        // Send in chunks
        const chunkSize = Math.max(1, Math.ceil(compressedBody.length / 3))
        let offset = 0
        const sendChunk = () => {
          if (offset < compressedBody.length) {
            const chunk = compressedBody.slice(offset, offset + chunkSize)
            res.write(chunk)
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
  })
}

async function startProxy(): Promise<void> {
  return new Promise((resolve, reject) => {
    const tsxPath = path.join(__dirname, '..', 'node_modules', '.bin', 'tsx')
    const serverPath = path.join(__dirname, 'index.ts')

    proxyProcess = spawn(tsxPath, [serverPath, '-p', String(PROXY_PORT)], {
      cwd: path.join(__dirname, '..'),
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let started = false
    proxyProcess.stdout?.on('data', (data) => {
      const output = data.toString()
      if (!started && output.includes('Claudeoscope proxy running')) {
        started = true
        setTimeout(resolve, 300)
      }
    })

    proxyProcess.stderr?.on('data', (data) => {
      console.error(`[Proxy stderr] ${data.toString().trim()}`)
    })

    setTimeout(() => {
      if (!started) reject(new Error('Proxy failed to start'))
    }, 10000)
  })
}

// ============================================================================
// HTTP Client
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

async function makeRequest(options: RequestOptions = {}): Promise<Response> {
  const { method = 'GET', path = '/', query = {}, headers = {}, body, timeout = 10000 } = options

  // Build query string
  const queryStr = Object.entries(query).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
  const fullPath = queryStr ? `${path}?${queryStr}` : path

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout)

    const connectReq = http.request({
      hostname: 'localhost',
      port: PROXY_PORT,
      method: 'CONNECT',
      path: `localhost:${targetPort}`
    })

    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        clearTimeout(timeoutId)
        reject(new Error(`CONNECT failed: ${res.statusCode}`))
        return
      }

      const tlsSocket = tls.connect({
        socket,
        rejectUnauthorized: false,
        servername: 'localhost'
      })

      tlsSocket.on('secureConnect', () => {
        let httpReq = `${method} ${fullPath} HTTP/1.1\r\n`
        httpReq += `Host: localhost:${targetPort}\r\n`
        for (const [k, v] of Object.entries(headers)) {
          httpReq += `${k}: ${v}\r\n`
        }
        if (body) {
          httpReq += `Content-Length: ${Buffer.byteLength(body)}\r\n`
        }
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
              if (idx > 0) {
                responseHeaders[lines[i].slice(0, idx).toLowerCase()] = lines[i].slice(idx + 1).trim()
              }
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
        const bodyReceived = responseData.length - bodyStartIndex
        if (expectedLength >= 0 && bodyReceived >= expectedLength) {
          finish()
        }
      }

      function finish() {
        clearTimeout(timeoutId)
        tlsSocket.destroy()
        const bodyBuf = responseData.slice(bodyStartIndex, bodyStartIndex + (expectedLength >= 0 ? expectedLength : responseData.length - bodyStartIndex))
        resolve({
          status: statusCode,
          headers: responseHeaders,
          body: bodyBuf.toString('utf-8')
        })
      }

      tlsSocket.on('end', finish)
      tlsSocket.on('error', (err) => {
        clearTimeout(timeoutId)
        reject(err)
      })
    })

    connectReq.on('error', (err) => {
      clearTimeout(timeoutId)
      reject(err)
    })

    connectReq.end()
  })
}

// Fetch proxy state via API
async function getProxyState(): Promise<ProxyState> {
  const statsRes = await fetch(`http://localhost:${PROXY_PORT}/api/stats`)
  const stats = await statsRes.json()

  // We can't directly get flows from API, but we can check raw HTTP
  const rawFlowsRes = await fetch(`http://localhost:${PROXY_PORT}/api/debug/raw-flows`)
  const rawFlows = await rawFlowsRes.json()

  return {
    flows: [],  // Would need API endpoint to get flows
    events: {}  // Would need API endpoint to get events
  }
}

async function clearProxyState(): Promise<void> {
  await fetch(`http://localhost:${PROXY_PORT}/api/flows`, { method: 'DELETE' })
}

// ============================================================================
// Test Generator
// ============================================================================

function generateResponseTests(configs: TestConfig[]) {
  for (const config of configs) {
    const { compression, transferMode, bodySize = 100, description } = config
    const testName = description || `${compression} + ${transferMode} (${bodySize} bytes)`

    it(testName, async () => {
      receivedRequests = []
      await clearProxyState()

      const response = await makeRequest({
        path: '/test',
        query: {
          compression,
          transfer: transferMode,
          size: String(bodySize)
        }
      })

      expect(response.status).toBe(200)

      // Body should be decompressed by proxy
      expect(response.body.length).toBe(bodySize)
      expect(response.body).toBe('x'.repeat(bodySize))

      // Server should have received the request
      expect(receivedRequests).toHaveLength(1)
      expect(receivedRequests[0].method).toBe('GET')
    })
  }
}

function generateRequestBodyTests(sizes: number[]) {
  for (const size of sizes) {
    it(`POST with ${size} byte body`, async () => {
      receivedRequests = []
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
      expect(data.receivedBody).toBe(body)

      expect(receivedRequests).toHaveLength(1)
      expect(receivedRequests[0].body).toBe(body)
    })
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('E2E Comprehensive Proxy Tests', () => {
  beforeAll(async () => {
    targetServer = createTargetServer()
    await new Promise<void>((resolve) => {
      targetServer.listen(0, () => {
        targetPort = (targetServer.address() as net.AddressInfo).port
        console.log(`[E2E] Target server on port ${targetPort}`)
        resolve()
      })
    })

    await startProxy()
    console.log(`[E2E] Proxy server on port ${PROXY_PORT}`)
  }, 30000)

  afterAll(async () => {
    proxyProcess?.kill('SIGTERM')
    await new Promise((resolve) => setTimeout(resolve, 300))
    await new Promise<void>((resolve) => targetServer.close(() => resolve()))
  })

  beforeEach(() => {
    receivedRequests = []
  })

  describe('Response Compression', () => {
    const compressions: Compression[] = ['none', 'gzip', 'deflate', 'br']
    const sizes = [50, 1024, 10240]

    generateResponseTests(
      compressions.flatMap(compression =>
        sizes.map(size => ({
          compression,
          transferMode: 'content-length' as TransferMode,
          bodySize: size,
          description: `${compression || 'no'} compression, ${size} bytes`
        }))
      )
    )
  })

  describe('Transfer Modes', () => {
    const modes: TransferMode[] = ['content-length', 'chunked']
    const compressions: Compression[] = ['none', 'gzip']

    generateResponseTests(
      modes.flatMap(transferMode =>
        compressions.map(compression => ({
          compression,
          transferMode,
          bodySize: 5000,
          description: `${transferMode} + ${compression || 'no compression'}`
        }))
      )
    )
  })

  describe('Request Body Sizes', () => {
    generateRequestBodyTests([10, 100, 1024, 10240, 102400])
  })

  describe('SSE Streaming', () => {
    it('should stream SSE events and store them correctly', async () => {
      receivedRequests = []
      await clearProxyState()

      const response = await makeRequest({
        path: '/stream',
        query: { sse: 'true', sseCount: '5' },
        timeout: 15000
      })

      expect(response.status).toBe(200)
      expect(response.headers['content-type']).toBe('text/event-stream')

      // Body should contain all SSE events
      const rawEvents = response.body.split('\n\n').filter(e => e.includes('data:'))
      expect(rawEvents.length).toBeGreaterThanOrEqual(5)

      // Verify event content format
      for (const eventStr of rawEvents) {
        expect(eventStr).toContain('event: message')
        expect(eventStr).toContain('data:')
        // Parse the data
        const dataMatch = eventStr.match(/data: (.+)/)
        expect(dataMatch).toBeTruthy()
        const data = JSON.parse(dataMatch![1])
        expect(data).toHaveProperty('count')
        expect(data).toHaveProperty('total')
      }

      // Verify proxy stored the flow correctly
      const flowsRes = await fetch(`http://localhost:${PROXY_PORT}/api/flows`)
      const flowsData = await flowsRes.json()
      expect(flowsData.count).toBeGreaterThan(0)

      // Find the SSE flow
      const sseFlow = flowsData.flows.find((f: Flow) => f.isSSE === true)
      expect(sseFlow).toBeDefined()
      expect(sseFlow.request.path).toContain('sse=true')

      // Verify events were stored
      const eventsRes = await fetch(`http://localhost:${PROXY_PORT}/api/flows/${sseFlow.id}/events`)
      const eventsData = await eventsRes.json()
      expect(eventsData.count).toBeGreaterThanOrEqual(5)

      // Verify event structure
      for (const event of eventsData.events) {
        expect(event).toHaveProperty('eventId')
        expect(event).toHaveProperty('flowId')
        expect(event).toHaveProperty('data')
        expect(event).toHaveProperty('timestamp')
      }
    })

    it('should handle SSE with many events', async () => {
      await clearProxyState()

      const response = await makeRequest({
        path: '/stream',
        query: { sse: 'true', sseCount: '20' },
        timeout: 15000
      })

      expect(response.status).toBe(200)
      const events = response.body.split('\n\n').filter(e => e.includes('data:'))
      expect(events.length).toBeGreaterThanOrEqual(20)

      // Verify all events stored
      const flowsRes = await fetch(`http://localhost:${PROXY_PORT}/api/flows`)
      const flowsData = await flowsRes.json()
      const sseFlow = flowsData.flows.find((f: Flow) => f.isSSE === true)
      expect(sseFlow).toBeDefined()

      const eventsRes = await fetch(`http://localhost:${PROXY_PORT}/api/flows/${sseFlow.id}/events`)
      const eventsData = await eventsRes.json()
      expect(eventsData.count).toBeGreaterThanOrEqual(20)
    })
  })

  describe('Combined Scenarios', () => {
    it('should handle rapid sequential requests', async () => {
      const results = []
      for (let i = 0; i < 10; i++) {
        const response = await makeRequest({
          path: `/seq/${i}`,
          query: { size: '100' }
        })
        results.push(response)
      }

      expect(results.every(r => r.status === 200)).toBe(true)
      expect(results.every(r => r.body.length === 100)).toBe(true)
    })

    it('should handle concurrent requests with different compressions', async () => {
      const compressions: Compression[] = ['none', 'gzip', 'deflate', 'br']

      const promises = compressions.map(compression =>
        makeRequest({
          path: '/concurrent',
          query: { compression, size: '1000' }
        })
      )

      const results = await Promise.all(promises)

      expect(results.every(r => r.status === 200)).toBe(true)
      expect(results.every(r => r.body.length === 1000)).toBe(true)
    })

    it('should handle mixed GET and POST requests', async () => {
      const results = await Promise.all([
        makeRequest({ path: '/get1', query: { size: '500' } }),
        makeRequest({ method: 'POST', path: '/echo', body: 'test body 1' }),
        makeRequest({ path: '/get2', query: { size: '500', compression: 'gzip' } }),
        makeRequest({ method: 'POST', path: '/echo', body: 'test body 2' }),
      ])

      expect(results.every(r => r.status === 200)).toBe(true)
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty response body', async () => {
      // size=0 returns empty string from target server
      const response = await makeRequest({
        path: '/test',
        query: { size: '0' }
      })
      expect(response.status).toBe(200)
      // With size=0, server returns empty body
      expect(response.body).toBe('')
    })

    it('should handle large response (200KB)', async () => {
      const response = await makeRequest({
        path: '/large',
        query: { size: '204800' },
        timeout: 30000
      })
      expect(response.status).toBe(200)
      expect(response.body.length).toBe(204800)
    })

    it('should handle large compressed response', async () => {
      const response = await makeRequest({
        path: '/large-compressed',
        query: { size: '100000', compression: 'gzip' },
        timeout: 30000
      })
      expect(response.status).toBe(200)
      expect(response.body.length).toBe(100000)
    })

    it('should handle chunked + compressed', async () => {
      const response = await makeRequest({
        path: '/chunked-compressed',
        query: { size: '5000', compression: 'gzip', transfer: 'chunked' },
        timeout: 15000
      })
      expect(response.status).toBe(200)
      expect(response.body.length).toBe(5000)
    })
  })

  describe('Flow Storage Verification', () => {
    it('should store request and response in flow', async () => {
      await clearProxyState()

      const body = JSON.stringify({ test: 'data' })
      const response = await makeRequest({
        method: 'POST',
        path: '/echo',
        headers: { 'Content-Type': 'application/json' },
        body
      })

      expect(response.status).toBe(200)

      // Verify via raw HTTP API
      const rawFlowsRes = await fetch(`http://localhost:${PROXY_PORT}/api/debug/raw-flows`)
      const rawFlows = await rawFlowsRes.json()

      expect(rawFlows.count).toBeGreaterThan(0)

      // Get raw HTTP for first flow
      const flowId = rawFlows.flowIds[0]
      const rawHttpRes = await fetch(`http://localhost:${PROXY_PORT}/api/flows/${flowId}/raw`)
      const rawHttp = await rawHttpRes.json()

      expect(rawHttp.request).toContain('POST /echo')
      expect(rawHttp.request).toContain(body)
      expect(rawHttp.response).toContain('HTTP/1.1 200')
    })

    it('should store complete flow data structure', async () => {
      await clearProxyState()

      const requestBody = JSON.stringify({ message: 'test flow storage' })
      await makeRequest({
        method: 'POST',
        path: '/echo',
        headers: {
          'Content-Type': 'application/json',
          'X-Custom-Header': 'test-value'
        },
        body: requestBody
      })

      // Get all flows
      const flowsRes = await fetch(`http://localhost:${PROXY_PORT}/api/flows`)
      const flowsData = await flowsRes.json()
      expect(flowsData.count).toBe(1)

      const flow = flowsData.flows[0]

      // Verify flow structure
      expect(flow).toHaveProperty('id')
      expect(flow).toHaveProperty('timestamp')
      expect(flow).toHaveProperty('host')
      expect(flow).toHaveProperty('type', 'https')
      expect(flow).toHaveProperty('duration')

      // Verify request
      expect(flow.request).toHaveProperty('method', 'POST')
      expect(flow.request).toHaveProperty('path')
      expect(flow.request.path).toContain('/echo')
      expect(flow.request).toHaveProperty('headers')
      expect(flow.request).toHaveProperty('body', requestBody)

      // Verify response
      expect(flow.response).toHaveProperty('status', 200)
      expect(flow.response).toHaveProperty('headers')
      expect(flow.response).toHaveProperty('body')

      // Response body should be the echo response
      const responseBody = JSON.parse(flow.response.body)
      expect(responseBody.method).toBe('POST')
      expect(responseBody.receivedBodyLength).toBe(requestBody.length)
    })

    it('should store flows for compressed responses', async () => {
      await clearProxyState()

      await makeRequest({
        path: '/test',
        query: { compression: 'gzip', size: '500' }
      })

      const flowsRes = await fetch(`http://localhost:${PROXY_PORT}/api/flows`)
      const flowsData = await flowsRes.json()
      expect(flowsData.count).toBe(1)

      const flow = flowsData.flows[0]

      // Response body should be decompressed in storage
      expect(flow.response.body.length).toBe(500)
      expect(flow.response.body).toBe('x'.repeat(500))
    })

    it('should correctly count multiple flows', async () => {
      await clearProxyState()

      // Make several requests
      await Promise.all([
        makeRequest({ path: '/test1', query: { size: '100' } }),
        makeRequest({ path: '/test2', query: { size: '100' } }),
        makeRequest({ path: '/test3', query: { size: '100' } }),
      ])

      const flowsRes = await fetch(`http://localhost:${PROXY_PORT}/api/flows`)
      const flowsData = await flowsRes.json()
      expect(flowsData.count).toBe(3)

      // Each flow should have unique ID
      const ids = flowsData.flows.map((f: Flow) => f.id)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(3)
    })
  })
})
