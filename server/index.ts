import express from 'express'
import http from 'http'
import https from 'https'
import tls from 'tls'
import path from 'path'
import { fileURLToPath } from 'url'
import type { Flow } from '../shared/types.js'
import { loadOrCreateCA, generateCertForHost, CERTS_DIR } from './ca.js'
import { generateId } from './utils.js'
import * as store from './flow-store.js'
import { handleProxyResponse, handleProxyError, handleCycleTLSResponse, createExpressWriter, createTlsWriter } from './proxy-handler.js'
import { getCycleClient, cycleFetch, setTLSProfile, getTLSProfile, shutdownCycleClient, TLS_PROFILES, type TLSProfile } from './cycle-client.js'

// TLS fingerprinting configuration
const USE_CYCLETLS = process.env.USE_CYCLETLS !== 'false' // Enabled by default
const TLS_PROFILE = (process.env.TLS_PROFILE || 'electron') as TLSProfile

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = parseInt(process.env.PORT || '9090', 10)

// Initialize CA
loadOrCreateCA()

// Initialize TLS profile
if (USE_CYCLETLS) {
  setTLSProfile(TLS_PROFILE)
  // Pre-initialize CycleTLS client
  getCycleClient().then(() => {
    console.log(`[CycleTLS] Ready with profile: ${getTLSProfile()}`)
  }).catch(err => {
    console.error('[CycleTLS] Failed to initialize:', err.message)
  })
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
  res.json({
    enabled: USE_CYCLETLS,
    profile: getTLSProfile(),
    availableProfiles: Object.keys(TLS_PROFILES)
  })
})

app.post('/api/tls/profile/:profile', express.json(), (req, res) => {
  const profile = req.params.profile as TLSProfile
  if (!TLS_PROFILES[profile]) {
    res.status(400).json({ error: `Invalid profile. Available: ${Object.keys(TLS_PROFILES).join(', ')}` })
    return
  }
  setTLSProfile(profile)
  res.json({ success: true, profile })
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
server.on('connect', (req, clientSocket, head) => {
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
    const body = contentLength > 0 ? buffer.slice(bodyStart, bodyStart + contentLength).toString('utf-8') : undefined

    // Capture raw HTTP request before removing from buffer
    const rawRequest = buffer.slice(0, totalLength).toString('utf-8')

    // Remove processed request from buffer
    buffer = buffer.slice(totalLength)

    // Create flow
    const id = generateId()
    const startTime = Date.now()
    const url = `https://${host}${path}`

    const flow: Flow = {
      id,
      timestamp: new Date().toISOString(),
      host,
      type: 'https',
      request: {
        method,
        url,
        path,
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

    if (USE_CYCLETLS) {
      // Use CycleTLS for TLS fingerprint impersonation
      // Filter out content-length as CycleTLS will calculate it from the body
      const cycleHeaders = { ...headers, host }
      delete cycleHeaders['content-length']
      delete cycleHeaders['transfer-encoding']
      
      cycleFetch(url, {
        method,
        headers: cycleHeaders,
        body: body || undefined
      }).then((cycleRes) => {
        handleCycleTLSResponse(cycleRes, {
          flow,
          startTime,
          writer,
          storeRawHttp: true,
          verbose: true
        })
      }).catch((err) => {
        handleProxyError(err, flow, startTime, writer)
      })
    } else {
      // Fall back to native https (no fingerprint impersonation)
      const reqOptions: https.RequestOptions = {
        hostname: host,
        port,
        path,
        method,
        headers: { ...headers, host },
        rejectUnauthorized: false
      }

      const proxyReq = https.request(reqOptions, (proxyRes) => {
        handleProxyResponse(proxyRes, {
          flow,
          startTime,
          writer,
          storeRawHttp: true,
          verbose: true
        })
      })

      proxyReq.on('error', (err) => {
        handleProxyError(err, flow, startTime, writer)
      })

      if (body) {
        proxyReq.write(body)
      }
      proxyReq.end()
    }

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

server.listen(PORT, () => {
  console.log(`Claudeoscope proxy running on http://localhost:${PORT}`)
  console.log(`CA certificate: ${path.join(CERTS_DIR, 'ca.crt')}`)
  if (USE_CYCLETLS) {
    console.log(`TLS fingerprint impersonation: enabled (profile: ${TLS_PROFILE})`)
  } else {
    console.log('TLS fingerprint impersonation: disabled')
  }
})

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...')
  if (USE_CYCLETLS) {
    await shutdownCycleClient()
  }
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('\nShutting down...')
  if (USE_CYCLETLS) {
    await shutdownCycleClient()
  }
  process.exit(0)
})
