import http from 'http'
import type { Flow } from '../shared/types.js'
import { decompressBody } from './utils.js'
import { createStreamParser, isBedrockStream } from './parsers/index.js'
import * as store from './flow-store.js'

/**
 * Interface for writing response data back to the client
 */
export interface ResponseWriter {
  writeHead(status: number, headers: http.OutgoingHttpHeaders): void
  write(chunk: Buffer): void
  end(): void
}

/**
 * Options for handling a proxy response
 */
export interface ProxyResponseOptions {
  flow: Flow
  startTime: number
  writer: ResponseWriter
  /** If provided, raw HTTP response will be stored */
  storeRawHttp?: boolean
  /** Enable verbose logging for streaming */
  verbose?: boolean
}

/**
 * Build raw HTTP response header string
 */
export function buildResponseHeader(
  statusCode: number,
  statusMessage: string,
  headers: Record<string, string | string[] | number | undefined>,
  contentLength?: number
): string {
  let header = `HTTP/1.1 ${statusCode} ${statusMessage}\r\n`
  for (const [key, value] of Object.entries(headers)) {
    if (value && key !== 'transfer-encoding') {
      header += `${key}: ${Array.isArray(value) ? value.join(', ') : value}\r\n`
    }
  }
  if (contentLength !== undefined) {
    header += `content-length: ${contentLength}\r\n`
  }
  header += '\r\n'
  return header
}

/**
 * Handle a proxy response (works for both HTTP and HTTPS)
 */
export function handleProxyResponse(
  proxyRes: http.IncomingMessage,
  options: ProxyResponseOptions
): void {
  const { flow, startTime, writer, storeRawHttp, verbose } = options
  const id = flow.id

  console.log(`[RESPONSE] Started receiving response for ${flow.request.method} ${flow.request.path} (flow: ${id}, status: ${proxyRes.statusCode})`)

  const contentType = proxyRes.headers['content-type'] as string | undefined
  const contentEncoding = proxyRes.headers['content-encoding'] as string | undefined
  const parser = createStreamParser(contentType, id, contentEncoding)

  if (parser && verbose) {
    const streamType = isBedrockStream(contentType) ? 'Bedrock' : 'SSE'
    console.log(`[Stream] Detected ${streamType} stream for ${flow.host}${flow.request.path}`)
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

  if (parser) {
    flow.isSSE = true
    if (storeRawHttp) {
      flow.hasRawHttp = false
      store.deleteRawHttp(id)
    }
    store.initFlowEvents(id)
  }

  // For compressed responses (including SSE), we must buffer until end to:
  // 1. Decompress the body (brotli/gzip can't be decompressed chunk-by-chunk)
  // 2. Send headers with content-encoding removed
  // For uncompressed responses, send headers immediately
  const needsBuffering = !!contentEncoding

  if (!needsBuffering) {
    // For streaming responses (SSE/Bedrock), Node.js decodes chunked encoding internally.
    // We receive decoded body data, not the raw chunked bytes. But the original headers
    // still include Transfer-Encoding: chunked, which would make the client wait forever
    // for the 0\r\n\r\n terminator that we never send.
    //
    // Fix: For streaming responses, remove transfer-encoding and use Connection: close
    // to signal end-of-body when the stream ends.
    const headersToSend = { ...proxyRes.headers }
    if (parser) {
      delete headersToSend['transfer-encoding']
      delete headersToSend['content-length']
      headersToSend['connection'] = 'close'
    }
    writer.writeHead(proxyRes.statusCode || 500, headersToSend)
  }
  store.saveFlow(flow)

  const responseChunks: Buffer[] = []

  // Track whether the stream has been finalized to prevent double-close
  let streamFinalized = false

  /**
   * Finalize the stream - called on 'end', 'error', or 'close' events.
   * Ensures cleanup happens exactly once regardless of which event fires first.
   */
  const finalizeStream = (reason: 'end' | 'error' | 'close', error?: Error) => {
    if (streamFinalized) return
    streamFinalized = true

    const rawBody = Buffer.concat(responseChunks)
    const duration = Date.now() - startTime

    if (reason === 'error') {
      console.error(`[RESPONSE] Error during ${flow.request.method} ${flow.request.path} (flow: ${id}): ${error?.message}`)
    } else if (reason === 'close' && !proxyRes.complete) {
      console.warn(`[RESPONSE] Connection closed prematurely for ${flow.request.method} ${flow.request.path} (flow: ${id}, ${rawBody.length} bytes received)`)
    } else {
      console.log(`[RESPONSE] Completed ${flow.request.method} ${flow.request.path} (flow: ${id}, ${rawBody.length} bytes, ${duration}ms)`)
    }

    if (parser) {
      // Decompress for event parsing if needed
      let decompressedBody = rawBody
      if (contentEncoding && rawBody.length > 0) {
        try {
          const decompressed = decompressBody(rawBody, contentEncoding)
          decompressedBody = Buffer.from(decompressed, 'utf-8')
        } catch (err) {
          console.error(`[RESPONSE] Decompression failed for flow ${id}:`, err)
          decompressedBody = rawBody
        }
      }

      // Parse events from decompressed data
      for (const event of parser.processChunk(decompressedBody)) {
        if (verbose) {
          console.log(`[Stream] Parsed event: ${event.eventId}`)
        }
        store.addEvent(id, event)
      }

      // Flush remaining events
      for (const event of parser.flush()) {
        if (verbose) {
          console.log(`[Stream] Flushing event: ${event.eventId}`)
        }
        store.addEvent(id, event)
      }

      if (verbose) {
        const totalEvents = store.getEvents(id).length
        console.log(`[Stream] Stream ended with ${totalEvents} total events`)
      }

      flow.response!.body = isBedrockStream(contentType)
        ? '[Bedrock Event Stream]'
        : decompressBody(rawBody, contentEncoding)

      // For compressed SSE, send headers (with encoding removed) and decompressed body
      // For uncompressed SSE, data was already streamed - don't write again
      if (contentEncoding) {
        const headersToSend = { ...proxyRes.headers }
        delete headersToSend['content-encoding']
        delete headersToSend['content-length']
        delete headersToSend['transfer-encoding']
        // Add Content-Length so client knows when response is complete
        headersToSend['content-length'] = String(decompressedBody.length)
        writer.writeHead(proxyRes.statusCode || 500, headersToSend)
        writer.write(decompressedBody)
      }
      // Note: For uncompressed SSE, data was already written in the 'data' handler
    } else {
      // Non-streaming response - decompress and send to client
      const decompressedBody = decompressBody(rawBody, contentEncoding)
      flow.response!.body = decompressedBody

      // For compressed responses, send headers now with correct Content-Length
      if (contentEncoding) {
        const decompressedBuf = Buffer.from(decompressedBody, 'utf-8')
        const headersToSend = { ...proxyRes.headers }
        delete headersToSend['content-encoding']
        delete headersToSend['content-length']
        delete headersToSend['transfer-encoding']
        headersToSend['content-length'] = String(decompressedBuf.length)
        writer.writeHead(proxyRes.statusCode || 500, headersToSend)
        writer.write(decompressedBuf)
      }
    }

    flow.duration = duration
    store.saveFlow(flow)

    // Store raw HTTP if requested
    if (storeRawHttp && !parser) {
      const header = buildResponseHeader(
        proxyRes.statusCode || 500,
        proxyRes.statusMessage || '',
        proxyRes.headers,
        rawBody.length
      )
      store.setRawHttpResponse(id, header + decompressBody(rawBody, contentEncoding))
    }

    writer.end()
  }

  proxyRes.on('data', (chunk: Buffer) => {
    // Ignore data if stream is already finalized
    if (streamFinalized) return

    responseChunks.push(chunk)

    // For streaming responses (SSE) WITHOUT compression, write immediately to client
    // For compressed SSE, we must buffer until end because brotli/gzip can't be
    // decompressed chunk-by-chunk
    if (parser && !contentEncoding) {
      writer.write(chunk)
      return
    }

    // For uncompressed non-streaming responses, stream immediately
    if (!contentEncoding && !parser) {
      writer.write(chunk)
    }
    // For compressed responses (streaming or not), buffer until end to decompress
  })

  proxyRes.on('end', () => {
    finalizeStream('end')
  })

  // Handle error events - connection errors, timeouts, etc.
  proxyRes.on('error', (err: Error) => {
    finalizeStream('error', err)
  })

  // Handle close events - connection closed before 'end' (e.g., client disconnect, network failure)
  proxyRes.on('close', () => {
    // 'close' fires after 'end' in normal cases, but can fire without 'end' on abrupt disconnection
    finalizeStream('close')
  })
}

/**
 * Handle a proxy error
 */
export function handleProxyError(
  err: Error,
  flow: Flow,
  startTime: number,
  writer: ResponseWriter
): void {
  console.error('Proxy request error:', err.message)

  flow.response = {
    status: 502,
    statusText: 'Bad Gateway',
    headers: {},
    body: err.message
  }
  flow.duration = Date.now() - startTime
  store.saveFlow(flow)

  writer.writeHead(502, { 'content-length': err.message.length })
  writer.write(Buffer.from(err.message))
  writer.end()
}


// ============ Writer Factories ============

/**
 * Create a ResponseWriter for an Express response object
 */
export function createExpressWriter(res: http.ServerResponse): ResponseWriter {
  return {
    writeHead: (status, headers) => res.writeHead(status, headers),
    write: (chunk) => res.write(chunk),
    end: () => res.end()
  }
}

/**
 * Create a ResponseWriter for a TLS socket (raw HTTP output)
 * @param socket The TLS socket to write to
 * @param closeOnEnd Whether to close the socket when end() is called (for Connection: close)
 */
export function createTlsWriter(
  socket: { write: (data: string | Buffer) => void; end?: () => void },
  closeOnEnd: boolean = false
): ResponseWriter {
  let sentConnectionClose = false

  return {
    writeHead: (status, headers) => {
      // Check if we're sending Connection: close in the response
      const connectionHeader = headers['connection']
      if (connectionHeader && String(connectionHeader).toLowerCase() === 'close') {
        sentConnectionClose = true
      }
      const header = buildResponseHeader(status, http.STATUS_CODES[status] || '', headers)
      socket.write(header)
    },
    write: (chunk) => socket.write(chunk),
    end: () => {
      // Close socket if either:
      // 1. Request had Connection: close (closeOnEnd)
      // 2. Response had Connection: close (sentConnectionClose)
      if ((closeOnEnd || sentConnectionClose) && socket.end) {
        socket.end()
      }
    }
  }
}

