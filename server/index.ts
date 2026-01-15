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
import { createStreamParser, isBedrockStream } from './parsers/index.js'
import { decompressBody } from './utils.js'
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

// Parse command-line arguments
function parseArgs() {
  const args = process.argv.slice(2)
  const options: { tlsProvider?: string; tlsFingerprint?: string; port?: string; help?: boolean } = {}

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--tls-provider' || arg === '-t') {
      options.tlsProvider = args[++i]
    } else if (arg === '--tls-fingerprint' || arg === '-f') {
      options.tlsFingerprint = args[++i]
    } else if (arg === '--port' || arg === '-p') {
      options.port = args[++i]
    }
  }

  return options
}

const cliArgs = parseArgs()

if (cliArgs.help) {
  console.log(`
Claudeoscope Proxy Server

Usage: npm start [options]

Options:
  -t, --tls-provider <provider>     TLS provider to use: 'utls' (Go fingerprinting) or 'native' (Node.js TLS)
                                    Default: utls
  -f, --tls-fingerprint <fp>        TLS fingerprint to use with utls provider
                                    Supported: chrome120, chrome102, firefox120, safari16, electron, etc.
                                    Default: electron
  -p, --port <port>                 Port to listen on (default: 9090)
  -h, --help                        Show this help message

Examples:
  npm start
  npm start --tls-provider native
  npm start --tls-provider utls --tls-fingerprint chrome120
  npm start -t native -p 8080
`)
  process.exit(0)
}

const PORT = parseInt(cliArgs.port || process.env.PORT || '9090', 10)

// TLS fingerprinting configuration
const TLS_PROVIDER = cliArgs.tlsProvider || process.env.TLS_PROVIDER || 'native' // 'utls' or 'native'
const TLS_FINGERPRINT = (cliArgs.tlsFingerprint || process.env.TLS_FINGERPRINT || 'electron') as TLSFingerprint

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

    // Build HTTP request with consistent header ordering
    let httpRequest = `${method} ${reqPath} HTTP/1.1\r\n`

    // Calculate body bytes first for Content-Length
    let bodyBytes: Buffer | undefined
    if (body) {
      bodyBytes = Buffer.from(body, 'utf-8')
    }

    // Track which headers we've already written
    const writtenHeaders = new Set<string>()

    // Write Host first (standard for HTTP/1.1)
    httpRequest += `Host: ${host}\r\n`
    writtenHeaders.add('host')

    // Write Content-Length if needed (before other headers, standard practice)
    if (bodyBytes) {
      httpRequest += `Content-Length: ${bodyBytes.length}\r\n`
      writtenHeaders.add('content-length')
    }

    // Write remaining headers in original order
    for (const [key, value] of Object.entries(headers)) {
      const keyLower = key.toLowerCase()
      if (!writtenHeaders.has(keyLower)) {
        httpRequest += `${key}: ${value}\r\n`
        writtenHeaders.add(keyLower)
      }
    }
    httpRequest += '\r\n'

    // Write request
    targetSocket.write(httpRequest)
    if (bodyBytes) {
      targetSocket.write(bodyBytes)
    }

    // Stream response as it arrives
    let responseBuffer = Buffer.alloc(0)
    let headersParsed = false
    let statusCode = 0
    let statusMessage = ''
    let responseHeaders: Record<string, string> = {}
    let contentEncoding: string | undefined
    let contentType: string | undefined
    let bodyChunks: Buffer[] = []
    let decompressedChunks: Buffer[] = []
    let streamParser: ReturnType<typeof createStreamParser> | null = null
    let isStreaming = false
    let compressionBuffer = Buffer.alloc(0) // For handling incomplete chunks in compressed streams

    const parseHeaders = (headerBytes: Buffer) => {
      const headerEnd = headerBytes.indexOf('\r\n\r\n')
      if (headerEnd === -1) return false

      headersParsed = true
      const headerStr = headerBytes.slice(0, headerEnd).toString('utf-8')
      const bodyStart = headerBytes.slice(headerEnd + 4)

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

      contentType = responseHeaders['content-type']
      contentEncoding = responseHeaders['content-encoding']

      // Check if this is a streaming response
      streamParser = createStreamParser(contentType, flow.id, contentEncoding)
      isStreaming = !!streamParser

      // Initialize response in flow
      flow.response = {
        status: statusCode,
        statusText: statusMessage,
        headers: responseHeaders,
        body: undefined
      }

      if (isStreaming) {
        flow.isSSE = true
        store.initFlowEvents(flow.id)
      }

      // Send headers to client, removing content-encoding since we decompress
      const headersToSend = { ...responseHeaders }
      if (contentEncoding && !isStreaming) {
        delete headersToSend['content-encoding']
      }
      writer.writeHead(statusCode, headersToSend)
      store.saveFlow(flow)

      // Return any remaining body data that came with headers
      return bodyStart.length > 0 ? bodyStart : null
    }

    targetSocket.on('data', (chunk: Buffer) => {
      if (!headersParsed) {
        responseBuffer = Buffer.concat([responseBuffer, chunk])
        const initialBody = parseHeaders(responseBuffer)

        if (headersParsed) {
          // Headers parsed, start streaming body
          responseBuffer = Buffer.alloc(0)

          // Process any body data that came with headers
          if (initialBody && initialBody.length > 0) {
            handleBodyChunk(initialBody)
          }
        }
      } else {
        handleBodyChunk(chunk)
      }
    })

    const handleBodyChunk = (chunk: Buffer) => {
      bodyChunks.push(chunk)

      // For streaming responses, write immediately to client
      // This prevents client hangs waiting for first chunk
      if (isStreaming && streamParser) {
        writer.write(chunk)
        return
      }

      // For non-streaming responses without compression, stream immediately
      if (!contentEncoding) {
        writer.write(chunk)
        return
      }

      // For compressed responses, accumulate in buffer for decompression
      // We keep buffering until the socket ends, then decompress all at once
      compressionBuffer = Buffer.concat([compressionBuffer, chunk])
    }

    targetSocket.on('end', () => {
      const duration = Date.now() - startTime
      const rawBody = Buffer.concat(bodyChunks)

      if (isStreaming && streamParser) {
        // Decompress if needed for SSE parsing
        let decompressedBody = rawBody
        if (contentEncoding) {
          const decompressed = decompressBody(rawBody, contentEncoding)
          decompressedBody = Buffer.from(decompressed, 'utf-8')
        }

        // Parse events from decompressed body
        for (const event of streamParser.processChunk(decompressedBody)) {
          store.addEvent(flow.id, event)
        }

        // Flush remaining events
        for (const event of streamParser.flush()) {
          store.addEvent(flow.id, event)
        }

        flow.response!.body = isBedrockStream(contentType)
          ? '[Bedrock Event Stream]'
          : decompressBody(rawBody, contentEncoding)

        writer.write(decompressedBody)
      } else {
        // For non-streaming responses
        // If we buffered compressed content, decompress and write it now
        if (contentEncoding && compressionBuffer.length > 0) {
          const decompressedBody = decompressBody(compressionBuffer, contentEncoding)
          flow.response!.body = decompressedBody
          writer.write(Buffer.from(decompressedBody, 'utf-8'))
        } else {
          // No compression, body already written or empty
          const decompressedBody = decompressBody(rawBody, contentEncoding)
          flow.response!.body = decompressedBody
        }
      }

      flow.duration = duration
      store.saveFlow(flow)
      writer.end()
    })

    targetSocket.on('error', (err) => {
      handleProxyError(err, flow, startTime, writer)
    })

    targetSocket.on('close', () => {
      // Ensure we finalize if end wasn't called
      if (headersParsed && !flow.duration) {
        const duration = Date.now() - startTime
        const rawBody = Buffer.concat(bodyChunks)
        flow.response!.body = decompressBody(rawBody, contentEncoding)
        flow.duration = duration
        store.saveFlow(flow)
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
