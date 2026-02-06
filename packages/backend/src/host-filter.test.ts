import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Flow } from '@clancyapp/shared'
import { createServer, type ClancyServer } from './server.js'
import { hostMatchesPattern, hostMatchesAny, createHostFilter, normalizePattern } from './host-filter.js'
import { findFreePorts } from './test-utils/ports.js'
import { createHttpsTargetServer } from './test-utils/target-servers.js'
import { httpsThroughProxy } from './test-utils/http-clients.js'
import type { ServerHandle } from './test-utils/types.js'

async function getFlows(proxyPort: number): Promise<Flow[]> {
  const res = await fetch(`http://localhost:${proxyPort}/api/flows`)
  const data = (await res.json()) as { flows: Flow[] }
  return data.flows
}

async function clearFlows(proxyPort: number): Promise<void> {
  await fetch(`http://localhost:${proxyPort}/api/flows`, { method: 'DELETE' })
}

// ── Unit tests for matching logic ───────────────────────────────

describe('normalizePattern', () => {
  it('should strip trailing :port from patterns', () => {
    expect(normalizePattern('example.com:443')).toBe('example.com')
    expect(normalizePattern('api.example.com:8080')).toBe('api.example.com')
  })

  it('should leave patterns without a port unchanged', () => {
    expect(normalizePattern('example.com')).toBe('example.com')
    expect(normalizePattern('*.example.com')).toBe('*.example.com')
  })

  it('should not strip wildcard-port patterns', () => {
    // ":*" is not all digits, so it stays
    expect(normalizePattern('example.com:*')).toBe('example.com:*')
  })
})

describe('hostMatchesPattern', () => {
  it('should match exact hostnames', () => {
    expect(hostMatchesPattern('example.com', 'example.com')).toBe(true)
    expect(hostMatchesPattern('example.com', 'other.com')).toBe(false)
  })

  it('should match leading wildcard (subdomain)', () => {
    expect(hostMatchesPattern('fonts.googleapis.com', '*.googleapis.com')).toBe(true)
    expect(hostMatchesPattern('maps.googleapis.com', '*.googleapis.com')).toBe(true)
    expect(hostMatchesPattern('googleapis.com', '*.googleapis.com')).toBe(false)
    expect(hostMatchesPattern('evil.com.googleapis.com', '*.googleapis.com')).toBe(true)
  })

  it('should match trailing wildcard (TLD)', () => {
    expect(hostMatchesPattern('api.google.com', 'api.google.*')).toBe(true)
    expect(hostMatchesPattern('api.google.co.uk', 'api.google.*')).toBe(true)
    expect(hostMatchesPattern('web.google.com', 'api.google.*')).toBe(false)
  })

  it('should match middle wildcard', () => {
    expect(hostMatchesPattern('api.us-east-1.amazonaws.com', 'api.*.amazonaws.com')).toBe(true)
    expect(hostMatchesPattern('api.eu-west-1.amazonaws.com', 'api.*.amazonaws.com')).toBe(true)
    expect(hostMatchesPattern('s3.us-east-1.amazonaws.com', 'api.*.amazonaws.com')).toBe(false)
  })

  it('should match contains wildcard', () => {
    expect(hostMatchesPattern('cdn.example.com', '*cdn*')).toBe(true)
    expect(hostMatchesPattern('my-cdn-host.net', '*cdn*')).toBe(true)
    expect(hostMatchesPattern('example.com', '*cdn*')).toBe(false)
  })

  it('should match catch-all wildcard', () => {
    expect(hostMatchesPattern('anything.com', '*')).toBe(true)
    expect(hostMatchesPattern('', '*')).toBe(true)
  })

  it('should handle dots correctly (not as regex wildcards)', () => {
    // "api.example.com" should NOT match "apixexample.com" — the dot is literal
    expect(hostMatchesPattern('apixexamplexcom', 'api.example.com')).toBe(false)
  })
})

describe('hostMatchesAny', () => {
  it('should return true if host matches any pattern', () => {
    expect(hostMatchesAny('fonts.googleapis.com', ['*.googleapis.com', 'cdn.example.com'])).toBe(
      true
    )
    expect(hostMatchesAny('cdn.example.com', ['*.googleapis.com', 'cdn.example.com'])).toBe(true)
  })

  it('should return false if host matches no patterns', () => {
    expect(hostMatchesAny('api.stripe.com', ['*.googleapis.com', 'cdn.example.com'])).toBe(false)
  })
})

describe('createHostFilter', () => {
  it('should return true for all hosts when no filter is set', () => {
    const filter = createHostFilter()
    expect(filter('anything.com')).toBe(true)
    expect(filter('localhost')).toBe(true)
  })

  it('should return true only for matching hosts with includeHosts', () => {
    const filter = createHostFilter(['api.example.com', '*.googleapis.com'])
    expect(filter('api.example.com')).toBe(true)
    expect(filter('fonts.googleapis.com')).toBe(true)
    expect(filter('other.com')).toBe(false)
  })

  it('should return false only for matching hosts with excludeHosts', () => {
    const filter = createHostFilter(undefined, ['*.googleapis.com', 'cdn.example.com'])
    expect(filter('fonts.googleapis.com')).toBe(false)
    expect(filter('cdn.example.com')).toBe(false)
    expect(filter('api.stripe.com')).toBe(true)
  })

  it('should prefer includeHosts when both are provided', () => {
    // includeHosts takes precedence (both should never be set, but testing the logic)
    const filter = createHostFilter(['api.example.com'], ['other.com'])
    expect(filter('api.example.com')).toBe(true)
    expect(filter('other.com')).toBe(false)
  })

  it('should strip :port from patterns before matching', () => {
    const include = createHostFilter(['bedrock-runtime.us-east-1.amazonaws.com:443'])
    expect(include('bedrock-runtime.us-east-1.amazonaws.com')).toBe(true)
    expect(include('other.com')).toBe(false)

    const exclude = createHostFilter(undefined, ['fonts.googleapis.com:443'])
    expect(exclude('fonts.googleapis.com')).toBe(false)
    expect(exclude('api.stripe.com')).toBe(true)
  })

  it('should strip :port from wildcard patterns before matching', () => {
    const filter = createHostFilter(['*.amazonaws.com:443'])
    expect(filter('bedrock-runtime.us-east-1.amazonaws.com')).toBe(true)
    expect(filter('other.com')).toBe(false)
  })
})

// ── E2E tests ───────────────────────────────────────────────────

describe('Host Filtering (e2e)', () => {
  let httpsTarget: ServerHandle

  beforeAll(async () => {
    httpsTarget = await createHttpsTargetServer()
  }, 15000)

  afterAll(async () => {
    await httpsTarget.close()
  })

  // ── includeHosts: host NOT in list → tunnel ─────────────────────

  describe('includeHosts — host NOT in list (should tunnel)', () => {
    let proxy: ClancyServer
    let proxyPort: number

    beforeAll(async () => {
      const [port] = await findFreePorts(1)
      proxyPort = port
      proxy = createServer({
        port: proxyPort,
        host: 'localhost',
        includeHosts: ['other.example.com'], // localhost is NOT included
      })
      await proxy.start()
    }, 15000)

    afterAll(() => proxy.stop())

    it('should create a filtered CONNECT flow', async () => {
      await clearFlows(proxyPort)

      const res = await httpsThroughProxy(proxyPort, httpsTarget.port)
      expect(res.status).toBe(200)

      await new Promise((r) => setTimeout(r, 300))
      const flows = await getFlows(proxyPort)

      const filtered = flows.filter((f) => f.filtered === true)
      expect(filtered).toHaveLength(1)
      expect(filtered[0].request.method).toBe('CONNECT')
      expect(filtered[0].type).toBe('https')
      expect(filtered[0].host).toContain('localhost')
    })

    it('should not create intercepted HTTP request flows', async () => {
      await clearFlows(proxyPort)

      await httpsThroughProxy(proxyPort, httpsTarget.port)
      await new Promise((r) => setTimeout(r, 300))
      const flows = await getFlows(proxyPort)

      // No GET flows — TLS was not intercepted so individual requests aren't visible
      const getFlows_ = flows.filter((f) => f.request.method === 'GET')
      expect(getFlows_).toHaveLength(0)
    })
  })

  // ── includeHosts: host IN list → intercept ──────────────────────

  describe('includeHosts — host IN list (should intercept)', () => {
    let proxy: ClancyServer
    let proxyPort: number

    beforeAll(async () => {
      const [port] = await findFreePorts(1)
      proxyPort = port
      proxy = createServer({
        port: proxyPort,
        host: 'localhost',
        includeHosts: ['localhost'], // localhost IS included
      })
      await proxy.start()
    }, 15000)

    afterAll(() => proxy.stop())

    it('should intercept TLS and create detailed HTTP flows', async () => {
      await clearFlows(proxyPort)

      const res = await httpsThroughProxy(proxyPort, httpsTarget.port)
      expect(res.status).toBe(200)

      await new Promise((r) => setTimeout(r, 500))
      const flows = await getFlows(proxyPort)

      // Should NOT have filtered flows
      const filtered = flows.filter((f) => f.filtered === true)
      expect(filtered).toHaveLength(0)

      // Should have an intercepted GET flow
      const getFlows_ = flows.filter((f) => f.request.method === 'GET')
      expect(getFlows_.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ── includeHosts with wildcard → intercept matching ─────────────

  describe('includeHosts — wildcard match (should intercept)', () => {
    let proxy: ClancyServer
    let proxyPort: number

    beforeAll(async () => {
      const [port] = await findFreePorts(1)
      proxyPort = port
      proxy = createServer({
        port: proxyPort,
        host: 'localhost',
        includeHosts: ['local*'], // matches "localhost" via wildcard
      })
      await proxy.start()
    }, 15000)

    afterAll(() => proxy.stop())

    it('should intercept hosts matching a wildcard include pattern', async () => {
      await clearFlows(proxyPort)

      const res = await httpsThroughProxy(proxyPort, httpsTarget.port)
      expect(res.status).toBe(200)

      await new Promise((r) => setTimeout(r, 500))
      const flows = await getFlows(proxyPort)

      const filtered = flows.filter((f) => f.filtered === true)
      expect(filtered).toHaveLength(0)

      const getFlows_ = flows.filter((f) => f.request.method === 'GET')
      expect(getFlows_.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ── excludeHosts: host IN list → tunnel ─────────────────────────

  describe('excludeHosts — host IN list (should tunnel)', () => {
    let proxy: ClancyServer
    let proxyPort: number

    beforeAll(async () => {
      const [port] = await findFreePorts(1)
      proxyPort = port
      proxy = createServer({
        port: proxyPort,
        host: 'localhost',
        excludeHosts: ['localhost'], // localhost IS excluded
      })
      await proxy.start()
    }, 15000)

    afterAll(() => proxy.stop())

    it('should create a filtered CONNECT flow', async () => {
      await clearFlows(proxyPort)

      const res = await httpsThroughProxy(proxyPort, httpsTarget.port)
      expect(res.status).toBe(200)

      await new Promise((r) => setTimeout(r, 300))
      const flows = await getFlows(proxyPort)

      const filtered = flows.filter((f) => f.filtered === true)
      expect(filtered).toHaveLength(1)
      expect(filtered[0].request.method).toBe('CONNECT')
    })

    it('should pipe data through the tunnel correctly', async () => {
      const res = await httpsThroughProxy(proxyPort, httpsTarget.port, {
        path: '/echo',
        method: 'POST',
        body: JSON.stringify({ hello: 'tunnel' }),
      })
      expect(res.status).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.receivedBody).toContain('tunnel')
    })
  })

  // ── excludeHosts with wildcard → tunnel matching ────────────────

  describe('excludeHosts — wildcard match (should tunnel)', () => {
    let proxy: ClancyServer
    let proxyPort: number

    beforeAll(async () => {
      const [port] = await findFreePorts(1)
      proxyPort = port
      proxy = createServer({
        port: proxyPort,
        host: 'localhost',
        excludeHosts: ['local*'], // matches "localhost" via wildcard
      })
      await proxy.start()
    }, 15000)

    afterAll(() => proxy.stop())

    it('should tunnel hosts matching a wildcard exclude pattern', async () => {
      await clearFlows(proxyPort)

      const res = await httpsThroughProxy(proxyPort, httpsTarget.port)
      expect(res.status).toBe(200)

      await new Promise((r) => setTimeout(r, 300))
      const flows = await getFlows(proxyPort)

      const filtered = flows.filter((f) => f.filtered === true)
      expect(filtered).toHaveLength(1)
      expect(filtered[0].request.method).toBe('CONNECT')
    })
  })

  // ── excludeHosts: host NOT in list → intercept ──────────────────

  describe('excludeHosts — host NOT in list (should intercept)', () => {
    let proxy: ClancyServer
    let proxyPort: number

    beforeAll(async () => {
      const [port] = await findFreePorts(1)
      proxyPort = port
      proxy = createServer({
        port: proxyPort,
        host: 'localhost',
        excludeHosts: ['other.example.com'], // localhost NOT excluded
      })
      await proxy.start()
    }, 15000)

    afterAll(() => proxy.stop())

    it('should intercept TLS and create detailed HTTP flows', async () => {
      await clearFlows(proxyPort)

      const res = await httpsThroughProxy(proxyPort, httpsTarget.port)
      expect(res.status).toBe(200)

      await new Promise((r) => setTimeout(r, 500))
      const flows = await getFlows(proxyPort)

      const filtered = flows.filter((f) => f.filtered === true)
      expect(filtered).toHaveLength(0)

      const getFlows_ = flows.filter((f) => f.request.method === 'GET')
      expect(getFlows_.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ── no filter (default) → intercept everything ──────────────────

  describe('no filter (default)', () => {
    let proxy: ClancyServer
    let proxyPort: number

    beforeAll(async () => {
      const [port] = await findFreePorts(1)
      proxyPort = port
      proxy = createServer({
        port: proxyPort,
        host: 'localhost',
      })
      await proxy.start()
    }, 15000)

    afterAll(() => proxy.stop())

    it('should intercept all hosts by default', async () => {
      await clearFlows(proxyPort)

      const res = await httpsThroughProxy(proxyPort, httpsTarget.port)
      expect(res.status).toBe(200)

      await new Promise((r) => setTimeout(r, 500))
      const flows = await getFlows(proxyPort)

      const filtered = flows.filter((f) => f.filtered === true)
      expect(filtered).toHaveLength(0)

      const getFlows_ = flows.filter((f) => f.request.method === 'GET')
      expect(getFlows_.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ── filtered flow shape ─────────────────────────────────────────

  describe('filtered flow shape', () => {
    let proxy: ClancyServer
    let proxyPort: number

    beforeAll(async () => {
      const [port] = await findFreePorts(1)
      proxyPort = port
      proxy = createServer({
        port: proxyPort,
        host: 'localhost',
        excludeHosts: ['localhost'],
      })
      await proxy.start()
    }, 15000)

    afterAll(() => proxy.stop())

    it('should have all expected flow properties', async () => {
      await clearFlows(proxyPort)

      await httpsThroughProxy(proxyPort, httpsTarget.port)
      await new Promise((r) => setTimeout(r, 300))
      const flows = await getFlows(proxyPort)

      expect(flows).toHaveLength(1)
      const flow = flows[0]

      expect(flow.filtered).toBe(true)
      expect(flow.request.method).toBe('CONNECT')
      expect(flow.type).toBe('https')
      expect(flow.host).toBe(`localhost:${httpsTarget.port}`)
      expect(flow.request.url).toBe(`localhost:${httpsTarget.port}`)
      expect(flow.request.path).toBe('/')
      expect(flow.id).toBeDefined()
      expect(flow.timestamp).toBeDefined()
      expect(flow.response).toBeUndefined()
    })

    it('should preserve CONNECT request headers', async () => {
      await clearFlows(proxyPort)

      await httpsThroughProxy(proxyPort, httpsTarget.port)
      await new Promise((r) => setTimeout(r, 300))
      const flows = await getFlows(proxyPort)

      const flow = flows[0]
      expect(flow.request.headers).toBeDefined()
      expect(typeof flow.request.headers).toBe('object')
    })
  })

  // ── multiple requests through same tunnel ───────────────────────

  describe('multiple requests through tunnel', () => {
    let proxy: ClancyServer
    let proxyPort: number

    beforeAll(async () => {
      const [port] = await findFreePorts(1)
      proxyPort = port
      proxy = createServer({
        port: proxyPort,
        host: 'localhost',
        excludeHosts: ['localhost'],
      })
      await proxy.start()
    }, 15000)

    afterAll(() => proxy.stop())

    it('should handle concurrent tunneled connections', async () => {
      await clearFlows(proxyPort)

      // Make multiple concurrent HTTPS requests through tunnels
      const results = await Promise.all([
        httpsThroughProxy(proxyPort, httpsTarget.port, { path: '/' }),
        httpsThroughProxy(proxyPort, httpsTarget.port, {
          path: '/echo',
          method: 'POST',
          body: 'test1',
        }),
        httpsThroughProxy(proxyPort, httpsTarget.port, {
          path: '/echo',
          method: 'POST',
          body: 'test2',
        }),
      ])

      // All requests should succeed through their tunnels
      for (const res of results) {
        expect(res.status).toBe(200)
      }

      await new Promise((r) => setTimeout(r, 300))
      const flows = await getFlows(proxyPort)

      // Each CONNECT creates one filtered flow
      const filtered = flows.filter((f) => f.filtered === true)
      expect(filtered).toHaveLength(3)

      // All should be CONNECT method
      for (const flow of filtered) {
        expect(flow.request.method).toBe('CONNECT')
        expect(flow.filtered).toBe(true)
      }
    })
  })
})
