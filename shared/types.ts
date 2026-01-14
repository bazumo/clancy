export interface FlowRequest {
  method: string
  url: string
  path: string
  headers: Record<string, string | string[] | undefined>
  body?: string
}

export interface SSEEvent {
  eventId: string
  flowId: string
  event?: string
  data: string
  id?: string
  retry?: string
  timestamp: string
}

export interface FlowResponse {
  status: number
  statusText: string
  headers: Record<string, string | string[] | undefined>
  body?: string
}

export interface Flow {
  id: string
  timestamp: string
  host: string
  type: 'http' | 'https'
  request: FlowRequest
  response?: FlowResponse
  duration?: number
  isSSE?: boolean
  hasRawHttp?: boolean  // Whether raw HTTP is available via API
}
