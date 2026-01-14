import type { Flow } from '../../../shared/types'
import type { FlowEnhancer } from '../types'
import { registerEnhancer } from '../registry'
import type { ClaudeMessagesRequest, ContentBlock } from '../claude-messages/types'
// Reuse Claude components since the message format is the same
import { ClaudeRequestBody } from '../claude-messages/components/ClaudeRequestBody'
import { ClaudeResponseBody } from '../claude-messages/components/ClaudeResponseBody'
import { ClaudeEventView } from '../claude-messages/components/ClaudeEventView'

/**
 * Check if a flow is a Bedrock Messages API request
 * Bedrock URLs look like: /model/{model-id}/invoke or /model/{model-id}/invoke-with-response-stream
 */
function isBedrockMessagesRequest(flow: Flow): boolean {
  const path = flow.request.path.split('?')[0]
  const isBedrockHost = flow.host.includes('bedrock-runtime') && flow.host.includes('amazonaws.com')
  const isInvokePath = /^\/model\/[^/]+\/invoke(-with-response-stream)?$/.test(path)
  
  return isBedrockHost && isInvokePath && flow.request.method === 'POST'
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
 * Extract model name from Bedrock path
 */
function extractModelFromPath(path: string): string | null {
  const match = path.match(/^\/model\/([^/]+)\/invoke/)
  return match ? match[1] : null
}

/**
 * Generate tags for a Bedrock Messages flow
 */
function getTags(flow: Flow): string[] {
  const tags: string[] = ['bedrock-messages']
  
  // Add model as a tag if we can extract it
  const model = extractModelFromPath(flow.request.path.split('?')[0])
  if (model) {
    // Check if it's a Claude model
    if (model.includes('claude') || model.includes('anthropic')) {
      tags.push('claude')
    }
  }
  
  const request = safeParseJson<ClaudeMessagesRequest>(flow.request.body)
  
  if (request) {
    // Check if streaming
    if (flow.request.path.includes('invoke-with-response-stream') || flow.isSSE) {
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
 * Bedrock Messages Enhancer - reuses Claude components since the message format is identical
 */
export const bedrockMessagesEnhancer: FlowEnhancer = {
  id: 'bedrock-messages',
  name: 'AWS Bedrock Messages API',
  match: isBedrockMessagesRequest,
  tags: getTags,
  
  // Reuse Claude components - the request/response format is the same
  RequestBodyComponent: ClaudeRequestBody,
  ResponseBodyComponent: ClaudeResponseBody,
  EventComponent: ClaudeEventView,
  
  transformRequestBody: (body: string) => safeParseJson<ClaudeMessagesRequest>(body),
  transformResponseBody: (body: string) => safeParseJson(body),
  transformEventData: (data: string) => safeParseJson(data),
}

// Auto-register
registerEnhancer(bedrockMessagesEnhancer)

