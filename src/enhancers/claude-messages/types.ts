// Claude Messages API Types

export interface CacheControl {
  type: 'ephemeral'
}

// Content block types
export interface TextBlock {
  type: 'text'
  text: string
  cache_control?: CacheControl
}

export interface ThinkingBlock {
  type: 'thinking'
  thinking: string
  signature: string
}

export interface ToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

export interface ToolResultBlock {
  type: 'tool_result'
  tool_use_id: string
  content: string | ContentBlock[]
  is_error?: boolean
}

export interface ImageBlock {
  type: 'image'
  source: {
    type: 'base64' | 'url'
    media_type?: string
    data?: string
    url?: string
  }
}

export type ContentBlock = 
  | TextBlock 
  | ThinkingBlock 
  | ToolUseBlock 
  | ToolResultBlock 
  | ImageBlock

// Message types
export interface Message {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}

export interface SystemBlock {
  type: 'text'
  text: string
  cache_control?: CacheControl
}

// Request body
export interface ClaudeMessagesRequest {
  model: string
  messages: Message[]
  system?: string | SystemBlock[]
  max_tokens?: number
  temperature?: number
  tools?: Tool[]
  tool_choice?: ToolChoice
  stream?: boolean
  thinking?: {
    type: 'enabled'
    budget_tokens: number
  }
  metadata?: Record<string, unknown>
}

export interface Tool {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export interface ToolChoice {
  type: 'auto' | 'any' | 'tool'
  name?: string
}

// Response types
export interface Usage {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

export interface ClaudeMessagesResponse {
  id: string
  type: 'message'
  role: 'assistant'
  content: ContentBlock[]
  model: string
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use'
  stop_sequence?: string
  usage: Usage
}

// Streaming event types
export interface MessageStartEvent {
  type: 'message_start'
  message: {
    id: string
    type: 'message'
    role: 'assistant'
    content: ContentBlock[]
    model: string
    usage: Usage
  }
}

export interface ContentBlockStartEvent {
  type: 'content_block_start'
  index: number
  content_block: ContentBlock
}

export interface ContentBlockDeltaEvent {
  type: 'content_block_delta'
  index: number
  delta: {
    type: 'text_delta' | 'thinking_delta' | 'input_json_delta'
    text?: string
    thinking?: string
    partial_json?: string
  }
}

export interface ContentBlockStopEvent {
  type: 'content_block_stop'
  index: number
}

export interface MessageDeltaEvent {
  type: 'message_delta'
  delta: {
    stop_reason: string
    stop_sequence?: string
  }
  usage: {
    output_tokens: number
  }
}

export interface MessageStopEvent {
  type: 'message_stop'
}

export interface PingEvent {
  type: 'ping'
}

export interface ErrorEvent {
  type: 'error'
  error: {
    type: string
    message: string
  }
}

export type StreamEvent = 
  | MessageStartEvent
  | ContentBlockStartEvent
  | ContentBlockDeltaEvent
  | ContentBlockStopEvent
  | MessageDeltaEvent
  | MessageStopEvent
  | PingEvent
  | ErrorEvent

