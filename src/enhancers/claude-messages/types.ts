// Claude Messages API Types
// Re-exports and extends types from @anthropic-ai/sdk

import type {
  // Request types
  MessageCreateParams,
  MessageCreateParamsNonStreaming,
  MessageCreateParamsStreaming,
  MessageParam,
  ContentBlockParam,
  TextBlockParam,
  ImageBlockParam,
  ToolUseBlockParam,
  ToolResultBlockParam,
  
  // Response types
  Message,
  
  // Tool types
  ToolChoice,
  ToolChoiceAuto,
  ToolChoiceAny,
  ToolChoiceTool,
  
  // Streaming types
  RawMessageStreamEvent,
  RawMessageStartEvent,
  RawMessageDeltaEvent,
  RawMessageStopEvent,
  RawContentBlockStartEvent,
  RawContentBlockDeltaEvent,
  RawContentBlockStopEvent,
  
  // Citation types
  TextCitation,
} from '@anthropic-ai/sdk/resources/messages'

// Re-export SDK types for convenience
export type {
  MessageCreateParams,
  MessageCreateParamsNonStreaming,
  MessageCreateParamsStreaming,
  MessageParam,
  ContentBlockParam,
  TextBlockParam,
  ImageBlockParam,
  ToolUseBlockParam,
  ToolResultBlockParam,
  Message,
  ToolChoice,
  ToolChoiceAuto,
  ToolChoiceAny,
  ToolChoiceTool,
  RawMessageStreamEvent,
  RawMessageStartEvent,
  RawMessageDeltaEvent,
  RawMessageStopEvent,
  RawContentBlockStartEvent,
  RawContentBlockDeltaEvent,
  RawContentBlockStopEvent,
  TextCitation,
}

// ============================================================================
// Cache Control Types
// ============================================================================

export interface CacheControlEphemeral {
  type: 'ephemeral'
  /** TTL for the cache control breakpoint: '5m' (5 minutes) or '1h' (1 hour) */
  ttl?: '5m' | '1h'
}

export type CacheControl = CacheControlEphemeral

// ============================================================================
// Citation Types (Response)
// ============================================================================

export interface CitationCharLocation {
  type: 'char_location'
  cited_text: string
  document_index: number
  document_title: string | null
  start_char_index: number
  end_char_index: number
  file_id?: string | null
}

export interface CitationPageLocation {
  type: 'page_location'
  cited_text: string
  document_index: number
  document_title: string | null
  start_page_number: number
  end_page_number: number
  file_id?: string | null
}

export interface CitationContentBlockLocation {
  type: 'content_block_location'
  cited_text: string
  document_index: number
  document_title: string | null
  start_block_index: number
  end_block_index: number
  file_id?: string | null
}

export interface CitationsWebSearchResultLocation {
  type: 'web_search_result_location'
  cited_text: string
  encrypted_index: string
  title: string | null
  url: string
}

export interface CitationsSearchResultLocation {
  type: 'search_result_location'
  cited_text: string
  search_result_index: number
  source: string
  title: string | null
  start_block_index: number
  end_block_index: number
}

export type Citation =
  | CitationCharLocation
  | CitationPageLocation
  | CitationContentBlockLocation
  | CitationsWebSearchResultLocation
  | CitationsSearchResultLocation

// ============================================================================
// Content Block Types (Request & Response)
// ============================================================================

// Text Block
export interface TextBlock {
  type: 'text'
  text: string
  citations?: Citation[] | null
  cache_control?: CacheControl | null
}

// Thinking Block (Response)
export interface ThinkingBlock {
  type: 'thinking'
  thinking: string
  signature: string
}

// Redacted Thinking Block (Response)
export interface RedactedThinkingBlock {
  type: 'redacted_thinking'
  data: string
}

// Tool Use Block (Response)
export interface ToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
  cache_control?: CacheControl | null
}

// Tool Result Block (Request)
export interface ToolResultBlock {
  type: 'tool_result'
  tool_use_id: string
  content?: string | ToolResultContent[]
  is_error?: boolean
  cache_control?: CacheControl | null
}

export type ToolResultContent = TextBlock | ImageBlock | SearchResultBlock | DocumentBlock

// Image Block
export interface Base64ImageSource {
  type: 'base64'
  media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
  data: string
}

export interface URLImageSource {
  type: 'url'
  url: string
}

export interface ImageBlock {
  type: 'image'
  source: Base64ImageSource | URLImageSource
  cache_control?: CacheControl | null
}

// Document Block (Request)
export interface Base64PDFSource {
  type: 'base64'
  media_type: 'application/pdf'
  data: string
}

export interface PlainTextSource {
  type: 'text'
  media_type: 'text/plain'
  data: string
}

export interface ContentBlockSource {
  type: 'content'
  content: string | ContentBlockSourceContent[]
}

export type ContentBlockSourceContent = TextBlock | ImageBlock

export interface URLPDFSource {
  type: 'url'
  url: string
}

export interface CitationsConfig {
  enabled?: boolean
}

export interface DocumentBlock {
  type: 'document'
  source: Base64PDFSource | PlainTextSource | ContentBlockSource | URLPDFSource
  title?: string | null
  context?: string | null
  citations?: CitationsConfig | null
  cache_control?: CacheControl | null
}

// Search Result Block (Request)
export interface SearchResultBlock {
  type: 'search_result'
  source: string
  title: string
  content: TextBlock[]
  citations?: CitationsConfig
  cache_control?: CacheControl | null
}

// Server Tool Use Block (Response) - for built-in server tools like web_search
export interface ServerToolUseBlock {
  type: 'server_tool_use'
  id: string
  name: 'web_search'
  input: Record<string, unknown>
  cache_control?: CacheControl | null
}

// Web Search Result Block (Individual result)
export interface WebSearchResultBlock {
  type: 'web_search_result'
  url: string
  title: string
  encrypted_content: string
  page_age?: string | null
}

// Web Search Tool Result Error
export interface WebSearchToolResultError {
  type: 'web_search_tool_result_error'
  error_code: 'invalid_tool_input' | 'unavailable' | 'max_uses_exceeded' | 'too_many_requests' | 'query_too_long'
}

// Web Search Tool Result Block (Response)
export interface WebSearchToolResultBlock {
  type: 'web_search_tool_result'
  tool_use_id: string
  content: WebSearchResultBlock[] | WebSearchToolResultError
}

// Union of all content block types
export type ContentBlock =
  | TextBlock
  | ThinkingBlock
  | RedactedThinkingBlock
  | ToolUseBlock
  | ToolResultBlock
  | ImageBlock
  | DocumentBlock
  | SearchResultBlock
  | ServerToolUseBlock
  | WebSearchToolResultBlock
  | WebSearchResultBlock

// ============================================================================
// Message Types
// ============================================================================

export interface MessageContent {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}

// Alias for backward compatibility
export type MessageType = MessageContent

// ============================================================================
// System Prompt Types
// ============================================================================

export interface SystemBlock {
  type: 'text'
  text: string
  cache_control?: CacheControl | null
}

export type SystemPrompt = string | SystemBlock[]

// ============================================================================
// Tool Types
// ============================================================================

// Standard Tool (Client-side)
export interface Tool {
  name: string
  description?: string
  input_schema: {
    type: 'object'
    properties?: Record<string, unknown> | null
    required?: string[] | null
  }
  type?: 'custom' | null
  cache_control?: CacheControl | null
}

// Built-in Bash Tool
export interface ToolBash20250124 {
  type: 'bash_20250124'
  name: 'bash'
  cache_control?: CacheControl | null
}

// Text Editor Tools
export interface ToolTextEditor20250124 {
  type: 'text_editor_20250124'
  name: 'str_replace_editor'
  cache_control?: CacheControl | null
}

export interface ToolTextEditor20250429 {
  type: 'text_editor_20250429'
  name: 'str_replace_based_edit_tool'
  cache_control?: CacheControl | null
}

export interface ToolTextEditor20250728 {
  type: 'text_editor_20250728'
  name: 'str_replace_based_edit_tool'
  max_characters?: number | null
  cache_control?: CacheControl | null
}

// Web Search Tool
export interface UserLocation {
  type: 'approximate'
  city?: string | null
  region?: string | null
  country?: string | null
  timezone?: string | null
}

export interface WebSearchTool20250305 {
  type: 'web_search_20250305'
  name: 'web_search'
  max_uses?: number | null
  allowed_domains?: string[] | null
  blocked_domains?: string[] | null
  user_location?: UserLocation | null
  cache_control?: CacheControl | null
}

// Union of all tool types
export type ToolUnion =
  | Tool
  | ToolBash20250124
  | ToolTextEditor20250124
  | ToolTextEditor20250429
  | ToolTextEditor20250728
  | WebSearchTool20250305

// Tool Choice Types
export interface ToolChoiceNone {
  type: 'none'
}

export interface ToolChoiceAutoExtended {
  type: 'auto'
  disable_parallel_tool_use?: boolean
}

export interface ToolChoiceAnyExtended {
  type: 'any'
  disable_parallel_tool_use?: boolean
}

export interface ToolChoiceToolExtended {
  type: 'tool'
  name: string
  disable_parallel_tool_use?: boolean
}

export type ToolChoiceExtended =
  | ToolChoiceAutoExtended
  | ToolChoiceAnyExtended
  | ToolChoiceToolExtended
  | ToolChoiceNone

// ============================================================================
// Thinking Configuration
// ============================================================================

export interface ThinkingConfigEnabled {
  type: 'enabled'
  /** Budget for thinking tokens. Must be >= 1024 and < max_tokens */
  budget_tokens: number
}

export interface ThinkingConfigDisabled {
  type: 'disabled'
}

export type ThinkingConfig = ThinkingConfigEnabled | ThinkingConfigDisabled

// ============================================================================
// Request Body
// ============================================================================

export interface ClaudeMessagesRequest {
  model: string
  messages: MessageContent[]
  max_tokens: number
  
  // Optional parameters
  system?: SystemPrompt
  tools?: ToolUnion[]
  tool_choice?: ToolChoiceExtended
  thinking?: ThinkingConfig
  
  // Streaming
  stream?: boolean
  
  // Sampling parameters
  temperature?: number
  top_p?: number
  top_k?: number
  
  // Stop sequences
  stop_sequences?: string[]
  
  // Service tier
  service_tier?: 'auto' | 'standard_only'
  
  // Beta features
  betas?: string[]
  
  // Metadata for tracking
  metadata?: {
    user_id?: string
    [key: string]: unknown
  }
}

// ============================================================================
// Usage Types
// ============================================================================

export interface CacheCreation {
  ephemeral_5m_input_tokens: number
  ephemeral_1h_input_tokens: number
}

export interface ServerToolUsage {
  web_search_requests: number
}

export interface Usage {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
  cache_creation?: CacheCreation | null
  server_tool_use?: ServerToolUsage | null
  service_tier?: 'standard' | 'priority' | 'batch' | null
}

// ============================================================================
// Response Types
// ============================================================================

export type StopReason = 
  | 'end_turn' 
  | 'max_tokens' 
  | 'stop_sequence' 
  | 'tool_use'
  | 'pause_turn'
  | 'refusal'

export interface ClaudeMessagesResponse {
  id: string
  type: 'message'
  role: 'assistant'
  content: ContentBlock[]
  model: string
  stop_reason: StopReason | null
  stop_sequence?: string | null
  usage: Usage
}

// ============================================================================
// Streaming Event Types
// ============================================================================

export interface MessageStartEvent {
  type: 'message_start'
  message: {
    id: string
    type: 'message'
    role: 'assistant'
    content: ContentBlock[]
    model: string
    usage: Usage
    stop_reason: StopReason | null
    stop_sequence?: string | null
  }
}

export interface ContentBlockStartEvent {
  type: 'content_block_start'
  index: number
  content_block: ContentBlock
}

// Delta types for streaming
export interface TextDelta {
  type: 'text_delta'
  text: string
}

export interface ThinkingDelta {
  type: 'thinking_delta'
  thinking: string
}

export interface SignatureDelta {
  type: 'signature_delta'
  signature: string
}

export interface InputJsonDelta {
  type: 'input_json_delta'
  partial_json: string
}

export interface CitationsDelta {
  type: 'citations_delta'
  citation: Citation
}

export type ContentBlockDelta =
  | TextDelta
  | ThinkingDelta
  | SignatureDelta
  | InputJsonDelta
  | CitationsDelta

export interface ContentBlockDeltaEvent {
  type: 'content_block_delta'
  index: number
  delta: ContentBlockDelta
}

export interface ContentBlockStopEvent {
  type: 'content_block_stop'
  index: number
}

export interface MessageDeltaUsage {
  output_tokens: number
  input_tokens?: number | null
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
  server_tool_use?: ServerToolUsage | null
}

export interface MessageDeltaEvent {
  type: 'message_delta'
  delta: {
    stop_reason: StopReason | null
    stop_sequence?: string | null
  }
  usage: MessageDeltaUsage
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

// ============================================================================
// Batch API Types
// ============================================================================

export interface BatchRequest {
  custom_id: string
  params: Omit<ClaudeMessagesRequest, 'stream'>
}

export interface BatchCreateParams {
  requests: BatchRequest[]
}

export type BatchProcessingStatus = 'in_progress' | 'canceling' | 'ended'

export interface BatchRequestCounts {
  processing: number
  succeeded: number
  errored: number
  canceled: number
  expired: number
}

export interface MessageBatch {
  id: string
  type: 'message_batch'
  processing_status: BatchProcessingStatus
  request_counts: BatchRequestCounts
  ended_at?: string | null
  created_at: string
  expires_at: string
  cancel_initiated_at?: string | null
  results_url?: string | null
}

export interface BatchSucceededResult {
  type: 'succeeded'
  message: ClaudeMessagesResponse
}

export interface BatchErroredResult {
  type: 'errored'
  error: {
    type: string
    message: string
  }
}

export interface BatchCanceledResult {
  type: 'canceled'
}

export interface BatchExpiredResult {
  type: 'expired'
}

export type BatchResult =
  | BatchSucceededResult
  | BatchErroredResult
  | BatchCanceledResult
  | BatchExpiredResult

export interface BatchResultEntry {
  custom_id: string
  result: BatchResult
}

// ============================================================================
// Count Tokens API Types
// ============================================================================

export interface MessageCountTokensParams {
  model: string
  messages: MessageContent[]
  system?: SystemPrompt
  tools?: ToolUnion[]
  tool_choice?: ToolChoiceExtended
  thinking?: ThinkingConfig
}

export interface MessageTokensCount {
  input_tokens: number
}
