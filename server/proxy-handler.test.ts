/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import http from 'http'
import type { Flow } from '../shared/types.js'
import {
  handleProxyResponse,
  handleProxyError,
  createExpressWriter,
  buildResponseHeader,
  type ResponseWriter,
} from './proxy-handler.js'

// Mock the store
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

// Mock decompressBody
vi.mock('./utils.js', () => ({
  generateId: () => 'test-id',
  decompressBody: (body: Buffer, encoding?: string) => {
    if (!encoding) return body.toString('utf-8')
    return `decompressed[${encoding}]: ${body.toString('utf-8')}`
  }
}))

// Mock parsers
vi.mock('./parsers/index.js', () => ({
  createStreamParser: vi.fn(() => null),
  isBedrockStream: vi.fn(() => false)
}))

describe('Proxy Handler', () => {
  let mockWriter: ResponseWriter
  let writeHeadCalls: Array<[number, any]>
  let writeCalls: Buffer[]
  let endCalls: number

  beforeEach(() => {
    writeHeadCalls = []
    writeCalls = []
    endCalls = 0

    mockWriter = {
      writeHead: (status, headers) => {
        writeHeadCalls.push([status, headers])
      },
      write: (chunk) => {
        writeCalls.push(chunk)
      },
      end: () => {
        endCalls++
      }
    }
  })

  describe('buildResponseHeader', () => {
    it('should build correct HTTP response header', () => {
      const header = buildResponseHeader(200, 'OK', { 'content-type': 'text/plain' }, 13)
      expect(header).toContain('HTTP/1.1 200 OK')
      expect(header).toContain('content-type: text/plain')
      expect(header).toContain('content-length: 13')
      expect(header).toMatch(/\r\n\r\n$/)
    })

    it('should filter out transfer-encoding header', () => {
      const header = buildResponseHeader(200, 'OK', {
        'content-type': 'text/plain',
        'transfer-encoding': 'chunked'
      })
      expect(header).not.toContain('transfer-encoding')
    })
  })

  describe('handleProxyResponse - Simple Response', () => {
    it('should handle simple non-streaming response without encoding', () => {
      return new Promise<void>((resolve, reject) => {
        const mockProxyRes = new (class extends http.IncomingMessage {
          constructor() {
            super(null as any)
            this.statusCode = 200
            this.statusMessage = 'OK'
            this.headers = { 'content-type': 'text/plain' }
          }
        })()

        const flow: Flow = {
          id: 'test-1',
          timestamp: new Date().toISOString(),
          host: 'example.com',
          type: 'http',
          request: {
            method: 'GET',
            url: 'http://example.com/test',
            path: '/test',
            headers: {}
          }
        }

        const startTime = Date.now()

        // Call handler
        handleProxyResponse(mockProxyRes, { flow, startTime, writer: mockWriter })

        // Simulate response data
        const responseData = Buffer.from('Hello World')
        mockProxyRes.emit('data', responseData)

        // Simulate end
        setTimeout(() => {
          mockProxyRes.emit('end')

          // Assertions
          try {
            expect(writeHeadCalls).toHaveLength(1)
            expect(writeHeadCalls[0][0]).toBe(200)
            expect(writeCalls).toHaveLength(1)
            expect(writeCalls[0].toString()).toBe('Hello World')
            expect(endCalls).toBe(1)
            resolve()
          } catch (err) {
            reject(err)
          }
        }, 50)
      })
    })

    it('should buffer uncompressed response before sending', () => {
      return new Promise<void>((resolve, reject) => {
        const mockProxyRes = new (class extends http.IncomingMessage {
          constructor() {
            super(null as any)
            this.statusCode = 200
            this.statusMessage = 'OK'
            this.headers = { 'content-type': 'text/plain' }
          }
        })()

        const flow: Flow = {
          id: 'test-2',
          timestamp: new Date().toISOString(),
          host: 'example.com',
          type: 'http',
          request: { method: 'GET', url: 'http://example.com/', path: '/', headers: {} }
        }

        handleProxyResponse(mockProxyRes, { flow, startTime: Date.now(), writer: mockWriter })

        // Send multiple chunks
        mockProxyRes.emit('data', Buffer.from('Hello '))
        mockProxyRes.emit('data', Buffer.from('World'))

        setTimeout(() => {
          mockProxyRes.emit('end')

          try {
            expect(writeHeadCalls).toHaveLength(1)
            // Should write both chunks immediately for uncompressed response
            expect(writeCalls).toHaveLength(2)
            expect(endCalls).toBe(1)
            resolve()
          } catch (err) {
            reject(err)
          }
        }, 50)
      })
    })
  })

  describe('handleProxyResponse - Hanging Issue', () => {
    it('should NOT hang when response ends without content-encoding', () => {
      return new Promise<void>((resolve, reject) => {
        const mockProxyRes = new (class extends http.IncomingMessage {
          constructor() {
            super(null as any)
            this.statusCode = 200
            this.statusMessage = 'OK'
            this.headers = { 'content-type': 'application/json' }
          }
        })()

        const flow: Flow = {
          id: 'test-hang-1',
          timestamp: new Date().toISOString(),
          host: 'api.example.com',
          type: 'http',
          request: { method: 'GET', url: 'http://api.example.com/data', path: '/data', headers: {} }
        }

        handleProxyResponse(mockProxyRes, { flow, startTime: Date.now(), writer: mockWriter })

        mockProxyRes.emit('data', Buffer.from('{"status":"ok"}'))

        // Test timeout - if this doesn't complete in 1s, the test will fail
        const timeout = setTimeout(() => {
          reject(new Error('Response handler hung - end event was not processed'))
        }, 1000)

        setTimeout(() => {
          mockProxyRes.emit('end')
        }, 50)

        // Monitor for end() call
        const originalEnd = mockWriter.end
        mockWriter.end = () => {
          clearTimeout(timeout)
          originalEnd()
          resolve()
        }
      })
    })

    it('BUG: should write SSE chunks immediately to client, not buffer until end', () => {
      return new Promise<void>((resolve, reject) => {
        const mockProxyRes = new (class extends http.IncomingMessage {
          constructor() {
            super(null as any)
            this.statusCode = 200
            this.statusMessage = 'OK'
            this.headers = {
              'content-type': 'text/event-stream'
            }
          }
        })()

        const flow: Flow = {
          id: 'test-sse-bug',
          timestamp: new Date().toISOString(),
          host: 'api.example.com',
          type: 'http',
          request: { method: 'GET', url: 'http://api.example.com/stream', path: '/stream', headers: {} }
        }

        let firstChunkWritten = false
        const testWriter: ResponseWriter = {
          writeHead: mockWriter.writeHead,
          write: (chunk) => {
            // Client should receive data chunks immediately, not buffered
            firstChunkWritten = true
            mockWriter.write(chunk)
          },
          end: mockWriter.end
        }

        handleProxyResponse(mockProxyRes, { flow, startTime: Date.now(), writer: testWriter })

        // Emit first chunk - client app will be waiting for this!
        mockProxyRes.emit('data', Buffer.from('data: {"msg":"1"}\n\n'))

        // The bug: if content-type is text/event-stream (SSE), the chunk should be written
        // to client immediately. If it's buffered, the client app will hang.
        const timeout = setTimeout(() => {
          if (!firstChunkWritten) {
            reject(new Error(
              'BUG FOUND: SSE chunks are being buffered instead of streamed immediately to client. ' +
              'This causes client applications to hang waiting for the first chunk.'
            ))
          } else {
            clearTimeout(timeout)
            resolve()
          }
        }, 200)

        setTimeout(() => {
          mockProxyRes.emit('end')
        }, 100)
      })
    })

    it('should NOT hang with chunked/streaming response', () => {
      return new Promise<void>((resolve, reject) => {
        const mockProxyRes = new (class extends http.IncomingMessage {
          constructor() {
            super(null as any)
            this.statusCode = 200
            this.statusMessage = 'OK'
            this.headers = {
              'content-type': 'text/event-stream',
              'transfer-encoding': 'chunked'
            }
          }
        })()

        const flow: Flow = {
          id: 'test-hang-2',
          timestamp: new Date().toISOString(),
          host: 'api.example.com',
          type: 'http',
          request: { method: 'GET', url: 'http://api.example.com/stream', path: '/stream', headers: {} }
        }

        handleProxyResponse(mockProxyRes, { flow, startTime: Date.now(), writer: mockWriter })

        mockProxyRes.emit('data', Buffer.from('data: {"msg":"1"}\n\n'))
        mockProxyRes.emit('data', Buffer.from('data: {"msg":"2"}\n\n'))

        const timeout = setTimeout(() => {
          reject(new Error('Streaming response handler hung'))
        }, 1000)

        setTimeout(() => {
          mockProxyRes.emit('end')
        }, 100)

        let endWasCalled = false
        const originalEnd = mockWriter.end
        mockWriter.end = () => {
          if (!endWasCalled) {
            endWasCalled = true
            clearTimeout(timeout)
            originalEnd()
            resolve()
          }
        }
      })
    })

    it('should properly handle empty response body', () => {
      return new Promise<void>((resolve, reject) => {
        const mockProxyRes = new (class extends http.IncomingMessage {
          constructor() {
            super(null as any)
            this.statusCode = 204
            this.statusMessage = 'No Content'
            this.headers = {}
          }
        })()

        const flow: Flow = {
          id: 'test-empty',
          timestamp: new Date().toISOString(),
          host: 'example.com',
          type: 'http',
          request: { method: 'DELETE', url: 'http://example.com/resource', path: '/resource', headers: {} }
        }

        handleProxyResponse(mockProxyRes, { flow, startTime: Date.now(), writer: mockWriter })

        const timeout = setTimeout(() => {
          reject(new Error('Empty response handler hung'))
        }, 500)

        setTimeout(() => {
          mockProxyRes.emit('end')
        }, 50)

        let endWasCalled = false
        mockWriter.end = () => {
          if (!endWasCalled) {
            endWasCalled = true
            clearTimeout(timeout)
            resolve()
          }
        }
      })
    })

    it('should handle error without hanging', () => {
      return new Promise<void>((resolve, reject) => {
        const mockProxyRes = new (class extends http.IncomingMessage {
          constructor() {
            super(null as any)
            this.statusCode = 500
            this.statusMessage = 'Internal Server Error'
            this.headers = {}
          }
        })()

        const flow: Flow = {
          id: 'test-error',
          timestamp: new Date().toISOString(),
          host: 'example.com',
          type: 'http',
          request: { method: 'GET', url: 'http://example.com/', path: '/', headers: {} }
        }

        const timeout = setTimeout(() => {
          reject(new Error('Error response handler hung'))
        }, 500)

        handleProxyResponse(mockProxyRes, { flow, startTime: Date.now(), writer: mockWriter })

        mockProxyRes.emit('data', Buffer.from('Internal error'))

        setTimeout(() => {
          mockProxyRes.emit('end')
        }, 50)

        let endWasCalled = false
        mockWriter.end = () => {
          if (!endWasCalled) {
            endWasCalled = true
            clearTimeout(timeout)
            resolve()
          }
        }
      })
    })

    it('should NOT hang when multiple rapid responses come in', () => {
      return new Promise<void>((resolve, reject) => {
        const responses = [
          { status: 200, body: 'Response 1' },
          { status: 200, body: 'Response 2' },
          { status: 200, body: 'Response 3' }
        ]

        let handledCount = 0
        const timeout = setTimeout(() => {
          reject(new Error(`Handler hung - only handled ${handledCount}/${responses.length} responses`))
        }, 2000)

        for (const resp of responses) {
          const mockProxyRes = new (class extends http.IncomingMessage {
            constructor() {
              super(null as any)
              this.statusCode = resp.status
              this.statusMessage = 'OK'
              this.headers = { 'content-type': 'text/plain' }
            }
          })()

          const flow: Flow = {
            id: `test-rapid-${handledCount}`,
            timestamp: new Date().toISOString(),
            host: 'example.com',
            type: 'http',
            request: { method: 'GET', url: 'http://example.com/', path: '/', headers: {} }
          }

          const testWriter: ResponseWriter = {
            writeHead: mockWriter.writeHead,
            write: mockWriter.write,
            end: () => {
              handledCount++
              if (handledCount === responses.length) {
                clearTimeout(timeout)
                resolve()
              }
            }
          }

          handleProxyResponse(mockProxyRes, { flow, startTime: Date.now(), writer: testWriter })

          mockProxyRes.emit('data', Buffer.from(resp.body))
          mockProxyRes.emit('end')
        }
      })
    })
  })

  describe('handleProxyError', () => {
    it('should handle error properly', () => {
      const error = new Error('Connection refused')
      const flow: Flow = {
        id: 'test-err',
        timestamp: new Date().toISOString(),
        host: 'example.com',
        type: 'http',
        request: { method: 'GET', url: 'http://example.com/', path: '/', headers: {} }
      }

      handleProxyError(error, flow, Date.now(), mockWriter)

      expect(writeHeadCalls).toHaveLength(1)
      expect(writeHeadCalls[0][0]).toBe(502)
      expect(endCalls).toBe(1)
    })
  })

  describe('createExpressWriter', () => {
    it('should create writer from express response', () => {
      const mockRes = {
        writeHead: vi.fn(),
        write: vi.fn(),
        end: vi.fn()
      }

      const writer = createExpressWriter(mockRes as any)

      writer.writeHead(200, {})
      expect(mockRes.writeHead).toHaveBeenCalledWith(200, {})

      writer.write(Buffer.from('test'))
      expect(mockRes.write).toHaveBeenCalled()

      writer.end()
      expect(mockRes.end).toHaveBeenCalled()
    })
  })
})
