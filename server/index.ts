import express from 'express'
import http from 'http'
import net from 'net'
import tls from 'tls'
import path from 'path'
import { fileURLToPath } from 'url'
import { program } from 'commander'
import type { Flow } from '../shared/types.js'
import { loadOrCreateCA, generateCertForHost, CERTS_DIR } from './ca.js'
import { generateId } from './utils.js'
import * as store from './flow-store.js'
import { handleUiWebSocketUpgrade } from './flow-store.js'
import { handleProxyError, handleProxyResponse, createExpressWriter } from './proxy-handler.js'
import {
  registerProvider,
  setActiveProvider,
  getActiveProvider,
  shutdownActiveProvider,
  getAvailableProviders,
  type TLSFingerprint
} from './tls-provider.js'
import { utlsProvider } from './tls-provider-utls.js'
import { createNativeTlsSocket, createProviderTlsSocket } from './tls-sockets.js'
import { createTunnelHttpParser, attachSocketToParser } from './https-tunnel-handler.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Parse command-line arguments
program
  .name('clancy')
  .description('Clancy Proxy Server')
  .option('-t, --tls-provider <provider>', "TLS provider: 'utls' (Go fingerprinting) or 'native' (Node.js TLS)", 'native')
  .option('-f, --tls-fingerprint <fingerprint>', 'TLS fingerprint for utls (chrome120, firefox120, safari16, electron, etc.)', 'electron')
  .option('-p, --port <port>', 'Port to listen on', '9090')
  .option('-H, --host <host>', 'Host to bind to', 'localhost')
  .parse()

const opts = program.opts<{ tlsProvider: string; tlsFingerprint: string; port: string; host: string }>()

const PORT = parseInt(opts.port || process.env.PORT || '9090', 10)
const HOST = opts.host || process.env.HOST || 'localhost'

// TLS fingerprinting configuration
const TLS_PROVIDER = opts.tlsProvider || process.env.TLS_PROVIDER || 'native' // 'utls' or 'native'
const TLS_FINGERPRINT = (opts.tlsFingerprint || process.env.TLS_FINGERPRINT || 'electron') as TLSFingerprint

// Initialize CA
loadOrCreateCA()

// Register TLS providers
registerProvider(utlsProvider)

// Initialize TLS provider
async function initTLSProvider() {
  if (TLS_PROVIDER === 'native') {
    console.log('[TLS] Using native Node.js TLS (no fingerprint spoofing)')
    return
  }

  try {
    utlsProvider.setDefaultFingerprint(TLS_FINGERPRINT)
    await setActiveProvider('utls')
    console.log(`[TLS] Provider: utls, fingerprint: ${TLS_FINGERPRINT}`)
  } catch (err) {
    console.error('[TLS] Failed to initialize utls provider:', (err as Error).message)
    console.log('[TLS] Falling back to native TLS')
  }
}

const app = express()
const server = http.createServer(app)

// Initialize WebSocket server
store.initWebSocket(server)

// Serve static files
const distPath = path.join(__dirname, '..', '..', 'dist')
app.use(express.static(distPath))

let requestCount = 0

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
    fingerprint: provider?.name === 'utls' ? utlsProvider.getDefaultFingerprint() : null,
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
  utlsProvider.setDefaultFingerprint(fingerprint)
  res.json({ success: true, fingerprint })
})

// Handle HTTP proxy requests
app.use((req, res) => {
  const targetUrl = req.url
  if (!targetUrl.startsWith('http://')) {
    res.sendFile(path.join(distPath, 'index.html'), (err) => {
      if (err) {
        res.status(404).end()
      }
    })
    return
  }

  const id = generateId()
  const startTime = Date.now()
  const parsedUrl = new URL(targetUrl)

  const requestChunks: Buffer[] = []
  req.on('data', (chunk) => requestChunks.push(chunk))

  req.on('end', () => {
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

    const options: http.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 80,
      path: parsedUrl.pathname + parsedUrl.search,
      method: req.method,
      headers: { ...req.headers, host: parsedUrl.host }
    }

    const writer = createExpressWriter(res)

    const proxyReq = http.request(options, (proxyRes) => {
      handleProxyResponse(proxyRes, { flow, startTime, writer })
    })

    proxyReq.on('error', (err) => {
      handleProxyError(err, flow, startTime, writer)
    })

    if (requestBody) {
      proxyReq.write(requestBody)
    }
    proxyReq.end()
  })
})

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

// Start server
async function start() {
  await initTLSProvider()

  server.listen(PORT, HOST, () => {
    console.log(`Clancy proxy running on http://${HOST}:${PORT}`)
    console.log(`CA certificate: ${path.join(CERTS_DIR, 'ca.crt')}`)
    console.log(`TLS Provider: ${TLS_PROVIDER === 'native' ? 'Node.js (native)' : `uTLS (Go) - ${TLS_FINGERPRINT}`}`)
  })
}

start().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...')
  await shutdownActiveProvider()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('\nShutting down...')
  await shutdownActiveProvider()
  process.exit(0)
})
