/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import https from 'https'
import { createServer as createHttpsServer } from 'https'
import { gzipSync, deflateSync } from 'zlib'
import type { Duplex } from 'stream'
import type { Flow } from '../shared/types.js'
import { createNativeTlsSocket, createProviderTlsSocket, forwardRequest } from './tls-sockets.js'
import { type ResponseWriter } from './proxy-handler.js'
import { registerProvider, setActiveProvider, shutdownActiveProvider } from './tls-provider.js'
import { utlsProvider } from './tls-provider-utls.js'

// Mock the store module
vi.mock('./flow-store.js', () => ({
  saveFlow: vi.fn(),
  deleteRawHttp: vi.fn(),
  initFlowEvents: vi.fn(),
  addEvent: vi.fn(),
  getEvents: vi.fn(() => []),
  setRawHttpResponse: vi.fn(),
  getRawHttp: vi.fn(),
  getRawHttpFlowIds: vi.fn(() => []),
  initRawHttp: vi.fn(),
  initWebSocket: vi.fn(),
  getClientCount: vi.fn(() => 0)
}))

// Generate self-signed cert for test server
async function generateSelfSignedCert() {
  // Use node-forge to generate a self-signed certificate
  const forge = await import('node-forge')
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

// Test server setup
let testServer: https.Server
let testServerPort: number
let credentials: { key: string; cert: string }

// Socket factory types for parameterized tests
type SocketFactory = (host: string, port: number) => Promise<Duplex>

interface TlsImplementation {
  name: string
  createSocket: SocketFactory
  setup: () => Promise<void>
  teardown: () => Promise<void>
}

const implementations: TlsImplementation[] = [
  {
    name: 'Native TLS',
    createSocket: createNativeTlsSocket,
    setup: async () => {},
    teardown: async () => {}
  },
  {
    name: 'uTLS Provider',
    createSocket: createProviderTlsSocket,
    setup: async () => {
      registerProvider(utlsProvider)
      await setActiveProvider('utls')
    },
    teardown: async () => {
      await shutdownActiveProvider()
    }
  }
]

// Helper to create a mock writer that captures output
function createMockWriter(): { writer: ResponseWriter; result: () => { status: number; headers: any; body: string; ended: boolean } } {
  let status = 0
  let headers: any = {}
  const chunks: Buffer[] = []
  let ended = false

  return {
    writer: {
      writeHead: (s, h) => { status = s; headers = h },
      write: (chunk) => { chunks.push(chunk) },
      end: () => { ended = true }
    },
    result: () => ({
      status,
      headers,
      body: Buffer.concat(chunks).toString('utf-8'),
      ended
    })
  }
}

// Helper to wait for response to complete
function waitForResponse(mock: ReturnType<typeof createMockWriter>, timeout = 5000): Promise<ReturnType<ReturnType<typeof createMockWriter>['result']>> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const check = () => {
      if (mock.result().ended) {
        resolve(mock.result())
      } else if (Date.now() - start > timeout) {
        reject(new Error('Response timeout'))
      } else {
        setTimeout(check, 10)
      }
    }
    check()
  })
}

// Helper to create a flow object
function createFlow(id: string, method: string, path: string): Flow {
  return {
    id,
    timestamp: new Date().toISOString(),
    host: 'localhost',
    type: 'https',
    request: {
      method,
      url: `https://localhost:${testServerPort}${path}`,
      path,
      headers: {}
    }
  }
}

describe('TLS Socket Integration Tests', () => {
  beforeAll(async () => {
    // Generate credentials
    credentials = await generateSelfSignedCert()

    // Create test HTTPS server
    testServer = createHttpsServer(credentials, (req, res) => {
      const url = new URL(req.url || '/', `https://localhost`)

      // Simple JSON response
      if (url.pathname === '/json') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, message: 'Hello World' }))
        return
      }

      // Chunked response
      if (url.pathname === '/chunked') {
        res.writeHead(200, {
          'Content-Type': 'text/plain',
          'Transfer-Encoding': 'chunked'
        })
        res.write('chunk1')
        setTimeout(() => {
          res.write('chunk2')
          setTimeout(() => {
            res.write('chunk3')
            res.end()
          }, 50)
        }, 50)
        return
      }

      // SSE (Server-Sent Events)
      if (url.pathname === '/sse') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        })

        let count = 0
        const interval = setInterval(() => {
          count++
          res.write(`data: {"count":${count}}\n\n`)
          if (count >= 3) {
            clearInterval(interval)
            res.end()
          }
        }, 50)
        return
      }

      // Gzip compressed response
      if (url.pathname === '/gzip') {
        const data = JSON.stringify({ compressed: true, method: 'gzip' })
        const compressed = gzipSync(data)
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Content-Encoding': 'gzip',
          'Content-Length': compressed.length.toString()
        })
        res.end(compressed)
        return
      }

      // Deflate compressed response
      if (url.pathname === '/deflate') {
        const data = JSON.stringify({ compressed: true, method: 'deflate' })
        const compressed = deflateSync(data)
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Content-Encoding': 'deflate',
          'Content-Length': compressed.length.toString()
        })
        res.end(compressed)
        return
      }

      // Large response (for chunking/streaming test)
      if (url.pathname === '/large') {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        const chunk = 'x'.repeat(1024) // 1KB chunks
        for (let i = 0; i < 100; i++) {
          res.write(chunk)
        }
        res.end()
        return
      }

      // POST echo
      if (url.pathname === '/echo' && req.method === 'POST') {
        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ received: body }))
        })
        return
      }

      // Compressed SSE
      if (url.pathname === '/sse-gzip') {
        // Note: SSE with gzip is unusual but should still work
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Content-Encoding': 'gzip',
          'Cache-Control': 'no-cache'
        })

        const events = [
          'data: {"msg":"event1"}\n\n',
          'data: {"msg":"event2"}\n\n',
          'data: {"msg":"event3"}\n\n'
        ].join('')

        res.end(gzipSync(events))
        return
      }

      // Empty response
      if (url.pathname === '/empty') {
        res.writeHead(204)
        res.end()
        return
      }

      // Error response
      if (url.pathname === '/error') {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Internal Server Error' }))
        return
      }

      // Default 404
      res.writeHead(404)
      res.end('Not Found')
    })

    // Start server on random port
    await new Promise<void>((resolve) => {
      testServer.listen(0, () => {
        const addr = testServer.address()
        testServerPort = typeof addr === 'object' && addr ? addr.port : 0
        console.log(`Test HTTPS server running on port ${testServerPort}`)
        resolve()
      })
    })
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      testServer.close(() => resolve())
    })
  })

  // Run all tests for both TLS implementations
  for (const impl of implementations) {
    describe(`${impl.name}`, () => {
      beforeAll(async () => {
        await impl.setup()
      })

      afterAll(async () => {
        await impl.teardown()
      })

      describe('Basic Requests', () => {
        it('should handle simple JSON response', async () => {
          const socket = await impl.createSocket('localhost', testServerPort)
          const mock = createMockWriter()
          const flow = createFlow('json-test', 'GET', '/json')

          forwardRequest(
            'localhost', testServerPort, 'GET', '/json',
            {}, undefined, flow, Date.now(), mock.writer, socket
          )

          const result = await waitForResponse(mock)
          expect(result.status).toBe(200)
          expect(result.body).toContain('Hello World')
        })

        it('should handle POST with body', async () => {
          const socket = await impl.createSocket('localhost', testServerPort)
          const mock = createMockWriter()
          const flow = createFlow('post-test', 'POST', '/echo')
          const body = JSON.stringify({ test: 'data' })

          forwardRequest(
            'localhost', testServerPort, 'POST', '/echo',
            { 'content-type': 'application/json', 'content-length': body.length.toString() },
            body, flow, Date.now(), mock.writer, socket
          )

          const result = await waitForResponse(mock)
          expect(result.status).toBe(200)
          expect(result.body).toContain('"received"')
          expect(result.body).toContain('test')
        })

        it('should handle empty response', async () => {
          const socket = await impl.createSocket('localhost', testServerPort)
          const mock = createMockWriter()
          const flow = createFlow('empty-test', 'GET', '/empty')

          forwardRequest(
            'localhost', testServerPort, 'GET', '/empty',
            {}, undefined, flow, Date.now(), mock.writer, socket
          )

          const result = await waitForResponse(mock)
          expect(result.status).toBe(204)
          expect(result.body).toBe('')
        })

        it('should handle error response', async () => {
          const socket = await impl.createSocket('localhost', testServerPort)
          const mock = createMockWriter()
          const flow = createFlow('error-test', 'GET', '/error')

          forwardRequest(
            'localhost', testServerPort, 'GET', '/error',
            {}, undefined, flow, Date.now(), mock.writer, socket
          )

          const result = await waitForResponse(mock)
          expect(result.status).toBe(500)
          expect(result.body).toContain('Internal Server Error')
        })
      })

      describe('Chunked Responses', () => {
        it('should handle chunked transfer encoding', async () => {
          const socket = await impl.createSocket('localhost', testServerPort)
          const mock = createMockWriter()
          const flow = createFlow('chunked-test', 'GET', '/chunked')

          forwardRequest(
            'localhost', testServerPort, 'GET', '/chunked',
            {}, undefined, flow, Date.now(), mock.writer, socket
          )

          const result = await waitForResponse(mock)
          expect(result.status).toBe(200)
          expect(result.body).toBe('chunk1chunk2chunk3')
        })

        it('should handle large response', async () => {
          const socket = await impl.createSocket('localhost', testServerPort)
          const mock = createMockWriter()
          const flow = createFlow('large-test', 'GET', '/large')

          forwardRequest(
            'localhost', testServerPort, 'GET', '/large',
            {}, undefined, flow, Date.now(), mock.writer, socket
          )

          const result = await waitForResponse(mock, 10000)
          expect(result.status).toBe(200)
          expect(result.body.length).toBe(100 * 1024) // 100KB
        })
      })

      describe('SSE (Server-Sent Events)', () => {
        it('should handle SSE stream', async () => {
          const socket = await impl.createSocket('localhost', testServerPort)
          const mock = createMockWriter()
          const flow = createFlow('sse-test', 'GET', '/sse')

          forwardRequest(
            'localhost', testServerPort, 'GET', '/sse',
            {}, undefined, flow, Date.now(), mock.writer, socket
          )

          const result = await waitForResponse(mock)
          expect(result.status).toBe(200)
          expect(result.headers['content-type']).toBe('text/event-stream')
          expect(result.body).toContain('data: {"count":1}')
          expect(result.body).toContain('data: {"count":2}')
          expect(result.body).toContain('data: {"count":3}')
        })
      })

      describe('Compression', () => {
        it('should handle gzip compressed response', async () => {
          const socket = await impl.createSocket('localhost', testServerPort)
          const mock = createMockWriter()
          const flow = createFlow('gzip-test', 'GET', '/gzip')

          forwardRequest(
            'localhost', testServerPort, 'GET', '/gzip',
            { 'accept-encoding': 'gzip' },
            undefined, flow, Date.now(), mock.writer, socket
          )

          const result = await waitForResponse(mock)
          expect(result.status).toBe(200)
          // Response should be decompressed by handleProxyResponse
          expect(result.body).toContain('compressed')
          expect(result.body).toContain('gzip')
        })

        it('should handle deflate compressed response', async () => {
          const socket = await impl.createSocket('localhost', testServerPort)
          const mock = createMockWriter()
          const flow = createFlow('deflate-test', 'GET', '/deflate')

          forwardRequest(
            'localhost', testServerPort, 'GET', '/deflate',
            { 'accept-encoding': 'deflate' },
            undefined, flow, Date.now(), mock.writer, socket
          )

          const result = await waitForResponse(mock)
          expect(result.status).toBe(200)
          // Response should be decompressed by handleProxyResponse
          expect(result.body).toContain('compressed')
          expect(result.body).toContain('deflate')
        })
      })

      describe('Connection Handling', () => {
        it('should handle multiple sequential requests', async () => {
          for (let i = 0; i < 3; i++) {
            const socket = await impl.createSocket('localhost', testServerPort)
            const mock = createMockWriter()
            const flow = createFlow(`seq-${i}`, 'GET', '/json')

            forwardRequest(
              'localhost', testServerPort, 'GET', '/json',
              {}, undefined, flow, Date.now(), mock.writer, socket
            )

            const result = await waitForResponse(mock)
            expect(result.status).toBe(200)
          }
        })

        it('should handle connection to non-existent server', async () => {
          try {
            // Try to connect to a port that's not listening
            await impl.createSocket('localhost', 59999)
            expect.fail('Should have thrown an error')
          } catch (err: any) {
            // Error may have code property (e.g., 'ECONNREFUSED') or message
            const errorInfo = err.code || err.message || ''
            expect(errorInfo).toMatch(/ECONNREFUSED|connection refused|failed/i)
          }
        })
      })
    })
  }
})
