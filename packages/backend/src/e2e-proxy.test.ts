import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  setupTestEnvironment,
  httpThroughProxy,
  httpsThroughProxy,
  type TestContext
} from './test-utils/index.js'

describe('E2E Proxy Tests', () => {
  let ctx: TestContext

  beforeAll(async () => {
    ctx = await setupTestEnvironment()
  }, 60000)

  afterAll(() => ctx.cleanup())

  it('should proxy HTTP GET request', async () => {
    const res = await httpThroughProxy(ctx.proxyPort, ctx.httpTargetPort, { path: '/' })
    expect(res.status).toBe(200)
    expect(JSON.parse(res.body).ok).toBe(true)
  })

  it('should proxy HTTP POST with body', async () => {
    const postBody = JSON.stringify({ test: 'data' })
    const res = await httpThroughProxy(ctx.proxyPort, ctx.httpTargetPort, {
      path: '/echo',
      method: 'POST',
      body: postBody
    })
    expect(res.status).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.receivedBody).toBe(postBody)
  })

  it('should proxy HTTPS request via CONNECT', async () => {
    const res = await httpsThroughProxy(ctx.proxyPort, ctx.httpsTargetPort, { path: '/' })
    expect(res.status).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.ok).toBe(true)
  })

  it('should handle gzip compression', async () => {
    const res = await httpThroughProxy(ctx.proxyPort, ctx.httpTargetPort, { path: '/gzip' })
    expect(res.status).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.compressed).toBe(true)
    expect(body.method).toBe('gzip')
  })

  it('should handle deflate compression', async () => {
    const res = await httpThroughProxy(ctx.proxyPort, ctx.httpTargetPort, { path: '/deflate' })
    expect(res.status).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.compressed).toBe(true)
    expect(body.method).toBe('deflate')
  })

  it('should handle chunked transfer encoding', async () => {
    const res = await httpThroughProxy(ctx.proxyPort, ctx.httpTargetPort, { path: '/chunked' })
    expect(res.status).toBe(200)
    expect(res.body).toBe('chunk1-chunk2-chunk3')
  })

  it('should record requests', async () => {
    ctx.receivedRequests.length = 0
    await httpThroughProxy(ctx.proxyPort, ctx.httpTargetPort, { path: '/test' })
    expect(ctx.receivedRequests.length).toBeGreaterThan(0)
    expect(ctx.receivedRequests[0].url).toBe('/test')
  })

  it('should handle various response sizes', async () => {
    const sizes = [100, 1000, 5000]
    for (const size of sizes) {
      const res = await httpThroughProxy(ctx.proxyPort, ctx.httpTargetPort, {
        path: `/size/${size}`
      })
      expect(res.status).toBe(200)
      expect(res.body.length).toBe(size)
    }
  })
})
