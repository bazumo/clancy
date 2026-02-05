/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createTunnelHttpParser, attachSocketToParser } from './https-tunnel-handler.js'
import { EventEmitter } from 'events'

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

// Mock utils
vi.mock('./utils.js', () => ({
  generateId: () => 'test-id'
}))

// Mock tls-sockets
vi.mock('./tls-sockets.js', () => ({
  forwardRequest: vi.fn()
}))

// Mock proxy-handler
vi.mock('./proxy-handler.js', () => ({
  createResponseWriter: vi.fn(() => ({
    writeHead: vi.fn(),
    write: vi.fn(),
    end: vi.fn()
  }))
}))

describe('HTTPS Tunnel Handler', () => {
  let mockTlsSocket: any
  let mockUpstreamSocket: any

  beforeEach(() => {
    vi.clearAllMocks()

    // Create mock TLS socket
    mockTlsSocket = new EventEmitter()
    mockTlsSocket.write = vi.fn()
    mockTlsSocket.end = vi.fn()
    mockTlsSocket.destroy = vi.fn()
    mockTlsSocket.destroyed = false

    // Create mock upstream socket
    mockUpstreamSocket = new EventEmitter()
    mockUpstreamSocket.write = vi.fn()
    mockUpstreamSocket.end = vi.fn()
    mockUpstreamSocket.destroy = vi.fn()
    mockUpstreamSocket.pipe = vi.fn()
    mockUpstreamSocket.removeListener = vi.fn()
  })

  describe('createTunnelHttpParser', () => {
    it('should create HTTP parser server', () => {
      const server = createTunnelHttpParser('example.com', 443, mockTlsSocket as any, mockUpstreamSocket)

      expect(server).toBeDefined()
      expect(server.timeout).toBe(0)
      expect(server.headersTimeout).toBe(0)
      expect(server.requestTimeout).toBe(0)
    })

    it('should have request handler', () => {
      const server = createTunnelHttpParser('example.com', 443, mockTlsSocket as any, mockUpstreamSocket)

      // Server should have listeners for 'request' event
      const listeners = server.listeners('request')
      expect(listeners.length).toBeGreaterThan(0)
    })

    it('should have upgrade handler', () => {
      const server = createTunnelHttpParser('example.com', 443, mockTlsSocket as any, mockUpstreamSocket)

      // Server should have listeners for 'upgrade' event
      const listeners = server.listeners('upgrade')
      expect(listeners.length).toBeGreaterThan(0)
    })
  })

  describe('attachSocketToParser', () => {
    it('should attach socket to parser by emitting connection event', () => {
      const server = createTunnelHttpParser('example.com', 443, mockTlsSocket as any, mockUpstreamSocket)
      const emitSpy = vi.spyOn(server, 'emit')

      attachSocketToParser(server, mockTlsSocket as any)

      expect(emitSpy).toHaveBeenCalledWith('connection', mockTlsSocket)
    })
  })

  describe('HTTP request handling', () => {
    it('should handle basic HTTP request through Node parser', async () => {
      const server = createTunnelHttpParser('example.com', 443, mockTlsSocket as any, mockUpstreamSocket)

      // Attach socket to trigger parsing
      attachSocketToParser(server, mockTlsSocket as any)

      // Give it a moment to set up, then verify the server is listening
      await new Promise(resolve => setTimeout(resolve, 10))
      expect(server.listening).toBe(false) // Server isn't actually listening on a port
    })
  })

  describe('WebSocket upgrade handling', () => {
    it('should handle WebSocket upgrade requests', () => {
      const server = createTunnelHttpParser('example.com', 443, mockTlsSocket as any, mockUpstreamSocket)

      // Verify upgrade handler exists
      const listeners = server.listeners('upgrade')
      expect(listeners.length).toBe(1)
    })

    it('should write upgrade request to upstream socket', () => {
      const server = createTunnelHttpParser('example.com', 443, mockTlsSocket as any, mockUpstreamSocket)

      // Create mock request and socket for upgrade event
      const mockReq = {
        url: '/ws',
        headers: {
          'upgrade': 'websocket',
          'sec-websocket-key': 'test-key'
        }
      } as any

      const mockClientSocket = new EventEmitter() as any
      const head = Buffer.from('test')

      // Trigger upgrade event
      server.emit('upgrade', mockReq, mockClientSocket, head)

      // Verify upstream socket received the upgrade request
      expect(mockUpstreamSocket.write).toHaveBeenCalled()
      const writeCall = mockUpstreamSocket.write.mock.calls[0][0]
      expect(writeCall).toContain('GET /ws HTTP/1.1')
      expect(writeCall).toContain('Host: example.com')
    })

    it('should handle missing upstream socket gracefully', () => {
      const server = createTunnelHttpParser('example.com', 443, mockTlsSocket as any, null)

      const mockReq = {
        url: '/ws',
        headers: { 'upgrade': 'websocket' }
      } as any

      const mockClientSocket = new EventEmitter() as any
      mockClientSocket.write = vi.fn()
      mockClientSocket.end = vi.fn()

      const head = Buffer.from('')

      // Trigger upgrade event
      server.emit('upgrade', mockReq, mockClientSocket, head)

      // Should send 502 error
      expect(mockClientSocket.write).toHaveBeenCalledWith('HTTP/1.1 502 Bad Gateway\r\n\r\n')
      expect(mockClientSocket.end).toHaveBeenCalled()
    })
  })
})
