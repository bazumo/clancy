/**
 * Adapters to convert Bedrock Converse API types to Claude Messages API types
 * This allows reusing Claude components for displaying Converse data
 */

import type { 
  ConverseMessage, 
  ConverseContentBlock, 
  ConverseSystemContentBlock,
  ConverseTool,
  ConverseStreamRequest,
  ConverseResponse,
  ConverseTokenUsage,
  ConverseCachePoint,
} from './types'
import type { 
  MessageContent, 
  ContentBlock, 
  SystemPrompt,
  Tool,
  ClaudeMessagesRequest,
  ClaudeMessagesResponse,
  Usage,
  CacheControl,
} from '../claude-messages/types'

/**
 * Convert Bedrock cachePoint to Claude cache_control format
 * Preserves the original Bedrock type ('default') for accurate display
 */
function convertCachePoint(cachePoint?: ConverseCachePoint): CacheControl | undefined {
  if (!cachePoint) return undefined
  return { type: cachePoint.type }
}

/**
 * Convert a Converse content block to Claude content block format
 */
export function converseBlockToClaudeBlock(block: ConverseContentBlock): ContentBlock | null {
  // Get cache_control if cachePoint is present on the block
  const cache_control = 'cachePoint' in block ? convertCachePoint(block.cachePoint) : undefined

  // Standalone cache point block - return null (cache control will be on previous block)
  if ('cachePoint' in block && Object.keys(block).length === 1) {
    return null
  }

  // Text block
  if ('text' in block && typeof block.text === 'string') {
    return {
      type: 'text',
      text: block.text,
      cache_control,
    }
  }

  // Image block
  if ('image' in block) {
    return {
      type: 'image',
      source: block.image.source.bytes 
        ? {
            type: 'base64',
            media_type: `image/${block.image.format}` as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
            data: block.image.source.bytes,
          }
        : {
            type: 'url',
            url: block.image.source.s3Location?.uri || '',
          },
      cache_control,
    }
  }

  // Document block
  if ('document' in block) {
    return {
      type: 'document',
      title: block.document.name,
      source: block.document.source.bytes
        ? {
            type: 'base64',
            media_type: 'application/pdf',
            data: block.document.source.bytes,
          }
        : {
            type: 'url',
            url: block.document.source.s3Location?.uri || '',
          },
      cache_control,
    }
  }

  // Tool use block
  if ('toolUse' in block) {
    return {
      type: 'tool_use',
      id: block.toolUse.toolUseId,
      name: block.toolUse.name,
      input: block.toolUse.input,
      cache_control,
    }
  }

  // Tool result block
  if ('toolResult' in block) {
    const content = block.toolResult.content
      .map(c => {
        if (c.text) return c.text
        if (c.json) return JSON.stringify(c.json)
        return ''
      })
      .join('\n')
    
    return {
      type: 'tool_result',
      tool_use_id: block.toolResult.toolUseId,
      content: content,
      is_error: block.toolResult.status === 'error',
      cache_control,
    }
  }

  // Reasoning/thinking block
  if ('reasoningContent' in block && block.reasoningContent) {
    return {
      type: 'thinking',
      thinking: block.reasoningContent.reasoningText?.text || '',
      signature: block.reasoningContent.reasoningText?.signature || '',
    }
  }

  // Guard content - treat as text
  if ('guardContent' in block && block.guardContent) {
    return {
      type: 'text',
      text: `[Guard] ${block.guardContent.text?.text || ''}`,
      cache_control,
    }
  }

  return null
}

/**
 * Convert a Converse message to Claude message format
 * Handles standalone cachePoint blocks by applying them to the previous content block
 */
export function converseMessageToClaudeMessage(message: ConverseMessage): MessageContent {
  const content: ContentBlock[] = []
  
  for (let i = 0; i < message.content.length; i++) {
    const block = message.content[i]
    const nextBlock = message.content[i + 1]
    
    // Check if next block is a standalone cachePoint
    const standaloneNextCachePoint = nextBlock && 
      'cachePoint' in nextBlock && 
      Object.keys(nextBlock).length === 1
      ? nextBlock.cachePoint
      : undefined
    
    // Convert the block
    const claudeBlock = converseBlockToClaudeBlock(block)
    
    if (claudeBlock) {
      // If there's a following standalone cachePoint, apply it to this block
      // Only apply to blocks that support cache_control (not thinking blocks)
      if (standaloneNextCachePoint && 
          'cache_control' in claudeBlock && 
          claudeBlock.cache_control === undefined) {
        (claudeBlock as { cache_control?: CacheControl }).cache_control = convertCachePoint(standaloneNextCachePoint)
      }
      content.push(claudeBlock)
    }
  }

  return {
    role: message.role,
    content,
  }
}

/**
 * Convert Converse system blocks to Claude system prompt format
 * Handles standalone cachePoint blocks by applying them to the previous content block
 */
export function converseSystemToClaudeSystem(system: ConverseSystemContentBlock[]): SystemPrompt {
  const result: SystemPrompt = []
  
  for (let i = 0; i < system.length; i++) {
    const block = system[i]
    const nextBlock = system[i + 1]
    
    // Check if next block is a standalone cachePoint
    const standaloneNextCachePoint = nextBlock && 
      'cachePoint' in nextBlock && 
      Object.keys(nextBlock).length === 1
      ? nextBlock.cachePoint
      : undefined
    
    // Get cache_control from this block's cachePoint (if it has content too)
    const blockCacheControl = 'cachePoint' in block && block.cachePoint 
      ? convertCachePoint(block.cachePoint)
      : undefined
    
    // Skip standalone cachePoint blocks
    if ('cachePoint' in block && Object.keys(block).length === 1) {
      continue
    }
    
    // Determine final cache_control - prefer block's own cache point, fallback to following standalone
    const cache_control = blockCacheControl || convertCachePoint(standaloneNextCachePoint)
    
    if ('text' in block && typeof block.text === 'string') {
      result.push({ type: 'text' as const, text: block.text, cache_control })
    } else if ('guardContent' in block && block.guardContent) {
      result.push({ type: 'text' as const, text: `[Guard] ${block.guardContent.text?.text || ''}`, cache_control })
    }
  }
  
  return result.filter(b => b.text)
}

/**
 * Convert Converse tool to Claude tool format
 */
export function converseToolToClaudeTool(tool: ConverseTool): Tool | null {
  if (!tool.toolSpec) return null
  
  return {
    name: tool.toolSpec.name,
    description: tool.toolSpec.description,
    input_schema: {
      type: 'object',
      properties: tool.toolSpec.inputSchema?.json as Record<string, unknown> | undefined,
    },
  }
}

/**
 * Convert Converse request to a Claude-like request format for display
 */
export function converseRequestToClaudeRequest(
  request: ConverseStreamRequest,
  modelId: string | null
): ClaudeMessagesRequest {
  const messages = request.messages.map(converseMessageToClaudeMessage)
  const system = request.system ? converseSystemToClaudeSystem(request.system) : undefined
  const tools = request.toolConfig?.tools
    ?.map(converseToolToClaudeTool)
    .filter((t): t is Tool => t !== null)

  return {
    model: modelId ? decodeURIComponent(modelId) : 'unknown',
    messages,
    max_tokens: request.inferenceConfig?.maxTokens || 4096,
    system,
    tools,
    temperature: request.inferenceConfig?.temperature,
    top_p: request.inferenceConfig?.topP,
    stop_sequences: request.inferenceConfig?.stopSequences,
    thinking: request.additionalModelRequestFields?.thinking as ClaudeMessagesRequest['thinking'],
  }
}

/**
 * Convert Converse usage to Claude usage format
 */
export function converseUsageToClaudeUsage(usage: ConverseTokenUsage): Usage {
  return {
    input_tokens: usage.inputTokens,
    output_tokens: usage.outputTokens,
    cache_read_input_tokens: usage.cacheReadInputTokens,
    cache_creation_input_tokens: usage.cacheWriteInputTokens,
  }
}

/**
 * Map Converse stop reason to Claude stop reason
 */
function mapStopReason(stopReason: string): ClaudeMessagesResponse['stop_reason'] {
  switch (stopReason) {
    case 'end_turn':
      return 'end_turn'
    case 'tool_use':
      return 'tool_use'
    case 'max_tokens':
      return 'max_tokens'
    case 'stop_sequence':
      return 'stop_sequence'
    case 'content_filtered':
    case 'guardrail_intervened':
      return 'refusal'
    default:
      return 'end_turn'
  }
}

/**
 * Convert Converse response to Claude response format for display
 */
export function converseResponseToClaudeResponse(
  response: ConverseResponse,
  modelId: string | null
): ClaudeMessagesResponse {
  const content: ContentBlock[] = response.output?.message?.content
    ?.map(converseBlockToClaudeBlock)
    .filter((b): b is ContentBlock => b !== null) || []

  return {
    id: 'converse-response',
    type: 'message',
    role: 'assistant',
    content,
    model: modelId ? decodeURIComponent(modelId) : 'unknown',
    stop_reason: mapStopReason(response.stopReason),
    usage: converseUsageToClaudeUsage(response.usage),
  }
}
