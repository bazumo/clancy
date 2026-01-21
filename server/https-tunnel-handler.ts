import http from 'http'
import type { TLSSocket } from 'tls'
import type { Duplex } from 'stream'
import type { Flow } from '../shared/types.js'
import { generateId } from './utils.js'
import { forwardRequest } from './tls-sockets.js'
import { createResponseWriter } from './proxy-handler.js'
import * as store from './flow-store.js'

/**
 * Creates an HTTP server that parses requests from a TLS socket.
 * This replaces the manual HTTP parsing logic by leveraging Node.js's built-in HTTP parser.
 */
export function createTunnelHttpParser(
  host: string,
  port: number,
  tlsSocket: TLSSocket,
  upstreamSocket: Duplex | null
): http.Server {
  const server = http.createServer((req, res) => {
    // Extract request body
    const bodyChunks: Buffer[] = []
    req.on('data', (chunk) => bodyChunks.push(chunk))
    req.on('end', () => {
      const body = bodyChunks.length > 0
        ? Buffer.concat(bodyChunks).toString('utf-8')
        : undefined

      // Create flow for this request
      const id = generateId()
      const startTime = Date.now()
      const url = `https://${host}${req.url}`

      console.log(`[CONNECT] HTTP request on ${host}:${port}: ${req.method} ${req.url} (flow: ${id})`)

      const flow: Flow = {
        id,
        timestamp: new Date().toISOString(),
        host,
        type: 'https',
        request: {
          method: req.method!,
          url,
          path: req.url!,
          headers: req.headers as Record<string, string>,
          body
        },
        hasRawHttp: true
      }

      // Build raw HTTP request for storage
      const rawRequest = buildRawHttpRequest(req.method!, req.url!, req.headers, body)
      store.initRawHttp(id, rawRequest)
      store.saveFlow(flow)

      const writer = createResponseWriter(res)

      // Forward to upstream
      if (upstreamSocket) {
        forwardRequest(
          host,
          port,
          req.method!,
          req.url!,
          req.headers as Record<string, string>,
          body,
          flow,
          startTime,
          writer,
          upstreamSocket
        )
      } else {
        console.error(`[CONNECT] No upstream socket available for ${host}:${port}`)
        res.writeHead(502, { 'Content-Type': 'text/plain' })
        res.end('Bad Gateway: No upstream connection')
      }
    })

    req.on('error', (err) => {
      console.error(`[CONNECT] Request error for ${host}:${port}:`, err.message)
    })
  })

  // Handle WebSocket and other protocol upgrades
  server.on('upgrade', (req, clientSocket, head) => {
    console.log(`[WSS] WebSocket upgrade request: ${host}:${port}${req.url}`)

    const id = generateId()
    const startTime = Date.now()
    const url = `https://${host}${req.url}`

    const flow: Flow = {
      id,
      timestamp: new Date().toISOString(),
      host,
      type: 'websocket',
      request: {
        method: 'GET',
        url,
        path: req.url!,
        headers: req.headers as Record<string, string>
      }
    }

    store.saveFlow(flow)

    if (!upstreamSocket) {
      console.error(`[WSS] No upstream socket available for ${host}:${port}`)
      clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n')
      clientSocket.end()
      return
    }

    // Build upgrade request for upstream
    const parsedUrl = new URL(req.url!, `https://${host}`)
    let upgradeRequest = `GET ${parsedUrl.pathname}${parsedUrl.search} HTTP/1.1\r\n`
    upgradeRequest += `Host: ${host}\r\n`

    for (const [key, value] of Object.entries(req.headers)) {
      if (key.toLowerCase() !== 'host') {
        upgradeRequest += `${key}: ${Array.isArray(value) ? value.join(', ') : value}\r\n`
      }
    }
    upgradeRequest += '\r\n'

    // Send upgrade request to upstream
    upstreamSocket.write(upgradeRequest)
    if (head.length > 0) {
      upstreamSocket.write(head)
    }

    // Wait for upgrade response from upstream
    let responseBuffer = Buffer.alloc(0)
    let upgraded = false

    const onData = (chunk: Buffer) => {
      if (!upgraded) {
        responseBuffer = Buffer.concat([responseBuffer, chunk])
        const headerEnd = responseBuffer.indexOf('\r\n\r\n')

        if (headerEnd !== -1) {
          const headerPart = responseBuffer.slice(0, headerEnd).toString('utf-8')
          const statusLine = headerPart.split('\r\n')[0]
          const statusMatch = statusLine.match(/HTTP\/[\d.]+ (\d+)/)
          const statusCode = statusMatch ? parseInt(statusMatch[1]) : 0

          if (statusCode === 101) {
            console.log(`[WSS] Upgrade successful for ${host}:${port}`)
            upgraded = true

            // Update flow with response
            flow.response = {
              status: 101,
              statusText: 'Switching Protocols',
              headers: {}
            }
            flow.duration = Date.now() - startTime
            store.saveFlow(flow)

            // Send response to client (TLS socket is the client socket in this context)
            tlsSocket.write(responseBuffer)
            responseBuffer = Buffer.alloc(0)

            // Remove the data listener and pipe bidirectionally
            upstreamSocket.removeListener('data', onData)
            upstreamSocket.pipe(tlsSocket)
            tlsSocket.pipe(upstreamSocket)
          } else {
            console.error(`[WSS] Upgrade failed with status ${statusCode}`)
            flow.response = {
              status: statusCode,
              statusText: 'Upgrade Failed',
              headers: {},
              body: headerPart
            }
            flow.duration = Date.now() - startTime
            store.saveFlow(flow)

            tlsSocket.write(responseBuffer)
            tlsSocket.end()
            upstreamSocket.end()
          }
        }
      }
    }

    upstreamSocket.on('data', onData)

    upstreamSocket.on('error', (err) => {
      console.error(`[WSS] Upstream socket error:`, err.message)
      flow.response = {
        status: 502,
        statusText: 'Bad Gateway',
        headers: {},
        body: err.message
      }
      flow.duration = Date.now() - startTime
      store.saveFlow(flow)
      tlsSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n')
      tlsSocket.end()
    })

    upstreamSocket.on('close', () => {
      console.log(`[WSS] Upstream socket closed for ${host}:${port}`)
      if (!tlsSocket.destroyed) {
        tlsSocket.end()
      }
    })
  })

  // Disable timeouts for long-lived connections (SSE, WebSocket upgrades)
  server.timeout = 0
  server.headersTimeout = 0
  server.requestTimeout = 0

  return server
}

/**
 * Attach TLS socket to HTTP parser.
 * This triggers Node.js's HTTP parser to start parsing requests from the socket.
 */
export function attachSocketToParser(
  server: http.Server,
  socket: TLSSocket
): void {
  // Emit connection event to trigger HTTP parsing
  server.emit('connection', socket)
}

/**
 * Build raw HTTP request string for storage
 */
function buildRawHttpRequest(
  method: string,
  path: string,
  headers: http.IncomingHttpHeaders,
  body?: string
): string {
  let raw = `${method} ${path} HTTP/1.1\r\n`

  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const v of value) {
        raw += `${key}: ${v}\r\n`
      }
    } else if (value !== undefined) {
      raw += `${key}: ${value}\r\n`
    }
  }

  raw += '\r\n'

  if (body) {
    raw += body
  }

  return raw
}
