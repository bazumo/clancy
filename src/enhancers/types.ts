import type { Flow, SSEEvent } from '../../shared/types'

export interface RequestBodyProps {
  flow: Flow
  body: string
  parsed: unknown
}

export interface ResponseBodyProps {
  flow: Flow
  body: string
  parsed: unknown
}

export interface EventProps {
  flow: Flow
  event: SSEEvent
  parsed: unknown
}

export interface FlowEnhancer {
  id: string
  name: string
  
  /** Determine if this enhancer applies to a flow */
  match: (flow: Flow) => boolean
  
  /** Generate tags for a matched flow */
  tags: (flow: Flow) => string[]
  
  /** Optional custom renderer for request body */
  RequestBodyComponent?: React.ComponentType<RequestBodyProps>
  
  /** Optional custom renderer for response body */
  ResponseBodyComponent?: React.ComponentType<ResponseBodyProps>
  
  /** Optional custom renderer for SSE events */
  EventComponent?: React.ComponentType<EventProps>
  
  /** Optional transform for request body (JSON string -> typed object) */
  transformRequestBody?: (body: string) => unknown
  
  /** Optional transform for response body (JSON string -> typed object) */
  transformResponseBody?: (body: string) => unknown
  
  /** Optional transform for event data (JSON string -> typed object) */
  transformEventData?: (data: string) => unknown
}

export interface EnhancerMatch {
  enhancer: FlowEnhancer
  tags: string[]
}

