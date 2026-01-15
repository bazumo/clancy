import tls from 'tls'
import http from 'http'
import type { Duplex } from 'stream'
import { tlsConnect } from './tls-provider.js'
import { utlsProvider } from './tls-provider-utls.js'
import { handleProxyResponse, handleProxyError, type ResponseWriter } from './proxy-handler.js'
import type { Flow } from '../shared/types.js'

/**
 * Create a native Node.js TLS socket
 */
export async function createNativeTlsSocket(host: string, port: number): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host,
      port,
      servername: host,
      rejectUnauthorized: false
    })
    socket.once('secureConnect', () => resolve(socket))
    socket.once('error', reject)
  })
}

/**
 * Create a TLS socket using the utls provider (Go-based fingerprint spoofing)
 */
export async function createProviderTlsSocket(host: string, port: number): Promise<Duplex> {
  return tlsConnect({
    host,
    port,
    fingerprint: utlsProvider.getDefaultFingerprint()
  })
}

/**
 * Forward an HTTP request over a pre-established TLS socket
 */
export function forwardRequest(
  host: string,
  port: number,
  method: string,
  reqPath: string,
  headers: Record<string, string>,
  body: string | undefined,
  flow: Flow,
  startTime: number,
  writer: ResponseWriter,
  socket: Duplex
): void {
  const proxyReq = http.request({
    hostname: host,
    port,
    path: reqPath,
    method,
    headers: { ...headers, host },
    createConnection: () => socket as never
  }, (proxyRes) => {
    handleProxyResponse(proxyRes, {
      flow,
      startTime,
      writer,
      storeRawHttp: true
    })
  })

  proxyReq.on('error', (err) => {
    handleProxyError(err, flow, startTime, writer)
  })

  if (body) proxyReq.write(body)
  proxyReq.end()
}
