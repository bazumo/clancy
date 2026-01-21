/**
 * Main entry point for test utilities
 * Provides convenience functions for setting up test environments
 */

// Re-export all utilities
export * from './types.js'
export * from './ports.js'
export * from './certificates.js'
export * from './compression.js'
export * from './target-servers.js'
export * from './proxy-runner.js'
export * from './http-clients.js'
export * from './test-matrix.js'

import { findFreePorts } from './ports.js'
import { createHttpTargetServer, createHttpsTargetServer } from './target-servers.js'
import { startProxy } from './proxy-runner.js'
import type { TestContext, ReceivedRequest } from './types.js'

/**
 * Setup options for test environment
 */
export interface SetupTestEnvironmentOptions {
  /**
   * Start the proxy server
   * @default true
   */
  startProxy?: boolean

  /**
   * Start HTTP target server
   * @default true
   */
  startHttpTarget?: boolean

  /**
   * Start HTTPS target server
   * @default true
   */
  startHttpsTarget?: boolean

  /**
   * Enable verbose logging
   * @default false
   */
  verbose?: boolean

  /**
   * Proxy startup timeout in ms
   * @default 15000
   */
  proxyTimeout?: number
}

/**
 * Setup a complete test environment with proxy and target servers
 * Allocates dynamic ports and starts all services
 */
export async function setupTestEnvironment(
  options: SetupTestEnvironmentOptions = {}
): Promise<TestContext> {
  const {
    startProxy: shouldStartProxy = true,
    startHttpTarget = true,
    startHttpsTarget = true,
    verbose = false,
    proxyTimeout = 15000
  } = options

  // Track all resources for cleanup
  const cleanupHandlers: Array<() => Promise<void>> = []
  const receivedRequests: ReceivedRequest[] = []

  try {
    // Allocate ports
    const portCount = (shouldStartProxy ? 1 : 0) + (startHttpTarget ? 1 : 0) + (startHttpsTarget ? 1 : 0)
    const ports = await findFreePorts(portCount)
    let portIndex = 0

    let proxyPort = 0
    let httpTargetPort = 0
    let httpsTargetPort = 0

    // Start proxy
    if (shouldStartProxy) {
      proxyPort = ports[portIndex++]
      const proxyHandle = await startProxy({ port: proxyPort, verbose, timeout: proxyTimeout })
      cleanupHandlers.push(proxyHandle.stop)
      if (verbose) {
        console.log(`[test-utils] Proxy started on port ${proxyPort}`)
      }
    }

    // Start HTTP target
    if (startHttpTarget) {
      const httpHandle = await createHttpTargetServer({ receivedRequests })
      httpTargetPort = httpHandle.port
      cleanupHandlers.push(httpHandle.close)
      if (verbose) {
        console.log(`[test-utils] HTTP target started on port ${httpTargetPort}`)
      }
    }

    // Start HTTPS target
    if (startHttpsTarget) {
      const httpsHandle = await createHttpsTargetServer({ receivedRequests })
      httpsTargetPort = httpsHandle.port
      cleanupHandlers.push(httpsHandle.close)
      if (verbose) {
        console.log(`[test-utils] HTTPS target started on port ${httpsTargetPort}`)
      }
    }

    return {
      proxyPort,
      httpTargetPort,
      httpsTargetPort,
      receivedRequests,
      cleanup: async () => {
        if (verbose) {
          console.log('[test-utils] Cleaning up test environment...')
        }
        // Run all cleanup handlers in parallel
        await Promise.all(cleanupHandlers.map(handler => handler().catch(err => {
          console.error('[test-utils] Cleanup error:', err)
        })))
        if (verbose) {
          console.log('[test-utils] Cleanup complete')
        }
      }
    }
  } catch (error) {
    // Cleanup on error
    await Promise.all(cleanupHandlers.map(handler => handler().catch(() => {})))
    throw error
  }
}
