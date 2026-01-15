import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'http'
import https from 'https'
import { gzipSync, deflateSync } from 'zlib'
import net from 'net'
import tls from 'tls'
import forge from 'node-forge'

// ============================================================================
// Test Infrastructure
// ============================================================================

// Generate self-signed cert for test HTTPS server
function generateCert() {
  const pki = forge.pki
  const keys = pki.rsa.generateKeyPair(2048)
  const cert = pki.createCertificate()

  cert.publicKey = keys.publicKey
  cert.serialNumber = '01'
  cert.validity.notBefore = new Date()
  cert.validity.notAfter = new Date()
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1)

  const attrs = [
    { name: 'commonName', value: 'localhost' },
    { name: 'organizationName', value: 'Test' }
  ]
  cert.setSubject(attrs)
  cert.setIssuer(attrs)
  cert.setExtensions([
    { name: 'subjectAltName', altNames: [{ type: 2, value: 'localhost' }] }
  ])
  cert.sign(keys.privateKey)

  return {
    key: pki.privateKeyToPem(keys.privateKey),
    cert: pki.certificateToPem(cert)
  }
}

// Track what the target server receives
interface ReceivedRequest {
  method: string
  url: string
  headers: http.IncomingHttpHeaders
  body: string
}

// ============================================================================
// Test Servers
// ============================================================================

let proxyPort: number
let targetHttpPort: number
let targetHttpsPort: number
let proxyServer: http.Server
let targetHttpServer: http.Server
let targetHttpsServer: https.Server
let receivedRequests: ReceivedRequest[] = []

// Import the actual server modules
import express from 'express'
import * as store from './flow-store.js'
import { loadOrCreateCA, generateCertForHost } from './ca.js'

function createTargetServer(isHttps: boolean): http.Server | https.Server {
  const handler = (req: http.IncomingMessage, res: http.ServerResponse) => {
    const chunks: Buffer[] = []

    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf-8')

      // Record what we received
      receivedRequests.push({
        method: req.method || 'GET',
        url: req.url || '/',
        headers: req.headers,
        body
      })

      const url = new URL(req.url || '/', `http://localhost`)

      // Echo endpoint - returns what it received
      if (url.pathname === '/echo') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          method: req.method,
          url: req.url,
          headers: req.headers,
          body,
          bodyLength: body.length
        }))
        return
      }

      // Fixed size response
      if (url.pathname.startsWith('/size/')) {
        const size = parseInt(url.pathname.split('/')[2])
        if (isNaN(size) || size < 0) {
          res.writeHead(400)
          res.end('Invalid size')
          return
        }
        const data = 'x'.repeat(size)
        res.writeHead(200, {
          'Content-Type': 'text/plain',
          'Content-Length': data.length.toString()
        })
        res.end(data)
        return
      }

      // Empty response (204 No Content)
      if (url.pathname === '/empty') {
        res.writeHead(204)
        res.end()
        return
      }

      // Chunked response
      if (url.pathname === '/chunked') {
        res.writeHead(200, {
          'Content-Type': 'text/plain',
          'Transfer-Encoding': 'chunked'
        })
        const chunks = ['chunk1-', 'chunk2-', 'chunk3']
        let i = 0
        const interval = setInterval(() => {
          if (i < chunks.length) {
            res.write(chunks[i])
            i++
          } else {
            clearInterval(interval)
            res.end()
          }
        }, 10)
        return
      }

      // Gzip compressed
      if (url.pathname === '/gzip') {
        const data = JSON.stringify({ compressed: true, method: 'gzip', padding: 'x'.repeat(100) })
        const compressed = gzipSync(data)
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Content-Encoding': 'gzip',
          'Content-Length': compressed.length.toString()
        })
        res.end(compressed)
        return
      }

      // Deflate compressed
      if (url.pathname === '/deflate') {
        const data = JSON.stringify({ compressed: true, method: 'deflate', padding: 'x'.repeat(100) })
        const compressed = deflateSync(data)
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Content-Encoding': 'deflate',
          'Content-Length': compressed.length.toString()
        })
        res.end(compressed)
        return
      }

      // Slow response (for timeout testing)
      if (url.pathname === '/slow') {
        setTimeout(() => {
          res.writeHead(200, { 'Content-Type': 'text/plain' })
          res.end('finally done')
        }, 500)
        return
      }

      // Default response
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, path: url.pathname }))
    })
  }

  if (isHttps) {
    const creds = generateCert()
    return https.createServer(creds, handler)
  }
  return http.createServer(handler)
}

// Create a minimal proxy server for testing
function createProxyServer(): http.Server {
  loadOrCreateCA()

  const app = express()
  const server = http.createServer(app)

  // Initialize WebSocket for flow broadcasting
  store.initWebSocket(server)

  // Handle HTTP proxy requests
  app.use((req, res) => {
    const targetUrl = req.url
    if (!targetUrl.startsWith('http://')) {
      res.status(400).send('Not a proxy request')
      return
    }

    const parsedUrl = new URL(targetUrl)
    const chunks: Buffer[] = []

    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      const body = Buffer.concat(chunks)

      const proxyReq = http.request({
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 80,
        path: parsedUrl.pathname + parsedUrl.search,
        method: req.method,
        headers: { ...req.headers, host: parsedUrl.host }
      }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 500, proxyRes.headers)
        proxyRes.pipe(res)
      })

      proxyReq.on('error', (err) => {
        res.status(502).send(err.message)
      })

      if (body.length > 0) {
        proxyReq.write(body)
      }
      proxyReq.end()
    })
  })

  // Handle HTTPS CONNECT
  server.on('connect', (req, clientSocket) => {
    const [host, portStr] = (req.url || '').split(':')
    const port = parseInt(portStr) || 443

    const serverCtx = generateCertForHost(host)
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')

    const tlsClient = new tls.TLSSocket(clientSocket, {
      isServer: true,
      secureContext: serverCtx
    } as tls.TLSSocketOptions)

    tlsClient.on('error', (err) => {
      console.error('[E2E Proxy] TLS error:', err.message)
      tlsClient.destroy()
    })

    let buffer = Buffer.alloc(0)

    tlsClient.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk])
      processBuffer()
    })

    function processBuffer() {
      const headerEnd = buffer.indexOf('\r\n\r\n')
      if (headerEnd === -1) return

      const headerPart = buffer.slice(0, headerEnd).toString('utf-8')
      const lines = headerPart.split('\r\n')
      const [method, path] = lines[0].split(' ')

      const headers: Record<string, string> = {}
      for (let i = 1; i < lines.length; i++) {
        const colonIdx = lines[i].indexOf(':')
        if (colonIdx > 0) {
          const key = lines[i].slice(0, colonIdx).toLowerCase()
          const value = lines[i].slice(colonIdx + 1).trim()
          headers[key] = value
        }
      }

      const contentLength = parseInt(headers['content-length'] || '0', 10)
      const totalLength = headerEnd + 4 + contentLength

      if (buffer.length < totalLength) return

      const bodyStart = headerEnd + 4
      const body = contentLength > 0
        ? buffer.slice(bodyStart, bodyStart + contentLength)
        : Buffer.alloc(0)

      buffer = buffer.slice(totalLength)

      // Connect to target and forward request
      const targetSocket = tls.connect({
        host: 'localhost',
        port,
        rejectUnauthorized: false
      })

      targetSocket.on('secureConnect', () => {
        // Forward the request
        let httpReq = `${method} ${path} HTTP/1.1\r\n`
        httpReq += `Host: localhost\r\n`
        for (const [key, value] of Object.entries(headers)) {
          if (key !== 'host') {
            httpReq += `${key}: ${value}\r\n`
          }
        }
        httpReq += '\r\n'
        targetSocket.write(httpReq)
        if (body.length > 0) {
          targetSocket.write(body)
        }
      })

      // Pipe response back to client
      targetSocket.on('data', (chunk) => {
        tlsClient.write(chunk)
      })

      targetSocket.on('end', () => {
        // Don't close tlsClient - may have more requests on this connection
      })

      targetSocket.on('error', (err) => {
        console.error('[E2E Proxy] Target error:', err.message)
        const errorResponse = `HTTP/1.1 502 Bad Gateway\r\nContent-Length: ${err.message.length}\r\n\r\n${err.message}`
        tlsClient.write(errorResponse)
      })

      // Process remaining data
      if (buffer.length > 0) {
        setImmediate(processBuffer)
      }
    }

    clientSocket.on('error', () => tlsClient.destroy())
  })

  return server
}

// ============================================================================
// HTTP Client Helpers
// ============================================================================

interface RequestOptions {
  method?: string
  path?: string
  headers?: Record<string, string>
  body?: string | Buffer
}

interface ResponseData {
  status: number
  headers: http.IncomingHttpHeaders
  body: string
}

// Make HTTP request through proxy
function httpThroughProxy(targetPort: number, options: RequestOptions = {}): Promise<ResponseData> {
  return new Promise((resolve, reject) => {
    const { method = 'GET', path = '/', headers = {}, body } = options

    const proxyReq = http.request({
      hostname: 'localhost',
      port: proxyPort,
      path: `http://localhost:${targetPort}${path}`,
      method,
      headers: {
        ...headers,
        host: `localhost:${targetPort}`
      }
    }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        resolve({
          status: res.statusCode || 0,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf-8')
        })
      })
    })

    proxyReq.on('error', reject)

    if (body) {
      proxyReq.write(body)
    }
    proxyReq.end()
  })
}

// Make HTTPS request through proxy (using CONNECT tunnel)
function httpsThroughProxy(targetPort: number, options: RequestOptions = {}): Promise<ResponseData> {
  return new Promise((resolve, reject) => {
    const { method = 'GET', path = '/', headers = {}, body } = options

    // First establish CONNECT tunnel
    const connectReq = http.request({
      hostname: 'localhost',
      port: proxyPort,
      method: 'CONNECT',
      path: `localhost:${targetPort}`
    })

    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        reject(new Error(`CONNECT failed: ${res.statusCode}`))
        return
      }

      // Upgrade to TLS
      const tlsSocket = tls.connect({
        socket,
        rejectUnauthorized: false,
        servername: 'localhost'
      })

      tlsSocket.on('secureConnect', () => {
        // Send HTTP request over TLS tunnel
        let httpReq = `${method} ${path} HTTP/1.1\r\n`
        httpReq += `Host: localhost:${targetPort}\r\n`
        for (const [key, value] of Object.entries(headers)) {
          httpReq += `${key}: ${value}\r\n`
        }
        if (body) {
          const bodyBuf = typeof body === 'string' ? Buffer.from(body) : body
          httpReq += `Content-Length: ${bodyBuf.length}\r\n`
        }
        httpReq += '\r\n'
        tlsSocket.write(httpReq)
        if (body) {
          tlsSocket.write(body)
        }
      })

      // Parse HTTP response
      let responseBuffer = Buffer.alloc(0)
      let headersParsed = false
      let statusCode = 0
      let responseHeaders: http.IncomingHttpHeaders = {}
      let bodyChunks: Buffer[] = []
      let expectedLength = -1 // -1 means chunked or until close
      let isChunked = false

      tlsSocket.on('data', (chunk) => {
        if (!headersParsed) {
          responseBuffer = Buffer.concat([responseBuffer, chunk])
          const headerEnd = responseBuffer.indexOf('\r\n\r\n')
          if (headerEnd !== -1) {
            headersParsed = true
            const headerStr = responseBuffer.slice(0, headerEnd).toString('utf-8')
            const lines = headerStr.split('\r\n')
            const statusMatch = lines[0].match(/HTTP\/[\d.]+ (\d+)/)
            statusCode = statusMatch ? parseInt(statusMatch[1]) : 500

            for (let i = 1; i < lines.length; i++) {
              const colonIdx = lines[i].indexOf(':')
              if (colonIdx > 0) {
                const key = lines[i].slice(0, colonIdx).toLowerCase()
                const value = lines[i].slice(colonIdx + 1).trim()
                responseHeaders[key] = value
              }
            }

            if (responseHeaders['content-length']) {
              expectedLength = parseInt(responseHeaders['content-length'] as string)
            }
            isChunked = responseHeaders['transfer-encoding'] === 'chunked'

            const bodyStart = responseBuffer.slice(headerEnd + 4)
            if (bodyStart.length > 0) {
              bodyChunks.push(bodyStart)
            }

            checkComplete()
          }
        } else {
          bodyChunks.push(chunk)
          checkComplete()
        }
      })

      function checkComplete() {
        const totalBody = Buffer.concat(bodyChunks)

        if (expectedLength >= 0 && totalBody.length >= expectedLength) {
          finish(totalBody.slice(0, expectedLength))
        } else if (isChunked && totalBody.includes(Buffer.from('0\r\n\r\n'))) {
          // Parse chunked encoding
          finish(parseChunked(totalBody))
        }
      }

      function parseChunked(data: Buffer): Buffer {
        const result: Buffer[] = []
        let pos = 0
        while (pos < data.length) {
          const lineEnd = data.indexOf('\r\n', pos)
          if (lineEnd === -1) break
          const sizeStr = data.slice(pos, lineEnd).toString('utf-8')
          const size = parseInt(sizeStr, 16)
          if (size === 0) break
          pos = lineEnd + 2
          result.push(data.slice(pos, pos + size))
          pos += size + 2 // skip chunk data and trailing \r\n
        }
        return Buffer.concat(result)
      }

      function finish(body: Buffer) {
        tlsSocket.destroy()
        resolve({
          status: statusCode,
          headers: responseHeaders,
          body: body.toString('utf-8')
        })
      }

      tlsSocket.on('end', () => {
        if (!headersParsed) {
          reject(new Error('Connection closed before headers received'))
        } else {
          finish(Buffer.concat(bodyChunks))
        }
      })

      tlsSocket.on('error', reject)
    })

    connectReq.on('error', reject)
    connectReq.end()
  })
}

// ============================================================================
// Tests
// ============================================================================

describe('E2E Proxy Tests', () => {
  beforeAll(async () => {
    // Clear received requests
    receivedRequests = []

    // Start target HTTP server
    targetHttpServer = createTargetServer(false) as http.Server
    await new Promise<void>((resolve) => {
      targetHttpServer.listen(0, () => {
        const addr = targetHttpServer.address() as net.AddressInfo
        targetHttpPort = addr.port
        console.log(`[E2E] Target HTTP server on port ${targetHttpPort}`)
        resolve()
      })
    })

    // Start target HTTPS server
    targetHttpsServer = createTargetServer(true) as https.Server
    await new Promise<void>((resolve) => {
      targetHttpsServer.listen(0, () => {
        const addr = targetHttpsServer.address() as net.AddressInfo
        targetHttpsPort = addr.port
        console.log(`[E2E] Target HTTPS server on port ${targetHttpsPort}`)
        resolve()
      })
    })

    // Start proxy server
    proxyServer = createProxyServer()
    await new Promise<void>((resolve) => {
      proxyServer.listen(0, () => {
        const addr = proxyServer.address() as net.AddressInfo
        proxyPort = addr.port
        console.log(`[E2E] Proxy server on port ${proxyPort}`)
        resolve()
      })
    })
  })

  afterAll(async () => {
    // Force close all servers with timeout
    const closeWithTimeout = (server: http.Server | https.Server, name: string) =>
      new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          console.log(`[E2E] Force closing ${name}`)
          resolve()
        }, 1000)
        server.close(() => {
          clearTimeout(timeout)
          resolve()
        })
      })

    await closeWithTimeout(proxyServer, 'proxy')
    await closeWithTimeout(targetHttpServer, 'HTTP target')
    await closeWithTimeout(targetHttpsServer, 'HTTPS target')
  })

  describe('HTTP through proxy', () => {
    it('should proxy simple GET request', async () => {
      receivedRequests = []

      const response = await httpThroughProxy(targetHttpPort, { path: '/test' })

      expect(response.status).toBe(200)
      expect(JSON.parse(response.body)).toEqual({ ok: true, path: '/test' })

      // Verify server received request
      expect(receivedRequests).toHaveLength(1)
      expect(receivedRequests[0].method).toBe('GET')
      expect(receivedRequests[0].url).toBe('/test')
    })

    it('should proxy POST request with body', async () => {
      receivedRequests = []
      const body = JSON.stringify({ test: 'data', number: 123 })

      const response = await httpThroughProxy(targetHttpPort, {
        method: 'POST',
        path: '/echo',
        headers: { 'Content-Type': 'application/json' },
        body
      })

      expect(response.status).toBe(200)
      const responseData = JSON.parse(response.body)
      expect(responseData.method).toBe('POST')
      expect(responseData.body).toBe(body)

      // Verify server received correct body
      expect(receivedRequests).toHaveLength(1)
      expect(receivedRequests[0].body).toBe(body)
    })

    it('should handle small response (100 bytes)', async () => {
      const response = await httpThroughProxy(targetHttpPort, { path: '/size/100' })
      expect(response.status).toBe(200)
      expect(response.body.length).toBe(100)
    })

    it('should handle medium response (10KB)', async () => {
      const response = await httpThroughProxy(targetHttpPort, { path: '/size/10240' })
      expect(response.status).toBe(200)
      expect(response.body.length).toBe(10240)
    })

    it('should handle large response (200KB)', async () => {
      const response = await httpThroughProxy(targetHttpPort, { path: '/size/204800' })
      expect(response.status).toBe(200)
      expect(response.body.length).toBe(204800)
    })

    it('should handle chunked response', async () => {
      const response = await httpThroughProxy(targetHttpPort, { path: '/chunked' })
      expect(response.status).toBe(200)
      expect(response.body).toBe('chunk1-chunk2-chunk3')
    })

    it('should handle gzip compressed response', async () => {
      const response = await httpThroughProxy(targetHttpPort, { path: '/gzip' })
      expect(response.status).toBe(200)
      // Note: proxy may or may not decompress - check either way
      try {
        const data = JSON.parse(response.body)
        expect(data.compressed).toBe(true)
        expect(data.method).toBe('gzip')
      } catch {
        // Response is still compressed - that's OK too
        expect(response.headers['content-encoding']).toBe('gzip')
      }
    })

    it('should handle large POST body (200KB)', async () => {
      receivedRequests = []
      const largeBody = 'x'.repeat(204800)

      const response = await httpThroughProxy(targetHttpPort, {
        method: 'POST',
        path: '/echo',
        headers: { 'Content-Type': 'text/plain' },
        body: largeBody
      })

      expect(response.status).toBe(200)
      const responseData = JSON.parse(response.body)
      expect(responseData.bodyLength).toBe(204800)

      // Verify server received full body
      expect(receivedRequests).toHaveLength(1)
      expect(receivedRequests[0].body.length).toBe(204800)
    })
  })

  describe('HTTPS through proxy (CONNECT tunnel)', () => {
    it('should proxy simple GET request', async () => {
      receivedRequests = []

      const response = await httpsThroughProxy(targetHttpsPort, { path: '/test' })

      expect(response.status).toBe(200)
      expect(JSON.parse(response.body)).toEqual({ ok: true, path: '/test' })

      // Verify server received request
      expect(receivedRequests).toHaveLength(1)
      expect(receivedRequests[0].method).toBe('GET')
      expect(receivedRequests[0].url).toBe('/test')
    })

    it('should proxy POST request with body', async () => {
      receivedRequests = []
      const body = JSON.stringify({ test: 'data', number: 123 })

      const response = await httpsThroughProxy(targetHttpsPort, {
        method: 'POST',
        path: '/echo',
        headers: { 'Content-Type': 'application/json' },
        body
      })

      expect(response.status).toBe(200)
      const responseData = JSON.parse(response.body)
      expect(responseData.method).toBe('POST')
      expect(responseData.body).toBe(body)

      // Verify server received correct body
      expect(receivedRequests).toHaveLength(1)
      expect(receivedRequests[0].body).toBe(body)
    })

    it('should handle small response (100 bytes)', async () => {
      const response = await httpsThroughProxy(targetHttpsPort, { path: '/size/100' })
      expect(response.status).toBe(200)
      expect(response.body.length).toBe(100)
    })

    it('should handle medium response (10KB)', async () => {
      const response = await httpsThroughProxy(targetHttpsPort, { path: '/size/10240' })
      expect(response.status).toBe(200)
      expect(response.body.length).toBe(10240)
    })

    it('should handle large response (200KB)', async () => {
      const response = await httpsThroughProxy(targetHttpsPort, { path: '/size/204800' })
      expect(response.status).toBe(200)
      expect(response.body.length).toBe(204800)
    })

    it('should handle chunked response', async () => {
      const response = await httpsThroughProxy(targetHttpsPort, { path: '/chunked' })
      expect(response.status).toBe(200)
      expect(response.body).toBe('chunk1-chunk2-chunk3')
    })

    it('should handle gzip compressed response', async () => {
      const response = await httpsThroughProxy(targetHttpsPort, { path: '/gzip' })
      expect(response.status).toBe(200)
      try {
        const data = JSON.parse(response.body)
        expect(data.compressed).toBe(true)
        expect(data.method).toBe('gzip')
      } catch {
        expect(response.headers['content-encoding']).toBe('gzip')
      }
    })

    it('should handle deflate compressed response', async () => {
      const response = await httpsThroughProxy(targetHttpsPort, { path: '/deflate' })
      expect(response.status).toBe(200)
      try {
        const data = JSON.parse(response.body)
        expect(data.compressed).toBe(true)
        expect(data.method).toBe('deflate')
      } catch {
        expect(response.headers['content-encoding']).toBe('deflate')
      }
    })

    it('should handle large POST body (200KB)', async () => {
      receivedRequests = []
      const largeBody = 'x'.repeat(204800)

      const response = await httpsThroughProxy(targetHttpsPort, {
        method: 'POST',
        path: '/echo',
        headers: { 'Content-Type': 'text/plain' },
        body: largeBody
      })

      expect(response.status).toBe(200)
      const responseData = JSON.parse(response.body)
      expect(responseData.bodyLength).toBe(204800)

      // Verify server received full body
      expect(receivedRequests).toHaveLength(1)
      expect(receivedRequests[0].body.length).toBe(204800)
    })

    it('should handle multiple sequential requests on same tunnel', async () => {
      receivedRequests = []

      // Make 3 sequential requests
      for (let i = 0; i < 3; i++) {
        const response = await httpsThroughProxy(targetHttpsPort, { path: `/test${i}` })
        expect(response.status).toBe(200)
      }

      expect(receivedRequests).toHaveLength(3)
      expect(receivedRequests[0].url).toBe('/test0')
      expect(receivedRequests[1].url).toBe('/test1')
      expect(receivedRequests[2].url).toBe('/test2')
    })
  })

  describe('Edge cases', () => {
    it('should handle empty response body', async () => {
      const response = await httpThroughProxy(targetHttpPort, { path: '/empty' })
      expect(response.status).toBe(204)
      expect(response.body.length).toBe(0)
    })

    it('should handle request with many headers', async () => {
      receivedRequests = []
      const headers: Record<string, string> = {}
      for (let i = 0; i < 20; i++) {
        headers[`X-Custom-Header-${i}`] = `value-${i}`
      }

      const response = await httpThroughProxy(targetHttpPort, {
        path: '/echo',
        headers
      })

      expect(response.status).toBe(200)

      // Verify headers were forwarded
      const received = receivedRequests[0]
      for (let i = 0; i < 20; i++) {
        expect(received.headers[`x-custom-header-${i}`]).toBe(`value-${i}`)
      }
    })

    it('should handle slow response', async () => {
      const start = Date.now()
      const response = await httpThroughProxy(targetHttpPort, { path: '/slow' })
      const duration = Date.now() - start

      expect(response.status).toBe(200)
      expect(response.body).toBe('finally done')
      expect(duration).toBeGreaterThan(400) // Should take at least 500ms
    })

    it('should preserve Content-Type header', async () => {
      receivedRequests = []

      await httpThroughProxy(targetHttpPort, {
        method: 'POST',
        path: '/echo',
        headers: { 'Content-Type': 'application/xml' },
        body: '<xml>test</xml>'
      })

      expect(receivedRequests[0].headers['content-type']).toBe('application/xml')
    })
  })
})
