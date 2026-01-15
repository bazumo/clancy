import express from 'express'
import http from 'http'
import tls from 'tls'
import path from 'path'
import { fileURLToPath } from 'url'
import { program } from 'commander'
import type { Flow } from '../shared/types.js'
import { loadOrCreateCA, generateCertForHost, CERTS_DIR } from './ca.js'
import { generateId } from './utils.js'
import * as store from './flow-store.js'
import { handleProxyError, createExpressWriter, createTlsWriter } from './proxy-handler.js'
import {
  registerProvider,
  setActiveProvider,
  getActiveProvider,
  shutdownActiveProvider,
  getAvailableProviders,
  type TLSFingerprint
} from './tls-provider.js'
import { utlsProvider } from './tls-provider-utls.js'
import { createNativeTlsSocket, createProviderTlsSocket, forwardRequest } from './tls-sockets.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Parse command-line arguments
program
  .name('claudeoscope')
  .description('Claudeoscope Proxy Server')
  .option('-t, --tls-provider <provider>', "TLS provider: 'utls' (Go fingerprinting) or 'native' (Node.js TLS)", 'native')
  .option('-f, --tls-fingerprint <fingerprint>', 'TLS fingerprint for utls (chrome120, firefox120, safari16, electron, etc.)', 'electron')
  .option('-p, --port <port>', 'Port to listen on', '9090')
  .parse()

const opts = program.opts<{ tlsProvider: string; tlsFingerprint: string; port: string }>()

const PORT = parseInt(opts.port || process.env.PORT || '9090', 10)

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
const distPath = path.join(__dirname, '..', 'dist')
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
    res.sendFile(path.join(distPath, 'index.html'))
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

// Handle HTTPS CONNECT with TLS interception
server.on('connect', (req, clientSocket) => {
  const [host, portStr] = (req.url || '').split(':')
  const port = parseInt(portStr) || 443

  // Create TLS server for the client
  const serverCtx = generateCertForHost(host)

  // Tell client the tunnel is established
  clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')

  // Wrap client socket in TLS
  const tlsClient = new tls.TLSSocket(clientSocket, {
    isServer: true,
    secureContext: serverCtx
  } as tls.TLSSocketOptions)

  tlsClient.on('error', (err) => {
    console.error('TLS client error:', err.message)
    tlsClient.destroy()
  })

  // Handle incoming HTTP requests over TLS
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
    const [method, reqPath] = lines[0].split(' ')

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
    const body = contentLength > 0 ? buffer.slice(bodyStart, bodyStart + contentLength).toString('utf-8') : undefined

    // Capture raw HTTP request before removing from buffer
    const rawRequest = buffer.slice(0, totalLength).toString('utf-8')

    // Remove processed request from buffer
    buffer = buffer.slice(totalLength)

    // Create flow
    const id = generateId()
    const startTime = Date.now()
    const url = `https://${host}${reqPath}`

    const flow: Flow = {
      id,
      timestamp: new Date().toISOString(),
      host,
      type: 'https',
      request: {
        method,
        url,
        path: reqPath,
        headers,
        body
      },
      hasRawHttp: true
    }

    // Initialize raw HTTP storage for this flow
    store.initRawHttp(id, rawRequest)

    store.saveFlow(flow)
    requestCount++

    // Forward request to actual server
    const writer = createTlsWriter(tlsClient)
    const provider = getActiveProvider()

    ;(async () => {
      try {
        const socket = provider?.isReady()
          ? await createProviderTlsSocket(host, port)
          : await createNativeTlsSocket(host, port)
        forwardRequest(host, port, method, reqPath, headers, body, flow, startTime, writer, socket)
      } catch (err) {
        handleProxyError(err as Error, flow, startTime, writer)
      }
    })()

    // Process any remaining data in buffer
    if (buffer.length > 0) {
      setImmediate(processBuffer)
    }
  }

  clientSocket.on('error', (err) => {
    console.error('Client socket error:', err.message)
    tlsClient.destroy()
  })
})

// Start server
async function start() {
  await initTLSProvider()

  server.listen(PORT, () => {
    console.log(`Claudeoscope proxy running on http://localhost:${PORT}`)
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
