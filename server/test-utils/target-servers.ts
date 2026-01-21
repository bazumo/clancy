/**
 * Test target servers for HTTP and HTTPS
 * Provides configurable endpoints for testing proxy behavior
 */
import http from 'http'
import https from 'https'
import net from 'net'
import { compress, ensureZstdReady } from './compression.js'
import { generateCert } from './certificates.js'
import type { Compression, TransferMode, ReceivedRequest, ServerHandle, TargetServerOptions } from './types.js'

/**
 * Create a request handler for test servers
 * Supports various endpoints for testing different response types
 */
export function createRequestHandler(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  receivedRequests: ReceivedRequest[]
): void {
  const chunks: Buffer[] = []

  req.on('data', (chunk) => chunks.push(chunk))
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf-8')
    const url = new URL(req.url || '/', 'http://localhost')
    const params = url.searchParams

    // Record received request
    receivedRequests.push({
      method: req.method || 'GET',
      url: req.url || '/',
      headers: req.headers as Record<string, string | string[] | undefined>,
      body
    })

    // Parse common query params
    const compression = (params.get('compression') || 'none') as Compression
    const transferMode = (params.get('transfer') || 'content-length') as TransferMode
    const responseSize = parseInt(params.get('size') || '0')
    const isSSE = params.get('sse') === 'true'
    const isBedrock = params.get('bedrock') === 'true'
    const eventCount = parseInt(params.get('count') || params.get('sseCount') || '5')
    const delay = parseInt(params.get('delay') || '20')

    // SSE endpoint
    if (isSSE || url.pathname === '/sse' || url.pathname === '/stream') {
      handleSSE(res, compression, transferMode, eventCount, delay)
      return
    }

    // Bedrock streaming endpoint
    if (isBedrock || url.pathname === '/bedrock' || url.pathname === '/bedrock-stream') {
      handleBedrockStream(res, compression, transferMode, eventCount, delay)
      return
    }

    // Echo endpoint - returns what it received
    if (url.pathname === '/echo') {
      const responseBody = JSON.stringify({
        method: req.method,
        path: url.pathname,
        headers: req.headers,
        receivedBody: body,
        receivedBodyLength: body.length
      })
      sendResponse(res, responseBody, compression, transferMode, 'application/json')
      return
    }

    // Empty response (204 No Content)
    if (url.pathname === '/empty') {
      res.writeHead(204)
      res.end()
      return
    }

    // Fixed size response via path
    if (url.pathname.startsWith('/size/')) {
      const size = parseInt(url.pathname.split('/')[2])
      if (isNaN(size) || size < 0) {
        res.writeHead(400)
        res.end('Invalid size')
        return
      }
      sendResponse(res, 'x'.repeat(size), compression, transferMode, 'text/plain')
      return
    }

    // Chunked response (legacy endpoint)
    if (url.pathname === '/chunked') {
      res.writeHead(200, {
        'Content-Type': 'text/plain',
        'Transfer-Encoding': 'chunked'
      })
      const chunks = ['chunk1-', 'chunk2-', 'chunk3']
      let i = 0
      const interval = setInterval(() => {
        if (i < chunks.length) {
          res.write(chunks[i])
          i++
        } else {
          clearInterval(interval)
          res.end()
        }
      }, 10)
      return
    }

    // Gzip compressed (legacy endpoint)
    if (url.pathname === '/gzip') {
      const data = JSON.stringify({ compressed: true, method: 'gzip', padding: 'x'.repeat(100) })
      sendResponse(res, data, 'gzip', 'content-length', 'application/json')
      return
    }

    // Deflate compressed (legacy endpoint)
    if (url.pathname === '/deflate') {
      const data = JSON.stringify({ compressed: true, method: 'deflate', padding: 'x'.repeat(100) })
      sendResponse(res, data, 'deflate', 'content-length', 'application/json')
      return
    }

    // Slow response (for timeout testing)
    if (url.pathname === '/slow') {
      const slowDelay = parseInt(params.get('delay') || '500')
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end('finally done')
      }, slowDelay)
      return
    }

    // Size via query param
    if (responseSize > 0) {
      sendResponse(res, 'x'.repeat(responseSize), compression, transferMode, 'text/plain')
      return
    }

    // Default response
    sendResponse(res, JSON.stringify({ ok: true, path: url.pathname }), compression, transferMode, 'application/json')
  })
}

/**
 * Send a response with optional compression and transfer mode
 */
function sendResponse(
  res: http.ServerResponse,
  body: string,
  compression: Compression,
  transferMode: TransferMode,
  contentType: string
): void {
  const compressedBody = compress(body, compression)
  const headers: http.OutgoingHttpHeaders = {
    'Content-Type': contentType
  }

  if (compression !== 'none') {
    headers['Content-Encoding'] = compression
  }

  if (transferMode === 'chunked') {
    headers['Transfer-Encoding'] = 'chunked'
    res.writeHead(200, headers)
    // Send in chunks
    const chunkSize = Math.max(1, Math.ceil(compressedBody.length / 3))
    let offset = 0
    const sendChunk = () => {
      if (offset < compressedBody.length) {
        res.write(compressedBody.slice(offset, offset + chunkSize))
        offset += chunkSize
        setImmediate(sendChunk)
      } else {
        res.end()
      }
    }
    sendChunk()
  } else {
    headers['Content-Length'] = compressedBody.length
    res.writeHead(200, headers)
    res.end(compressedBody)
  }
}

/**
 * Handle SSE streaming responses
 */
function handleSSE(
  res: http.ServerResponse,
  compression: Compression,
  transferMode: TransferMode,
  eventCount: number,
  delay: number
): void {
  // Build complete SSE body for compressed responses
  if (compression !== 'none') {
    let sseBody = ''
    for (let i = 1; i <= eventCount; i++) {
      sseBody += `event: message\ndata: {"count":${i},"total":${eventCount}}\n\n`
    }

    const compressedBody = compress(sseBody, compression)
    const headers: http.OutgoingHttpHeaders = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'close',
      'Content-Encoding': compression
    }

    if (transferMode === 'chunked') {
      headers['Transfer-Encoding'] = 'chunked'
      res.writeHead(200, headers)
      // Send compressed data in chunks
      const chunkSize = Math.max(1, Math.ceil(compressedBody.length / 3))
      let offset = 0
      const sendChunk = () => {
        if (offset < compressedBody.length) {
          res.write(compressedBody.slice(offset, offset + chunkSize))
          offset += chunkSize
          setImmediate(sendChunk)
        } else {
          res.end()
        }
      }
      sendChunk()
    } else {
      headers['Content-Length'] = compressedBody.length
      res.writeHead(200, headers)
      res.end(compressedBody)
    }
    return
  }

  // Uncompressed - stream events with delay
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'close'
  })

  let count = 0
  const interval = setInterval(() => {
    count++
    res.write(`event: message\ndata: {"count":${count},"total":${eventCount}}\n\n`)
    if (count >= eventCount) {
      clearInterval(interval)
      res.end()
    }
  }, delay)

  // Handle client disconnect
  res.on('close', () => {
    clearInterval(interval)
  })
}

/**
 * Handle Bedrock-style streaming responses
 * Simulates AWS Bedrock's event-stream format
 */
function handleBedrockStream(
  res: http.ServerResponse,
  compression: Compression,
  transferMode: TransferMode,
  chunkCount: number,
  delay: number
): void {
  const chunks: string[] = []

  // Message start
  chunks.push(JSON.stringify({
    type: 'message_start',
    message: {
      id: 'msg_test_' + Date.now(),
      type: 'message',
      role: 'assistant',
      content: [],
      model: 'test-model',
      stop_reason: null,
      stop_sequence: null
    }
  }))

  // Content block start
  chunks.push(JSON.stringify({
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'text', text: '' }
  }))

  // Content deltas
  const words = ['Hello', ' ', 'from', ' ', 'Bedrock', ' ', 'streaming', ' ', 'test', '!']
  for (let i = 0; i < Math.min(chunkCount, words.length); i++) {
    chunks.push(JSON.stringify({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: words[i] }
    }))
  }

  // Content block stop
  chunks.push(JSON.stringify({
    type: 'content_block_stop',
    index: 0
  }))

  // Message delta
  chunks.push(JSON.stringify({
    type: 'message_delta',
    delta: { stop_reason: 'end_turn', stop_sequence: null },
    usage: { output_tokens: chunkCount }
  }))

  // Message stop
  chunks.push(JSON.stringify({
    type: 'message_stop'
  }))

  // Format as event-stream
  const body = chunks.map(chunk => `event: content_block_delta\ndata: ${chunk}\n\n`).join('')

  if (compression !== 'none') {
    const compressedBody = compress(body, compression)
    const headers: http.OutgoingHttpHeaders = {
      'Content-Type': 'application/vnd.amazon.eventstream',
      'Cache-Control': 'no-cache',
      'Connection': 'close',
      'Content-Encoding': compression
    }

    if (transferMode === 'chunked') {
      headers['Transfer-Encoding'] = 'chunked'
      res.writeHead(200, headers)
      const chunkSize = Math.max(1, Math.ceil(compressedBody.length / 3))
      let offset = 0
      const sendChunk = () => {
        if (offset < compressedBody.length) {
          res.write(compressedBody.slice(offset, offset + chunkSize))
          offset += chunkSize
          setImmediate(sendChunk)
        } else {
          res.end()
        }
      }
      sendChunk()
    } else {
      headers['Content-Length'] = compressedBody.length
      res.writeHead(200, headers)
      res.end(compressedBody)
    }
    return
  }

  // Uncompressed - stream with delay
  res.writeHead(200, {
    'Content-Type': 'application/vnd.amazon.eventstream',
    'Cache-Control': 'no-cache',
    'Connection': 'close'
  })

  let index = 0
  const interval = setInterval(() => {
    if (index < chunks.length) {
      res.write(`event: content_block_delta\ndata: ${chunks[index]}\n\n`)
      index++
    } else {
      clearInterval(interval)
      res.end()
    }
  }, delay)

  res.on('close', () => {
    clearInterval(interval)
  })
}

/**
 * Create an HTTP target server on an ephemeral port
 */
export async function createHttpTargetServer(
  options: TargetServerOptions = {}
): Promise<ServerHandle> {
  const receivedRequests = options.receivedRequests || []
  await ensureZstdReady()

  const server = http.createServer((req, res) => {
    createRequestHandler(req, res, receivedRequests)
  })

  return new Promise((resolve, reject) => {
    server.on('error', reject)
    server.listen(0, () => {
      const addr = server.address() as net.AddressInfo
      resolve({
        port: addr.port,
        server,
        close: () => new Promise<void>((res) => {
          server.close(() => res())
        })
      })
    })
  })
}

/**
 * Create an HTTPS target server on an ephemeral port
 */
export async function createHttpsTargetServer(
  options: TargetServerOptions = {}
): Promise<ServerHandle> {
  const receivedRequests = options.receivedRequests || []
  await ensureZstdReady()

  const creds = generateCert()
  const server = https.createServer(creds, (req, res) => {
    createRequestHandler(req, res, receivedRequests)
  })

  return new Promise((resolve, reject) => {
    server.on('error', reject)
    server.listen(0, () => {
      const addr = server.address() as net.AddressInfo
      resolve({
        port: addr.port,
        server,
        close: () => new Promise<void>((res) => {
          server.close(() => res())
        })
      })
    })
  })
}
