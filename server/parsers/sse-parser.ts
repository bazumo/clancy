import type { SSEEvent } from '../../shared/types.js'
import { generateId } from '../utils.js'

// Incremental SSE parser for streaming
export class SSEStreamParser {
  private buffer = ''
  private flowId: string
  
  constructor(flowId: string) {
    this.flowId = flowId
  }
  
  // Process a chunk, returns any newly completed events
  processChunk(chunk: string): SSEEvent[] {
    this.buffer += chunk
    const newEvents: SSEEvent[] = []
    
    // Split on double newlines (event boundaries)
    const parts = this.buffer.split(/\n\n/)
    
    // Keep the last part as buffer (might be incomplete)
    this.buffer = parts.pop() || ''
    
    // Parse complete events
    for (const part of parts) {
      if (!part.trim()) continue
      
      const event = this.parseEvent(part)
      if (event) {
        newEvents.push(event)
      }
    }
    
    return newEvents
  }
  
  // Flush any remaining buffer content
  flush(): SSEEvent[] {
    if (!this.buffer.trim()) return []
    
    const event = this.parseEvent(this.buffer)
    this.buffer = ''
    
    if (event) {
      return [event]
    }
    return []
  }
  
  private parseEvent(raw: string): SSEEvent | null {
    const lines = raw.split('\n')
    const event: Partial<SSEEvent> = {
      eventId: generateId(),
      flowId: this.flowId
    }
    const dataLines: string[] = []
    
    for (const line of lines) {
      if (line.startsWith('event:')) {
        event.event = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim())
      } else if (line.startsWith('id:')) {
        event.id = line.slice(3).trim()
      } else if (line.startsWith('retry:')) {
        event.retry = line.slice(6).trim()
      }
    }
    
    if (dataLines.length > 0) {
      event.data = dataLines.join('\n')
      event.timestamp = new Date().toISOString()
      return event as SSEEvent
    }
    return null
  }
}

