/**
 * WebSocket proxy tests
 * Tests WebSocket proxying for both ws:// (HTTP) and wss:// (HTTPS) connections
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'http'
import https from 'https'
import net from 'net'
import tls from 'tls'
import crypto from 'crypto'
import { WebSocketServer } from 'ws'
import { spawn, ChildProcess } from 'child_process'
import forge from 'node-forge'
import path from 'path'
import { fileURLToPath } from 'url'
import type { Flow } from '../shared/types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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

function generateWebSocketKey(): string {
  return crypto.randomBytes(16).toString('base64')
}

function generateAcceptKey(key: string): string {
  return crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64')
}

// Simple WebSocket frame encoding/decoding
function encodeFrame(data: string | Buffer, opcode: number = 0x01): Buffer {
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(data)
  const length = payload.length

  let frame: Buffer
  if (length < 126) {
    frame = Buffer.alloc(2 + 4 + length)
    frame[0] = 0x80 | opcode // FIN + opcode
    frame[1] = 0x80 | length // MASK + length
  } else if (length < 65536) {
    frame = Buffer.alloc(4 + 4 + length)
    frame[0] = 0x80 | opcode
    frame[1] = 0x80 | 126
    frame.writeUInt16BE(length, 2)
  } else {
    frame = Buffer.alloc(10 + 4 + length)
    frame[0] = 0x80 | opcode
    frame[1] = 0x80 | 127
    frame.writeBigUInt64BE(BigInt(length), 2)
  }

  // Generate mask key
  const maskKey = crypto.randomBytes(4)
  const maskOffset = frame.length - 4 - length
  maskKey.copy(frame, maskOffset)

  // Apply mask to payload
  for (let i = 0; i < length; i++) {
    frame[maskOffset + 4 + i] = payload[i] ^ maskKey[i % 4]
  }

  return frame
}

function decodeFrame(data: Buffer): { payload: string; opcode: number } | null {
  if (data.length < 2) return null

  const opcode = data[0] & 0x0f
  let payloadLength = data[1] & 0x7f
  let offset = 2

  if (payloadLength === 126) {
    if (data.length < 4) return null
    payloadLength = data.readUInt16BE(2)
    offset = 4
  } else if (payloadLength === 127) {
    if (data.length < 10) return null
    payloadLength = Number(data.readBigUInt64BE(2))
    offset = 10
  }

  if (data.length < offset + payloadLength) return null

  const payload = data.slice(offset, offset + payloadLength).toString()
  return { payload, opcode }
}

const PROXY_PORT = 19097
let httpWsPort: number
let httpsWsPort: number
let httpServer: http.Server
let httpsServer: https.Server
let httpWss: WebSocketServer
let httpsWss: WebSocketServer
let proxyProcess: ChildProcess | null = null

async function startProxy(): Promise<void> {
  return new Promise((resolve, reject) => {
    const tsxPath = path.join(__dirname, '..', 'node_modules', '.bin', 'tsx')
    const serverPath = path.join(__dirname, 'index.ts')

    proxyProcess = spawn(tsxPath, [serverPath, '-p', String(PROXY_PORT), '-t', 'native'], {
      cwd: path.join(__dirname, '..'),
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let started = false
    proxyProcess.stdout?.on('data', (data) => {
      const str = data.toString()
      if (!started && str.includes('Clancy proxy running')) {
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
// WebSocket Client Helpers
// ============================================================================

interface WebSocketConnection {
  send: (data: string) => void
  onMessage: (callback: (data: string) => void) => void
  close: () => void
}

/**
 * Create a WebSocket connection through HTTP proxy (ws://)
 */
async function connectWsThroughProxy(targetHost: string, targetPort: number, targetPath: string = '/'): Promise<WebSocketConnection> {
  return new Promise((resolve, reject) => {
    const targetUrl = `http://${targetHost}:${targetPort}${targetPath}`
    const wsKey = generateWebSocketKey()

    const req = http.request({
      hostname: 'localhost',
      port: PROXY_PORT,
      method: 'GET',
      path: targetUrl,
      headers: {
        'Host': `${targetHost}:${targetPort}`,
        'Upgrade': 'websocket',
        'Connection': 'Upgrade',
        'Sec-WebSocket-Key': wsKey,
        'Sec-WebSocket-Version': '13'
      }
    })

    req.on('upgrade', (res, socket, head) => {
      const expectedAccept = generateAcceptKey(wsKey)
      const actualAccept = res.headers['sec-websocket-accept']

      if (actualAccept !== expectedAccept) {
        socket.destroy()
        reject(new Error('Invalid Sec-WebSocket-Accept'))
        return
      }

      const messageCallbacks: ((data: string) => void)[] = []
      let buffer = Buffer.alloc(0)

      if (head.length > 0) {
        buffer = head
      }

      socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk])

        // Try to decode frames
        while (buffer.length > 0) {
          const frame = decodeFrame(buffer)
          if (!frame) break

          // Calculate full frame size to remove from buffer
          let frameSize = 2 + frame.payload.length
          if (frame.payload.length >= 126) frameSize += 2
          if (frame.payload.length >= 65536) frameSize += 6

          buffer = buffer.slice(frameSize)

          if (frame.opcode === 0x01) { // Text frame
            messageCallbacks.forEach(cb => cb(frame.payload))
          }
        }
      })

      resolve({
        send: (data: string) => {
          socket.write(encodeFrame(data))
        },
        onMessage: (callback) => {
          messageCallbacks.push(callback)
        },
        close: () => {
          socket.destroy()
        }
      })
    })

    req.on('response', (res) => {
      reject(new Error(`Upgrade failed with status ${res.statusCode}`))
    })

    req.on('error', reject)
    req.end()
  })
}

/**
 * Create a WebSocket connection through HTTPS CONNECT tunnel (wss://)
 */
async function connectWssThroughProxy(targetHost: string, targetPort: number, targetPath: string = '/'): Promise<WebSocketConnection> {
  return new Promise((resolve, reject) => {
    // First establish CONNECT tunnel
    const connectReq = http.request({
      hostname: 'localhost',
      port: PROXY_PORT,
      method: 'CONNECT',
      path: `${targetHost}:${targetPort}`
    })

    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        reject(new Error(`CONNECT failed: ${res.statusCode}`))
        return
      }

      // Wrap in TLS (connecting to proxy's fake cert)
      const tlsSocket = tls.connect({
        socket,
        rejectUnauthorized: false,
        servername: targetHost
      })

      tlsSocket.on('secureConnect', () => {
        const wsKey = generateWebSocketKey()

        // Send WebSocket upgrade request
        let upgradeRequest = `GET ${targetPath} HTTP/1.1\r\n`
        upgradeRequest += `Host: ${targetHost}:${targetPort}\r\n`
        upgradeRequest += `Upgrade: websocket\r\n`
        upgradeRequest += `Connection: Upgrade\r\n`
        upgradeRequest += `Sec-WebSocket-Key: ${wsKey}\r\n`
        upgradeRequest += `Sec-WebSocket-Version: 13\r\n`
        upgradeRequest += `\r\n`

        tlsSocket.write(upgradeRequest)

        // Wait for upgrade response
        let responseBuffer = Buffer.alloc(0)
        let upgraded = false
        const messageCallbacks: ((data: string) => void)[] = []

        const onData = (chunk: Buffer) => {
          responseBuffer = Buffer.concat([responseBuffer, chunk])

          if (!upgraded) {
            const headerEnd = responseBuffer.indexOf('\r\n\r\n')

            if (headerEnd !== -1) {
              const headerPart = responseBuffer.slice(0, headerEnd).toString('utf-8')
              const statusLine = headerPart.split('\r\n')[0]
              const statusMatch = statusLine.match(/HTTP\/[\d.]+ (\d+)/)
              const statusCode = statusMatch ? parseInt(statusMatch[1]) : 0

              if (statusCode === 101) {
                upgraded = true

                // Check Sec-WebSocket-Accept
                const acceptMatch = headerPart.match(/Sec-WebSocket-Accept:\s*(\S+)/i)
                const expectedAccept = generateAcceptKey(wsKey)

                if (acceptMatch?.[1] !== expectedAccept) {
                  tlsSocket.destroy()
                  reject(new Error('Invalid Sec-WebSocket-Accept'))
                  return
                }

                // Keep remaining data after headers
                responseBuffer = responseBuffer.slice(headerEnd + 4)

                resolve({
                  send: (data: string) => {
                    tlsSocket.write(encodeFrame(data))
                  },
                  onMessage: (callback) => {
                    messageCallbacks.push(callback)
                  },
                  close: () => {
                    tlsSocket.destroy()
                  }
                })
              } else {
                reject(new Error(`WebSocket upgrade failed with status ${statusCode}`))
              }
            }
          } else {
            // Process WebSocket frames
            while (responseBuffer.length > 0) {
              const frame = decodeFrame(responseBuffer)
              if (!frame) break

              let frameSize = 2 + frame.payload.length
              if (frame.payload.length >= 126) frameSize += 2
              if (frame.payload.length >= 65536) frameSize += 6

              responseBuffer = responseBuffer.slice(frameSize)

              if (frame.opcode === 0x01) {
                messageCallbacks.forEach(cb => cb(frame.payload))
              }
            }
          }
        }

        tlsSocket.on('data', onData)
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

describe('WebSocket Proxy Tests', () => {
  beforeAll(async () => {
    // Create HTTP WebSocket server
    httpServer = http.createServer()
    httpWss = new WebSocketServer({ server: httpServer })

    httpWss.on('connection', (ws) => {
      ws.on('message', (data) => {
        // Echo back with prefix
        ws.send(`echo: ${data.toString()}`)
      })
    })

    await new Promise<void>(resolve => httpServer.listen(0, () => {
      httpWsPort = (httpServer.address() as net.AddressInfo).port
      resolve()
    }))

    // Create HTTPS WebSocket server
    const creds = generateCert()
    httpsServer = https.createServer(creds)
    httpsWss = new WebSocketServer({ server: httpsServer })

    httpsWss.on('connection', (ws) => {
      ws.on('message', (data) => {
        // Echo back with prefix
        ws.send(`secure-echo: ${data.toString()}`)
      })
    })

    await new Promise<void>(resolve => httpsServer.listen(0, () => {
      httpsWsPort = (httpsServer.address() as net.AddressInfo).port
      resolve()
    }))

    // Start proxy
    await startProxy()
  }, 30000)

  afterAll(async () => {
    proxyProcess?.kill('SIGTERM')
    await new Promise(resolve => setTimeout(resolve, 300))
    await new Promise<void>(resolve => httpServer.close(() => resolve()))
    await new Promise<void>(resolve => httpsServer.close(() => resolve()))
  })

  describe('ws:// (HTTP WebSocket)', () => {
    it('should proxy WebSocket upgrade and messages', async () => {
      const ws = await connectWsThroughProxy('localhost', httpWsPort)

      const messages: string[] = []
      const messagePromise = new Promise<void>((resolve) => {
        ws.onMessage((data) => {
          messages.push(data)
          if (messages.length >= 2) resolve()
        })
      })

      // Send messages
      ws.send('hello')
      ws.send('world')

      await messagePromise

      expect(messages).toContain('echo: hello')
      expect(messages).toContain('echo: world')

      ws.close()
    })

    it('should record WebSocket flow', async () => {
      // Clear flows first
      await fetch(`http://localhost:${PROXY_PORT}/api/flows`, { method: 'DELETE' })

      const ws = await connectWsThroughProxy('localhost', httpWsPort)

      // Give proxy time to record
      await new Promise(resolve => setTimeout(resolve, 200))

      // Check flow was recorded
      const flowsRes = await fetch(`http://localhost:${PROXY_PORT}/api/flows`)
      const flowsData = await flowsRes.json()

      expect(flowsData.count).toBeGreaterThanOrEqual(1)
      const wsFlow = flowsData.flows.find((f: Flow) => f.type === 'websocket')
      expect(wsFlow).toBeDefined()
      expect(wsFlow.response?.status).toBe(101)

      ws.close()
    })
  })

  describe('wss:// (HTTPS WebSocket)', () => {
    it('should proxy secure WebSocket upgrade and messages', async () => {
      const ws = await connectWssThroughProxy('localhost', httpsWsPort)

      const messages: string[] = []
      const messagePromise = new Promise<void>((resolve) => {
        ws.onMessage((data) => {
          messages.push(data)
          if (messages.length >= 2) resolve()
        })
      })

      // Send messages
      ws.send('secure-hello')
      ws.send('secure-world')

      await messagePromise

      expect(messages).toContain('secure-echo: secure-hello')
      expect(messages).toContain('secure-echo: secure-world')

      ws.close()
    })

    it('should record secure WebSocket flow', async () => {
      // Clear flows first
      await fetch(`http://localhost:${PROXY_PORT}/api/flows`, { method: 'DELETE' })

      const ws = await connectWssThroughProxy('localhost', httpsWsPort)

      // Give proxy time to record
      await new Promise(resolve => setTimeout(resolve, 200))

      // Check flow was recorded
      const flowsRes = await fetch(`http://localhost:${PROXY_PORT}/api/flows`)
      const flowsData = await flowsRes.json()

      expect(flowsData.count).toBeGreaterThanOrEqual(1)
      const wsFlow = flowsData.flows.find((f: Flow) => f.type === 'websocket')
      expect(wsFlow).toBeDefined()
      expect(wsFlow.response?.status).toBe(101)

      ws.close()
    })

    it('should handle multiple messages bidirectionally', async () => {
      const ws = await connectWssThroughProxy('localhost', httpsWsPort)

      const receivedMessages: string[] = []
      const expectedCount = 5

      const allMessagesReceived = new Promise<void>((resolve) => {
        ws.onMessage((data) => {
          receivedMessages.push(data)
          if (receivedMessages.length >= expectedCount) {
            resolve()
          }
        })
      })

      // Send multiple messages rapidly
      for (let i = 0; i < expectedCount; i++) {
        ws.send(`message-${i}`)
      }

      await allMessagesReceived

      // Verify all echoed back
      for (let i = 0; i < expectedCount; i++) {
        expect(receivedMessages).toContain(`secure-echo: message-${i}`)
      }

      ws.close()
    })
  })

  describe('error handling', () => {
    it('should handle connection to non-existent server (ws://)', async () => {
      await expect(connectWsThroughProxy('localhost', 59999)).rejects.toThrow()
    })

    it('should handle connection to non-existent server (wss://)', async () => {
      await expect(connectWssThroughProxy('localhost', 59999)).rejects.toThrow()
    })
  })
})
