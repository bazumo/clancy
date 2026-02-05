import type { StreamSink } from '../types.js'

/**
 * Interface for writing response data back to the client
 * (same as ResponseWriter from proxy-handler for compatibility)
 */
export interface ResponseWriter {
  writeHead(status: number, headers: Record<string, string | string[] | number | undefined>): void
  write(chunk: Buffer): void
  end(): void
}

/**
 * Client sink that wraps a ResponseWriter interface.
 * This is the primary sink for sending data back to the client.
 */
export class ClientSink implements StreamSink {
  name = 'client'
  private writer: ResponseWriter
  private headersSent = false

  constructor(writer: ResponseWriter) {
    this.writer = writer
  }

  writeHead(statusCode: number, headers: Record<string, string | string[] | undefined>): void {
    if (this.headersSent) return
    this.headersSent = true
    this.writer.writeHead(statusCode, headers)
  }

  write(chunk: Buffer): void {
    this.writer.write(chunk)
  }

  end(): void {
    this.writer.end()
  }
}
