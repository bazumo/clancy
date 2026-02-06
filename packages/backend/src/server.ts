import express from 'express'
import http from 'http'
import net from 'net'
import tls from 'tls'
import path from 'path'
import type { Flow } from '@clancyapp/shared'
import { loadOrCreateCA, generateCertForHost, initCertsDir } from './ca.js'
import { generateId } from './utils.js'
import * as store from './flow-store.js'
import { handleUiWebSocketUpgrade } from './flow-store.js'
import { handleProxyError, handleProxyResponse, createResponseWriter } from './proxy-handler.js'
import {
  registerProvider,
  setActiveProvider,
  getActiveProvider,
  shutdownActiveProvider,
  getAvailableProviders,
  setDefaultFingerprint,
  getDefaultFingerprint,
  type TLSFingerprint,
  type TLSProvider
} from './tls-provider.js'
import { createNativeTlsSocket, createProviderTlsSocket } from './tls-sockets.js'
import { createTunnelHttpParser, attachSocketToParser } from './https-tunnel-handler.js'
import './modifiers/index.js'
import { applyRequestModifiers } from './modifiers/apply.js'

export interface ClancyServerOptions {
  port?: number
  host?: string
  tlsProvider?: string
  tlsFingerprint?: TLSFingerprint
  staticDir?: string
  certsDir?: string
  providers?: TLSProvider[]
}

export interface ClancyServer {
  server: http.Server
  app: express.Express
  start(): Promise<void>
  stop(): Promise<void>
}

export function createServer(options?: ClancyServerOptions): ClancyServer {
  const opts = options || {}
  const PORT = opts.port ?? 9090
  const HOST = opts.host ?? 'localhost'
  const TLS_PROVIDER = opts.tlsProvider ?? 'native'
  const TLS_FINGERPRINT = opts.tlsFingerprint ?? 'electron'
  const staticDir = opts.staticDir
  const certsDir = opts.certsDir

  // Initialize certs directory
  initCertsDir(certsDir)

  // Initialize CA
  loadOrCreateCA()

  // Register any provided TLS providers
  if (opts.providers) {
    for (const provider of opts.providers) {
      registerProvider(provider)
    }
  }

  const app = express()
  const server = http.createServer(app)

  // Track all sockets for cleanup (CONNECT tunnels aren't tracked by Node's HTTP server)
  const activeSockets = new Set<net.Socket>()
  server.on('connection', (socket) => {
    activeSockets.add(socket)
    socket.on('close', () => activeSockets.delete(socket))
  })

  // Initialize WebSocket server
  store.initWebSocket(server)

  let requestCount = 0

  // Handle HTTP proxy requests (must run before static files —
  // proxy requests use absolute URLs like "GET http://host/path HTTP/1.1",
  // but Express normalises req.url to just the path for routing, so
  // express.static would match "/" and serve index.html instead of proxying)
  app.use((req, res, next) => {
    const targetUrl = req.url
    if (!targetUrl.startsWith('http://')) {
      next()
      return
    }

    const id = generateId()
    const startTime = Date.now()
    const parsedUrl = new URL(targetUrl)

    const requestChunks: Buffer[] = []
    req.on('data', (chunk) => requestChunks.push(chunk))

    req.on('end', async () => {
      const requestBody = Buffer.concat(requestChunks).toString('utf-8')

      const flow: Flow = {
        id,
        timestamp: new Date().toISOString(),
        host: parsedUrl.host,
        type: 'http',
        request: {
          method: req.method,
          url: targetUrl,
          path: parsedUrl.pathname + parsedUrl.search,
          headers: req.headers as Record<string, string | string[] | undefined>,
          body: requestBody || undefined
        }
      }

      store.saveFlow(flow)
      requestCount++

      // Apply request modifiers
      const modifiedRequest = await applyRequestModifiers(flow, {
        method: req.method || 'GET',
        url: targetUrl,
        path: parsedUrl.pathname + parsedUrl.search,
        host: parsedUrl.host,
        headers: req.headers as Record<string, string>,
        body: requestBody || undefined
      })

      const reqOptions: http.RequestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 80,
        path: modifiedRequest.path,
        method: modifiedRequest.method,
        headers: { ...modifiedRequest.headers, host: parsedUrl.host }
      }

      const writer = createResponseWriter(res)

      const proxyReq = http.request(reqOptions, (proxyRes) => {
        handleProxyResponse(proxyRes, { flow, startTime, writer })
      })

      proxyReq.on('error', (err) => {
        handleProxyError(err, flow, startTime, writer)
      })

      if (modifiedRequest.body) {
        proxyReq.write(modifiedRequest.body)
      }
      proxyReq.end()
    })
  })

  // Serve static files (after proxy handler so absolute-URL requests aren't caught)
  if (staticDir) {
    app.use(express.static(staticDir))
  }

  app.get('/api/stats', (_req, res) => {
    res.json({
      requestCount,
      uptime: process.uptime(),
      connectedClients: store.getClientCount()
    })
  })

  // API to fetch raw HTTP for a flow
  app.get('/api/flows/:id/raw', (req, res) => {
    const { id } = req.params
    const raw = store.getRawHttp(id)
    if (!raw) {
      res.status(404).json({ error: 'Raw HTTP not found' })
      return
    }
    res.json(raw)
  })

  // Debug endpoint to list all flows with raw HTTP
  app.get('/api/debug/raw-flows', (_req, res) => {
    const flowIds = store.getRawHttpFlowIds()
    res.json({ count: flowIds.length, flowIds })
  })

  // Get all flows
  app.get('/api/flows', (_req, res) => {
    const flows = store.getAllFlows()
    res.json({ flows, count: flows.length })
  })

  // Get a specific flow by ID
  app.get('/api/flows/:id', (req, res) => {
    const flow = store.getFlow(req.params.id)
    if (!flow) {
      res.status(404).json({ error: 'Flow not found' })
      return
    }
    res.json(flow)
  })

  // Get events for a specific flow
  app.get('/api/flows/:id/events', (req, res) => {
    const events = store.getEvents(req.params.id)
    res.json({ flowId: req.params.id, events, count: events.length })
  })

  // Clear all flows and events
  app.delete('/api/flows', (_req, res) => {
    store.clearAll()
    requestCount = 0
    res.json({ success: true })
  })

  // TLS fingerprinting configuration endpoints
  app.get('/api/tls/config', (_req, res) => {
    const provider = getActiveProvider()
    res.json({
      provider: provider?.name || 'native',
      fingerprint: provider ? getDefaultFingerprint() : null,
      availableProviders: ['native', ...getAvailableProviders()],
      availableFingerprints: [
        'chrome120', 'chrome102', 'chrome100',
        'firefox120', 'firefox105', 'firefox102',
        'safari16', 'edge106', 'edge85',
        'ios14', 'android11', 'electron',
        'randomized', 'golanghttp2'
      ]
    })
  })

  app.post('/api/tls/fingerprint/:fingerprint', express.json(), (req, res) => {
    const fingerprint = req.params.fingerprint as TLSFingerprint
    setDefaultFingerprint(fingerprint)
    res.json({ success: true, fingerprint })
  })

  // SPA fallback — serve index.html for any non-API, non-proxy route
  if (staticDir) {
    app.use((_req, res) => {
      res.sendFile(path.join(staticDir, 'index.html'), (err) => {
        if (err) {
          res.status(404).end()
        }
      })
    })
  }

  // Handle WebSocket upgrade for HTTP (ws://) connections
  server.on('upgrade', (req, clientSocket, head) => {
    const targetUrl = req.url || ''

    // Only handle proxy requests (ws:// URLs), not local WebSocket connections
    if (!targetUrl.startsWith('http://')) {
      // Let the WebSocket server handle local connections (for UI)
      handleUiWebSocketUpgrade(req, clientSocket, head)
      return
    }

    const id = generateId()
    const parsedUrl = new URL(targetUrl)
    const host = parsedUrl.hostname
    const port = parseInt(parsedUrl.port) || 80

    console.log(`[WS] WebSocket upgrade request: ${host}:${port}${parsedUrl.pathname}`)

    const flow: Flow = {
      id,
      timestamp: new Date().toISOString(),
      host: parsedUrl.host,
      type: 'websocket',
      request: {
        method: 'GET',
        url: targetUrl,
        path: parsedUrl.pathname + parsedUrl.search,
        headers: req.headers as Record<string, string | string[] | undefined>
      }
    }
    store.saveFlow(flow)
    requestCount++

    // Connect to upstream server
    const upstreamSocket = net.connect(port, host, () => {
      console.log(`[WS] Connected to upstream ${host}:${port}`)

      // Forward the original upgrade request
      let upgradeRequest = `GET ${parsedUrl.pathname}${parsedUrl.search} HTTP/1.1\r\n`
      upgradeRequest += `Host: ${parsedUrl.host}\r\n`

      for (const [key, value] of Object.entries(req.headers)) {
        if (key.toLowerCase() !== 'host') {
          upgradeRequest += `${key}: ${Array.isArray(value) ? value.join(', ') : value}\r\n`
        }
      }
      upgradeRequest += '\r\n'

      upstreamSocket.write(upgradeRequest)
      if (head.length > 0) {
        upstreamSocket.write(head)
      }

      // Wait for upgrade response from upstream
      let responseBuffer = Buffer.alloc(0)
      let upgraded = false

      upstreamSocket.on('data', (chunk) => {
        if (!upgraded) {
          responseBuffer = Buffer.concat([responseBuffer, chunk])
          const headerEnd = responseBuffer.indexOf('\r\n\r\n')

          if (headerEnd !== -1) {
            const headerPart = responseBuffer.slice(0, headerEnd).toString('utf-8')
            const statusLine = headerPart.split('\r\n')[0]
            const statusMatch = statusLine.match(/HTTP\/[\d.]+ (\d+)/)
            const statusCode = statusMatch ? parseInt(statusMatch[1]) : 0

            if (statusCode === 101) {
              console.log(`[WS] Upgrade successful for ${host}:${port}`)
              upgraded = true

              // Update flow with response
              flow.response = {
                status: 101,
                statusText: 'Switching Protocols',
                headers: {}
              }
              store.saveFlow(flow)

              // Send response to client (including any data after headers)
              clientSocket.write(responseBuffer)
              responseBuffer = Buffer.alloc(0)

              // Now pipe bidirectionally
              upstreamSocket.pipe(clientSocket as net.Socket)
              ;(clientSocket as net.Socket).pipe(upstreamSocket)
            } else {
              console.error(`[WS] Upgrade failed with status ${statusCode}`)
              clientSocket.write(responseBuffer)
              clientSocket.end()
              upstreamSocket.end()
            }
          }
        }
      })
    })

    upstreamSocket.on('error', (err) => {
      console.error(`[WS] Upstream connection error:`, err.message)
      flow.response = {
        status: 502,
        statusText: 'Bad Gateway',
        headers: {},
        body: err.message
      }
      store.saveFlow(flow)
      clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n')
      clientSocket.end()
    })

    clientSocket.on('error', (err) => {
      console.error(`[WS] Client socket error:`, err.message)
      upstreamSocket.destroy()
    })
  })

  // Handle HTTPS CONNECT with TLS interception
  server.on('connect', async (req, clientSocket) => {
    const [host, portStr] = (req.url || '').split(':')
    const port = parseInt(portStr) || 443

    console.log(`[CONNECT] New tunnel request: ${host}:${port}`)

    // Create TLS server for the client
    const serverCtx = generateCertForHost(host)

    // Tell client the tunnel is established
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')

    // Wrap client socket in TLS
    const tlsClient = new tls.TLSSocket(clientSocket, {
      isServer: true,
      secureContext: serverCtx
    } as tls.TLSSocketOptions)

    tlsClient.on('secure', async () => {
      console.log(`[CONNECT] TLS handshake complete: ${host}:${port}`)

      // Establish upstream connection
      let upstreamSocket: tls.TLSSocket | import('stream').Duplex | null = null
      try {
        const provider = getActiveProvider()
        if (provider?.isReady()) {
          upstreamSocket = await createProviderTlsSocket(host, port)
        } else {
          upstreamSocket = await createNativeTlsSocket(host, port)
        }
        console.log(`[CONNECT] Connected to upstream ${host}:${port}`)
      } catch (err) {
        console.error(`[CONNECT] Failed to connect to ${host}:${port}:`, (err as Error).message)
        tlsClient.destroy()
        return
      }

      // Create HTTP parser for this tunnel
      const httpParser = createTunnelHttpParser(host, port, tlsClient, upstreamSocket)

      // Attach TLS socket to parser - Node will now parse HTTP automatically
      attachSocketToParser(httpParser, tlsClient)

      // Handle cleanup
      tlsClient.on('close', () => {
        console.log(`[CONNECT] Connection closed: ${host}:${port}`)
        upstreamSocket?.destroy()
      })

      upstreamSocket.on('close', () => {
        if (!tlsClient.destroyed) {
          tlsClient.destroy()
        }
      })
    })

    tlsClient.on('error', (err) => {
      console.error(`[CONNECT] TLS client error for ${host}:${port}:`, err.message)
      tlsClient.destroy()
    })

    clientSocket.on('error', (err) => {
      console.error('Client socket error:', err.message)
      tlsClient.destroy()
    })
  })

  async function initTLSProvider() {
    if (TLS_PROVIDER === 'native') {
      console.log('[TLS] Using native Node.js TLS (no fingerprint spoofing)')
      return
    }

    try {
      setDefaultFingerprint(TLS_FINGERPRINT)
      await setActiveProvider(TLS_PROVIDER)
      console.log(`[TLS] Provider: ${TLS_PROVIDER}, fingerprint: ${TLS_FINGERPRINT}`)
    } catch (err) {
      console.error(`[TLS] Failed to initialize ${TLS_PROVIDER} provider:`, (err as Error).message)
      console.log('[TLS] Falling back to native TLS')
    }
  }

  return {
    server,
    app,
    async start() {
      await initTLSProvider()

      return new Promise<void>((resolve) => {
        server.listen(PORT, HOST, () => {
          const addr = server.address() as import('net').AddressInfo
          const url = `http://${HOST}:${addr.port}`
          console.log('')
          console.log('   _____ _')
          console.log('  / ____| |')
          console.log(' | |    | | __ _ _ __   ___ _   _')
          console.log(' | |    | |/ _` | \'_ \\ / __| | | |')
          console.log(' | |____| | (_| | | | | (__| |_| |')
          console.log('  \\_____|_|\\__,_|_| |_|\\___|\\__, |')
          console.log('                             __/ |')
          console.log('                            |___/')
          console.log('')
          console.log(`  Proxy & Web UI running on ${url}`)
          console.log('')
          resolve()
        })
      })
    },
    async stop() {
      await shutdownActiveProvider()
      for (const socket of activeSockets) {
        socket.destroy()
      }
      activeSockets.clear()
      server.closeAllConnections()
      return new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err)
          else resolve()
        })
      })
    }
  }
}
