import type { TapStage, ResponseMeta } from '../types.js'
import * as store from '../../flow-store.js'

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
 * Stores the raw HTTP response when enabled.
 */
export class RawHttpStorageTap implements TapStage {
  name = 'raw-http-storage'
  private bodyChunks: Buffer[] = []

  shouldActivate(meta: ResponseMeta): boolean {
    // Only activate if raw HTTP storage is requested
    return meta.storeRawHttp
  }

  onChunk(chunk: Buffer, _meta: ResponseMeta): void { // eslint-disable-line @typescript-eslint/no-unused-vars
    this.bodyChunks.push(chunk)
  }

  onEnd(meta: ResponseMeta): void {
    const body = Buffer.concat(this.bodyChunks)

    // Build the raw HTTP response
    const header = buildResponseHeader(
      meta.statusCode,
      meta.statusMessage,
      meta.headers,
      body.length
    )

    store.setRawHttpResponse(meta.flow.id, header + body.toString('utf-8'))

    // Clear buffer
    this.bodyChunks = []
  }

  onError(_error: Error, meta: ResponseMeta): void {
    // On error, store what we have
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
    this.bodyChunks = []
  }
}

export { buildResponseHeader }
