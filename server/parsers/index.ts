import type { SSEEvent } from '../../shared/types.js'
import { SSEStreamParser } from './sse-parser.js'
import { BedrockEventStreamParser } from './bedrock-parser.js'

/**
 * Common interface for all stream parsers
 */
export interface StreamParser {
  processChunk(chunk: Buffer): SSEEvent[]
  flush(): SSEEvent[]
}

/**
 * Wraps SSEStreamParser to accept Buffer
 * Note: Decompression is handled by the caller (proxy-handler.ts) before passing to this adapter
 */
class SSEParserAdapter implements StreamParser {
  private parser: SSEStreamParser

  constructor(flowId: string, _contentEncoding: string | undefined) { // eslint-disable-line @typescript-eslint/no-unused-vars
    this.parser = new SSEStreamParser(flowId)
    // Note: contentEncoding is ignored here - decompression happens in proxy-handler
  }

  processChunk(chunk: Buffer): SSEEvent[] {
    // Chunk should already be decompressed by the caller
    const chunkStr = chunk.toString('utf-8')
    return this.parser.processChunk(chunkStr)
  }

  flush(): SSEEvent[] {
    return this.parser.flush()
  }
}

/**
 * Create a stream parser based on content type
 * Returns null if the content type is not a streaming type
 */
export function createStreamParser(
  contentType: string | undefined,
  flowId: string,
  contentEncoding?: string
): StreamParser | null {
  if (contentType?.includes('text/event-stream')) {
    return new SSEParserAdapter(flowId, contentEncoding)
  }
  if (contentType?.includes('application/vnd.amazon.eventstream')) {
    return new BedrockEventStreamParser(flowId)
  }
  return null
}

/**
 * Check if content type indicates a streaming response
 */
export function isStreamingContentType(contentType: string | undefined): boolean {
  if (!contentType) return false
  return contentType.includes('text/event-stream') || 
         contentType.includes('application/vnd.amazon.eventstream')
}

/**
 * Check if content type is Bedrock event stream (for special body handling)
 */
export function isBedrockStream(contentType: string | undefined): boolean {
  return contentType?.includes('application/vnd.amazon.eventstream') ?? false
}

