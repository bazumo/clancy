import http from 'http'
import { buildResponseHeader } from './pipeline/taps/raw-http-storage.js'
import type { ResponseWriter } from './pipeline/sinks/client-sink.js'

// Re-export from pipeline for backward compatibility
export {
  handleProxyResponse,
  handleProxyError,
} from './pipeline/factory.js'

export type { ResponseWriter }

export { buildResponseHeader }

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
 * @param socket The TLS socket to write to
 * @param closeOnEnd Whether to close the socket when end() is called (for Connection: close)
 */
export function createTlsWriter(
  socket: { write: (data: string | Buffer) => void; end?: () => void },
  closeOnEnd: boolean = false
): ResponseWriter {
  let sentConnectionClose = false

  return {
    writeHead: (status, headers) => {
      const connectionHeader = headers['connection']
      if (connectionHeader && String(connectionHeader).toLowerCase() === 'close') {
        sentConnectionClose = true
      }
      const header = buildResponseHeader(status, http.STATUS_CODES[status] || '', headers)
      socket.write(header)
    },
    write: (chunk) => socket.write(chunk),
    end: () => {
      if ((closeOnEnd || sentConnectionClose) && socket.end) {
        socket.end()
      }
    }
  }
}
