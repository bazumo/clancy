import { describe, it, expect } from 'vitest'
import { BedrockEventStreamParser } from './bedrock-parser.js'

/**
 * Helper to create an AWS event stream message
 */
function createEventStreamMessage(
  headers: Record<string, { type: number; value: string | number | Buffer }>,
  payload: Buffer | string
): Buffer {
  const payloadBuf = typeof payload === 'string' ? Buffer.from(payload, 'utf-8') : payload
  
  // Build headers buffer
  const headerBuffers: Buffer[] = []
  for (const [name, { type, value }] of Object.entries(headers)) {
    const nameBuf = Buffer.from(name, 'utf-8')
    const nameLen = Buffer.alloc(1)
    nameLen.writeUInt8(nameBuf.length)
    
    const typeBuf = Buffer.alloc(1)
    typeBuf.writeUInt8(type)
    
    let valueBuf: Buffer
    if (type === 7 || type === 6) {
      // String or bytes - 2-byte length prefix
      const strBuf = typeof value === 'string' ? Buffer.from(value, 'utf-8') : value as Buffer
      const lenBuf = Buffer.alloc(2)
      lenBuf.writeUInt16BE(strBuf.length)
      valueBuf = Buffer.concat([lenBuf, strBuf])
    } else if (type === 0 || type === 1) {
      // Bool - no value bytes
      valueBuf = Buffer.alloc(0)
    } else if (type === 4) {
      // Int
      valueBuf = Buffer.alloc(4)
      valueBuf.writeInt32BE(value as number)
    } else {
      valueBuf = Buffer.alloc(0)
    }
    
    headerBuffers.push(Buffer.concat([nameLen, nameBuf, typeBuf, valueBuf]))
  }
  
  const headersBuffer = Buffer.concat(headerBuffers)
  const headersLength = headersBuffer.length
  
  // Total length = prelude (12) + headers + payload + message CRC (4)
  const totalLength = 12 + headersLength + payloadBuf.length + 4
  
  // Build prelude
  const prelude = Buffer.alloc(12)
  prelude.writeUInt32BE(totalLength, 0)
  prelude.writeUInt32BE(headersLength, 4)
  prelude.writeUInt32BE(0, 8) // CRC placeholder
  
  // Message CRC placeholder
  const messageCrc = Buffer.alloc(4)
  
  return Buffer.concat([prelude, headersBuffer, payloadBuf, messageCrc])
}

describe('BedrockEventStreamParser', () => {
  describe('basic parsing', () => {
    it('should parse a simple event with bytes payload', () => {
      const parser = new BedrockEventStreamParser('test-flow')
      
      const eventData = { type: 'messageStart', role: 'assistant' }
      const base64Data = Buffer.from(JSON.stringify(eventData)).toString('base64')
      const payload = JSON.stringify({ bytes: base64Data })
      
      const message = createEventStreamMessage(
        {
          ':event-type': { type: 7, value: 'messageStart' },
          ':message-type': { type: 7, value: 'event' },
          ':content-type': { type: 7, value: 'application/json' }
        },
        payload
      )
      
      const events = parser.processChunk(message)
      
      expect(events).toHaveLength(1)
      expect(events[0].event).toBe('messageStart')
      expect(events[0].flowId).toBe('test-flow')
      
      const parsedData = JSON.parse(events[0].data!)
      expect(parsedData.type).toBe('messageStart')
      expect(parsedData.role).toBe('assistant')
    })

    it('should parse multiple messages in one chunk', () => {
      const parser = new BedrockEventStreamParser('test-flow')
      
      const events = [
        { type: 'messageStart', role: 'assistant' },
        { type: 'contentBlockStart', index: 0 },
        { type: 'contentBlockDelta', index: 0, delta: { type: 'text_delta', text: 'Hello' } }
      ]
      
      const messages = events.map((eventData) => {
        const base64Data = Buffer.from(JSON.stringify(eventData)).toString('base64')
        const payload = JSON.stringify({ bytes: base64Data })
        
        return createEventStreamMessage(
          {
            ':event-type': { type: 7, value: eventData.type },
            ':message-type': { type: 7, value: 'event' }
          },
          payload
        )
      })
      
      const combined = Buffer.concat(messages)
      const parsedEvents = parser.processChunk(combined)
      
      expect(parsedEvents).toHaveLength(3)
      expect(parsedEvents[0].event).toBe('messageStart')
      expect(parsedEvents[1].event).toBe('contentBlockStart')
      expect(parsedEvents[2].event).toBe('contentBlockDelta')
    })

    it('should handle chunked delivery', () => {
      const parser = new BedrockEventStreamParser('test-flow')
      
      const eventData = { type: 'messageStart', role: 'assistant' }
      const base64Data = Buffer.from(JSON.stringify(eventData)).toString('base64')
      const payload = JSON.stringify({ bytes: base64Data })
      
      const message = createEventStreamMessage(
        {
          ':event-type': { type: 7, value: 'messageStart' },
          ':message-type': { type: 7, value: 'event' }
        },
        payload
      )
      
      // Split message into chunks
      const chunk1 = message.slice(0, 20)
      const chunk2 = message.slice(20, 50)
      const chunk3 = message.slice(50)
      
      expect(parser.processChunk(chunk1)).toHaveLength(0)
      expect(parser.processChunk(chunk2)).toHaveLength(0)
      
      const events = parser.processChunk(chunk3)
      expect(events).toHaveLength(1)
      expect(events[0].event).toBe('messageStart')
    })
  })

  describe('payload formats', () => {
    it('should handle direct JSON payload without bytes field', () => {
      const parser = new BedrockEventStreamParser('test-flow')
      
      const payload = JSON.stringify({ type: 'metadata', usage: { inputTokens: 10 } })
      
      const message = createEventStreamMessage(
        {
          ':event-type': { type: 7, value: 'metadata' },
          ':message-type': { type: 7, value: 'event' }
        },
        payload
      )
      
      const events = parser.processChunk(message)
      
      expect(events).toHaveLength(1)
      expect(events[0].event).toBe('metadata')
      
      const parsedData = JSON.parse(events[0].data!)
      expect(parsedData.usage.inputTokens).toBe(10)
    })

    it('should handle empty payload', () => {
      const parser = new BedrockEventStreamParser('test-flow')
      
      const message = createEventStreamMessage(
        {
          ':event-type': { type: 7, value: 'ping' },
          ':message-type': { type: 7, value: 'event' }
        },
        ''
      )
      
      const events = parser.processChunk(message)
      
      expect(events).toHaveLength(1)
      expect(events[0].event).toBe('ping')
    })
  })

  describe('exception handling', () => {
    it('should parse exception messages', () => {
      const parser = new BedrockEventStreamParser('test-flow')
      
      const payload = JSON.stringify({ message: 'Rate limit exceeded' })
      
      const message = createEventStreamMessage(
        {
          ':exception-type': { type: 7, value: 'throttlingException' },
          ':message-type': { type: 7, value: 'exception' }
        },
        payload
      )
      
      const events = parser.processChunk(message)
      
      expect(events).toHaveLength(1)
      expect(events[0].event).toBe('exception:throttlingException')
      
      const parsedData = JSON.parse(events[0].data!)
      expect(parsedData.type).toBe('exception')
      expect(parsedData.message).toBe('Rate limit exceeded')
    })
  })

  describe('header types', () => {
    it('should parse various header types', () => {
      const parser = new BedrockEventStreamParser('test-flow')
      
      const eventData = { type: 'test' }
      const base64Data = Buffer.from(JSON.stringify(eventData)).toString('base64')
      const payload = JSON.stringify({ bytes: base64Data })
      
      const message = createEventStreamMessage(
        {
          ':event-type': { type: 7, value: 'test' },
          ':message-type': { type: 7, value: 'event' },
          'custom-int': { type: 4, value: 42 },
          'custom-bool': { type: 0, value: '' }
        },
        payload
      )
      
      const events = parser.processChunk(message)
      
      expect(events).toHaveLength(1)
      expect(events[0].event).toBe('test')
    })
  })

  describe('flush', () => {
    it('should return remaining complete events on flush', () => {
      const parser = new BedrockEventStreamParser('test-flow')
      
      const eventData = { type: 'messageStop' }
      const base64Data = Buffer.from(JSON.stringify(eventData)).toString('base64')
      const payload = JSON.stringify({ bytes: base64Data })
      
      const message = createEventStreamMessage(
        {
          ':event-type': { type: 7, value: 'messageStop' },
          ':message-type': { type: 7, value: 'event' }
        },
        payload
      )
      
      // Add partial message
      const partialMessage = message.slice(0, 10)
      parser.processChunk(Buffer.concat([message, partialMessage]))
      
      // Flush should not return incomplete message
      const flushed = parser.flush()
      expect(flushed).toHaveLength(0)
    })
  })
})
