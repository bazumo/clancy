import type { Flow } from '../../../shared/types'
import type { FlowEnhancer } from '../types'
import { registerEnhancer } from '../registry'
import type { ClaudeMessagesRequest, ContentBlock } from './types'
import { ClaudeRequestBody } from './components/ClaudeRequestBody'
import { ClaudeResponseBody } from './components/ClaudeResponseBody'
import { ClaudeEventView } from './components/ClaudeEventView'

/**
 * Check if a flow is a Claude Messages API request
 */
function isClaudeMessagesRequest(flow: Flow): boolean {
  const path = flow.request.path.split('?')[0]
  return (
    path === '/v1/messages' &&
    flow.request.method === 'POST' &&
    (flow.host.includes('anthropic.com') || flow.host.includes('localhost'))
  )
}

/**
 * Safely parse JSON
 */
function safeParseJson<T>(str: string | undefined): T | null {
  if (!str) return null
  try {
    return JSON.parse(str) as T
  } catch {
    return null
  }
}

/**
 * Check if content blocks contain thinking
 */
function hasThinking(content: string | ContentBlock[]): boolean {
  if (typeof content === 'string') return false
  return content.some(block => block.type === 'thinking' || block.type === 'redacted_thinking')
}

/**
 * Check if content blocks contain tool use
 */
function hasToolUse(content: string | ContentBlock[]): boolean {
  if (typeof content === 'string') return false
  return content.some(block => 
    block.type === 'tool_use' || 
    block.type === 'tool_result' || 
    block.type === 'server_tool_use' ||
    block.type === 'web_search_tool_result'
  )
}

/**
 * Check if content blocks contain images
 */
function hasImages(content: string | ContentBlock[]): boolean {
  if (typeof content === 'string') return false
  return content.some(block => block.type === 'image')
}

/**
 * Check if content blocks contain documents
 */
function hasDocuments(content: string | ContentBlock[]): boolean {
  if (typeof content === 'string') return false
  return content.some(block => block.type === 'document')
}

/**
 * Check if content blocks contain web search results
 */
function hasWebSearch(content: string | ContentBlock[]): boolean {
  if (typeof content === 'string') return false
  return content.some(block => 
    block.type === 'web_search_tool_result' || 
    block.type === 'web_search_result' ||
    block.type === 'server_tool_use'
  )
}

/**
 * Check if content blocks contain citations
 */
function hasCitations(content: string | ContentBlock[]): boolean {
  if (typeof content === 'string') return false
  return content.some(block => 
    block.type === 'text' && 
    'citations' in block && 
    block.citations && 
    block.citations.length > 0
  )
}

/**
 * Generate tags for a Claude Messages flow
 */
function getTags(flow: Flow): string[] {
  const tags: string[] = ['claude-messages']
  
  const request = safeParseJson<ClaudeMessagesRequest>(flow.request.body)
  
  if (request) {
    // Check if streaming
    if (request.stream || flow.isSSE) {
      tags.push('streaming')
    }
    
    // Check for thinking in request config
    if (request.thinking?.type === 'enabled') {
      tags.push('thinking')
    }
    
    // Check for tools in request
    if (request.tools && request.tools.length > 0) {
      tags.push('tools')
      
      // Check for specific tool types
      for (const tool of request.tools) {
        if ('type' in tool) {
          if (tool.type?.startsWith('web_search')) {
            if (!tags.includes('web-search')) tags.push('web-search')
          }
          if (tool.type?.startsWith('bash')) {
            if (!tags.includes('computer-use')) tags.push('computer-use')
          }
          if (tool.type?.startsWith('text_editor')) {
            if (!tags.includes('computer-use')) tags.push('computer-use')
          }
        }
      }
    }
    
    // Check messages for various content types
    for (const msg of request.messages) {
      if (hasThinking(msg.content)) {
        if (!tags.includes('thinking')) tags.push('thinking')
      }
      if (hasToolUse(msg.content)) {
        if (!tags.includes('tools')) tags.push('tools')
      }
      if (hasImages(msg.content)) {
        if (!tags.includes('vision')) tags.push('vision')
      }
      if (hasDocuments(msg.content)) {
        if (!tags.includes('documents')) tags.push('documents')
      }
      if (hasWebSearch(msg.content)) {
        if (!tags.includes('web-search')) tags.push('web-search')
      }
      if (hasCitations(msg.content)) {
        if (!tags.includes('citations')) tags.push('citations')
      }
    }
    
    // Check for caching
    const hasCache = request.messages.some(msg => {
      if (typeof msg.content === 'string') return false
      return msg.content.some(block => 'cache_control' in block && block.cache_control)
    }) || (
      typeof request.system !== 'string' && 
      request.system?.some(block => block.cache_control)
    )
    
    if (hasCache) {
      tags.push('caching')
    }
  }
  
  return tags
}

/**
 * Claude Messages Enhancer
 */
export const claudeMessagesEnhancer: FlowEnhancer = {
  id: 'claude-messages',
  name: 'Claude Messages API',
  match: isClaudeMessagesRequest,
  tags: getTags,
  
  RequestBodyComponent: ClaudeRequestBody,
  ResponseBodyComponent: ClaudeResponseBody,
  EventComponent: ClaudeEventView,
  
  transformRequestBody: (body: string) => safeParseJson<ClaudeMessagesRequest>(body),
  transformResponseBody: (body: string) => safeParseJson(body),
  transformEventData: (data: string) => safeParseJson(data),
}

// Auto-register
registerEnhancer(claudeMessagesEnhancer)

export * from './types'
