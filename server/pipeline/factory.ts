import http from 'http'
import type { Flow } from '../../shared/types.js'
import type { ResponseMeta, TransformStage, TapStage, StreamSink } from './types.js'
import { Pipeline } from './pipeline.js'
import { DecompressionStage } from './transforms/index.js'
import { EventParserTap, FlowStorageTap, RawHttpStorageTap } from './taps/index.js'
import { ClientSink, type ResponseWriter } from './sinks/index.js'
import { isStreamingContentType } from '../parsers/index.js'
import * as store from '../flow-store.js'

/**
 * Options for handling a proxy response (same interface as before)
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
 * Create response metadata from an HTTP response
 */
export function createResponseMeta(
  proxyRes: http.IncomingMessage,
  options: ProxyResponseOptions
): ResponseMeta {
  const { flow, startTime, storeRawHttp, verbose } = options
  const contentType = proxyRes.headers['content-type'] as string | undefined
  const contentEncoding = proxyRes.headers['content-encoding'] as string | undefined

  return {
    flow,
    startTime,
    statusCode: proxyRes.statusCode || 500,
    statusMessage: proxyRes.statusMessage || '',
    headers: proxyRes.headers,
    contentType,
    contentEncoding,
    isStreaming: isStreamingContentType(contentType),
    storeRawHttp: storeRawHttp ?? false,
    verbose: verbose ?? false
  }
}

/**
 * Create the standard pipeline for proxy responses
 */
export function createProxyPipeline(
  writer: ResponseWriter,
  additionalSinks?: StreamSink[]
): {
  transforms: TransformStage[]
  taps: TapStage[]
  sink: StreamSink
  additionalSinks?: StreamSink[]
} {
  return {
    transforms: [new DecompressionStage()],
    taps: [
      new EventParserTap(),
      new FlowStorageTap(),
      new RawHttpStorageTap()
    ],
    sink: new ClientSink(writer),
    additionalSinks
  }
}

/**
 * Handle a proxy response (drop-in replacement for the original function)
 * Uses the new pipeline architecture internally.
 */
export function handleProxyResponse(
  proxyRes: http.IncomingMessage,
  options: ProxyResponseOptions
): void {
  const { flow, writer, verbose } = options

  console.log(`[RESPONSE] Started receiving response for ${flow.request.method} ${flow.request.path} (flow: ${flow.id}, status: ${proxyRes.statusCode})`)

  // Create response metadata
  const meta = createResponseMeta(proxyRes, options)

  // Initialize response on flow
  flow.response = {
    status: meta.statusCode,
    statusText: meta.statusMessage,
    headers: meta.headers as Record<string, string | string[] | undefined>,
    body: undefined
  }

  store.saveFlow(flow)

  // Create and run pipeline
  const pipelineConfig = createProxyPipeline(writer)
  const pipeline = new Pipeline(pipelineConfig)

  if (verbose) {
    console.log(`[RESPONSE] Using pipeline for ${flow.request.method} ${flow.request.path}`)
    console.log(`[RESPONSE] Content-Type: ${meta.contentType}`)
    console.log(`[RESPONSE] Content-Encoding: ${meta.contentEncoding || 'none'}`)
    console.log(`[RESPONSE] Is streaming: ${meta.isStreaming}`)
  }

  pipeline.process(proxyRes, meta)
}

/**
 * Handle a proxy error (unchanged from original)
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

// Re-export types and classes for direct pipeline usage
export { Pipeline } from './pipeline.js'
export type { ResponseMeta, TransformStage, TapStage, StreamSink, PipelineOptions } from './types.js'
export { DecompressionStage } from './transforms/index.js'
export { EventParserTap, FlowStorageTap, RawHttpStorageTap } from './taps/index.js'
export { ClientSink, BufferSink, type ResponseWriter } from './sinks/index.js'
