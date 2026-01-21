/**
 * Comprehensive E2E tests for the proxy server
 * Tests all combinations of:
 * - Protocol: HTTP, HTTPS
 * - Compression: none, gzip, deflate, br, zstd
 * - Transfer mode: content-length, chunked
 * - SSE streaming
 * - Bedrock streaming
 * - Connection close verification
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  setupTestEnvironment,
  httpThroughProxy,
  httpsThroughProxy,
  sseRequest,
  generateResponseMatrix,
  generateStreamMatrix,
  formatTestCase,
  type TestContext
} from './test-utils/index.js'

describe('E2E Comprehensive Tests', () => {
  let ctx: TestContext

  beforeAll(async () => {
    ctx = await setupTestEnvironment({ verbose: false })
  }, 60000)

  afterAll(() => ctx.cleanup())

  describe('HTTP Response Variations', () => {
    const testCases = generateResponseMatrix({
      protocols: ['http'],
      compressions: ['none', 'gzip', 'deflate', 'br', 'zstd'],
      transferModes: ['content-length', 'chunked'],
      bodySizes: [100, 5000]
    })

    for (const tc of testCases) {
      it(formatTestCase(tc), async () => {
        const res = await httpThroughProxy(ctx.proxyPort, ctx.httpTargetPort, {
          path: '/test',
          query: {
            compression: tc.compression,
            transfer: tc.transferMode,
            size: String(tc.bodySize)
          }
        })

        expect(res.status).toBe(200)
        expect(res.body.length).toBe(tc.bodySize)

        // Verify connection close
        expect(res.connectionClosed).toBe(true)
      })
    }
  })

  describe('HTTPS Response Variations', () => {
    const testCases = generateResponseMatrix({
      protocols: ['https'],
      compressions: ['none', 'gzip', 'deflate', 'br', 'zstd'],
      transferModes: ['content-length', 'chunked'],
      bodySizes: [100, 5000]
    })

    for (const tc of testCases) {
      it(formatTestCase(tc), async () => {
        const res = await httpsThroughProxy(ctx.proxyPort, ctx.httpsTargetPort, {
          path: '/test',
          query: {
            compression: tc.compression,
            transfer: tc.transferMode,
            size: String(tc.bodySize)
          }
        })

        expect(res.status).toBe(200)
        expect(res.body.length).toBe(tc.bodySize)

        // Verify connection close
        expect(res.connectionClosed).toBe(true)
      })
    }
  })

  describe('SSE Streams (HTTP)', () => {
    const testCases = generateStreamMatrix({
      protocols: ['http'],
      compressions: ['none', 'gzip'],
      transferModes: ['chunked'],
      eventCounts: [5, 10]
    })

    for (const tc of testCases) {
      it(`SSE ${tc.compression} (${tc.bodySize} events)`, async () => {
        const { events, connectionClosed } = await sseRequest(
          ctx.proxyPort,
          ctx.httpTargetPort,
          false,
          {
            path: '/sse',
            query: {
              compression: tc.compression,
              count: String(tc.bodySize),
              delay: '20'
            },
            eventLimit: tc.bodySize
          }
        )

        expect(events.length).toBe(tc.bodySize)

        // Verify event structure
        for (let i = 0; i < events.length; i++) {
          expect(events[i].data).toBeDefined()
          expect(events[i].data.count).toBe(i + 1)
          expect(events[i].data.total).toBe(tc.bodySize)
        }

        // Verify connection closes properly
        expect(connectionClosed).toBe(true)
      })
    }
  })

  describe('SSE Streams (HTTPS)', () => {
    const testCases = generateStreamMatrix({
      protocols: ['https'],
      compressions: ['none', 'gzip'],
      transferModes: ['chunked'],
      eventCounts: [5, 10]
    })

    for (const tc of testCases) {
      it(`SSE ${tc.compression} (${tc.bodySize} events)`, async () => {
        const { events, connectionClosed } = await sseRequest(
          ctx.proxyPort,
          ctx.httpsTargetPort,
          true,
          {
            path: '/sse',
            query: {
              compression: tc.compression,
              count: String(tc.bodySize),
              delay: '20'
            },
            eventLimit: tc.bodySize
          }
        )

        expect(events.length).toBe(tc.bodySize)

        // Verify event structure
        for (let i = 0; i < events.length; i++) {
          expect(events[i].data).toBeDefined()
          expect(events[i].data.count).toBe(i + 1)
          expect(events[i].data.total).toBe(tc.bodySize)
        }

        // Verify connection closes properly
        expect(connectionClosed).toBe(true)
      })
    }
  })

  describe('Bedrock Streams (HTTP)', () => {
    const compressions: Array<'none' | 'gzip'> = ['none', 'gzip']

    for (const compression of compressions) {
      it(`Bedrock stream ${compression}`, async () => {
        const res = await httpThroughProxy(ctx.proxyPort, ctx.httpTargetPort, {
          path: '/bedrock',
          query: {
            compression,
            count: '5',
            delay: '20'
          }
        })

        expect(res.status).toBe(200)
        expect(res.headers['content-type']).toBe('application/vnd.amazon.eventstream')

        // Parse event stream
        const lines = res.body.split('\n')
        const events: any[] = []

        for (let i = 0; i < lines.length; i++) {
          if (lines[i].startsWith('data: ')) {
            const data = lines[i].slice(6).trim()
            try {
              events.push(JSON.parse(data))
            } catch (e) {
              // Ignore parse errors
            }
          }
        }

        // Should have: message_start, content_block_start, 5x content_block_delta,
        // content_block_stop, message_delta, message_stop
        expect(events.length).toBeGreaterThanOrEqual(5)

        // Verify structure
        const hasStart = events.some(e => e.type === 'message_start')
        const hasDeltas = events.some(e => e.type === 'content_block_delta')
        const hasStop = events.some(e => e.type === 'message_stop')

        expect(hasStart).toBe(true)
        expect(hasDeltas).toBe(true)
        expect(hasStop).toBe(true)

        // Verify connection close
        expect(res.connectionClosed).toBe(true)
      })
    }
  })

  describe('Bedrock Streams (HTTPS)', () => {
    const compressions: Array<'none' | 'gzip'> = ['none', 'gzip']

    for (const compression of compressions) {
      it(`Bedrock stream ${compression}`, async () => {
        const res = await httpsThroughProxy(ctx.proxyPort, ctx.httpsTargetPort, {
          path: '/bedrock',
          query: {
            compression,
            count: '5',
            delay: '20'
          }
        })

        expect(res.status).toBe(200)
        expect(res.headers['content-type']).toBe('application/vnd.amazon.eventstream')

        // Parse event stream
        const lines = res.body.split('\n')
        const events: any[] = []

        for (let i = 0; i < lines.length; i++) {
          if (lines[i].startsWith('data: ')) {
            const data = lines[i].slice(6).trim()
            try {
              events.push(JSON.parse(data))
            } catch (e) {
              // Ignore parse errors
            }
          }
        }

        // Should have multiple events
        expect(events.length).toBeGreaterThanOrEqual(5)

        // Verify structure
        const hasStart = events.some(e => e.type === 'message_start')
        const hasDeltas = events.some(e => e.type === 'content_block_delta')
        const hasStop = events.some(e => e.type === 'message_stop')

        expect(hasStart).toBe(true)
        expect(hasDeltas).toBe(true)
        expect(hasStop).toBe(true)

        // Verify connection close
        expect(res.connectionClosed).toBe(true)
      })
    }
  })

  describe('Edge Cases', () => {
    it('should handle empty response', async () => {
      const res = await httpThroughProxy(ctx.proxyPort, ctx.httpTargetPort, {
        path: '/empty'
      })
      expect(res.status).toBe(204)
      expect(res.connectionClosed).toBe(true)
    })

    it('should handle large body (50KB)', async () => {
      const res = await httpThroughProxy(ctx.proxyPort, ctx.httpTargetPort, {
        path: '/size/51200'
      })
      expect(res.status).toBe(200)
      expect(res.body.length).toBe(51200)
      expect(res.connectionClosed).toBe(true)
    })

    it('should handle multiple compressions in sequence', async () => {
      const compressions: Array<'none' | 'gzip' | 'deflate' | 'br' | 'zstd'> = ['gzip', 'deflate', 'br', 'zstd']

      for (const compression of compressions) {
        const res = await httpThroughProxy(ctx.proxyPort, ctx.httpTargetPort, {
          query: { compression, size: '1000' }
        })
        expect(res.status).toBe(200)
        expect(res.body.length).toBe(1000)
        expect(res.connectionClosed).toBe(true)
      }
    })

    it('should handle POST with large body', async () => {
      const largeBody = 'x'.repeat(10000)
      const res = await httpThroughProxy(ctx.proxyPort, ctx.httpTargetPort, {
        path: '/echo',
        method: 'POST',
        body: largeBody
      })
      expect(res.status).toBe(200)
      const parsed = JSON.parse(res.body)
      expect(parsed.receivedBody).toBe(largeBody)
      expect(res.connectionClosed).toBe(true)
    })
  })

  describe('Connection Management', () => {
    it('should properly close connections for multiple sequential requests', async () => {
      const results = []

      for (let i = 0; i < 5; i++) {
        const res = await httpThroughProxy(ctx.proxyPort, ctx.httpTargetPort, {
          path: '/test',
          query: { size: '100' }
        })
        results.push(res)
      }

      // All connections should be closed
      for (const res of results) {
        expect(res.connectionClosed).toBe(true)
      }
    })

    it('should handle rapid sequential requests', async () => {
      const promises = []

      for (let i = 0; i < 10; i++) {
        promises.push(
          httpThroughProxy(ctx.proxyPort, ctx.httpTargetPort, {
            path: '/test',
            query: { size: '50' }
          })
        )
      }

      const results = await Promise.all(promises)

      // All should succeed with proper cleanup
      for (const res of results) {
        expect(res.status).toBe(200)
        expect(res.body.length).toBe(50)
        expect(res.connectionClosed).toBe(true)
      }
    })
  })
})
