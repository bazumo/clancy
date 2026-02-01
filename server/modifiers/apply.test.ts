import { describe, it, expect, beforeEach } from 'vitest'
import type { Flow } from '../../shared/types'
import type { FlowModifier } from './types'
import { registerModifier } from './registry'
import { applyRequestModifiers, applyResponseModifiers } from './apply'

describe.skip('Modifier Application', () => {
  let modifiers: FlowModifier[]

  beforeEach(async () => {
    // Clear registry
    const registry = await import('./registry.js')
    modifiers = registry.getModifiers()
    modifiers.length = 0
  })

  describe('applyRequestModifiers', () => {
    it('should apply request modifications', async () => {
      registerModifier({
        id: 'add-header',
        name: 'Add Header',
        match: () => true,
        modifyRequest: (req) => ({
          ...req,
          headers: { ...req.headers, 'X-Custom': 'test' },
        }),
      })

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

      expect(result.headers['X-Custom']).toBe('test')
    })

    it('should update content-length when body is modified', async () => {
      registerModifier({
        id: 'modify-body',
        name: 'Modify Body',
        match: () => true,
        modifyRequest: (req) => ({
          ...req,
          body: JSON.stringify({ modified: true }),
        }),
      })

      const flow: Flow = {
        id: 'flow-1',
        timestamp: new Date().toISOString(),
        host: 'example.com',
        type: 'https',
        request: {
          method: 'POST',
          url: 'https://example.com/api',
          path: '/api',
          headers: {},
          body: JSON.stringify({ original: true }),
        },
      }

      const request = {
        method: 'POST',
        url: 'https://example.com/api',
        path: '/api',
        host: 'example.com',
        headers: {},
        body: JSON.stringify({ original: true }),
      }

      const result = await applyRequestModifiers(flow, request)

      expect(result.body).toBe(JSON.stringify({ modified: true }))
      expect(result.headers['content-length']).toBe('17')
    })

    it('should apply multiple modifiers in sequence', async () => {
      registerModifier({
        id: 'mod1',
        name: 'Modifier 1',
        match: () => true,
        modifyRequest: (req) => ({
          ...req,
          headers: { ...req.headers, 'X-First': '1' },
        }),
      })

      registerModifier({
        id: 'mod2',
        name: 'Modifier 2',
        match: () => true,
        modifyRequest: (req) => ({
          ...req,
          headers: { ...req.headers, 'X-Second': '2' },
        }),
      })

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

      expect(result.headers['X-First']).toBe('1')
      expect(result.headers['X-Second']).toBe('2')
    })

    it('should skip non-matching modifiers', async () => {
      registerModifier({
        id: 'non-matching',
        name: 'Non-matching',
        match: () => false,
        modifyRequest: (req) => ({
          ...req,
          headers: { ...req.headers, 'X-Should-Not-Exist': 'true' },
        }),
      })

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

      expect(result.headers['X-Should-Not-Exist']).toBeUndefined()
    })
  })

  describe('applyResponseModifiers', () => {
    it('should apply response modifications', async () => {
      registerModifier({
        id: 'add-header',
        name: 'Add Header',
        match: () => true,
        modifyResponse: (res) => ({
          ...res,
          headers: { ...res.headers, 'X-Modified': 'true' },
        }),
      })

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

      const response = {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: 'original',
      }

      const request = {
        method: 'GET',
        url: 'https://example.com/api',
        path: '/api',
        host: 'example.com',
        headers: {},
        body: '',
      }

      const result = await applyResponseModifiers(flow, response, request)

      expect(result.headers['X-Modified']).toBe('true')
    })

    it('should update content-length and remove transfer-encoding when body is modified', async () => {
      registerModifier({
        id: 'modify-body',
        name: 'Modify Body',
        match: () => true,
        modifyResponse: (res) => ({
          ...res,
          body: 'modified body',
        }),
      })

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

      const response = {
        status: 200,
        statusText: 'OK',
        headers: { 'transfer-encoding': 'chunked' },
        body: 'original',
      }

      const request = {
        method: 'GET',
        url: 'https://example.com/api',
        path: '/api',
        host: 'example.com',
        headers: {},
        body: '',
      }

      const result = await applyResponseModifiers(flow, response, request)

      expect(result.body).toBe('modified body')
      expect(result.headers['content-length']).toBe('13')
      expect(result.headers['transfer-encoding']).toBeUndefined()
    })

    it('should handle async modifiers', async () => {
      registerModifier({
        id: 'async-mod',
        name: 'Async Modifier',
        match: () => true,
        modifyResponse: async (res) => {
          await new Promise((resolve) => setTimeout(resolve, 10))
          return {
            ...res,
            body: 'async modified',
          }
        },
      })

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

      const response = {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: 'original',
      }

      const request = {
        method: 'GET',
        url: 'https://example.com/api',
        path: '/api',
        host: 'example.com',
        headers: {},
        body: '',
      }

      const result = await applyResponseModifiers(flow, response, request)

      expect(result.body).toBe('async modified')
    })
  })
})
