import type { TapStage, ResponseMeta } from '../types.js'
import { createStreamParser, type StreamParser } from '../../parsers/index.js'
import * as store from '../../flow-store.js'

/**
 * Event parser tap for SSE and Bedrock streams.
 * Parses events from the response stream and stores them.
 */
export class EventParserTap implements TapStage {
  name = 'event-parser'
  private parser: StreamParser | null = null
  private verbose = false

  shouldActivate(meta: ResponseMeta): boolean {
    // Only activate for streaming content types
    return meta.isStreaming
  }

  onChunk(chunk: Buffer, meta: ResponseMeta): void {
    // Create parser lazily on first chunk
    if (!this.parser) {
      this.parser = createStreamParser(meta.contentType, meta.flow.id, meta.contentEncoding)
      this.verbose = meta.verbose

      if (this.parser) {
        // Initialize event storage
        store.initFlowEvents(meta.flow.id)
        meta.flow.isSSE = true

        if (this.verbose) {
          console.log(`[EventParserTap] Detected stream for ${meta.flow.host}${meta.flow.request.path}`)
        }
      }
    }

    if (!this.parser) return

    // Parse events from chunk
    for (const event of this.parser.processChunk(chunk)) {
      if (this.verbose) {
        console.log(`[EventParserTap] Parsed event: ${event.eventId}`)
      }
      store.addEvent(meta.flow.id, event)
    }
  }

  onEnd(meta: ResponseMeta): void {
    if (!this.parser) return

    // Flush any remaining events
    for (const event of this.parser.flush()) {
      if (this.verbose) {
        console.log(`[EventParserTap] Flushing event: ${event.eventId}`)
      }
      store.addEvent(meta.flow.id, event)
    }

    if (this.verbose) {
      const totalEvents = store.getEvents(meta.flow.id).length
      console.log(`[EventParserTap] Stream ended with ${totalEvents} total events`)
    }

    // Reset parser for potential reuse
    this.parser = null
  }

  onError(_error: Error, _meta: ResponseMeta): void {
    // Flush any partial events on error
    if (this.parser) {
      try {
        for (const event of this.parser.flush()) {
          store.addEvent(_meta.flow.id, event)
        }
      } catch {
        // Ignore flush errors on error path
      }
      this.parser = null
    }
  }
}
