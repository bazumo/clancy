import type { Flow } from '@clancyapp/shared'

export type { Flow }

export interface FlowRequest {
  method: string
  url: string
  path: string
  host: string
  headers: Record<string, string>
  body: string
}

export interface FlowResponse {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
}

export interface FlowModifier {
  id: string
  name: string
  description?: string

  // Determines if this modifier should be applied to the flow
  match: (flow: Flow) => boolean

  // Optional: modify request before sending upstream
  // Return modified request or original if no changes needed
  modifyRequest?: (request: FlowRequest) => FlowRequest | Promise<FlowRequest>

  // Optional: modify response before sending to client
  // Return modified response or original if no changes needed
  // Note: Only applies to non-streaming responses
  modifyResponse?: (response: FlowResponse, request: FlowRequest) =>
    FlowResponse | Promise<FlowResponse>
}

export interface ModifierMatch {
  modifier: FlowModifier
}
