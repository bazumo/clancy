import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { Duplex } from 'stream'
import https from 'https'
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
import { UtlsProvider, isBinaryAvailable } from '@clancy/utls'

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
// Integration Tests (require Go binary + local HTTPS server)
// ============================================================================

// Generate self-signed cert for local test server
async function generateSelfSignedCert() {
  const forge = await import('node-forge')
  const pki = forge.pki
  const keys = pki.rsa.generateKeyPair(2048)
  const cert = pki.createCertificate()
  cert.publicKey = keys.publicKey
  cert.serialNumber = '01'
  cert.validity.notBefore = new Date()
  cert.validity.notAfter = new Date()
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1)
  const attrs = [
    { name: 'commonName', value: 'localhost' },
    { name: 'organizationName', value: 'Test' }
  ]
  cert.setSubject(attrs)
  cert.setIssuer(attrs)
  cert.setExtensions([
    { name: 'subjectAltName', altNames: [{ type: 2, value: 'localhost' }] }
  ])
  cert.sign(keys.privateKey)
  return {
    key: pki.privateKeyToPem(keys.privateKey),
    cert: pki.certificateToPem(cert)
  }
}

describe.skipIf(!isBinaryAvailable())('UtlsProvider Integration', () => {
  let provider: UtlsProvider
  let server: https.Server
  let serverPort: number

  beforeAll(async () => {
    // Start local HTTPS server
    const creds = await generateSelfSignedCert()
    server = https.createServer(creds, (req, res) => {
      const url = new URL(req.url || '/', `https://localhost`)

      if (url.pathname === '/get') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ url: req.url, headers: req.headers }))
        return
      }

      if (url.pathname === '/headers') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ headers: req.headers }))
        return
      }

      if (url.pathname === '/post' && req.method === 'POST') {
        let body = ''
        req.on('data', (chunk: Buffer) => { body += chunk })
        req.on('end', () => {
          let parsed
          try { parsed = JSON.parse(body) } catch { parsed = body }
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ data: parsed }))
        })
        return
      }

      res.writeHead(404)
      res.end('Not Found')
    })

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address()
        serverPort = typeof addr === 'object' && addr ? addr.port : 0
        resolve()
      })
    })

    provider = new UtlsProvider()
    await provider.initialize()
  }, 15000)

  afterAll(async () => {
    await provider.shutdown()
    await new Promise<void>((resolve) => { server.close(() => resolve()) })
  })

  it('should initialize successfully', () => {
    expect(provider.isReady()).toBe(true)
  })

  it('should connect to a real HTTPS server', async () => {
    const socket = await provider.connect({
      host: 'localhost',
      port: serverPort,
      fingerprint: 'electron',
    })

    expect(socket).toBeInstanceOf(Duplex)

    const request = `GET /get HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`
    socket.write(request)

    const response = await readResponse(socket)

    expect(response).toContain('HTTP/1.1 200')
    expect(response).toContain('application/json')

    socket.destroy()
  }, 30000)

  it('should use specified fingerprint', async () => {
    const fingerprints: TLSFingerprint[] = ['chrome120', 'firefox120', 'safari16']

    for (const fp of fingerprints) {
      const socket = await provider.connect({
        host: 'localhost',
        port: serverPort,
        fingerprint: fp,
      })

      const request = `GET /headers HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`
      socket.write(request)

      const response = await readResponse(socket)
      expect(response).toContain('HTTP/1.1 200')

      socket.destroy()
    }
  }, 60000)

  it('should handle connection errors gracefully', async () => {
    await expect(
      provider.connect({
        host: 'this-host-does-not-exist.invalid',
        port: 443,
        fingerprint: 'chrome120',
      })
    ).rejects.toThrow()
  }, 30000)

  it('should handle invalid port', async () => {
    await expect(
      provider.connect({
        host: '127.0.0.1',
        port: 59999,
        fingerprint: 'chrome120',
      })
    ).rejects.toThrow()
  }, 10000)

  it('should make POST request correctly', async () => {
    const socket = await provider.connect({
      host: 'localhost',
      port: serverPort,
      fingerprint: 'electron',
    })

    const body = '{"test":"data"}'
    const request = [
      'POST /post HTTP/1.1',
      `Host: localhost`,
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
// ============================================================================

describe.skipIf(!isBinaryAvailable())('Concurrent Connections', () => {
  let provider: UtlsProvider
  let server: https.Server
  let serverPort: number

  beforeAll(async () => {
    const creds = await generateSelfSignedCert()
    server = https.createServer(creds, (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ url: req.url }))
    })

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address()
        serverPort = typeof addr === 'object' && addr ? addr.port : 0
        resolve()
      })
    })

    provider = new UtlsProvider()
    await provider.initialize()
  }, 15000)

  afterAll(async () => {
    await provider.shutdown()
    await new Promise<void>((resolve) => { server.close(() => resolve()) })
  })

  it('should handle multiple concurrent connections', async () => {
    // Make 5 concurrent connections
    const promises = Array.from({ length: 5 }, async (_, i) => {
      const socket = await provider.connect({
        host: 'localhost',
        port: serverPort,
        fingerprint: 'electron',
      })

      const request = `GET /get?id=${i} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`
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
    registerProvider(mockProvider1)
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
    registerProvider(mockProvider1)

    await setActiveProvider('mock1')
    expect(mockProvider1.isReady()).toBe(true)

    // Switch to same provider
    await setActiveProvider('mock1')
    expect(mockProvider1.isReady()).toBe(true)
  })
})

