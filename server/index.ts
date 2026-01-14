import express from 'express'
import http from 'http'
import https from 'https'
import net from 'net'
import tls from 'tls'
import fs from 'fs'
import zlib from 'zlib'
import { WebSocketServer, WebSocket } from 'ws'
import path from 'path'
import { fileURLToPath } from 'url'
import forge from 'node-forge'
import type { Flow, FlowRequest, FlowResponse, SSEEvent } from '../shared/types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = parseInt(process.env.PORT || '9090', 10)
const CERTS_DIR = path.join(__dirname, '..', 'certs')

// Ensure certs directory exists
if (!fs.existsSync(CERTS_DIR)) {
  fs.mkdirSync(CERTS_DIR, { recursive: true })
}

// CA certificate management
let caCert: forge.pki.Certificate
let caKey: forge.pki.PrivateKey
const certCache = new Map<string, tls.SecureContext>()

function loadOrCreateCA() {
  const caCertPath = path.join(CERTS_DIR, 'ca.crt')
  const caKeyPath = path.join(CERTS_DIR, 'ca.key')

  if (fs.existsSync(caCertPath) && fs.existsSync(caKeyPath)) {
    caCert = forge.pki.certificateFromPem(fs.readFileSync(caCertPath, 'utf-8'))
    caKey = forge.pki.privateKeyFromPem(fs.readFileSync(caKeyPath, 'utf-8'))
    console.log('Loaded existing CA certificate')
  } else {
    console.log('Generating new CA certificate...')
    const keys = forge.pki.rsa.generateKeyPair(2048)
    caCert = forge.pki.createCertificate()
    caKey = keys.privateKey

    caCert.publicKey = keys.publicKey
    caCert.serialNumber = '01'
    caCert.validity.notBefore = new Date()
    caCert.validity.notAfter = new Date()
    caCert.validity.notAfter.setFullYear(caCert.validity.notBefore.getFullYear() + 10)

    const attrs = [
      { name: 'commonName', value: 'Claudeoscope Proxy CA' },
      { name: 'organizationName', value: 'Claudeoscope' }
    ]
    caCert.setSubject(attrs)
    caCert.setIssuer(attrs)

    caCert.setExtensions([
      { name: 'basicConstraints', cA: true },
      { name: 'keyUsage', keyCertSign: true, digitalSignature: true, cRLSign: true }
    ])

    caCert.sign(caKey, forge.md.sha256.create())

    fs.writeFileSync(caCertPath, forge.pki.certificateToPem(caCert))
    fs.writeFileSync(caKeyPath, forge.pki.privateKeyToPem(caKey))
    console.log(`CA certificate saved to ${caCertPath}`)
  }
}

function generateCertForHost(host: string): tls.SecureContext {
  if (certCache.has(host)) {
    return certCache.get(host)!
  }

  const keys = forge.pki.rsa.generateKeyPair(2048)
  const cert = forge.pki.createCertificate()

  cert.publicKey = keys.publicKey
  cert.serialNumber = Date.now().toString(16)
  cert.validity.notBefore = new Date()
  cert.validity.notAfter = new Date()
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1)

  const attrs = [{ name: 'commonName', value: host }]
  cert.setSubject(attrs)
  cert.setIssuer(caCert.subject.attributes)

  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
    { name: 'extKeyUsage', serverAuth: true },
    { name: 'subjectAltName', altNames: [{ type: 2, value: host }] }
  ])

  cert.sign(caKey as forge.pki.rsa.PrivateKey, forge.md.sha256.create())

  const ctx = tls.createSecureContext({
    key: forge.pki.privateKeyToPem(keys.privateKey),
    cert: forge.pki.certificateToPem(cert)
  })

  certCache.set(host, ctx)
  return ctx
}

// Incremental SSE parser for streaming
class SSEStreamParser {
  private buffer = ''
  private flowId: string
  
  constructor(flowId: string) {
    this.flowId = flowId
  }
  
  // Process a chunk, returns any newly completed events
  processChunk(chunk: string): SSEEvent[] {
    this.buffer += chunk
    const newEvents: SSEEvent[] = []
    
    // Split on double newlines (event boundaries)
    const parts = this.buffer.split(/\n\n/)
    
    // Keep the last part as buffer (might be incomplete)
    this.buffer = parts.pop() || ''
    
    // Parse complete events
    for (const part of parts) {
      if (!part.trim()) continue
      
      const event = this.parseEvent(part)
      if (event) {
        newEvents.push(event)
      }
    }
    
    return newEvents
  }
  
  // Flush any remaining buffer content
  flush(): SSEEvent[] {
    if (!this.buffer.trim()) return []
    
    const event = this.parseEvent(this.buffer)
    this.buffer = ''
    
    if (event) {
      return [event]
    }
    return []
  }
  
  private parseEvent(raw: string): SSEEvent | null {
    const lines = raw.split('\n')
    const event: Partial<SSEEvent> = {
      eventId: generateId(),
      flowId: this.flowId
    }
    const dataLines: string[] = []
    
    for (const line of lines) {
      if (line.startsWith('event:')) {
        event.event = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim())
      } else if (line.startsWith('id:')) {
        event.id = line.slice(3).trim()
      } else if (line.startsWith('retry:')) {
        event.retry = line.slice(6).trim()
      }
    }
    
    if (dataLines.length > 0) {
      event.data = dataLines.join('\n')
      event.timestamp = new Date().toISOString()
      return event as SSEEvent
    }
    return null
  }
}

// AWS Bedrock event stream parser for application/vnd.amazon.eventstream
class BedrockEventStreamParser {
  private buffer = Buffer.alloc(0)
  private flowId: string
  
  constructor(flowId: string) {
    this.flowId = flowId
  }
  
  // Process a binary chunk, returns any newly completed events
  processChunk(chunk: Buffer): SSEEvent[] {
    this.buffer = Buffer.concat([this.buffer, chunk])
    const newEvents: SSEEvent[] = []
    
    // Parse complete messages from buffer
    while (true) {
      const message = this.parseMessage()
      if (!message) break
      
      const event = this.messageToEvent(message)
      if (event) {
        newEvents.push(event)
      }
    }
    
    return newEvents
  }
  
  // Flush any remaining buffer content
  flush(): SSEEvent[] {
    const events: SSEEvent[] = []
    while (true) {
      const message = this.parseMessage()
      if (!message) break
      
      const event = this.messageToEvent(message)
      if (event) {
        events.push(event)
      }
    }
    return events
  }
  
  // Parse a single AWS event stream message
  // Format: 4-byte total length, 4-byte headers length, 4-byte prelude CRC, headers, payload, 4-byte message CRC
  private parseMessage(): { headers: Record<string, string>, payload: Buffer } | null {
    // Need at least 12 bytes for prelude (total_len + headers_len + prelude_crc)
    if (this.buffer.length < 12) return null
    
    const totalLength = this.buffer.readUInt32BE(0)
    const headersLength = this.buffer.readUInt32BE(4)
    
    // Check if we have the complete message
    if (this.buffer.length < totalLength) return null
    
    // Parse headers (start after prelude: offset 12)
    const headers: Record<string, string> = {}
    let offset = 12
    const headersEnd = 12 + headersLength
    
    while (offset < headersEnd) {
      // Header name length (1 byte)
      const nameLength = this.buffer.readUInt8(offset)
      offset += 1
      
      // Header name
      const name = this.buffer.slice(offset, offset + nameLength).toString('utf-8')
      offset += nameLength
      
      // Header type (1 byte) - 7 means string
      const headerType = this.buffer.readUInt8(offset)
      offset += 1
      
      if (headerType === 7) {
        // String value: 2 bytes length + value
        const valueLength = this.buffer.readUInt16BE(offset)
        offset += 2
        const value = this.buffer.slice(offset, offset + valueLength).toString('utf-8')
        offset += valueLength
        headers[name] = value
      } else {
        // Skip other header types for now
        break
      }
    }
    
    // Payload is between headers and message CRC (last 4 bytes)
    const payloadStart = 12 + headersLength
    const payloadEnd = totalLength - 4
    const payload = this.buffer.slice(payloadStart, payloadEnd)
    
    // Remove processed message from buffer
    this.buffer = this.buffer.slice(totalLength)
    
    return { headers, payload }
  }
  
  // Convert AWS message to SSEEvent
  private messageToEvent(message: { headers: Record<string, string>, payload: Buffer }): SSEEvent | null {
    try {
      // Parse the JSON payload
      const payloadStr = message.payload.toString('utf-8')
      const payloadJson = JSON.parse(payloadStr)
      
      // The actual event data is base64-encoded in the "bytes" field
      if (payloadJson.bytes) {
        const decodedData = Buffer.from(payloadJson.bytes, 'base64').toString('utf-8')
        const eventData = JSON.parse(decodedData)
        
        return {
          eventId: generateId(),
          flowId: this.flowId,
          event: eventData.type || message.headers[':event-type'],
          data: decodedData,
          timestamp: new Date().toISOString()
        }
      }
    } catch (err) {
      console.error('Error parsing Bedrock event:', err)
    }
    return null
  }
}

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

function generateId(): string {
  return Math.random().toString(36).substring(2, 9)
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
