import { describe, it, expect, beforeEach } from 'vitest'
import type { Flow } from '../../shared/types'
import type { FlowModifier } from './types'
import { registerModifier } from './registry'

describe.skip('Modifier Integration Tests', () => {
  let modifiers: FlowModifier[]

  beforeEach(async () => {
    // Clear registry
    const registry = await import('./registry.js')
    modifiers = registry.getModifiers()
    modifiers.length = 0
  })

  describe('Real-world scenarios', () => {
    it('should mock Claude API response', async () => {
      registerModifier({
        id: 'mock-claude',
        name: 'Mock Claude',
        match: (flow) =>
          flow.host.includes('anthropic.com') &&
          flow.request.path === '/v1/messages',
        modifyResponse: (res) => ({
          ...res,
          status: 200,
          body: JSON.stringify({
            id: 'msg_mock',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'Mocked response' }],
            model: 'claude-3-5-sonnet-20241022',
            stop_reason: 'end_turn',
            usage: { input_tokens: 10, output_tokens: 5 },
          }),
        }),
      })

      const { applyResponseModifiers } = await import('./apply.js')

      const flow: Flow = {
        id: 'flow-1',
        timestamp: new Date().toISOString(),
        host: 'api.anthropic.com',
        type: 'https',
        request: {
          method: 'POST',
          url: 'https://api.anthropic.com/v1/messages',
          path: '/v1/messages',
          headers: {},
          body: JSON.stringify({
            model: 'claude-3-5-sonnet-20241022',
            messages: [{ role: 'user', content: 'Hello' }],
          }),
        },
      }

      const response = {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ original: 'response' }),
      }

      const request = {
        method: 'POST',
        url: 'https://api.anthropic.com/v1/messages',
        path: '/v1/messages',
        host: 'api.anthropic.com',
        headers: {},
        body: flow.request.body || '',
      }

      const result = await applyResponseModifiers(flow, response, request)

      const parsed = JSON.parse(result.body)
      expect(parsed.id).toBe('msg_mock')
      expect(parsed.content[0].text).toBe('Mocked response')
    })

    it('should inject authentication token', async () => {
      registerModifier({
        id: 'add-auth',
        name: 'Add Auth',
        match: (flow) => flow.host.includes('secure-api.com'),
        modifyRequest: (req) => ({
          ...req,
          headers: {
            ...req.headers,
            Authorization: 'Bearer secret-token',
          },
        }),
      })

      const { applyRequestModifiers } = await import('./apply.js')

      const flow: Flow = {
        id: 'flow-1',
        timestamp: new Date().toISOString(),
        host: 'secure-api.com',
        type: 'https',
        request: {
          method: 'GET',
          url: 'https://secure-api.com/data',
          path: '/data',
          headers: {},
        },
      }

      const request = {
        method: 'GET',
        url: 'https://secure-api.com/data',
        path: '/data',
        host: 'secure-api.com',
        headers: {},
        body: undefined,
      }

      const result = await applyRequestModifiers(flow, request)

      expect(result.headers.Authorization).toBe('Bearer secret-token')
    })

    it('should modify JSON request body', async () => {
      registerModifier({
        id: 'modify-json',
        name: 'Modify JSON',
        match: (flow) => flow.host === 'api.example.com',
        modifyRequest: (req) => {
          const body = JSON.parse(req.body)
          body.modified = true
          body.timestamp = '2024-01-01T00:00:00Z'
          return { ...req, body: JSON.stringify(body) }
        },
      })

      const { applyRequestModifiers } = await import('./apply.js')

      const flow: Flow = {
        id: 'flow-1',
        timestamp: new Date().toISOString(),
        host: 'api.example.com',
        type: 'https',
        request: {
          method: 'POST',
          url: 'https://api.example.com/submit',
          path: '/submit',
          headers: {},
          body: JSON.stringify({ data: 'test' }),
        },
      }

      const request = {
        method: 'POST',
        url: 'https://api.example.com/submit',
        path: '/submit',
        host: 'api.example.com',
        headers: {},
        body: JSON.stringify({ data: 'test' }),
      }

      const result = await applyRequestModifiers(flow, request)

      const parsed = JSON.parse(result.body || '{}')
      expect(parsed.data).toBe('test')
      expect(parsed.modified).toBe(true)
      expect(parsed.timestamp).toBe('2024-01-01T00:00:00Z')
    })

    it('should chain multiple modifiers', async () => {
      registerModifier({
        id: 'add-timestamp',
        name: 'Add Timestamp',
        match: () => true,
        modifyRequest: (req) => ({
          ...req,
          headers: { ...req.headers, 'X-Timestamp': Date.now().toString() },
        }),
      })

      registerModifier({
        id: 'add-user-agent',
        name: 'Add User Agent',
        match: () => true,
        modifyRequest: (req) => ({
          ...req,
          headers: { ...req.headers, 'User-Agent': 'Clancy/1.0' },
        }),
      })

      registerModifier({
        id: 'add-tracking',
        name: 'Add Tracking',
        match: () => true,
        modifyRequest: (req) => ({
          ...req,
          headers: { ...req.headers, 'X-Request-ID': 'req-123' },
        }),
      })

      const { applyRequestModifiers } = await import('./apply.js')

      const flow: Flow = {
        id: 'flow-1',
        timestamp: new Date().toISOString(),
        host: 'example.com',
        type: 'https',
        request: {
          method: 'GET',
          url: 'https://example.com/api',
          path: '/api',
          headers: {},
        },
      }

      const request = {
        method: 'GET',
        url: 'https://example.com/api',
        path: '/api',
        host: 'example.com',
        headers: {},
        body: undefined,
      }

      const result = await applyRequestModifiers(flow, request)

      expect(result.headers['X-Timestamp']).toBeDefined()
      expect(result.headers['User-Agent']).toBe('Clancy/1.0')
      expect(result.headers['X-Request-ID']).toBe('req-123')
    })
  })
})
