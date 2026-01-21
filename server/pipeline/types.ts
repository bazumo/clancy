import http from 'http'
import type { Flow } from '../../shared/types.js'

/**
 * Metadata about a response being processed by the pipeline
 */
export interface ResponseMeta {
  flow: Flow
  startTime: number
  statusCode: number
  statusMessage: string
  headers: http.IncomingHttpHeaders
  contentType: string | undefined
  contentEncoding: string | undefined
  isStreaming: boolean
  storeRawHttp: boolean
  verbose: boolean
}

/**
 * Result from a transform stage's process/flush methods
 */
export interface TransformResult {
  data: Buffer
  /** Header modifications to apply when sending response */
  headerMods?: {
    set?: Record<string, string>
    remove?: string[]
  }
}

/**
 * Transform: modifies data sequentially
 * Transforms can buffer data and emit modified output.
 * They process chunks one at a time in order.
 */
export interface TransformStage {
  name: string

  /**
   * Determine if this transform should be active for the given response
   */
  shouldActivate(meta: ResponseMeta): boolean

  /**
   * Process a chunk of data. May return null to indicate data is being buffered.
   * @param chunk The raw chunk received from upstream
   * @param meta Response metadata
   * @returns Transformed data or null if buffering
   */
  process(chunk: Buffer, meta: ResponseMeta): TransformResult | null

  /**
   * Flush any buffered data at stream end.
   * @param meta Response metadata
   * @returns Final transformed data or null if nothing buffered
   */
  flush(meta: ResponseMeta): TransformResult | null

  /**
   * Get header modifications that should be applied to the response.
   * Called once before any data is sent.
   * @param meta Response metadata
   */
  getHeaderModifications(meta: ResponseMeta): { set?: Record<string, string>, remove?: string[] }
}

/**
 * Tap: observes data without modifying (can run in parallel)
 * Taps receive post-transform data and can perform side effects
 * like parsing, logging, or storing data.
 */
export interface TapStage {
  name: string

  /**
   * Determine if this tap should be active for the given response
   */
  shouldActivate(meta: ResponseMeta): boolean

  /**
   * Called for each chunk of (transformed) data
   * @param chunk The data chunk (already transformed)
   * @param meta Response metadata
   */
  onChunk(chunk: Buffer, meta: ResponseMeta): void

  /**
   * Called when the stream ends successfully
   * @param meta Response metadata
   */
  onEnd(meta: ResponseMeta): void

  /**
   * Called when an error occurs
   * @param error The error that occurred
   * @param meta Response metadata
   */
  onError(error: Error, meta: ResponseMeta): void
}

/**
 * Sink: terminal consumer of data
 * Sinks are the final destination for response data.
 */
export interface StreamSink {
  name: string

  /**
   * Write response headers
   * @param statusCode HTTP status code
   * @param headers Response headers
   */
  writeHead(statusCode: number, headers: Record<string, string | string[] | undefined>): void

  /**
   * Write a chunk of data
   * @param chunk Data to write
   */
  write(chunk: Buffer): void

  /**
   * Signal end of response
   */
  end(): void
}

/**
 * Options for creating a response pipeline
 */
export interface PipelineOptions {
  transforms: TransformStage[]
  taps: TapStage[]
  sink: StreamSink
  additionalSinks?: StreamSink[]
}
