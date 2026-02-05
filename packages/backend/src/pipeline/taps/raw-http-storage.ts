import type { TapStage, ResponseMeta } from '../types.js'
import * as store from '../../flow-store.js'

// 20MB limit for raw HTTP storage
const MAX_FLOW_SIZE_BYTES = 20 * 1024 * 1024

/**
 * Build raw HTTP response header string
 */
function buildResponseHeader(
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
 * Raw HTTP storage tap.
 * Stores the raw HTTP response when enabled, up to 20MB.
 */
export class RawHttpStorageTap implements TapStage {
  name = 'raw-http-storage'
  private bodyChunks: Buffer[] = []
  private totalSize = 0

  shouldActivate(meta: ResponseMeta): boolean {
    // Only activate if raw HTTP storage is requested
    return meta.storeRawHttp
  }

  onChunk(chunk: Buffer, _meta: ResponseMeta): void { // eslint-disable-line @typescript-eslint/no-unused-vars
    this.totalSize += chunk.length

    // Only accumulate chunks if we haven't exceeded the limit
    if (this.totalSize <= MAX_FLOW_SIZE_BYTES) {
      this.bodyChunks.push(chunk)
    }
  }

  onEnd(meta: ResponseMeta): void {
    if (this.totalSize > MAX_FLOW_SIZE_BYTES) {
      // Body too large, don't save it
      const header = buildResponseHeader(meta.statusCode, meta.statusMessage, meta.headers)
      store.setRawHttpResponse(
        meta.flow.id,
        header + `[Body too large: ${(this.totalSize / 1024 / 1024).toFixed(2)}MB - not saved]`
      )
    } else {
      const body = Buffer.concat(this.bodyChunks)

      // Build the raw HTTP response
      const header = buildResponseHeader(
        meta.statusCode,
        meta.statusMessage,
        meta.headers,
        body.length
      )

      store.setRawHttpResponse(meta.flow.id, header + body.toString('utf-8'))
    }

    // Clear buffer
    this.bodyChunks = []
    this.totalSize = 0
  }

  onError(_error: Error, meta: ResponseMeta): void {
    // On error, store what we have
    if (this.totalSize > MAX_FLOW_SIZE_BYTES) {
      const header = buildResponseHeader(meta.statusCode, meta.statusMessage, meta.headers)
      store.setRawHttpResponse(
        meta.flow.id,
        header + `[Body too large: ${(this.totalSize / 1024 / 1024).toFixed(2)}MB - not saved]`
      )
    } else {
      const body = Buffer.concat(this.bodyChunks)
      if (body.length > 0) {
        const header = buildResponseHeader(
          meta.statusCode,
          meta.statusMessage,
          meta.headers,
          body.length
        )
        store.setRawHttpResponse(meta.flow.id, header + body.toString('utf-8'))
      }
    }
    this.bodyChunks = []
    this.totalSize = 0
  }
}

export { buildResponseHeader }
