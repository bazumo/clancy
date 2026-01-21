import { registerModifier } from '../registry.js'
import type { Flow, FlowRequest, FlowResponse } from '../types.js'

/* eslint-disable @typescript-eslint/no-unused-vars */

// Example: Mock Claude API responses
registerModifier({
  id: 'mock-claude-response',
  name: 'Mock Claude Responses',
  description: 'Returns a mocked response for Claude API requests',
  match: (_flow: Flow) => {
    // Uncomment to enable:
    // return _flow.host.includes('anthropic.com') && _flow.request.path === '/v1/messages'
    return false // Disabled by default
  },
  modifyResponse: (response: FlowResponse, _request: FlowRequest) => {
    return {
      ...response,
      status: 200,
      statusText: 'OK',
      body: JSON.stringify({
        id: 'msg_mock123',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'This is a mocked response from the proxy modifier!',
          },
        ],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 10,
          output_tokens: 15,
        },
      }),
    }
  },
})

// Example: Mock any API with custom JSON
registerModifier({
  id: 'mock-json-response',
  name: 'Mock JSON Response',
  description: 'Returns a custom JSON response for specific endpoints',
  match: (_flow: Flow) => {
    // Example: Mock a specific endpoint
    // return _flow.host === 'api.example.com' && _flow.request.path === '/data'
    return false // Disabled by default
  },
  modifyResponse: (response: FlowResponse, request: FlowRequest) => {
    return {
      ...response,
      status: 200,
      statusText: 'OK',
      headers: {
        ...response.headers,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        mocked: true,
        message: 'This response was modified by the proxy',
        originalPath: request.path,
      }),
    }
  },
})
