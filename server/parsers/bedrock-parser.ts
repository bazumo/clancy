import type { SSEEvent } from '../../shared/types.js'
import { generateId } from '../utils.js'

/**
 * AWS Bedrock event stream parser for application/vnd.amazon.eventstream
 * 
 * Binary message format:
 * - Prelude (12 bytes):
 *   - Total byte-length (4 bytes, big-endian)
 *   - Headers byte-length (4 bytes, big-endian)
 *   - Prelude CRC (4 bytes)
 * - Headers (variable length, format: 1-byte name length, name, 1-byte type, value)
 * - Payload (variable length)
 * - Message CRC (4 bytes)
 */
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
  private parseMessage(): { headers: Record<string, string>, payload: Buffer } | null {
    // Need at least 12 bytes for prelude (total_len + headers_len + prelude_crc)
    if (this.buffer.length < 12) return null
    
    const totalLength = this.buffer.readUInt32BE(0)
    const headersLength = this.buffer.readUInt32BE(4)
    // Skip prelude CRC at offset 8
    
    // Sanity check - totalLength should be reasonable
    if (totalLength < 16 || totalLength > 16 * 1024 * 1024) {
      // Invalid message, try to recover by skipping a byte
      console.error(`[BedrockParser] Invalid message length: ${totalLength}, skipping byte`)
      this.buffer = this.buffer.slice(1)
      return null
    }
    
    // Check if we have the complete message
    if (this.buffer.length < totalLength) return null
    
    // Parse headers (start after prelude: offset 12)
    const headers: Record<string, string> = {}
    let offset = 12
    const headersEnd = 12 + headersLength
    
    while (offset < headersEnd) {
      try {
        // Header name length (1 byte)
        const nameLength = this.buffer.readUInt8(offset)
        offset += 1
        
        if (offset + nameLength > headersEnd) break
        
        // Header name
        const name = this.buffer.slice(offset, offset + nameLength).toString('utf-8')
        offset += nameLength
        
        if (offset >= headersEnd) break
        
        // Header type (1 byte)
        const headerType = this.buffer.readUInt8(offset)
        offset += 1
        
        // Parse value based on type
        // Type 0: bool true, Type 1: bool false (no value bytes)
        // Type 2: byte (1 byte), Type 3: short (2 bytes), Type 4: int (4 bytes), Type 5: long (8 bytes)
        // Type 6: bytes (2-byte length + bytes), Type 7: string (2-byte length + string)
        // Type 8: timestamp (8 bytes), Type 9: uuid (16 bytes)
        
        switch (headerType) {
          case 0: // bool true
            headers[name] = 'true'
            break
          case 1: // bool false
            headers[name] = 'false'
            break
          case 2: // byte
            headers[name] = String(this.buffer.readInt8(offset))
            offset += 1
            break
          case 3: // short
            headers[name] = String(this.buffer.readInt16BE(offset))
            offset += 2
            break
          case 4: // int
            headers[name] = String(this.buffer.readInt32BE(offset))
            offset += 4
            break
          case 5: // long
            headers[name] = String(this.buffer.readBigInt64BE(offset))
            offset += 8
            break
          case 6: // bytes
          case 7: // string
            {
              const valueLength = this.buffer.readUInt16BE(offset)
              offset += 2
              const value = this.buffer.slice(offset, offset + valueLength).toString('utf-8')
              offset += valueLength
              headers[name] = value
            }
            break
          case 8: // timestamp
            headers[name] = String(this.buffer.readBigInt64BE(offset))
            offset += 8
            break
          case 9: // uuid
            {
              const uuid = this.buffer.slice(offset, offset + 16).toString('hex')
              headers[name] = `${uuid.slice(0,8)}-${uuid.slice(8,12)}-${uuid.slice(12,16)}-${uuid.slice(16,20)}-${uuid.slice(20)}`
              offset += 16
            }
            break
          default:
            // Unknown type, can't continue parsing headers safely
            console.warn(`[BedrockParser] Unknown header type: ${headerType} for header ${name}`)
            offset = headersEnd // Skip remaining headers
            break
        }
      } catch (err) {
        console.error('[BedrockParser] Error parsing header:', err)
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
    const eventType = message.headers[':event-type'] || message.headers[':exception-type']
    const messageType = message.headers[':message-type']
    
    // Handle exception messages
    if (messageType === 'exception' || message.headers[':exception-type']) {
      const errorType = message.headers[':exception-type'] || 'unknown'
      let errorMessage = ''
      
      try {
        const payloadStr = message.payload.toString('utf-8')
        if (payloadStr) {
          const parsed = JSON.parse(payloadStr)
          errorMessage = parsed.message || parsed.Message || payloadStr
        }
      } catch {
        errorMessage = message.payload.toString('utf-8')
      }
      
      return {
        eventId: generateId(),
        flowId: this.flowId,
        event: `exception:${errorType}`,
        data: JSON.stringify({ type: 'exception', errorType, message: errorMessage }),
        timestamp: new Date().toISOString()
      }
    }
    
    // Handle regular event messages
    try {
      const payloadStr = message.payload.toString('utf-8')
      
      if (!payloadStr || payloadStr.length === 0) {
        // Empty payload, still create event with headers info
        return {
          eventId: generateId(),
          flowId: this.flowId,
          event: eventType || 'unknown',
          data: JSON.stringify({ type: eventType, headers: message.headers }),
          timestamp: new Date().toISOString()
        }
      }
      
      const payloadJson = JSON.parse(payloadStr)
      
      // The actual event data is base64-encoded in the "bytes" field
      if (payloadJson.bytes) {
        const decodedData = Buffer.from(payloadJson.bytes, 'base64').toString('utf-8')
        
        // Try to parse as JSON to get the event type
        try {
          const eventData = JSON.parse(decodedData)
          return {
            eventId: generateId(),
            flowId: this.flowId,
            event: eventData.type || eventType || 'unknown',
            data: decodedData,
            timestamp: new Date().toISOString()
          }
        } catch {
          // Not JSON, return as-is
          return {
            eventId: generateId(),
            flowId: this.flowId,
            event: eventType || 'unknown',
            data: decodedData,
            timestamp: new Date().toISOString()
          }
        }
      }
      
      // No bytes field - payload might be the event data directly
      return {
        eventId: generateId(),
        flowId: this.flowId,
        event: payloadJson.type || eventType || 'unknown',
        data: payloadStr,
        timestamp: new Date().toISOString()
      }
    } catch (err) {
      // Failed to parse as JSON - return raw payload
      const rawData = message.payload.toString('utf-8')
      
      if (rawData.length > 0) {
        return {
          eventId: generateId(),
          flowId: this.flowId,
          event: eventType || 'unknown',
          data: rawData,
          timestamp: new Date().toISOString()
        }
      }
      
      console.error('[BedrockParser] Error parsing event payload:', err)
      return null
    }
  }
}
