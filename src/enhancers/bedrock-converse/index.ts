import type { Flow } from '../../../shared/types'
import type { FlowEnhancer } from '../types'
import { registerEnhancer } from '../registry'
import type { ConverseStreamRequest, ConverseContentBlock } from './types'
import { ConverseRequestBody } from './components/ConverseRequestBody'
import { ConverseResponseBody } from './components/ConverseResponseBody'
import { ConverseEventView } from './components/ConverseEventView'

/**
 * Check if a flow is a Bedrock Converse API request
 * Bedrock Converse URLs look like: /model/{model-id}/converse or /model/{model-id}/converse-stream
 */
function isBedrockConverseRequest(flow: Flow): boolean {
  const path = flow.request.path.split('?')[0]
  const isBedrockHost = flow.host.includes('bedrock-runtime') && flow.host.includes('amazonaws.com')
  const isConversePath = /^\/model\/[^/]+\/converse(-stream)?$/.test(path)

  return isBedrockHost && isConversePath && flow.request.method === 'POST'
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
 * Check if content blocks contain tool use
 */
function hasToolUse(content: ConverseContentBlock[]): boolean {
  return content.some(block => 'toolUse' in block || 'toolResult' in block)
}

/**
 * Check if content blocks contain reasoning (thinking)
 */
function hasReasoning(content: ConverseContentBlock[]): boolean {
  return content.some(block => 'reasoningContent' in block)
}

/**
 * Check if content blocks contain cache points
 */
function hasCachePoint(content: ConverseContentBlock[]): boolean {
  return content.some(block => 'cachePoint' in block)
}

/**
 * Extract model name from Bedrock path
 */
function extractModelFromPath(path: string): string | null {
  const match = path.match(/^\/model\/([^/]+)\/converse/)
  return match ? decodeURIComponent(match[1]) : null
}

/**
 * Generate tags for a Bedrock Converse flow
 */
function getTags(flow: Flow): string[] {
  const tags: string[] = ['bedrock-converse']

  // Add model as a tag if we can extract it
  const model = extractModelFromPath(flow.request.path.split('?')[0])
  if (model) {
    // Check if it's a Claude model
    if (model.includes('claude') || model.includes('anthropic')) {
      tags.push('claude')
    }
    // Check for other known model families
    if (model.includes('titan')) {
      tags.push('titan')
    }
    if (model.includes('llama')) {
      tags.push('llama')
    }
    if (model.includes('mistral')) {
      tags.push('mistral')
    }
    if (model.includes('cohere')) {
      tags.push('cohere')
    }
  }

  const request = safeParseJson<ConverseStreamRequest>(flow.request.body)

  if (request) {
    // Check if streaming
    if (flow.request.path.includes('converse-stream') || flow.isSSE) {
      tags.push('streaming')
    }

    // Check for thinking in additionalModelRequestFields (Anthropic-specific)
    if (request.additionalModelRequestFields?.thinking?.type === 'enabled') {
      tags.push('thinking')
    }

    // Check for tools in request
    if (request.toolConfig?.tools && request.toolConfig.tools.length > 0) {
      tags.push('tools')
    }

    // Check messages for reasoning/tools
    for (const msg of request.messages) {
      if (hasReasoning(msg.content)) {
        if (!tags.includes('thinking')) tags.push('thinking')
      }
      if (hasToolUse(msg.content)) {
        if (!tags.includes('tools')) tags.push('tools')
      }
    }

    // Check for guardrails
    if (request.guardrailConfig) {
      tags.push('guardrail')
    }

    // Check for caching (cache points in system or messages)
    const hasCaching = 
      (request.system?.some(block => 'cachePoint' in block)) ||
      request.messages.some(msg => hasCachePoint(msg.content))
    
    if (hasCaching) {
      tags.push('caching')
    }
  }

  return tags
}

/**
 * Bedrock Converse API Enhancer
 */
export const bedrockConverseEnhancer: FlowEnhancer = {
  id: 'bedrock-converse',
  name: 'AWS Bedrock Converse API',
  match: isBedrockConverseRequest,
  tags: getTags,

  RequestBodyComponent: ConverseRequestBody,
  ResponseBodyComponent: ConverseResponseBody,
  EventComponent: ConverseEventView,

  transformRequestBody: (body: string) => safeParseJson<ConverseStreamRequest>(body),
  transformResponseBody: (body: string) => safeParseJson(body),
  transformEventData: (data: string) => safeParseJson(data),
}

// Auto-register
registerEnhancer(bedrockConverseEnhancer)
