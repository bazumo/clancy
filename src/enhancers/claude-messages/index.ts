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
  return content.some(block => block.type === 'thinking')
}

/**
 * Check if content blocks contain tool use
 */
function hasToolUse(content: string | ContentBlock[]): boolean {
  if (typeof content === 'string') return false
  return content.some(block => block.type === 'tool_use' || block.type === 'tool_result')
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
    }
    
    // Check messages for thinking/tools
    for (const msg of request.messages) {
      if (hasThinking(msg.content)) {
        if (!tags.includes('thinking')) tags.push('thinking')
      }
      if (hasToolUse(msg.content)) {
        if (!tags.includes('tools')) tags.push('tools')
      }
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

