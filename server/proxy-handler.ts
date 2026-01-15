import http from 'http'
import type { Flow } from '../shared/types.js'
import { decompressBody } from './utils.js'
import { createStreamParser, isBedrockStream, StreamParser } from './parsers/index.js'
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

  // Handle streaming setup
  if (parser) {
    flow.isSSE = true
    if (storeRawHttp) {
      flow.hasRawHttp = false
      store.deleteRawHttp(id)
    }
    store.initFlowEvents(id)

    // For streaming, send headers immediately
    writer.writeHead(proxyRes.statusCode || 500, proxyRes.headers)
    store.saveFlow(flow)
  }

  const responseChunks: Buffer[] = []

  proxyRes.on('data', (chunk: Buffer) => {
    responseChunks.push(chunk)

    if (parser) {
      writer.write(chunk)
      for (const event of parser.processChunk(chunk)) {
        if (verbose) {
          console.log(`[Stream] Broadcasting event: ${event.eventId}`)
        }
        store.addEvent(id, event)
      }
    }
  })

  proxyRes.on('end', () => {
    const rawBody = Buffer.concat(responseChunks)
    const duration = Date.now() - startTime

    if (parser) {
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
      flow.duration = duration
      store.saveFlow(flow)
      writer.end()
    } else {
      // Non-streaming response
      const responseBody = decompressBody(rawBody, contentEncoding)

      flow.response = {
        status: proxyRes.statusCode || 500,
        statusText: proxyRes.statusMessage || '',
        headers: proxyRes.headers as Record<string, string | string[] | undefined>,
        body: responseBody || undefined
      }
      flow.duration = duration
      store.saveFlow(flow)

      // Store raw HTTP if requested
      if (storeRawHttp) {
        const header = buildResponseHeader(
          proxyRes.statusCode || 500,
          proxyRes.statusMessage || '',
          proxyRes.headers,
          rawBody.length
        )
        store.setRawHttpResponse(id, header + rawBody.toString('utf-8'))
      }

      writer.writeHead(proxyRes.statusCode || 500, proxyRes.headers)
      writer.write(rawBody)
      writer.end()
    }
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
 */
export function createTlsWriter(socket: { write: (data: string | Buffer) => void }): ResponseWriter {
  return {
    writeHead: (status, headers) => {
      const header = buildResponseHeader(status, http.STATUS_CODES[status] || '', headers)
      socket.write(header)
    },
    write: (chunk) => socket.write(chunk),
    end: () => { /* TLS socket stays open for more requests */ }
  }
}

