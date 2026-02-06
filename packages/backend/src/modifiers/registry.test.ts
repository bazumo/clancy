import { describe, it, expect, beforeEach } from 'vitest'
import type { Flow } from '@clancyapp/shared'
import type { FlowModifier } from './types'

describe.skip('Modifier Registry', () => {
  // Import registry functions
  let registerModifier: (modifier: FlowModifier) => void
  let getModifiers: () => FlowModifier[]
  let matchModifiers: (flow: Flow) => Array<{ modifier: FlowModifier }>
  let hasModifiers: (flow: Flow) => boolean

  beforeEach(async () => {
    // Import registry dynamically
    const registry = await import('./registry.js')
    registerModifier = registry.registerModifier
    getModifiers = registry.getModifiers
    matchModifiers = registry.matchModifiers
    hasModifiers = registry.hasModifiers

    // Clear any existing modifiers
    const modifiers = getModifiers()
    modifiers.length = 0
  })

  describe('registerModifier', () => {
    it('should register a new modifier', () => {
      const modifier: FlowModifier = {
        id: 'test-modifier',
        name: 'Test Modifier',
        match: () => true,
      }

      registerModifier(modifier)

      const registered = getModifiers()
      expect(registered).toHaveLength(1)
      expect(registered[0]).toBe(modifier)
    })

    it('should not register duplicate modifiers with same id', () => {
      const modifier1: FlowModifier = {
        id: 'duplicate',
        name: 'First',
        match: () => true,
      }

      const modifier2: FlowModifier = {
        id: 'duplicate',
        name: 'Second',
        match: () => false,
      }

      registerModifier(modifier1)
      registerModifier(modifier2)

      const registered = getModifiers()
      expect(registered).toHaveLength(1)
      expect(registered[0].name).toBe('First')
    })

    it('should register multiple different modifiers', () => {
      const modifiers: FlowModifier[] = [
        { id: 'mod1', name: 'Modifier 1', match: () => true },
        { id: 'mod2', name: 'Modifier 2', match: () => true },
        { id: 'mod3', name: 'Modifier 3', match: () => true },
      ]

      modifiers.forEach(registerModifier)

      const registered = getModifiers()
      expect(registered).toHaveLength(3)
    })
  })

  describe('matchModifiers', () => {
    it('should return modifiers that match the flow', () => {
      const modifier1: FlowModifier = {
        id: 'matching',
        name: 'Matching',
        match: (flow) => flow.host === 'example.com',
      }

      const modifier2: FlowModifier = {
        id: 'non-matching',
        name: 'Non-matching',
        match: (flow) => flow.host === 'other.com',
      }

      registerModifier(modifier1)
      registerModifier(modifier2)

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

      const matches = matchModifiers(flow)
      expect(matches).toHaveLength(1)
      expect(matches[0].modifier.id).toBe('matching')
    })

    it('should return multiple matching modifiers', () => {
      const modifier1: FlowModifier = {
        id: 'mod1',
        name: 'Mod 1',
        match: (flow) => flow.type === 'https',
      }

      const modifier2: FlowModifier = {
        id: 'mod2',
        name: 'Mod 2',
        match: (flow) => flow.host.includes('example'),
      }

      registerModifier(modifier1)
      registerModifier(modifier2)

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

      const matches = matchModifiers(flow)
      expect(matches).toHaveLength(2)
    })

    it('should return empty array when no modifiers match', () => {
      const modifier: FlowModifier = {
        id: 'non-matching',
        name: 'Non-matching',
        match: () => false,
      }

      registerModifier(modifier)

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

      const matches = matchModifiers(flow)
      expect(matches).toHaveLength(0)
    })

    it('should handle complex matching logic', () => {
      const modifier: FlowModifier = {
        id: 'complex',
        name: 'Complex Matcher',
        match: (flow) =>
          flow.host.includes('anthropic.com') &&
          flow.request.path === '/v1/messages' &&
          flow.request.method === 'POST',
      }

      registerModifier(modifier)

      const matchingFlow: Flow = {
        id: 'flow-1',
        timestamp: new Date().toISOString(),
        host: 'api.anthropic.com',
        type: 'https',
        request: {
          method: 'POST',
          url: 'https://api.anthropic.com/v1/messages',
          path: '/v1/messages',
          headers: {},
        },
      }

      const nonMatchingFlow: Flow = {
        id: 'flow-2',
        timestamp: new Date().toISOString(),
        host: 'api.anthropic.com',
        type: 'https',
        request: {
          method: 'GET',
          url: 'https://api.anthropic.com/v1/models',
          path: '/v1/models',
          headers: {},
        },
      }

      expect(matchModifiers(matchingFlow)).toHaveLength(1)
      expect(matchModifiers(nonMatchingFlow)).toHaveLength(0)
    })
  })

  describe('hasModifiers', () => {
    it('should return true when flow has matching modifiers', () => {
      const modifier: FlowModifier = {
        id: 'test',
        name: 'Test',
        match: (flow) => flow.host === 'example.com',
      }

      registerModifier(modifier)

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

      expect(hasModifiers(flow)).toBe(true)
    })

    it('should return false when flow has no matching modifiers', () => {
      const modifier: FlowModifier = {
        id: 'test',
        name: 'Test',
        match: () => false,
      }

      registerModifier(modifier)

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

      expect(hasModifiers(flow)).toBe(false)
    })

    it('should return false when no modifiers are registered', () => {
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

      expect(hasModifiers(flow)).toBe(false)
    })
  })
})
