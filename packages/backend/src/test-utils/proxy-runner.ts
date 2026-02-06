/**
 * Proxy server management for tests
 * Uses createServer() in-process for faster, more reliable testing
 */
import type { ProxyHandle as ProxyHandleType } from './types.js'
import { createServer, type ClancyServer } from '../server.js'

export type ProxyHandle = ProxyHandleType & { instance: ClancyServer }

export interface ProxyOptions {
  port?: number
  verbose?: boolean
  timeout?: number
}

/**
 * Start the proxy server in-process using createServer()
 * Returns when the proxy is ready to accept connections
 */
export async function startProxy(options: ProxyOptions = {}): Promise<ProxyHandle> {
  const port = options.port || 0

  const instance = createServer({
    port,
    host: 'localhost'
  })

  await instance.start()

  const addr = instance.server.address() as import('net').AddressInfo
  const actualPort = addr.port

  return {
    port: actualPort,
    instance,
    stop: async () => {
      await instance.stop()
    },
    clearFlows: async () => {
      const res = await fetch(`http://localhost:${actualPort}/api/flows`, { method: 'DELETE' })
      await res.json()
    },
    getFlows: async () => {
      const res = await fetch(`http://localhost:${actualPort}/api/flows`)
      return res.json() as Promise<{ count: number; flows: unknown[] }>
    }
  }
}
