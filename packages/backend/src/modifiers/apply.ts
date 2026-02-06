import type { Flow } from '@clancyapp/shared'
import type { FlowRequest, FlowResponse } from './types.js'
import { matchModifiers } from './registry.js'

/**
 * Apply request modifiers to a flow before forwarding to upstream
 */
export async function applyRequestModifiers(
  flow: Flow,
  request: {
    method: string
    url: string
    path: string
    host: string
    headers: Record<string, string>
    body?: string
  }
): Promise<{
  method: string
  path: string
  headers: Record<string, string>
  body?: string
}> {
  const matches = matchModifiers(flow)

  if (matches.length === 0) {
    return request
  }

  let modifiedRequest: FlowRequest = {
    method: request.method,
    url: request.url,
    path: request.path,
    host: request.host,
    headers: { ...request.headers },
    body: request.body || '',
  }

  // Apply each modifier in sequence
  for (const match of matches) {
    if (match.modifier.modifyRequest) {
      try {
        modifiedRequest = await match.modifier.modifyRequest(modifiedRequest)
      } catch (err) {
        console.error(
          `[Modifier] Error in request modifier "${match.modifier.name}":`,
          (err as Error).message
        )
      }
    }
  }

  // Update Content-Length if body was modified
  if (modifiedRequest.body !== undefined && modifiedRequest.body !== request.body) {
    const bodyLength = Buffer.byteLength(modifiedRequest.body, 'utf-8')
    modifiedRequest.headers['content-length'] = bodyLength.toString()
  }

  return {
    method: modifiedRequest.method,
    path: modifiedRequest.path,
    headers: modifiedRequest.headers,
    body: modifiedRequest.body || undefined,
  }
}

/**
 * Apply response modifiers to a flow before sending to client
 * Note: Only applies to non-streaming responses
 */
export async function applyResponseModifiers(
  flow: Flow,
  response: {
    status: number
    statusText: string
    headers: Record<string, string>
    body: string
  },
  request: {
    method: string
    url: string
    path: string
    host: string
    headers: Record<string, string>
    body: string
  }
): Promise<{
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
}> {
  const matches = matchModifiers(flow)

  if (matches.length === 0) {
    return response
  }

  let modifiedResponse: FlowResponse = {
    status: response.status,
    statusText: response.statusText,
    headers: { ...response.headers },
    body: response.body,
  }

  // Apply each modifier in sequence
  for (const match of matches) {
    if (match.modifier.modifyResponse) {
      try {
        modifiedResponse = await match.modifier.modifyResponse(modifiedResponse, request)
      } catch (err) {
        console.error(
          `[Modifier] Error in response modifier "${match.modifier.name}":`,
          (err as Error).message
        )
      }
    }
  }

  // Update Content-Length if body was modified
  if (modifiedResponse.body !== response.body) {
    const bodyLength = Buffer.byteLength(modifiedResponse.body, 'utf-8')
    modifiedResponse.headers['content-length'] = bodyLength.toString()
    // Remove transfer-encoding if present (we're sending the full body now)
    delete modifiedResponse.headers['transfer-encoding']
  }

  return modifiedResponse
}
