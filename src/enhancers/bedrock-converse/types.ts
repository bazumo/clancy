// AWS Bedrock Converse API Types
// Based on https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_ConverseStream.html

// ============================================================================
// Content Block Types
// ============================================================================

export interface ConverseTextBlock {
  text: string
}

export interface ConverseImageSource {
  bytes?: string // base64 encoded
  s3Location?: {
    uri: string
    bucketOwner?: string
  }
}

export interface ConverseImageBlock {
  format: 'png' | 'jpeg' | 'gif' | 'webp'
  source: ConverseImageSource
}

export interface ConverseDocumentSource {
  bytes?: string // base64 encoded
  s3Location?: {
    uri: string
    bucketOwner?: string
  }
}

export interface ConverseDocumentBlock {
  format: 'pdf' | 'csv' | 'doc' | 'docx' | 'xls' | 'xlsx' | 'html' | 'txt' | 'md'
  name: string
  source: ConverseDocumentSource
}

export interface ConverseToolUseBlock {
  toolUseId: string
  name: string
  input: Record<string, unknown>
}

export interface ConverseToolResultContentBlock {
  text?: string
  image?: ConverseImageBlock
  document?: ConverseDocumentBlock
  json?: Record<string, unknown>
}

export interface ConverseToolResultBlock {
  toolUseId: string
  content: ConverseToolResultContentBlock[]
  status?: 'success' | 'error'
}

// Cache point for prompt caching
export interface ConverseCachePoint {
  type: 'default'
}

// Union type for content blocks in messages
export type ConverseContentBlock =
  | { text: string; cachePoint?: ConverseCachePoint }
  | { image: ConverseImageBlock; cachePoint?: ConverseCachePoint }
  | { document: ConverseDocumentBlock; cachePoint?: ConverseCachePoint }
  | { toolUse: ConverseToolUseBlock; cachePoint?: ConverseCachePoint }
  | { toolResult: ConverseToolResultBlock; cachePoint?: ConverseCachePoint }
  | { guardContent?: { text: { text: string } }; cachePoint?: ConverseCachePoint }
  | { reasoningContent?: { reasoningText: { text: string; signature?: string } }; cachePoint?: ConverseCachePoint }
  | { cachePoint: ConverseCachePoint }

// ============================================================================
// Message Types
// ============================================================================

export interface ConverseMessage {
  role: 'user' | 'assistant'
  content: ConverseContentBlock[]
}

// ============================================================================
// System Content Block Types
// ============================================================================

export interface ConverseSystemTextBlock {
  text: string
}

export interface ConverseSystemGuardContent {
  text: { text: string }
}

export type ConverseSystemContentBlock =
  | { text: string; cachePoint?: ConverseCachePoint }
  | { guardContent: ConverseSystemGuardContent; cachePoint?: ConverseCachePoint }
  | { cachePoint: ConverseCachePoint }

// ============================================================================
// Inference Configuration
// ============================================================================

export interface ConverseInferenceConfig {
  maxTokens?: number
  temperature?: number
  topP?: number
  stopSequences?: string[]
}

// ============================================================================
// Tool Configuration
// ============================================================================

export interface ConverseToolInputSchema {
  json?: Record<string, unknown>
}

export interface ConverseTool {
  toolSpec?: {
    name: string
    description?: string
    inputSchema: ConverseToolInputSchema
  }
}

export interface ConverseToolChoice {
  auto?: Record<string, never>
  any?: Record<string, never>
  tool?: {
    name: string
  }
}

export interface ConverseToolConfig {
  tools?: ConverseTool[]
  toolChoice?: ConverseToolChoice
}

// ============================================================================
// Guardrail Configuration
// ============================================================================

export interface ConverseGuardrailConfig {
  guardrailIdentifier: string
  guardrailVersion: string
  streamProcessingMode?: 'sync' | 'async'
  trace?: 'enabled' | 'disabled'
}

// ============================================================================
// Additional Model Request Fields (for model-specific params)
// ============================================================================

export interface ConverseAdditionalModelRequestFields {
  // Anthropic-specific
  thinking?: {
    type: 'enabled' | 'disabled'
    budget_tokens?: number
  }
  // Other model-specific fields
  [key: string]: unknown
}

// ============================================================================
// Request Body
// ============================================================================

export interface ConverseStreamRequest {
  messages: ConverseMessage[]
  system?: ConverseSystemContentBlock[]
  inferenceConfig?: ConverseInferenceConfig
  toolConfig?: ConverseToolConfig
  guardrailConfig?: ConverseGuardrailConfig
  additionalModelRequestFields?: ConverseAdditionalModelRequestFields
  additionalModelResponseFieldPaths?: string[]
  requestMetadata?: Record<string, string>
  performanceConfig?: {
    latency?: 'standard' | 'optimized'
  }
  promptVariables?: Record<string, { text?: string }>
}

// Non-streaming version
export type ConverseRequest = ConverseStreamRequest

// ============================================================================
// Streaming Event Types
// ============================================================================

export interface ConverseMessageStartEvent {
  messageStart: {
    role: 'assistant'
  }
}

export interface ConverseContentBlockStartEvent {
  contentBlockStart: {
    contentBlockIndex: number
    start: {
      text?: string
      toolUse?: {
        toolUseId: string
        name: string
      }
      reasoningContent?: {
        reasoningText?: {
          text?: string
        }
      }
    }
  }
}

export interface ConverseTextDelta {
  text: string
}

export interface ConverseToolUseDelta {
  input: string  // partial JSON
}

export interface ConverseReasoningTextDelta {
  text: string
}

export interface ConverseReasoningSignatureDelta {
  signature: string
}

export interface ConverseContentBlockDeltaEvent {
  contentBlockDelta: {
    contentBlockIndex: number
    delta: {
      text?: string
      toolUse?: { input: string }
      reasoningContent?: {
        reasoningText?: { text: string }
        signature?: string
      }
    }
  }
}

export interface ConverseContentBlockStopEvent {
  contentBlockStop: {
    contentBlockIndex: number
  }
}

export interface ConverseMessageStopEvent {
  messageStop: {
    stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' | 'guardrail_intervened' | 'content_filtered'
    additionalModelResponseFields?: Record<string, unknown>
  }
}

export interface ConverseTokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cacheReadInputTokens?: number
  cacheWriteInputTokens?: number
}

export interface ConverseStreamMetrics {
  latencyMs: number
}

export interface ConverseMetadataEvent {
  metadata: {
    usage: ConverseTokenUsage
    metrics: ConverseStreamMetrics
    trace?: {
      guardrail?: Record<string, unknown>
      promptRouter?: { invokedModelId: string }
    }
    performanceConfig?: {
      latency: string
    }
  }
}

// Union of all stream events
export type ConverseStreamEvent =
  | ConverseMessageStartEvent
  | ConverseContentBlockStartEvent
  | ConverseContentBlockDeltaEvent
  | ConverseContentBlockStopEvent
  | ConverseMessageStopEvent
  | ConverseMetadataEvent

// ============================================================================
// Non-Streaming Response
// ============================================================================

export interface ConverseOutputMessage {
  role: 'assistant'
  content: ConverseContentBlock[]
}

export interface ConverseResponse {
  output: {
    message: ConverseOutputMessage
  }
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' | 'guardrail_intervened' | 'content_filtered'
  usage: ConverseTokenUsage
  metrics: ConverseStreamMetrics
  additionalModelResponseFields?: Record<string, unknown>
  trace?: Record<string, unknown>
  performanceConfig?: {
    latency: string
  }
}

// ============================================================================
// Helper type guards
// ============================================================================

export function isMessageStartEvent(event: ConverseStreamEvent): event is ConverseMessageStartEvent {
  return 'messageStart' in event
}

export function isContentBlockStartEvent(event: ConverseStreamEvent): event is ConverseContentBlockStartEvent {
  return 'contentBlockStart' in event
}

export function isContentBlockDeltaEvent(event: ConverseStreamEvent): event is ConverseContentBlockDeltaEvent {
  return 'contentBlockDelta' in event
}

export function isContentBlockStopEvent(event: ConverseStreamEvent): event is ConverseContentBlockStopEvent {
  return 'contentBlockStop' in event
}

export function isMessageStopEvent(event: ConverseStreamEvent): event is ConverseMessageStopEvent {
  return 'messageStop' in event
}

export function isMetadataEvent(event: ConverseStreamEvent): event is ConverseMetadataEvent {
  return 'metadata' in event
}
