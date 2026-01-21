# Flow Modifiers

Flow modifiers allow you to intercept and modify HTTP requests and responses on the fly based on matching conditions.

## How It Works

Modifiers are TypeScript/JavaScript files that register functions to:
1. **Match** flows based on conditions (host, path, headers, etc.)
2. **Modify** requests before sending them upstream
3. **Modify** responses before sending them to the client

Modifiers run automatically when they match a flow. The system follows the same pattern as the frontend "enhancers" for a consistent architecture.

## Architecture

```
Request Flow:
Client → Proxy → [Request Modifiers] → Upstream Server

Response Flow:
Upstream Server → [Decompression] → [Response Modifiers] → Proxy → Client
```

### Key Points

- **Request modifiers** run before forwarding to upstream
- **Response modifiers** only work with non-streaming responses
- **Response modifiers** run after decompression (so you get readable JSON/text)
- Multiple modifiers can match and run in sequence
- Streaming responses (SSE, etc.) are skipped by response modifiers

## Creating a Modifier

Create a new `.ts` file in `server/modifiers/examples/` or your own directory:

```typescript
import { registerModifier } from '../registry'

registerModifier({
  id: 'my-modifier',
  name: 'My Custom Modifier',
  description: 'What this modifier does',

  // Match condition - return true to apply this modifier
  match: (flow) => {
    return flow.host.includes('api.example.com') &&
           flow.request.path === '/endpoint'
  },

  // Optional: Modify request before sending upstream
  modifyRequest: (request) => {
    return {
      ...request,
      headers: {
        ...request.headers,
        'X-Custom-Header': 'my-value'
      }
    }
  },

  // Optional: Modify response before sending to client
  modifyResponse: (response, request) => {
    return {
      ...response,
      body: response.body.replace('foo', 'bar')
    }
  }
})
```

## FlowModifier Interface

```typescript
interface FlowModifier {
  id: string                    // Unique identifier
  name: string                  // Display name
  description?: string          // Optional description

  match: (flow: Flow) => boolean

  modifyRequest?: (request: FlowRequest) =>
    FlowRequest | Promise<FlowRequest>

  modifyResponse?: (response: FlowResponse, request: FlowRequest) =>
    FlowResponse | Promise<FlowResponse>
}

interface FlowRequest {
  method: string
  url: string
  path: string
  host: string
  headers: Record<string, string>
  body: string
}

interface FlowResponse {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
}
```

## Examples

### Example 1: Mock API Responses

```typescript
registerModifier({
  id: 'mock-api',
  name: 'Mock API',
  match: (flow) => flow.host === 'api.example.com',
  modifyResponse: (response) => ({
    ...response,
    status: 200,
    body: JSON.stringify({ mocked: true, data: 'test' })
  })
})
```

### Example 2: Add Authentication Headers

```typescript
registerModifier({
  id: 'add-auth',
  name: 'Add Auth Headers',
  match: (flow) => flow.host.includes('secure-api.com'),
  modifyRequest: (request) => ({
    ...request,
    headers: {
      ...request.headers,
      'Authorization': 'Bearer YOUR_TOKEN_HERE'
    }
  })
})
```

### Example 3: Modify JSON Request Body

```typescript
registerModifier({
  id: 'modify-json',
  name: 'Modify JSON Request',
  match: (flow) =>
    flow.host.includes('anthropic.com') &&
    flow.request.path === '/v1/messages',
  modifyRequest: (request) => {
    try {
      const body = JSON.parse(request.body)
      // Force a specific model
      body.model = 'claude-3-5-sonnet-20241022'
      // Limit tokens
      body.max_tokens = Math.min(body.max_tokens || 1024, 1024)

      return {
        ...request,
        body: JSON.stringify(body)
      }
    } catch (e) {
      return request // Return unchanged if not JSON
    }
  }
})
```

### Example 4: Log and Modify Response

```typescript
registerModifier({
  id: 'log-and-modify',
  name: 'Log and Modify',
  match: (flow) => flow.host === 'api.example.com',
  modifyResponse: (response, request) => {
    // Note: Response modifiers must be synchronous in the pipeline
    console.log(`Response from ${request.host}${request.path}:`, response.status)

    try {
      const body = JSON.parse(response.body)
      body._modified = true
      body._timestamp = new Date().toISOString()

      return {
        ...response,
        body: JSON.stringify(body, null, 2)
      }
    } catch (e) {
      return response
    }
  }
})
```

### Example 5: Async Request Modifier

```typescript
registerModifier({
  id: 'async-request-mod',
  name: 'Async Request Modifier',
  match: (flow) => flow.host === 'api.example.com',
  modifyRequest: async (request) => {
    // Request modifiers CAN be async
    const token = await fetchAuthToken()
    return {
      ...request,
      headers: {
        ...request.headers,
        'Authorization': `Bearer ${token}`
      }
    }
  }
})
```

### Example 6: Conditional Modification

```typescript
registerModifier({
  id: 'conditional-mod',
  name: 'Conditional Modifier',
  match: (flow) => flow.host === 'api.example.com',
  modifyResponse: (response) => {
    // Only modify 404 responses
    if (response.status === 404) {
      return {
        ...response,
        status: 200,
        body: JSON.stringify({
          message: 'Resource not found, but returning success anyway'
        })
      }
    }
    return response // Leave other responses unchanged
  }
})
```

## Loading Modifiers

1. Create your modifier file in `server/modifiers/examples/` or any subdirectory
2. Import it in `server/modifiers/index.ts`:
   ```typescript
   import './examples/my-modifier'
   ```
3. Restart the proxy server

The modifier will be automatically loaded and registered on startup.

## Tips

- **Match efficiently**: The `match` function runs for every flow, keep it fast
- **Handle errors**: Wrap JSON parsing in try-catch to avoid breaking the proxy
- **Immutable updates**: Always use spread operators to create new objects
- **Content-Length**: The proxy automatically recalculates `Content-Length` after modifications
- **Streaming**: Response modifiers only work with buffered (non-streaming) responses
- **Debugging**: Check the proxy console logs for modifier registration and execution

## Debugging

When the proxy starts, you'll see:
```
Registered modifier: My Modifier (my-modifier)
```

When a modifier runs:
```
[ResponseModifier] Modified response for flow abc123
```

## Limitations

1. **Streaming responses** are not modified (SSE, chunked encoding with events)
2. **WebSocket** connections are not modified
3. **Large responses** may cause memory issues (the entire response is buffered)
4. **Compressed responses** are automatically decompressed before modification
5. **Async modifiers** - Response modifiers in the pipeline must be synchronous. If you return a Promise from `modifyResponse`, it will be skipped with a warning. Request modifiers support async/await since they run before the pipeline.

## Advanced: Programmatic Access

You can access registered modifiers programmatically:

```typescript
import { getModifiers, matchModifiers } from './server/modifiers/registry'

// Get all registered modifiers
const allModifiers = getModifiers()

// Get modifiers that match a specific flow
const matches = matchModifiers(flow)
```
