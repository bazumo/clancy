import type { StreamSink } from '../types.js'

/**
 * Buffer sink that captures response data for cloning purposes.
 * Useful when you need to capture the response data while also
 * sending it to the client.
 */
export class BufferSink implements StreamSink {
  name = 'buffer'
  private chunks: Buffer[] = []
  private _statusCode = 0
  private _headers: Record<string, string | string[] | undefined> = {}

  writeHead(statusCode: number, headers: Record<string, string | string[] | undefined>): void {
    this._statusCode = statusCode
    this._headers = { ...headers }
  }

  write(chunk: Buffer): void {
    this.chunks.push(chunk)
  }

  end(): void {
    // Nothing to do on end for buffer sink
  }

  /**
   * Get the captured response body
   */
  get body(): Buffer {
    return Buffer.concat(this.chunks)
  }

  /**
   * Get the captured response body as a string
   */
  get bodyString(): string {
    return this.body.toString('utf-8')
  }

  /**
   * Get the captured status code
   */
  get statusCode(): number {
    return this._statusCode
  }

  /**
   * Get the captured headers
   */
  get headers(): Record<string, string | string[] | undefined> {
    return this._headers
  }

  /**
   * Reset the buffer for reuse
   */
  reset(): void {
    this.chunks = []
    this._statusCode = 0
    this._headers = {}
  }
}
