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
import { handleProxyResponse, handleProxyError, createExpressWriter, createTlsWriter } from './proxy-handler.js'
import {
  registerProvider,
  setActiveProvider,
  getActiveProvider,
  tlsConnect,
  shutdownActiveProvider,
  getAvailableProviders,
  type TLSFingerprint
} from './tls-provider.js'
import { utlsProvider } from './tls-provider-utls.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = parseInt(process.env.PORT || '9090', 10)

// TLS fingerprinting configuration
const TLS_PROVIDER = process.env.TLS_PROVIDER || 'utls' // 'utls' or 'native'
const TLS_FINGERPRINT = (process.env.TLS_FINGERPRINT || 'electron') as TLSFingerprint

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

    if (provider && provider.isReady()) {
      // Use TLS provider for fingerprint impersonation
      forwardWithProvider(host, port, method, reqPath, headers, body, flow, startTime, writer)
    } else {
      // Fall back to native https
      forwardWithNativeTLS(host, port, method, reqPath, headers, body, flow, startTime, writer)
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

/**
 * Forward request using the TLS provider (utls)
 */
async function forwardWithProvider(
  host: string,
  port: number,
  method: string,
  reqPath: string,
  headers: Record<string, string>,
  body: string | undefined,
  flow: Flow,
  startTime: number,
  writer: ReturnType<typeof createTlsWriter>
) {
  try {
    // Connect to target using TLS provider
    const targetSocket = await tlsConnect({
      host,
      port,
      fingerprint: utlsProvider.getDefaultFingerprint()
    })

    // Build HTTP request
    let httpRequest = `${method} ${reqPath} HTTP/1.1\r\n`
    httpRequest += `Host: ${host}\r\n`
    
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() !== 'host') {
        httpRequest += `${key}: ${value}\r\n`
      }
    }
    httpRequest += '\r\n'

    // Write request
    targetSocket.write(httpRequest)
    if (body) {
      targetSocket.write(body)
    }

    // Read and forward response manually
    let responseBuffer = Buffer.alloc(0)
    let headersParsed = false
    let statusCode = 0
    let statusMessage = ''
    let responseHeaders: Record<string, string> = {}
    let contentLength = -1
    let isChunked = false
    let bodyBuffer = Buffer.alloc(0)
    
    const processResponse = () => {
      // Parse headers if not done yet
      if (!headersParsed) {
        const headerEnd = responseBuffer.indexOf('\r\n\r\n')
        if (headerEnd === -1) return // Need more data
        
        headersParsed = true
        const headerStr = responseBuffer.slice(0, headerEnd).toString('utf-8')
        bodyBuffer = responseBuffer.slice(headerEnd + 4)
        responseBuffer = Buffer.alloc(0)
        
        // Parse status line
        const lines = headerStr.split('\r\n')
        const statusMatch = lines[0].match(/HTTP\/[\d.]+ (\d+) ?(.*)/)
        statusCode = statusMatch ? parseInt(statusMatch[1], 10) : 500
        statusMessage = statusMatch ? statusMatch[2] || '' : 'Unknown'
        
        // Parse headers
        for (let i = 1; i < lines.length; i++) {
          const colonIdx = lines[i].indexOf(':')
          if (colonIdx > 0) {
            const key = lines[i].slice(0, colonIdx).toLowerCase()
            const value = lines[i].slice(colonIdx + 1).trim()
            responseHeaders[key] = value
          }
        }
        
        contentLength = parseInt(responseHeaders['content-length'] || '-1', 10)
        isChunked = responseHeaders['transfer-encoding']?.toLowerCase() === 'chunked'
      }
    }
    
    targetSocket.on('data', (chunk: Buffer) => {
      if (!headersParsed) {
        responseBuffer = Buffer.concat([responseBuffer, chunk])
        processResponse()
      } else {
        bodyBuffer = Buffer.concat([bodyBuffer, chunk])
      }
    })
    
    targetSocket.on('end', () => {
      // Finalize response
      flow.response = {
        status: statusCode,
        statusText: statusMessage,
        headers: responseHeaders,
        body: bodyBuffer.toString('utf-8') || undefined
      }
      flow.duration = Date.now() - startTime
      store.saveFlow(flow)
      
      // Send response to client
      writer.writeHead(statusCode, responseHeaders)
      writer.write(bodyBuffer)
      writer.end()
    })
    
    targetSocket.on('error', (err) => {
      handleProxyError(err, flow, startTime, writer)
    })
    
    targetSocket.on('close', () => {
      // If we have headers but end wasn't called, finalize now
      if (headersParsed && !flow.response) {
        flow.response = {
          status: statusCode,
          statusText: statusMessage,
          headers: responseHeaders,
          body: bodyBuffer.toString('utf-8') || undefined
        }
        flow.duration = Date.now() - startTime
        store.saveFlow(flow)
        
        writer.writeHead(statusCode, responseHeaders)
        writer.write(bodyBuffer)
        writer.end()
      }
    })
    
  } catch (err) {
    handleProxyError(err as Error, flow, startTime, writer)
  }
}

/**
 * Forward request using native Node.js TLS (no fingerprint spoofing)
 */
function forwardWithNativeTLS(
  host: string,
  port: number,
  method: string,
  reqPath: string,
  headers: Record<string, string>,
  body: string | undefined,
  flow: Flow,
  startTime: number,
  writer: ReturnType<typeof createTlsWriter>
) {
  const reqOptions: https.RequestOptions = {
    hostname: host,
    port,
    path: reqPath,
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
      verbose: false
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

// Start server
async function start() {
  await initTLSProvider()

  server.listen(PORT, () => {
    console.log(`Claudeoscope proxy running on http://localhost:${PORT}`)
    console.log(`CA certificate: ${path.join(CERTS_DIR, 'ca.crt')}`)
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
