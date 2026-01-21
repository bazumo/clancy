/**
 * HTTP client helpers for making requests through the proxy
 */
import http from 'http'
import https from 'https'
import { gunzipSync, inflateSync, brotliDecompressSync } from 'zlib'
import { ZstdCodec } from 'zstd-codec'

let zstdSimple: { decompress: (data: Uint8Array) => Uint8Array } | null = null

async function ensureZstdReady(): Promise<void> {
  if (zstdSimple) return
  const { ZstdCodec } = await import('zstd-codec')
  return new Promise((resolve) => {
    ZstdCodec.run((zstd: any) => {
      zstdSimple = new zstd.Simple()
      resolve()
    })
  })
}

export interface HttpRequestOptions {
  method?: string
  path?: string
  headers?: Record<string, string>
  body?: string
  query?: Record<string, string>
  timeout?: number
}

export interface HttpResponse {
  status: number
  headers: http.IncomingHttpHeaders
  body: string
  rawBody: Buffer
  connectionClosed: boolean
}

/**
 * Decompress response body based on Content-Encoding header
 */
async function decompressBody(body: Buffer, encoding?: string): Promise<Buffer> {
  if (!encoding || encoding === 'identity') {
    return body
  }

  switch (encoding) {
    case 'gzip':
      return gunzipSync(body)
    case 'deflate':
      return inflateSync(body)
    case 'br':
      return brotliDecompressSync(body)
    case 'zstd':
      await ensureZstdReady()
      if (!zstdSimple) {
        throw new Error('Zstd not initialized')
      }
      return Buffer.from(zstdSimple.decompress(new Uint8Array(body)))
    default:
      return body
  }
}

/**
 * Make an HTTP request through the proxy
 */
export async function httpThroughProxy(
  proxyPort: number,
  targetPort: number,
  options: HttpRequestOptions = {}
): Promise<HttpResponse> {
  const method = options.method || 'GET'
  let path = options.path || '/'
  const headers = options.headers || {}
  const body = options.body
  const timeout = options.timeout || 10000

  // Add query params
  if (options.query) {
    const params = new URLSearchParams(options.query)
    path += (path.includes('?') ? '&' : '?') + params.toString()
  }

  // Set up request options
  const reqOptions: http.RequestOptions = {
    method,
    host: 'localhost',
    port: proxyPort,
    path: `http://localhost:${targetPort}${path}`,
    headers: {
      ...headers,
      'Host': `localhost:${targetPort}`
    },
    timeout
  }

  if (body) {
    reqOptions.headers!['Content-Length'] = Buffer.byteLength(body)
  }

  return new Promise((resolve, reject) => {
    const req = http.request(reqOptions, async (res) => {
      const chunks: Buffer[] = []
      let connectionClosed = false

      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', async () => {
        try {
          const rawBody = Buffer.concat(chunks)
          const decompressed = await decompressBody(rawBody, res.headers['content-encoding'])

          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body: decompressed.toString('utf-8'),
            rawBody: decompressed,
            connectionClosed
          })
        } catch (err) {
          reject(err)
        }
      })

      res.on('close', () => {
        connectionClosed = true
      })
    })

    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Request timeout'))
    })

    if (body) {
      req.write(body)
    }
    req.end()
  })
}

/**
 * Make an HTTPS request through the proxy using CONNECT tunnel
 */
export async function httpsThroughProxy(
  proxyPort: number,
  targetPort: number,
  options: HttpRequestOptions = {}
): Promise<HttpResponse> {
  const method = options.method || 'GET'
  let path = options.path || '/'
  const headers = options.headers || {}
  const body = options.body
  const timeout = options.timeout || 10000

  // Add query params
  if (options.query) {
    const params = new URLSearchParams(options.query)
    path += (path.includes('?') ? '&' : '?') + params.toString()
  }

  return new Promise((resolve, reject) => {
    // Step 1: Establish CONNECT tunnel
    const connectReq = http.request({
      method: 'CONNECT',
      host: 'localhost',
      port: proxyPort,
      path: `localhost:${targetPort}`,
      timeout
    })

    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy()
        reject(new Error(`CONNECT failed with status ${res.statusCode}`))
        return
      }

      // Step 2: Make HTTPS request through tunnel
      const httpsReq = https.request({
        method,
        host: 'localhost',
        port: targetPort,
        path,
        headers: {
          ...headers,
          'Host': `localhost:${targetPort}`
        },
        socket,
        rejectUnauthorized: false, // Allow self-signed certs
        timeout
      }, async (httpsRes) => {
        const chunks: Buffer[] = []
        let connectionClosed = false

        httpsRes.on('data', (chunk) => chunks.push(chunk))
        httpsRes.on('end', async () => {
          try {
            const rawBody = Buffer.concat(chunks)
            const decompressed = await decompressBody(rawBody, httpsRes.headers['content-encoding'])

            resolve({
              status: httpsRes.statusCode || 0,
              headers: httpsRes.headers,
              body: decompressed.toString('utf-8'),
              rawBody: decompressed,
              connectionClosed
            })
          } catch (err) {
            reject(err)
          }
        })

        httpsRes.on('close', () => {
          connectionClosed = true
        })
      })

      httpsReq.on('error', reject)
      httpsReq.on('timeout', () => {
        httpsReq.destroy()
        reject(new Error('HTTPS request timeout'))
      })

      if (body) {
        httpsReq.write(body)
      }
      httpsReq.end()
    })

    connectReq.on('error', reject)
    connectReq.on('timeout', () => {
      connectReq.destroy()
      reject(new Error('CONNECT timeout'))
    })

    connectReq.end()
  })
}

/**
 * Make an SSE request and collect events
 */
export async function sseRequest(
  proxyPort: number,
  targetPort: number,
  isHttps: boolean,
  options: HttpRequestOptions & { eventLimit?: number } = {}
): Promise<{ events: any[], connectionClosed: boolean }> {
  const eventLimit = options.eventLimit || 100
  const timeout = options.timeout || 30000
  let path = options.path || '/sse'

  if (options.query) {
    const params = new URLSearchParams(options.query)
    path += (path.includes('?') ? '&' : '?') + params.toString()
  }

  return new Promise((resolve, reject) => {
    const events: any[] = []
    let connectionClosed = false
    let buffer = ''

    const makeRequest = isHttps
      ? () => {
          // CONNECT tunnel for HTTPS
          const connectReq = http.request({
            method: 'CONNECT',
            host: 'localhost',
            port: proxyPort,
            path: `localhost:${targetPort}`,
            timeout
          })

          connectReq.on('connect', (res, socket) => {
            if (res.statusCode !== 200) {
              socket.destroy()
              reject(new Error(`CONNECT failed with status ${res.statusCode}`))
              return
            }

            const httpsReq = https.request({
              method: 'GET',
              host: 'localhost',
              port: targetPort,
              path,
              headers: { Accept: 'text/event-stream' },
              socket,
              rejectUnauthorized: false,
              timeout
            }, handleResponse)

            httpsReq.on('error', reject)
            httpsReq.end()
          })

          connectReq.on('error', reject)
          connectReq.end()
        }
      : () => {
          const httpReq = http.request({
            method: 'GET',
            host: 'localhost',
            port: proxyPort,
            path: `http://localhost:${targetPort}${path}`,
            headers: {
              'Accept': 'text/event-stream',
              'Host': `localhost:${targetPort}`
            },
            timeout
          }, handleResponse)

          httpReq.on('error', reject)
          httpReq.end()
        }

    function handleResponse(res: http.IncomingMessage) {
      res.on('data', (chunk: Buffer) => {
        buffer += chunk.toString()

        // Parse SSE events
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        let currentEvent: any = {}
        for (const line of lines) {
          if (line.startsWith('event:')) {
            currentEvent.event = line.slice(6).trim()
          } else if (line.startsWith('data:')) {
            const data = line.slice(5).trim()
            try {
              currentEvent.data = JSON.parse(data)
            } catch {
              currentEvent.data = data
            }
          } else if (line === '') {
            if (currentEvent.data !== undefined) {
              events.push(currentEvent)
              currentEvent = {}

              if (events.length >= eventLimit) {
                res.destroy()
                // Wait a bit for close event to fire
                setTimeout(() => {
                  resolve({ events, connectionClosed: true })
                }, 50)
                return
              }
            }
          }
        }
      })

      res.on('end', () => {
        connectionClosed = true
        // Give a moment for close event
        setTimeout(() => {
          resolve({ events, connectionClosed: true })
        }, 50)
      })

      res.on('close', () => {
        connectionClosed = true
      })

      res.on('error', reject)
    }

    makeRequest()
  })
}
