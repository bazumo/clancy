import type { SSEEvent } from '../../shared/types.js'
import { generateId } from '../utils.js'

// AWS Bedrock event stream parser for application/vnd.amazon.eventstream
export class BedrockEventStreamParser {
  private buffer = Buffer.alloc(0)
  private flowId: string
  
  constructor(flowId: string) {
    this.flowId = flowId
  }
  
  // Process a binary chunk, returns any newly completed events
  processChunk(chunk: Buffer): SSEEvent[] {
    this.buffer = Buffer.concat([this.buffer, chunk])
    const newEvents: SSEEvent[] = []
    
    // Parse complete messages from buffer
    while (true) {
      const message = this.parseMessage()
      if (!message) break
      
      const event = this.messageToEvent(message)
      if (event) {
        newEvents.push(event)
      }
    }
    
    return newEvents
  }
  
  // Flush any remaining buffer content
  flush(): SSEEvent[] {
    const events: SSEEvent[] = []
    while (true) {
      const message = this.parseMessage()
      if (!message) break
      
      const event = this.messageToEvent(message)
      if (event) {
        events.push(event)
      }
    }
    return events
  }
  
  // Parse a single AWS event stream message
  // Format: 4-byte total length, 4-byte headers length, 4-byte prelude CRC, headers, payload, 4-byte message CRC
  private parseMessage(): { headers: Record<string, string>, payload: Buffer } | null {
    // Need at least 12 bytes for prelude (total_len + headers_len + prelude_crc)
    if (this.buffer.length < 12) return null
    
    const totalLength = this.buffer.readUInt32BE(0)
    const headersLength = this.buffer.readUInt32BE(4)
    
    // Check if we have the complete message
    if (this.buffer.length < totalLength) return null
    
    // Parse headers (start after prelude: offset 12)
    const headers: Record<string, string> = {}
    let offset = 12
    const headersEnd = 12 + headersLength
    
    while (offset < headersEnd) {
      // Header name length (1 byte)
      const nameLength = this.buffer.readUInt8(offset)
      offset += 1
      
      // Header name
      const name = this.buffer.slice(offset, offset + nameLength).toString('utf-8')
      offset += nameLength
      
      // Header type (1 byte) - 7 means string
      const headerType = this.buffer.readUInt8(offset)
      offset += 1
      
      if (headerType === 7) {
        // String value: 2 bytes length + value
        const valueLength = this.buffer.readUInt16BE(offset)
        offset += 2
        const value = this.buffer.slice(offset, offset + valueLength).toString('utf-8')
        offset += valueLength
        headers[name] = value
      } else {
        // Skip other header types for now
        break
      }
    }
    
    // Payload is between headers and message CRC (last 4 bytes)
    const payloadStart = 12 + headersLength
    const payloadEnd = totalLength - 4
    const payload = this.buffer.slice(payloadStart, payloadEnd)
    
    // Remove processed message from buffer
    this.buffer = this.buffer.slice(totalLength)
    
    return { headers, payload }
  }
  
  // Convert AWS message to SSEEvent
  private messageToEvent(message: { headers: Record<string, string>, payload: Buffer }): SSEEvent | null {
    try {
      // Parse the JSON payload
      const payloadStr = message.payload.toString('utf-8')
      const payloadJson = JSON.parse(payloadStr)
      
      // The actual event data is base64-encoded in the "bytes" field
      if (payloadJson.bytes) {
        const decodedData = Buffer.from(payloadJson.bytes, 'base64').toString('utf-8')
        const eventData = JSON.parse(decodedData)
        
        return {
          eventId: generateId(),
          flowId: this.flowId,
          event: eventData.type || message.headers[':event-type'],
          data: decodedData,
          timestamp: new Date().toISOString()
        }
      }
    } catch (err) {
      console.error('Error parsing Bedrock event:', err)
    }
    return null
  }
}

