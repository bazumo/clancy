// import { registerModifier } from '../registry.js'
// import type { Flow, FlowRequest, FlowResponse } from '../types.js'

/* eslint-disable @typescript-eslint/no-unused-vars */

// Example: Modify request body
// registerModifier({
//   id: 'modify-request-body',
//   name: 'Modify Request Body',
//   description: 'Modifies JSON request bodies',
//   match: (_flow: Flow) => {
//     // Example: Modify Claude API requests
//     // return _flow.host.includes('anthropic.com') && _flow.request.path === '/v1/messages'
//     return false // Disabled by default
//   },
//   modifyRequest: (request: FlowRequest) => {
//     try {
//       const body = JSON.parse(request.body)

//       // Example: Force a specific model
//       body.model = 'claude-3-5-sonnet-20241022'

//       // Example: Inject system prompt
//       if (!body.system) {
//         body.system = 'You are a helpful assistant modified by the proxy.'
//       }

//       // Example: Limit max tokens
//       body.max_tokens = Math.min(body.max_tokens || 1024, 1024)

//       return {
//         ...request,
//         body: JSON.stringify(body),
//       }
//     } catch {
//       // If body is not JSON, return unchanged
//       return request
//     }
//   },
// })

// Example: Modify response body
// registerModifier({
//   id: 'modify-response-body',
//   name: 'Modify Response Body',
//   description: 'Modifies JSON response bodies',
//   match: (_flow: Flow) => {
//     // Example: Modify specific API responses
//     // return _flow.host.includes('api.example.com')
//     return false // Disabled by default
//   },
//   modifyResponse: (response: FlowResponse, request: FlowRequest) => {
//     try {
//       const body = JSON.parse(response.body)

//       // Example: Add metadata to response
//       body._proxy_metadata = {
//         modified: true,
//         timestamp: new Date().toISOString(),
//         originalHost: request.host,
//       }

//       return {
//         ...response,
//         body: JSON.stringify(body),
//       }
//     } catch {
//       // If body is not JSON, return unchanged
//       return response
//     }
//   },
// })

// Example: Text replacement in response
// registerModifier({
//   id: 'replace-text-in-response',
//   name: 'Replace Text in Response',
//   description: 'Performs text replacement in response bodies',
//   match: (_flow: Flow) => {
//     // Example: Replace text in specific responses
//     // return _flow.host.includes('example.com')
//     return false // Disabled by default
//   },
//   modifyResponse: (response: FlowResponse, _request: FlowRequest) => {
//     // Example: Replace all occurrences of a word
//     const modifiedBody = response.body.replace(/original/gi, 'MODIFIED')

//     return {
//       ...response,
//       body: modifiedBody,
//     }
//   },
// })
