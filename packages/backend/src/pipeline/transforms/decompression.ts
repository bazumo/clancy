import zlib from 'zlib'
import { decompress as zstdDecompress } from 'fzstd'
import type { TransformStage, ResponseMeta, TransformResult } from '../types.js'

/**
 * Decompress data based on content encoding
 */
function decompressData(data: Buffer, encoding: string): Buffer {
  try {
    if (encoding === 'gzip') {
      return zlib.gunzipSync(data)
    } else if (encoding === 'deflate') {
      return zlib.inflateSync(data)
    } else if (encoding === 'br') {
      return zlib.brotliDecompressSync(data)
    } else if (encoding === 'zstd') {
      // Node's HTTP parser handles chunked encoding automatically,
      // so we can decompress zstd data directly without workarounds
      return Buffer.from(zstdDecompress(new Uint8Array(data)))
    }
  } catch (err) {
    console.error(`[DecompressionStage] Decompression failed for encoding ${encoding}:`, err)
  }

  // Return original data if decompression fails or unknown encoding
  return data
}

/**
 * Decompression transform stage.
 * Buffers compressed data and decompresses it in flush().
 *
 * Supported encodings: gzip, deflate, br (brotli), zstd
 */
export class DecompressionStage implements TransformStage {
  name = 'decompression'
  private buffer: Buffer[] = []
  private encoding: string | undefined

  shouldActivate(meta: ResponseMeta): boolean {
    return !!meta.contentEncoding
  }

  process(chunk: Buffer, meta: ResponseMeta): TransformResult | null {
    // Store encoding for later use
    this.encoding = meta.contentEncoding

    // Buffer the chunk - we can't decompress incrementally
    this.buffer.push(chunk)

    // Return null to indicate we're buffering
    return null
  }

  flush(meta: ResponseMeta): TransformResult | null {
    if (this.buffer.length === 0) {
      return null
    }

    const rawData = Buffer.concat(this.buffer)
    const encoding = this.encoding || meta.contentEncoding

    if (!encoding) {
      // No encoding, return raw data
      return { data: rawData }
    }

    const decompressed = decompressData(rawData, encoding)
    this.buffer = [] // Clear buffer

    return {
      data: decompressed,
      headerMods: {
        remove: ['content-encoding'],
        set: { 'content-length': String(decompressed.length) }
      }
    }
  }

  getHeaderModifications(meta: ResponseMeta): { set?: Record<string, string>, remove?: string[] } {
    if (!meta.contentEncoding) {
      return {}
    }

    return {
      remove: ['content-encoding', 'transfer-encoding']
    }
  }
}
