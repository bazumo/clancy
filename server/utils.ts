import zlib from 'zlib'
import { decompress as zstdDecompress } from 'fzstd'

export function generateId(): string {
  return Math.random().toString(36).substring(2, 9)
}

export function decompressBody(body: Buffer, encoding: string | undefined): string {
  if (!encoding) {
    return body.toString('utf-8')
  }
  
  try {
    if (encoding === 'gzip') {
      return zlib.gunzipSync(body).toString('utf-8')
    } else if (encoding === 'deflate') {
      return zlib.inflateSync(body).toString('utf-8')
    } else if (encoding === 'br') {
      return zlib.brotliDecompressSync(body).toString('utf-8')
    } else if (encoding === 'zstd') {
      return Buffer.from(zstdDecompress(new Uint8Array(body))).toString('utf-8')
    }
  } catch (err) {
    // If decompression fails, return raw string
    console.error('Decompression error:', err)
  }
  
  return body.toString('utf-8')
}

