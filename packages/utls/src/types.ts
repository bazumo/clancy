import type { Duplex } from 'stream'

/**
 * Available TLS fingerprint profiles
 */
export type TLSFingerprint =
  | 'chrome120'
  | 'chrome102'
  | 'chrome100'
  | 'firefox120'
  | 'firefox105'
  | 'firefox102'
  | 'safari16'
  | 'edge106'
  | 'edge85'
  | 'ios14'
  | 'android11'
  | 'electron'
  | 'randomized'
  | 'golanghttp2'

/**
 * Options for establishing a TLS connection
 */
export interface TLSConnectOptions {
  host: string
  port: number
  fingerprint?: TLSFingerprint
}

/**
 * Abstract interface for TLS providers
 * Implementations must provide socket-like bidirectional streams
 */
export interface TLSProvider {
  /**
   * Provider name for logging/debugging
   */
  readonly name: string

  /**
   * Initialize the provider (spawn processes, etc.)
   */
  initialize(): Promise<void>

  /**
   * Establish a TLS connection to the target
   * Returns a duplex stream that can be used like a socket
   */
  connect(options: TLSConnectOptions): Promise<Duplex>

  /**
   * Shutdown the provider and clean up resources
   */
  shutdown(): Promise<void>

  /**
   * Check if the provider is ready to accept connections
   */
  isReady(): boolean
}
