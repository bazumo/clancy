import { registerModifier } from '../registry.js'
import type { Flow, FlowRequest, FlowResponse } from '../types.js'

/* eslint-disable @typescript-eslint/no-unused-vars */

// Example: Add custom headers to requests
registerModifier({
  id: 'add-request-headers',
  name: 'Add Custom Request Headers',
  description: 'Adds custom headers to outgoing requests',
  match: (_flow: Flow) => {
    // Uncomment and customize to enable:
    // return _flow.host.includes('api.example.com')
    return false // Disabled by default
  },
  modifyRequest: (request: FlowRequest) => {
    return {
      ...request,
      headers: {
        ...request.headers,
        'X-Custom-Header': 'added-by-proxy',
        'X-Proxy-Modified': 'true',
      },
    }
  },
})

// Example: Add custom headers to responses
registerModifier({
  id: 'add-response-headers',
  name: 'Add Custom Response Headers',
  description: 'Adds custom headers to responses',
  match: (_flow: Flow) => {
    // Uncomment to enable for all flows:
    // return true
    return false // Disabled by default
  },
  modifyResponse: (response: FlowResponse, request: FlowRequest) => {
    return {
      ...response,
      headers: {
        ...response.headers,
        'X-Proxy-Modified': 'true',
        'X-Original-Host': request.host,
      },
    }
  },
})

// Example: Remove tracking headers
registerModifier({
  id: 'remove-tracking-headers',
  name: 'Remove Tracking Headers',
  description: 'Removes common tracking headers from requests',
  match: (_flow: Flow) => {
    // Uncomment to enable:
    // return true
    return false // Disabled by default
  },
  modifyRequest: (request: FlowRequest) => {
    const headers = { ...request.headers }
    // Remove common tracking headers
    delete headers['x-forwarded-for']
    delete headers['x-real-ip']
    delete headers['referer']
    delete headers['user-agent']

    return {
      ...request,
      headers,
    }
  },
})
