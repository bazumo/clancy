import { describe, it, expect } from 'vitest'
import { SSEStreamParser } from './sse-parser.js'

describe('SSEStreamParser', () => {
  describe('line ending handling', () => {
    it('should parse SSE with LF line endings', () => {
      const parser = new SSEStreamParser('test-flow')
      const chunk = 'event: message_start\ndata: {"type":"message_start"}\n\nevent: content_block_delta\ndata: {"type":"delta"}\n\n'

      const events = parser.processChunk(chunk)

      expect(events).toHaveLength(2)
      expect(events[0].event).toBe('message_start')
      expect(events[0].data).toBe('{"type":"message_start"}')
      expect(events[1].event).toBe('content_block_delta')
      expect(events[1].data).toBe('{"type":"delta"}')
    })

    it('should parse SSE with CRLF line endings', () => {
      const parser = new SSEStreamParser('test-flow')
      const chunk = 'event: message_start\r\ndata: {"type":"message_start"}\r\n\r\nevent: content_block_delta\r\ndata: {"type":"delta"}\r\n\r\n'

      const events = parser.processChunk(chunk)

      expect(events).toHaveLength(2)
      expect(events[0].event).toBe('message_start')
      expect(events[0].data).toBe('{"type":"message_start"}')
      expect(events[1].event).toBe('content_block_delta')
      expect(events[1].data).toBe('{"type":"delta"}')
    })

    it('should parse SSE with mixed line endings', () => {
      const parser = new SSEStreamParser('test-flow')
      // Mix of LF and CRLF
      const chunk = 'event: message_start\r\ndata: {"type":"message_start"}\n\nevent: content_block_delta\ndata: {"type":"delta"}\r\n\r\n'

      const events = parser.processChunk(chunk)

      expect(events).toHaveLength(2)
      expect(events[0].event).toBe('message_start')
      expect(events[1].event).toBe('content_block_delta')
    })

    it('should parse real claude.ai SSE format with CRLF', () => {
      const parser = new SSEStreamParser('test-flow')
      const chunk = [
        'event: message_start',
        'data: {"type":"message_start","message":{"id":"chatcompl_123"}}',
        '',
        'event: content_block_start',
        'data: {"type":"content_block_start","index":0}',
        '',
        'event: content_block_delta',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}',
        '',
        'event: content_block_delta',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}',
        '',
        'event: content_block_stop',
        'data: {"type":"content_block_stop","index":0}',
        '',
        'event: message_delta',
        'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}',
        '',
        'event: message_stop',
        'data: {"type":"message_stop"}',
        ''
      ].join('\r\n')

      const events = parser.processChunk(chunk)
      const flushed = parser.flush()

      const allEvents = [...events, ...flushed]

      expect(allEvents).toHaveLength(7)
      expect(allEvents[0].event).toBe('message_start')
      expect(allEvents[1].event).toBe('content_block_start')
      expect(allEvents[2].event).toBe('content_block_delta')
      expect(JSON.parse(allEvents[2].data!).delta.text).toBe('Hello')
      expect(allEvents[3].event).toBe('content_block_delta')
      expect(JSON.parse(allEvents[3].data!).delta.text).toBe(' world')
      expect(allEvents[4].event).toBe('content_block_stop')
      expect(allEvents[5].event).toBe('message_delta')
      expect(allEvents[6].event).toBe('message_stop')
    })
  })

  describe('buffering', () => {
    it('should buffer incomplete events across chunks', () => {
      const parser = new SSEStreamParser('test-flow')

      // First chunk - partial event
      const events1 = parser.processChunk('event: message_start\r\ndata: {"type":"mess')
      expect(events1).toHaveLength(0)

      // Second chunk - complete first event, start second
      const events2 = parser.processChunk('age_start"}\r\n\r\nevent: delta\r\n')
      expect(events2).toHaveLength(1)
      expect(events2[0].event).toBe('message_start')

      // Flush remaining
      const events3 = parser.flush()
      expect(events3).toHaveLength(0) // No data line yet
    })
  })
})
