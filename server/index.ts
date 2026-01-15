import express from 'express'
import http from 'http'
import https from 'https'
import tls from 'tls'
import zlib from 'zlib'
import { WebSocketServer, WebSocket } from 'ws'
import path from 'path'
import { fileURLToPath } from 'url'
import type { Flow, SSEEvent } from '../shared/types.js'
import { loadOrCreateCA, generateCertForHost, CERTS_DIR } from './ca.js'
import { generateId } from './utils.js'
import { SSEStreamParser } from './parsers/sse-parser.js'
import { BedrockEventStreamParser } from './parsers/bedrock-parser.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = parseInt(process.env.PORT || '9090', 10)

// Initialize CA
loadOrCreateCA()

const app = express()
const server = http.createServer(app)
const wss = new WebSocketServer({ server })

const clients = new Set<WebSocket>()
const flows = new Map<string, Flow>()
const events = new Map<string, SSEEvent[]>()
const rawHttp = new Map<string, { request: string; response: string }>()  // Store raw HTTP by flow ID

wss.on('connection', (ws) => {
  clients.add(ws)
  const existingFlows = Array.from(flows.values()).slice(-100)
  // Convert events Map to Record for JSON serialization
  const existingEvents: Record<string, SSEEvent[]> = {}
  for (const [flowId, flowEvents] of events.entries()) {
    existingEvents[flowId] = flowEvents
  }
  ws.send(JSON.stringify({ type: 'init', flows: existingFlows, events: existingEvents }))
  ws.on('close', () => clients.delete(ws))
})

function broadcastFlow(flow: Flow) {
  const message = JSON.stringify({ type: 'flow', flow })
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message)
    }
  })
}

function broadcastEvent(flowId: string, event: SSEEvent) {
  const message = JSON.stringify({ type: 'event', flowId, event })
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message)
    }
  })
}

function decompressBody(body: Buffer, encoding: string | undefined): string {
  if (!encoding) {
    return body.toString('utf-8')
  }
  
  try {
    if (encoding === 'gzip') {
      return zlib.gunzipSync(body).toString('utf-8')
    } else if (encoding === 'deflate') {
      return zlib.inflateSync(body).toString('utf-8')
    } else if (encoding === 'br') {
      return zlib.brotliDecompressSync(body).toString('utf-8')
    }
  } catch (err) {
    // If decompression fails, return raw string
    console.error('Decompression error:', err)
  }
  
  return body.toString('utf-8')
}

// Serve static files
const distPath = path.join(__dirname, '..', 'dist')
app.use(express.static(distPath))

let requestCount = 0

app.get('/api/stats', (_req, res) => {
  res.json({
    requestCount,
    uptime: process.uptime(),
    connectedClients: clients.size
  })
})

// API to fetch raw HTTP for a flow
app.get('/api/flows/:id/raw', (req, res) => {
  const { id } = req.params
  const raw = rawHttp.get(id)
  if (!raw) {
    res.status(404).json({ error: 'Raw HTTP not found' })
    return
  }
  res.json(raw)
})

// Debug endpoint to list all flows with raw HTTP
app.get('/api/debug/raw-flows', (_req, res) => {
  const entries = Array.from(rawHttp.keys())
  res.json({ count: entries.length, flowIds: entries })
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

    flows.set(id, flow)
    broadcastFlow(flow)
    requestCount++

    const options: http.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 80,
      path: parsedUrl.pathname + parsedUrl.search,
      method: req.method,
      headers: { ...req.headers, host: parsedUrl.host }
    }

    const proxyReq = http.request(options, (proxyRes) => {
      const contentType = proxyRes.headers['content-type'] as string | undefined
      const contentEncoding = proxyRes.headers['content-encoding'] as string | undefined
      const isSSE = contentType?.includes('text/event-stream')
      const isBedrockStream = contentType?.includes('application/vnd.amazon.eventstream')
      const isStreaming = isSSE || isBedrockStream
      
      // Initialize response
      flow.response = {
        status: proxyRes.statusCode || 500,
        statusText: proxyRes.statusMessage || '',
        headers: proxyRes.headers as Record<string, string | string[] | undefined>,
        body: undefined
      }
      
      // Mark flow as streaming and broadcast initial state
      if (isStreaming) {
        flow.isSSE = true
        events.set(id, [])
        flows.set(id, flow)
        broadcastFlow(flow)
      }
      
      const responseChunks: Buffer[] = []
      const sseParser = isSSE ? new SSEStreamParser(id) : null
      const bedrockParser = isBedrockStream ? new BedrockEventStreamParser(id) : null

      proxyRes.on('data', (chunk: Buffer) => {
        responseChunks.push(chunk)
        res.write(chunk)
        
        if (isStreaming) {
          let newEvents: SSEEvent[] = []
          
          if (isSSE && sseParser) {
            // Parse SSE events incrementally
            const chunkStr = contentEncoding ? decompressBody(chunk, contentEncoding) : chunk.toString('utf-8')
            newEvents = sseParser.processChunk(chunkStr)
          } else if (isBedrockStream && bedrockParser) {
            // Parse Bedrock event stream (binary)
            newEvents = bedrockParser.processChunk(chunk)
          }
          
          // Broadcast each event individually
          for (const event of newEvents) {
            const flowEvents = events.get(id) || []
            flowEvents.push(event)
            events.set(id, flowEvents)
            broadcastEvent(id, event)
          }
        }
      })

      proxyRes.on('end', () => {
        res.end()
        const rawBody = Buffer.concat(responseChunks)
        const duration = Date.now() - startTime

        if (isStreaming) {
          // Flush any remaining events
          let remainingEvents: SSEEvent[] = []
          if (sseParser) {
            remainingEvents = sseParser.flush()
          } else if (bedrockParser) {
            remainingEvents = bedrockParser.flush()
          }
          
          for (const event of remainingEvents) {
            const flowEvents = events.get(id) || []
            flowEvents.push(event)
            events.set(id, flowEvents)
            broadcastEvent(id, event)
          }
          flow.response!.body = isBedrockStream ? '[Bedrock Event Stream]' : decompressBody(rawBody, contentEncoding)
          flow.duration = duration
          flows.set(id, flow)
          broadcastFlow(flow) // Final flow update with duration
        } else {
          // Non-SSE: original behavior
          const responseBody = decompressBody(rawBody, contentEncoding)

          flow.response = {
            status: proxyRes.statusCode || 500,
            statusText: proxyRes.statusMessage || '',
            headers: proxyRes.headers as Record<string, string | string[] | undefined>,
            body: responseBody || undefined
          }
          flow.duration = duration
          flows.set(id, flow)
          broadcastFlow(flow)
        }
      })

      res.writeHead(proxyRes.statusCode || 500, proxyRes.headers)
    })

    proxyReq.on('error', (err) => {
      console.error('Proxy request error:', err.message)
      res.writeHead(502)
      res.end('Bad Gateway')

      flow.response = {
        status: 502,
        statusText: 'Bad Gateway',
        headers: {},
        body: err.message
      }
      flow.duration = Date.now() - startTime
      flows.set(id, flow)
      broadcastFlow(flow)
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
    rawHttp.set(id, { request: rawRequest, response: '' })

    flows.set(id, flow)
    broadcastFlow(flow)
    requestCount++

    // Forward request to actual server
    const reqOptions: https.RequestOptions = {
      hostname: host,
      port,
      path,
      method,
      headers: { ...headers, host },
      rejectUnauthorized: false
    }

    const proxyReq = https.request(reqOptions, (proxyRes) => {
      const contentType = proxyRes.headers['content-type'] as string | undefined
      const contentEncoding = proxyRes.headers['content-encoding'] as string | undefined
      const isSSE = contentType?.includes('text/event-stream')
      const isBedrockStream = contentType?.includes('application/vnd.amazon.eventstream')
      const isStreaming = isSSE || isBedrockStream
      
      if (isStreaming) {
        console.log(`[Stream] Detected ${isBedrockStream ? 'Bedrock' : 'SSE'} stream for ${host}${path}`)
        console.log(`[Stream] Content-Type: ${contentType}`)
        console.log(`[Stream] Content-Encoding: ${contentEncoding || 'none'}`)
      }
      
      // Initialize response
      flow.response = {
        status: proxyRes.statusCode || 500,
        statusText: proxyRes.statusMessage || '',
        headers: proxyRes.headers as Record<string, string | string[] | undefined>,
        body: undefined
      }
      
      // For streaming, send headers immediately and stream to client
      if (isStreaming) {
        flow.isSSE = true // Reuse isSSE for any streaming response
        flow.hasRawHttp = false // Raw HTTP not available for streaming (binary/large)
        rawHttp.delete(id) // Remove the raw HTTP entry since we won't have the full response
        events.set(id, [])
        
        let responseHeader = `HTTP/1.1 ${proxyRes.statusCode} ${proxyRes.statusMessage}\r\n`
        for (const [key, value] of Object.entries(proxyRes.headers)) {
          if (value) {
            responseHeader += `${key}: ${Array.isArray(value) ? value.join(', ') : value}\r\n`
          }
        }
        responseHeader += '\r\n'
        tlsClient.write(responseHeader)
        
        // Broadcast initial flow state
        flows.set(id, flow)
        broadcastFlow(flow)
      }
      
      const responseChunks: Buffer[] = []
      const sseParser = isSSE ? new SSEStreamParser(id) : null
      const bedrockParser = isBedrockStream ? new BedrockEventStreamParser(id) : null

      proxyRes.on('data', (chunk: Buffer) => {
        responseChunks.push(chunk)
        
        if (isStreaming) {
          // Stream chunk directly to client
          tlsClient.write(chunk)
          
          let newEvents: SSEEvent[] = []
          
          if (isSSE && sseParser) {
            // Parse SSE events incrementally
            const chunkStr = contentEncoding ? decompressBody(chunk, contentEncoding) : chunk.toString('utf-8')
            newEvents = sseParser.processChunk(chunkStr)
          } else if (isBedrockStream && bedrockParser) {
            // Parse Bedrock event stream (binary)
            newEvents = bedrockParser.processChunk(chunk)
          }
          
          // Broadcast each event individually
          for (const event of newEvents) {
            console.log(`[Stream HTTPS] Broadcasting event: ${event.eventId}`)
            const flowEvents = events.get(id) || []
            flowEvents.push(event)
            events.set(id, flowEvents)
            broadcastEvent(id, event)
          }
        }
      })

      proxyRes.on('end', () => {
        const rawBody = Buffer.concat(responseChunks)
        const duration = Date.now() - startTime

        if (isStreaming) {
          // Flush any remaining events
          let remainingEvents: SSEEvent[] = []
          if (sseParser) {
            remainingEvents = sseParser.flush()
          } else if (bedrockParser) {
            remainingEvents = bedrockParser.flush()
          }
          
          for (const event of remainingEvents) {
            console.log(`[Stream HTTPS] Flushing event: ${event.eventId}`)
            const flowEvents = events.get(id) || []
            flowEvents.push(event)
            events.set(id, flowEvents)
            broadcastEvent(id, event)
          }
          const totalEvents = events.get(id)?.length || 0
          console.log(`[Stream HTTPS] Stream ended with ${totalEvents} total events`)
          // For Bedrock, don't try to decompress since it's binary
          flow.response!.body = isBedrockStream ? '[Bedrock Event Stream]' : decompressBody(rawBody, contentEncoding)
          flow.duration = duration
          flows.set(id, flow)
          broadcastFlow(flow) // Final flow update with duration
        } else {
          // Non-SSE: original behavior
          const decompressedBody = decompressBody(rawBody, contentEncoding)
          
          flow.response = {
            status: proxyRes.statusCode || 500,
            statusText: proxyRes.statusMessage || '',
            headers: proxyRes.headers as Record<string, string | string[] | undefined>,
            body: decompressedBody || undefined
          }
          flow.duration = duration
          flows.set(id, flow)
          broadcastFlow(flow)

          // Build response header for client
          let responseHeader = `HTTP/1.1 ${proxyRes.statusCode} ${proxyRes.statusMessage}\r\n`
          for (const [key, value] of Object.entries(proxyRes.headers)) {
            if (value && key !== 'transfer-encoding') {
              responseHeader += `${key}: ${Array.isArray(value) ? value.join(', ') : value}\r\n`
            }
          }
          responseHeader += `content-length: ${rawBody.length}\r\n`
          responseHeader += '\r\n'

          // Store raw HTTP response
          const rawEntry = rawHttp.get(id)
          if (rawEntry) {
            rawEntry.response = responseHeader + rawBody.toString('utf-8')
          }

          tlsClient.write(responseHeader)
          tlsClient.write(rawBody)
        }
      })
    })

    proxyReq.on('error', (err) => {
      console.error('Proxy request error:', err.message)

      flow.response = {
        status: 502,
        statusText: 'Bad Gateway',
        headers: {},
        body: err.message
      }
      flow.duration = Date.now() - startTime
      flows.set(id, flow)
      broadcastFlow(flow)

      const errorResponse = `HTTP/1.1 502 Bad Gateway\r\ncontent-length: ${err.message.length}\r\n\r\n${err.message}`
      tlsClient.write(errorResponse)
    })

    if (body) {
      proxyReq.write(body)
    }
    proxyReq.end()

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
})
