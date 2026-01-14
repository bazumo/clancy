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
      { name: 'commonName', value: 'Claudio Proxy CA' },
      { name: 'organizationName', value: 'Claudio' }
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

// Flow types imported from ../shared/types.ts

function parseSSEEvents(body: string): SSEEvent[] {
  const events: SSEEvent[] = []
  const rawEvents = body.split(/\n\n+/)
  
  for (const rawEvent of rawEvents) {
    if (!rawEvent.trim()) continue
    
    const lines = rawEvent.split('\n')
    const event: Partial<SSEEvent> = {}
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
      events.push(event as SSEEvent)
    }
  }
  
  return events
}

// Incremental SSE parser for streaming
class SSEStreamParser {
  private buffer = ''
  private events: SSEEvent[] = []
  
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
        this.events.push(event)
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
      this.events.push(event)
      return [event]
    }
    return []
  }
  
  private parseEvent(raw: string): SSEEvent | null {
    const lines = raw.split('\n')
    const event: Partial<SSEEvent> = {}
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
  
  getAllEvents(): SSEEvent[] {
    return this.events
  }
}

// Initialize CA
loadOrCreateCA()

const app = express()
const server = http.createServer(app)
const wss = new WebSocketServer({ server })

const clients = new Set<WebSocket>()
const flows = new Map<string, Flow>()

wss.on('connection', (ws) => {
  clients.add(ws)
  const existingFlows = Array.from(flows.values()).slice(-100)
  ws.send(JSON.stringify({ type: 'init', flows: existingFlows }))
  ws.on('close', () => clients.delete(ws))
})

function broadcast(flow: Flow) {
  const message = JSON.stringify({ type: 'flow', flow })
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
    broadcast(flow)
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
      
      // Initialize response early for SSE streaming
      flow.response = {
        status: proxyRes.statusCode || 500,
        statusText: proxyRes.statusMessage || '',
        headers: proxyRes.headers as Record<string, string | string[] | undefined>,
        body: undefined,
        events: isSSE ? [] : undefined
      }
      
      // Broadcast initial response state for SSE
      if (isSSE) {
        flows.set(id, flow)
        broadcast(flow)
      }
      
      const responseChunks: Buffer[] = []
      const sseParser = isSSE ? new SSEStreamParser() : null
      let lastBroadcast = Date.now()

      proxyRes.on('data', (chunk: Buffer) => {
        responseChunks.push(chunk)
        res.write(chunk)
        
        if (isSSE) {
          // Parse SSE events incrementally
          const chunkStr = contentEncoding ? decompressBody(chunk, contentEncoding) : chunk.toString('utf-8')
          const newEvents = sseParser!.processChunk(chunkStr)
          
          if (newEvents.length > 0) {
            flow.response!.events!.push(...newEvents)
            flow.duration = Date.now() - startTime
            flows.set(id, flow)
            
            // Throttle broadcasts to avoid overwhelming clients (max every 50ms)
            const now = Date.now()
            if (now - lastBroadcast >= 50) {
              broadcast(flow)
              lastBroadcast = now
            }
          }
        }
      })

      proxyRes.on('end', () => {
        res.end()
        const rawBody = Buffer.concat(responseChunks)
        const duration = Date.now() - startTime

        if (isSSE) {
          // Flush any remaining events
          const remainingEvents = sseParser!.flush()
          if (remainingEvents.length > 0) {
            flow.response!.events!.push(...remainingEvents)
          }
          flow.response!.body = decompressBody(rawBody, contentEncoding)
          flow.duration = duration
          flows.set(id, flow)
          broadcast(flow) // Final broadcast
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
          broadcast(flow)
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
      broadcast(flow)
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
      }
    }

    flows.set(id, flow)
    broadcast(flow)
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
      
      if (isSSE) {
        console.log(`[SSE] Detected SSE stream for ${host}${path}`)
        console.log(`[SSE] Content-Type: ${contentType}`)
        console.log(`[SSE] Content-Encoding: ${contentEncoding || 'none'}`)
      }
      
      // Initialize response early for SSE streaming
      flow.response = {
        status: proxyRes.statusCode || 500,
        statusText: proxyRes.statusMessage || '',
        headers: proxyRes.headers as Record<string, string | string[] | undefined>,
        body: undefined,
        events: isSSE ? [] : undefined
      }
      
      // For SSE, send headers immediately and stream to client
      if (isSSE) {
        let responseHeader = `HTTP/1.1 ${proxyRes.statusCode} ${proxyRes.statusMessage}\r\n`
        for (const [key, value] of Object.entries(proxyRes.headers)) {
          if (value) {
            responseHeader += `${key}: ${Array.isArray(value) ? value.join(', ') : value}\r\n`
          }
        }
        responseHeader += '\r\n'
        tlsClient.write(responseHeader)
        
        // Broadcast initial response state
        flows.set(id, flow)
        broadcast(flow)
      }
      
      const responseChunks: Buffer[] = []
      const sseParser = isSSE ? new SSEStreamParser() : null
      let lastBroadcast = Date.now()

      proxyRes.on('data', (chunk: Buffer) => {
        responseChunks.push(chunk)
        
        if (isSSE) {
          // Stream chunk directly to client
          tlsClient.write(chunk)
          
          // Parse SSE events incrementally
          const chunkStr = contentEncoding ? decompressBody(chunk, contentEncoding) : chunk.toString('utf-8')
          const newEvents = sseParser!.processChunk(chunkStr)
          
          if (newEvents.length > 0) {
            console.log(`[SSE HTTPS] Parsed ${newEvents.length} new events (total: ${flow.response!.events!.length + newEvents.length})`)
            flow.response!.events!.push(...newEvents)
            flow.duration = Date.now() - startTime
            flows.set(id, flow)
            
            // Throttle broadcasts to avoid overwhelming clients (max every 50ms)
            const now = Date.now()
            if (now - lastBroadcast >= 50) {
              broadcast(flow)
              lastBroadcast = now
            }
          }
        }
      })

      proxyRes.on('end', () => {
        const rawBody = Buffer.concat(responseChunks)
        const duration = Date.now() - startTime

        if (isSSE) {
          // Flush any remaining events
          const remainingEvents = sseParser!.flush()
          if (remainingEvents.length > 0) {
            console.log(`[SSE HTTPS] Flushed ${remainingEvents.length} remaining events`)
            flow.response!.events!.push(...remainingEvents)
          }
          console.log(`[SSE HTTPS] Stream ended with ${flow.response!.events!.length} total events`)
          flow.response!.body = decompressBody(rawBody, contentEncoding)
          flow.duration = duration
          flows.set(id, flow)
          broadcast(flow) // Final broadcast
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
          broadcast(flow)

          // Send response back to client (original compressed body)
          let responseHeader = `HTTP/1.1 ${proxyRes.statusCode} ${proxyRes.statusMessage}\r\n`
          for (const [key, value] of Object.entries(proxyRes.headers)) {
            if (value && key !== 'transfer-encoding') {
              responseHeader += `${key}: ${Array.isArray(value) ? value.join(', ') : value}\r\n`
            }
          }
          responseHeader += `content-length: ${rawBody.length}\r\n`
          responseHeader += '\r\n'

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
      broadcast(flow)

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
  console.log(`Claudio proxy running on http://localhost:${PORT}`)
  console.log(`CA certificate: ${path.join(CERTS_DIR, 'ca.crt')}`)
})
