// import { registerModifier } from '../registry.js'
// import type { Flow, FlowRequest, FlowResponse } from '../types.js'


// registerModifier({
//   id: 'test-response-header',
//   name: 'Test Response Header',
//   description: 'Adds X-Clancy-Modified header to all responses (for testing)',
//   match: (flow: Flow) => {
//     // Match all non-streaming HTTP/HTTPS flows

//     //return !flow.isSSE && (flow.type === 'http' || flow.type === 'https')
//     return false
//   },
//   modifyResponse: (response: FlowResponse, request: FlowRequest) => {
//     console.log(`[Test Modifier] Adding header to response for ${request.host}${request.path}`)
//     return {
//       ...response,
//       headers: {
//         ...response.headers,
//         'x-clancy-modified': 'true',
//         'x-clancy-proxy': 'v1.0',
//       },
//     }
//   },
// })
