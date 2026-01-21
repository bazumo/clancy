import http from 'http'
import type {
  ResponseMeta,
  TransformStage,
  TapStage,
  StreamSink,
  PipelineOptions
} from './types.js'

/**
 * Pipeline orchestrates the flow of response data through transforms, taps, and sinks.
 *
 * Data flow:
 * 1. Raw chunks from response
 * 2. Active transforms (sequential, may buffer)
 * 3. Active taps (parallel observers)
 * 4. Primary sink + additional sinks (with cloning)
 */
export class Pipeline {
  private transforms: TransformStage[]
  private taps: TapStage[]
  private sink: StreamSink
  private additionalSinks: StreamSink[]

  private activeTransforms: TransformStage[] = []
  private activeTaps: TapStage[] = []
  private needsBuffering = false
  private headersSent = false
  private bufferedChunks: Buffer[] = []
  private finalized = false

  constructor(options: PipelineOptions) {
    this.transforms = options.transforms
    this.taps = options.taps
    this.sink = options.sink
    this.additionalSinks = options.additionalSinks || []
  }

  /**
   * Process an HTTP response through the pipeline
   */
  process(proxyRes: http.IncomingMessage, meta: ResponseMeta): void {
    // Activate relevant transforms and taps
    this.activeTransforms = this.transforms.filter(t => t.shouldActivate(meta))
    this.activeTaps = this.taps.filter(t => t.shouldActivate(meta))

    // Determine if we need to buffer
    // 1. Decompression transforms need full buffering because brotli/gzip can't be decompressed chunk-by-chunk
    // 2. Chunked responses through HTTPS tunnels (storeRawHttp=true) need buffering to re-frame as Content-Length
    //    because we can't re-encode in chunked format when writing raw HTTP to TLS sockets
    this.needsBuffering = this.activeTransforms.some(t =>
      t.name === 'decompression' && meta.contentEncoding
    ) || (meta.storeRawHttp && meta.headers['transfer-encoding'] === 'chunked')

    if (meta.verbose) {
      console.log(`[Pipeline] Active transforms: ${this.activeTransforms.map(t => t.name).join(', ') || 'none'}`)
      console.log(`[Pipeline] Active taps: ${this.activeTaps.map(t => t.name).join(', ') || 'none'}`)
      console.log(`[Pipeline] Buffering: ${this.needsBuffering}`)
    }

    // If not buffering, send headers immediately
    if (!this.needsBuffering) {
      this.sendHeaders(meta)
    }

    // Handle data chunks
    proxyRes.on('data', (chunk: Buffer) => {
      if (this.finalized) return
      this.handleChunk(chunk, meta)
    })

    // Handle stream end
    proxyRes.on('end', () => {
      this.finalize('end', meta)
    })

    // Handle errors
    proxyRes.on('error', (err: Error) => {
      this.finalize('error', meta, err)
    })

    // Handle premature close
    proxyRes.on('close', () => {
      this.finalize('close', meta)
    })
  }

  /**
   * Send headers to all sinks
   */
  private sendHeaders(meta: ResponseMeta): void {
    if (this.headersSent) return
    this.headersSent = true

    // Start with original headers
    const headers = { ...meta.headers } as Record<string, string | string[] | undefined>

    // Apply header modifications from transforms
    for (const transform of this.activeTransforms) {
      const mods = transform.getHeaderModifications(meta)
      if (mods.remove) {
        for (const key of mods.remove) {
          delete headers[key.toLowerCase()]
        }
      }
      if (mods.set) {
        for (const [key, value] of Object.entries(mods.set)) {
          headers[key.toLowerCase()] = value
        }
      }
    }

    // For streaming responses without content-length or transfer-encoding,
    // add Connection: close so the client knows the response ends when connection closes
    if (meta.isStreaming && !headers['content-length'] && !headers['transfer-encoding']) {
      headers['connection'] = 'close'
    }

    // Send to all sinks
    this.sink.writeHead(meta.statusCode, headers)
    for (const sink of this.additionalSinks) {
      sink.writeHead(meta.statusCode, headers)
    }
  }

  /**
   * Handle an incoming data chunk
   */
  private handleChunk(chunk: Buffer, meta: ResponseMeta): void {
    if (this.needsBuffering) {
      // Buffer the chunk for later processing
      this.bufferedChunks.push(chunk)
      return
    }

    // Process through transforms (non-buffering mode)
    const transformed = this.runTransforms(chunk, meta)
    if (transformed) {
      this.deliverChunk(transformed, meta)
    }
  }

  /**
   * Run a chunk through all active transforms
   */
  private runTransforms(chunk: Buffer, meta: ResponseMeta): Buffer | null {
    let data: Buffer | null = chunk

    for (const transform of this.activeTransforms) {
      if (!data) break
      const result = transform.process(data, meta)
      data = result?.data || null
    }

    return data
  }

  /**
   * Deliver a chunk to taps and sinks
   */
  private deliverChunk(chunk: Buffer, meta: ResponseMeta): void {
    // Notify taps
    for (const tap of this.activeTaps) {
      try {
        tap.onChunk(chunk, meta)
      } catch (err) {
        console.error(`[Pipeline] Tap ${tap.name} error on chunk:`, err)
      }
    }

    // Write to all sinks
    this.sink.write(chunk)
    for (const sink of this.additionalSinks) {
      sink.write(Buffer.from(chunk)) // Clone for additional sinks
    }
  }

  /**
   * Finalize the pipeline (on end, error, or close)
   */
  private finalize(reason: 'end' | 'error' | 'close', meta: ResponseMeta, error?: Error): void {
    if (this.finalized) return
    this.finalized = true

    const duration = Date.now() - meta.startTime
    const rawBody = Buffer.concat(this.bufferedChunks)

    if (meta.verbose) {
      console.log(`[Pipeline] Finalizing: reason=${reason}, buffered=${rawBody.length} bytes, duration=${duration}ms`)
    }

    if (reason === 'error') {
      console.error(`[Pipeline] Error for ${meta.flow.request.method} ${meta.flow.request.path}: ${error?.message}`)
      // Notify taps of error
      for (const tap of this.activeTaps) {
        try {
          tap.onError(error!, meta)
        } catch (err) {
          console.error(`[Pipeline] Tap ${tap.name} error on onError:`, err)
        }
      }
    }

    // If we were buffering, process all buffered data now
    if (this.needsBuffering && rawBody.length > 0) {
      // Flush transforms to get decompressed data
      let finalData = rawBody

      for (const transform of this.activeTransforms) {
        // First process the raw data
        const processResult = transform.process(finalData, meta)
        // Then flush any buffered data
        const flushResult = transform.flush(meta)

        if (flushResult?.data) {
          finalData = flushResult.data
        } else if (processResult?.data) {
          finalData = processResult.data
        }
      }

      // Now send headers with correct content-length
      const headers = { ...meta.headers } as Record<string, string | string[] | undefined>

      for (const transform of this.activeTransforms) {
        const mods = transform.getHeaderModifications(meta)
        if (mods.remove) {
          for (const key of mods.remove) {
            delete headers[key.toLowerCase()]
          }
        }
        if (mods.set) {
          for (const [key, value] of Object.entries(mods.set)) {
            headers[key.toLowerCase()] = value
          }
        }
      }

      // Set correct content-length for decompressed data
      headers['content-length'] = String(finalData.length)
      delete headers['transfer-encoding']

      // Send headers to all sinks
      this.sink.writeHead(meta.statusCode, headers)
      for (const sink of this.additionalSinks) {
        sink.writeHead(meta.statusCode, headers)
      }
      this.headersSent = true

      // Deliver the final data
      this.deliverChunk(finalData, meta)
    } else if (!this.needsBuffering) {
      // For non-buffered streams, flush any remaining transform data
      for (const transform of this.activeTransforms) {
        const flushResult = transform.flush(meta)
        if (flushResult?.data && flushResult.data.length > 0) {
          this.deliverChunk(flushResult.data, meta)
        }
      }
    }

    // Update meta with duration
    meta.flow.duration = duration

    // Notify taps of end
    if (reason !== 'error') {
      for (const tap of this.activeTaps) {
        try {
          tap.onEnd(meta)
        } catch (err) {
          console.error(`[Pipeline] Tap ${tap.name} error on onEnd:`, err)
        }
      }
    }

    // End all sinks
    this.sink.end()
    for (const sink of this.additionalSinks) {
      sink.end()
    }
  }

  /**
   * Get the buffered raw body (for external access)
   */
  getRawBody(): Buffer {
    return Buffer.concat(this.bufferedChunks)
  }
}
