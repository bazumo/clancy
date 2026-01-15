import zlib from 'zlib'
import { decompress as zstdDecompress } from 'fzstd'

export function generateId(): string {
  return Math.random().toString(36).substring(2, 9)
}

/**
 * Decode HTTP chunked transfer encoding
 * Handles the hex chunk size prefixes that appear when transfer-encoding: chunked is used
 */
function decodeChunkedEncoding(body: Buffer): Buffer {
  const chunks: Buffer[] = []
  let offset = 0

  while (offset < body.length) {
    // Find the end of the chunk size line (CRLF)
    const crlfIndex = body.indexOf('\r\n', offset)
    if (crlfIndex === -1) {
      break
    }

    // Parse chunk size in hex
    const chunkSizeStr = body.toString('utf-8', offset, crlfIndex).trim()
    const chunkSize = parseInt(chunkSizeStr, 16)

    if (isNaN(chunkSize)) {
      // Invalid chunk size, stop processing
      break
    }

    if (chunkSize === 0) {
      // Last chunk, we're done
      break
    }

    // Extract chunk data (skip the CRLF after size)
    const chunkStart = crlfIndex + 2
    const chunkEnd = chunkStart + chunkSize
    if (chunkEnd > body.length) {
      break
    }

    chunks.push(body.slice(chunkStart, chunkEnd))

    // Move offset past the chunk data and its trailing CRLF
    offset = chunkEnd + 2
  }

  return Buffer.concat(chunks)
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
      // Check if body contains chunked encoding (look for hex chunk size pattern)
      // Chunked encoding starts with hex digits followed by CRLF
      const isChunked = /^[0-9a-fA-F]+\r\n/.test(body.toString('utf-8', 0, Math.min(100, body.length)))

      let decompressData = body
      if (isChunked) {
        decompressData = decodeChunkedEncoding(body)
      }

      return Buffer.from(zstdDecompress(new Uint8Array(decompressData))).toString('utf-8')
    }
  } catch (err) {
    // If decompression fails, return raw string
    console.error('Decompression error:', err)
  }

  return body.toString('utf-8')
}

