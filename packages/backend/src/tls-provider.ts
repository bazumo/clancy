import { Duplex } from 'stream'

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
  fingerprint: TLSFingerprint
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

/**
 * Registry of available TLS providers
 */
const providers = new Map<string, TLSProvider>()

/**
 * Current active provider
 */
let activeProvider: TLSProvider | null = null

/**
 * Register a TLS provider
 */
export function registerProvider(provider: TLSProvider): void {
  providers.set(provider.name, provider)
}

/**
 * Get a provider by name
 */
export function getProvider(name: string): TLSProvider | undefined {
  return providers.get(name)
}

/**
 * Set the active TLS provider
 */
export async function setActiveProvider(name: string): Promise<void> {
  const provider = providers.get(name)
  if (!provider) {
    throw new Error(`TLS provider '${name}' not found. Available: ${Array.from(providers.keys()).join(', ')}`)
  }

  if (activeProvider && activeProvider !== provider) {
    await activeProvider.shutdown()
  }

  if (!provider.isReady()) {
    await provider.initialize()
  }

  activeProvider = provider
  console.log(`[TLS] Active provider: ${name}`)
}

/**
 * Get the active TLS provider
 */
export function getActiveProvider(): TLSProvider | null {
  return activeProvider
}

/**
 * Connect using the active provider
 */
export async function tlsConnect(options: TLSConnectOptions): Promise<Duplex> {
  if (!activeProvider) {
    throw new Error('No active TLS provider. Call setActiveProvider() first.')
  }
  return activeProvider.connect(options)
}

/**
 * Shutdown the active provider
 */
export async function shutdownActiveProvider(): Promise<void> {
  if (activeProvider) {
    await activeProvider.shutdown()
    activeProvider = null
  }
}

/**
 * Get list of available providers
 */
export function getAvailableProviders(): string[] {
  return Array.from(providers.keys())
}

