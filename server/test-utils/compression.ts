/**
 * Compression utilities for test responses
 * Supports gzip, deflate, brotli, and zstd compression
 */
import { gzipSync, deflateSync, brotliCompressSync } from 'zlib'
import { ZstdCodec } from 'zstd-codec'
import type { Compression } from './types.js'

// Zstd compressor - lazily initialized
let zstdSimple: { compress: (data: Uint8Array) => Uint8Array } | null = null
let zstdReadyPromise: Promise<void> | null = null

/**
 * Initialize the zstd codec
 * Returns a promise that resolves when zstd is ready
 */
export function initZstd(): Promise<void> {
  if (zstdReadyPromise) {
    return zstdReadyPromise
  }

  zstdReadyPromise = new Promise<void>((resolve) => {
    ZstdCodec.run((zstd: { Simple: new () => { compress: (data: Uint8Array) => Uint8Array } }) => {
      zstdSimple = new zstd.Simple()
      resolve()
    })
  })

  return zstdReadyPromise
}

/**
 * Check if zstd is initialized
 */
export function isZstdReady(): boolean {
  return zstdSimple !== null
}

/**
 * Wait for zstd to be ready
 */
export async function ensureZstdReady(): Promise<void> {
  if (zstdSimple) return
  await initZstd()
}

/**
 * Compress data with the specified encoding
 *
 * @param data - String or Buffer to compress
 * @param encoding - Compression type ('none', 'gzip', 'deflate', 'br', 'zstd')
 * @returns Compressed buffer (or original if encoding is 'none')
 * @throws Error if zstd is not initialized and zstd encoding is requested
 */
export function compress(data: string | Buffer, encoding: Compression): Buffer {
  const buf = typeof data === 'string' ? Buffer.from(data) : data

  switch (encoding) {
    case 'gzip':
      return gzipSync(buf)

    case 'deflate':
      return deflateSync(buf)

    case 'br':
      return brotliCompressSync(buf)

    case 'zstd':
      if (!zstdSimple) {
        throw new Error('zstd codec not initialized. Call initZstd() first.')
      }
      return Buffer.from(zstdSimple.compress(new Uint8Array(buf)))

    case 'none':
    default:
      return buf
  }
}

/**
 * Get the Content-Encoding header value for a compression type
 * Returns undefined for 'none'
 */
export function getContentEncodingHeader(encoding: Compression): string | undefined {
  if (encoding === 'none') {
    return undefined
  }
  return encoding
}

/**
 * List of all supported compression types
 */
export const COMPRESSIONS: Compression[] = ['none', 'gzip', 'deflate', 'br', 'zstd']

/**
 * List of compression types that require no initialization
 */
export const SYNC_COMPRESSIONS: Compression[] = ['none', 'gzip', 'deflate', 'br']
