/**
 * Shared type definitions for E2E tests
 */
import type http from 'http'

export type Compression = 'none' | 'gzip' | 'deflate' | 'br' | 'zstd'
export type TransferMode = 'content-length' | 'chunked'
export type Protocol = 'http' | 'https'

export interface TestCase {
  protocol: Protocol
  compression: Compression
  transferMode: TransferMode
  bodySize: number
}

export interface ReceivedRequest {
  method: string
  url: string
  headers: Record<string, string | string[] | undefined>
  body: string
}

export interface RequestOptions {
  method?: string
  path?: string
  query?: Record<string, string>
  headers?: Record<string, string>
  body?: string | Buffer
  timeout?: number
}

export interface ResponseData {
  status: number
  headers: http.IncomingHttpHeaders
  body: string
  connectionClosed: boolean
}

export interface SSEEvent {
  event?: string
  data: string
  id?: string
}

export interface SSEResponseData extends ResponseData {
  events: SSEEvent[]
}

export interface BedrockChunk {
  bytes?: string
  type?: string
  delta?: {
    type?: string
    text?: string
  }
  message_start?: unknown
  message_delta?: unknown
  message_stop?: unknown
}

export interface BedrockResponseData extends ResponseData {
  chunks: BedrockChunk[]
}

export interface TestContext {
  proxyPort: number
  httpTargetPort: number
  httpsTargetPort: number
  receivedRequests: ReceivedRequest[]
  cleanup: () => Promise<void>
  clearRequests: () => void
  clearFlows: () => Promise<void>
  getFlows: () => Promise<{ count: number; flows: unknown[] }>
}

export interface ProxyHandle {
  port: number
  stop: () => Promise<void>
  clearFlows: () => Promise<void>
  getFlows: () => Promise<{ count: number; flows: unknown[] }>
}

export interface ServerHandle {
  port: number
  server: http.Server | import('https').Server
  close: () => Promise<void>
}

export interface WebSocketConnection {
  send: (data: string) => void
  onMessage: (callback: (data: string) => void) => void
  close: () => void
  isClosed: () => boolean
}

export interface TargetServerOptions {
  receivedRequests?: ReceivedRequest[]
}

export interface ProxyStartOptions {
  port?: number
  tlsProvider?: 'native' | 'utls'
  timeout?: number
}

export interface SetupTestEnvironmentOptions {
  tlsProvider?: 'native' | 'utls'
  proxyTimeout?: number
}
