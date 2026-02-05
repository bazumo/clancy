import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { Duplex } from 'stream'
import {
  registerProvider,
  getProvider,
  setActiveProvider,
  getActiveProvider,
  tlsConnect,
  shutdownActiveProvider,
  getAvailableProviders,
  type TLSProvider,
  type TLSConnectOptions,
  type TLSFingerprint,
} from './tls-provider.js'
import { UtlsProvider } from './tls-provider-utls.js'

// ============================================================================
// Mock Provider for Unit Tests
// ============================================================================

class MockTLSProvider implements TLSProvider {
  readonly name = 'mock'
  private _ready = false
  public connectCalls: TLSConnectOptions[] = []
  public shouldFail = false
  public mockSocket: Duplex | null = null

  async initialize(): Promise<void> {
    if (this.shouldFail) {
      throw new Error('Mock initialization failed')
    }
    this._ready = true
  }

  async connect(options: TLSConnectOptions): Promise<Duplex> {
    this.connectCalls.push(options)
    if (this.shouldFail) {
      throw new Error('Mock connection failed')
    }
    // Return a mock duplex stream
    this.mockSocket = new Duplex({
      read() {},
      write(chunk, encoding, callback) {
        callback()
      },
    })
    return this.mockSocket
  }

  async shutdown(): Promise<void> {
    this._ready = false
  }

  isReady(): boolean {
    return this._ready
  }

  reset(): void {
    this.connectCalls = []
    this.shouldFail = false
    this._ready = false
    this.mockSocket = null
  }
}

// ============================================================================
// Provider Registry Tests
// ============================================================================

describe('TLS Provider Registry', () => {
  const mockProvider = new MockTLSProvider()

  beforeEach(async () => {
    mockProvider.reset()
    await shutdownActiveProvider()
  })

  afterAll(async () => {
    await shutdownActiveProvider()
  })

  it('should register a provider', () => {
    registerProvider(mockProvider)
    expect(getProvider('mock')).toBe(mockProvider)
  })

  it('should return undefined for unknown provider', () => {
    expect(getProvider('unknown')).toBeUndefined()
  })

  it('should list available providers', () => {
    registerProvider(mockProvider)
    const providers = getAvailableProviders()
    expect(providers).toContain('mock')
  })

  it('should set active provider and initialize it', async () => {
    registerProvider(mockProvider)
    await setActiveProvider('mock')
    
    expect(getActiveProvider()).toBe(mockProvider)
    expect(mockProvider.isReady()).toBe(true)
  })

  it('should throw when setting unknown provider as active', async () => {
    await expect(setActiveProvider('nonexistent')).rejects.toThrow(
      /not found/
    )
  })

  it('should connect using active provider', async () => {
    registerProvider(mockProvider)
    await setActiveProvider('mock')

    const socket = await tlsConnect({
      host: 'example.com',
      port: 443,
      fingerprint: 'chrome120',
    })

    expect(socket).toBeInstanceOf(Duplex)
    expect(mockProvider.connectCalls).toHaveLength(1)
    expect(mockProvider.connectCalls[0]).toEqual({
      host: 'example.com',
      port: 443,
      fingerprint: 'chrome120',
    })
  })

  it('should throw when connecting without active provider', async () => {
    await shutdownActiveProvider()
    await expect(
      tlsConnect({ host: 'example.com', port: 443, fingerprint: 'chrome120' })
    ).rejects.toThrow(/No active TLS provider/)
  })

  it('should shutdown active provider', async () => {
    registerProvider(mockProvider)
    await setActiveProvider('mock')
    expect(mockProvider.isReady()).toBe(true)

    await shutdownActiveProvider()
    expect(mockProvider.isReady()).toBe(false)
    expect(getActiveProvider()).toBeNull()
  })
})

// ============================================================================
// UtlsProvider Unit Tests
// ============================================================================

describe('UtlsProvider', () => {
  it('should have correct name', () => {
    const provider = new UtlsProvider()
    expect(provider.name).toBe('utls')
  })

  it('should set and get default fingerprint', () => {
    const provider = new UtlsProvider()
    expect(provider.getDefaultFingerprint()).toBe('electron')

    provider.setDefaultFingerprint('chrome120')
    expect(provider.getDefaultFingerprint()).toBe('chrome120')

    provider.setDefaultFingerprint('firefox120')
    expect(provider.getDefaultFingerprint()).toBe('firefox120')
  })

  it('should not be ready before initialization', () => {
    const provider = new UtlsProvider()
    expect(provider.isReady()).toBe(false)
  })

  it('should throw when connecting without initialization', async () => {
    const provider = new UtlsProvider()
    await expect(
      provider.connect({ host: 'example.com', port: 443, fingerprint: 'chrome120' })
    ).rejects.toThrow(/not ready/)
  })
})

// ============================================================================
// Integration Tests (require Go binary)
// These tests are skipped because they depend on external servers (httpbin.org)
// which now respond with HTTP/2, breaking HTTP/1.1 expectations
// ============================================================================

describe.skip('UtlsProvider Integration', () => {
  let provider: UtlsProvider

  beforeAll(async () => {
    provider = new UtlsProvider()
    
    // Try to initialize - skip tests if binary not available
    try {
      await provider.initialize()
    } catch {
      console.log('Skipping integration tests: Go binary not available')
    }
  }, 15000) // Longer timeout for initialization

  afterAll(async () => {
    await provider.shutdown()
  })

  it('should initialize successfully', () => {
    if (!provider.isReady()) {
      console.log('Skipping: provider not ready')
      return
    }
    expect(provider.isReady()).toBe(true)
  })

  it('should connect to a real HTTPS server', async () => {
    if (!provider.isReady()) {
      console.log('Skipping: provider not ready')
      return
    }

    const socket = await provider.connect({
      host: 'httpbin.org',
      port: 443,
      fingerprint: 'electron',
    })

    expect(socket).toBeInstanceOf(Duplex)

    // Send a simple HTTP request
    const request = 'GET /get HTTP/1.1\r\nHost: httpbin.org\r\nConnection: close\r\n\r\n'
    socket.write(request)

    // Read response
    const response = await readResponse(socket)
    
    expect(response).toContain('HTTP/1.1 200')
    expect(response).toContain('application/json')

    socket.destroy()
  }, 30000)

  it('should use specified fingerprint', async () => {
    if (!provider.isReady()) {
      console.log('Skipping: provider not ready')
      return
    }

    // Test with different fingerprints
    const fingerprints: TLSFingerprint[] = ['chrome120', 'firefox120', 'safari16']

    for (const fp of fingerprints) {
      const socket = await provider.connect({
        host: 'httpbin.org',
        port: 443,
        fingerprint: fp,
      })

      const request = 'GET /headers HTTP/1.1\r\nHost: httpbin.org\r\nConnection: close\r\n\r\n'
      socket.write(request)

      const response = await readResponse(socket)
      expect(response).toContain('HTTP/1.1 200')

      socket.destroy()
    }
  }, 60000)

  it('should handle connection errors gracefully', async () => {
    if (!provider.isReady()) {
      console.log('Skipping: provider not ready')
      return
    }

    // Try to connect to a non-existent host
    await expect(
      provider.connect({
        host: 'this-host-does-not-exist.invalid',
        port: 443,
        fingerprint: 'chrome120',
      })
    ).rejects.toThrow()
  }, 30000)

  it('should handle invalid port', async () => {
    if (!provider.isReady()) {
      console.log('Skipping: provider not ready')
      return
    }

    // Try to connect to localhost on a closed port (faster than remote host)
    // This should fail quickly with connection refused
    await expect(
      provider.connect({
        host: '127.0.0.1',
        port: 59999, // Unlikely to be open locally
        fingerprint: 'chrome120',
      })
    ).rejects.toThrow()
  }, 10000)

  it('should make POST request correctly', async () => {
    if (!provider.isReady()) {
      console.log('Skipping: provider not ready')
      return
    }

    const socket = await provider.connect({
      host: 'httpbin.org',
      port: 443,
      fingerprint: 'electron',
    })

    const body = '{"test":"data"}'
    const request = [
      'POST /post HTTP/1.1',
      'Host: httpbin.org',
      'Content-Type: application/json',
      `Content-Length: ${body.length}`,
      'Connection: close',
      '',
      body,
    ].join('\r\n')

    socket.write(request)

    const response = await readResponse(socket)
    
    expect(response).toContain('HTTP/1.1 200')
    expect(response).toContain('"test"')
    expect(response).toContain('"data"')

    socket.destroy()
  }, 30000)
})

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Read full response from a socket
 * Handles the case where data arrives before listeners are set up
 */
function readResponse(socket: Duplex, timeout = 10000): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    let resolved = false
    
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true
        // If we have any data, return it; otherwise timeout
        if (data.length > 0) {
          resolve(data)
        } else {
          reject(new Error('Response timeout'))
        }
      }
    }, timeout)

    const finish = () => {
      if (!resolved) {
        resolved = true
        clearTimeout(timer)
        resolve(data)
      }
    }

    socket.on('data', (chunk) => {
      data += chunk.toString('utf-8')
      // Check if we have a complete HTTP response (for Connection: close)
      if (data.includes('\r\n\r\n')) {
        // For Connection: close, wait for socket to close
        // But set a shorter timeout since we have data
        clearTimeout(timer)
        setTimeout(() => finish(), 1000)
      }
    })

    socket.on('end', finish)
    socket.on('close', finish)

    socket.on('error', (err) => {
      if (!resolved) {
        resolved = true
        clearTimeout(timer)
        reject(err)
      }
    })
  })
}

// ============================================================================
// Fingerprint Validation Tests
// ============================================================================

describe('Fingerprint Validation', () => {
  const validFingerprints: TLSFingerprint[] = [
    'chrome120',
    'chrome102',
    'chrome100',
    'firefox120',
    'firefox105',
    'firefox102',
    'safari16',
    'edge106',
    'edge85',
    'ios14',
    'android11',
    'electron',
    'randomized',
    'golanghttp2',
  ]

  it('should accept all valid fingerprints', () => {
    const provider = new UtlsProvider()
    
    for (const fp of validFingerprints) {
      // Should not throw
      provider.setDefaultFingerprint(fp)
      expect(provider.getDefaultFingerprint()).toBe(fp)
    }
  })
})

// ============================================================================
// Concurrent Connection Tests
// Skipped: depends on external server (httpbin.org) which responds with HTTP/2
// ============================================================================

describe.skip('Concurrent Connections', () => {
  let provider: UtlsProvider

  beforeAll(async () => {
    provider = new UtlsProvider()
    try {
      await provider.initialize()
    } catch {
      console.log('Skipping concurrent tests: Go binary not available')
    }
  }, 15000)

  afterAll(async () => {
    await provider.shutdown()
  })

  it('should handle multiple concurrent connections', async () => {
    if (!provider.isReady()) {
      console.log('Skipping: provider not ready')
      return
    }

    // Make 5 concurrent connections
    const promises = Array.from({ length: 5 }, async (_, i) => {
      const socket = await provider.connect({
        host: 'httpbin.org',
        port: 443,
        fingerprint: 'electron',
      })

      const request = `GET /get?id=${i} HTTP/1.1\r\nHost: httpbin.org\r\nConnection: close\r\n\r\n`
      socket.write(request)

      const response = await readResponse(socket)
      socket.destroy()
      
      return { id: i, success: response.includes('HTTP/1.1 200') }
    })

    const results = await Promise.all(promises)
    
    // All should succeed
    for (const result of results) {
      expect(result.success).toBe(true)
    }
  }, 60000)
})

// ============================================================================
// Provider Switching Tests
// ============================================================================

describe('Provider Switching', () => {
  const mockProvider1 = new MockTLSProvider()
  const mockProvider2 = new MockTLSProvider()

  beforeEach(async () => {
    mockProvider1.reset()
    mockProvider2.reset()
    // @ts-expect-error Override readonly name for testing
    mockProvider1.name = 'mock1'
    // @ts-expect-error Override readonly name for testing
    mockProvider2.name = 'mock2'
    await shutdownActiveProvider()
  })

  afterAll(async () => {
    await shutdownActiveProvider()
  })

  it('should switch between providers', async () => {
    // @ts-expect-error Mock provider with dynamic name
    registerProvider(mockProvider1)
    // @ts-expect-error Mock provider with dynamic name
    registerProvider(mockProvider2)

    await setActiveProvider('mock1')
    expect(getActiveProvider()?.name).toBe('mock1')
    expect(mockProvider1.isReady()).toBe(true)

    await setActiveProvider('mock2')
    expect(getActiveProvider()?.name).toBe('mock2')
    expect(mockProvider2.isReady()).toBe(true)
    // Previous provider should be shut down
    expect(mockProvider1.isReady()).toBe(false)
  })

  it('should not shutdown when switching to same provider', async () => {
    // @ts-expect-error Mock provider with dynamic name
    registerProvider(mockProvider1)

    await setActiveProvider('mock1')
    expect(mockProvider1.isReady()).toBe(true)

    // Switch to same provider
    await setActiveProvider('mock1')
    expect(mockProvider1.isReady()).toBe(true)
  })
})

