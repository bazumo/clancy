import type { StreamSink } from './types.js'

/**
 * Utility for cloning buffer data to multiple sinks.
 * This is used internally by the Pipeline when additionalSinks are provided.
 */

/**
 * Clone a buffer to avoid shared memory issues
 */
export function cloneBuffer(buffer: Buffer): Buffer {
  return Buffer.from(buffer)
}

/**
 * Write data to multiple sinks
 * @param data The data to write
 * @param sinks The sinks to write to
 * @param clone Whether to clone the data for each sink (default: true for additional sinks)
 */
export function teeWrite(data: Buffer, sinks: StreamSink[], clone = true): void {
  for (const sink of sinks) {
    sink.write(clone ? cloneBuffer(data) : data)
  }
}

/**
 * Send headers to multiple sinks
 */
export function teeWriteHead(
  statusCode: number,
  headers: Record<string, string | string[] | undefined>,
  sinks: StreamSink[]
): void {
  for (const sink of sinks) {
    sink.writeHead(statusCode, headers)
  }
}

/**
 * End multiple sinks
 */
export function teeEnd(sinks: StreamSink[]): void {
  for (const sink of sinks) {
    sink.end()
  }
}

/**
 * A sink wrapper that clones data to multiple destinations
 */
export class TeeSink implements StreamSink {
  name = 'tee'
  private sinks: StreamSink[]

  constructor(sinks: StreamSink[]) {
    this.sinks = sinks
  }

  writeHead(statusCode: number, headers: Record<string, string | string[] | undefined>): void {
    teeWriteHead(statusCode, headers, this.sinks)
  }

  write(chunk: Buffer): void {
    // First sink gets original, rest get clones
    for (let i = 0; i < this.sinks.length; i++) {
      this.sinks[i].write(i === 0 ? chunk : cloneBuffer(chunk))
    }
  }

  end(): void {
    teeEnd(this.sinks)
  }
}
