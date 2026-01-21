import http from 'http'
import type { ResponseWriter } from './pipeline/sinks/client-sink.js'

// Re-export from pipeline for backward compatibility
export {
  handleProxyResponse,
  handleProxyError,
} from './pipeline/factory.js'

export type { ResponseWriter }

// ============ Writer Factories ============

/**
 * Create a ResponseWriter from Node.js's http.ServerResponse
 *
 * Works with any http.ServerResponse, whether from:
 * - Express app (res parameter in route handlers)
 * - http.createServer() callback
 * - https.createServer() callback
 *
 * Node.js's ServerResponse handles all HTTP protocol details automatically:
 * - Chunked encoding
 * - Content-Length calculation
 * - Header formatting
 * - Connection management
 * - HTTP/1.1 compliance
 */
export function createResponseWriter(res: http.ServerResponse): ResponseWriter {
  return {
    writeHead: (status, headers) => res.writeHead(status, headers),
    write: (chunk) => res.write(chunk),
    end: () => res.end()
  }
}
