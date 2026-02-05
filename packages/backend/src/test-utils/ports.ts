/**
 * Dynamic port allocation utilities for tests
 * Uses ephemeral port 0 to let the OS assign free ports
 */
import net from 'net'

/**
 * Find a single free port by binding to port 0
 * The OS will assign an available ephemeral port
 */
export async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, () => {
      const addr = server.address() as net.AddressInfo
      const port = addr.port
      server.close(() => resolve(port))
    })
  })
}

/**
 * Find multiple free ports atomically
 * All ports are allocated together to ensure no conflicts
 */
export async function findFreePorts(count: number): Promise<number[]> {
  const servers: net.Server[] = []
  const ports: number[] = []

  try {
    // Create all servers first to reserve ports
    for (let i = 0; i < count; i++) {
      await new Promise<void>((resolve, reject) => {
        const server = net.createServer()
        server.unref()
        server.on('error', reject)
        server.listen(0, () => {
          const addr = server.address() as net.AddressInfo
          ports.push(addr.port)
          servers.push(server)
          resolve()
        })
      })
    }

    // Close all servers to release ports
    await Promise.all(servers.map(server =>
      new Promise<void>(resolve => server.close(() => resolve()))
    ))

    return ports
  } catch (error) {
    // Cleanup on error
    await Promise.all(servers.map(server =>
      new Promise<void>(resolve => server.close(() => resolve()))
    ))
    throw error
  }
}

/**
 * Wait for a port to become available (server started)
 * Uses exponential backoff with configurable max attempts
 */
export async function waitForPort(
  port: number,
  host: string = 'localhost',
  maxAttempts: number = 50,
  initialDelay: number = 100
): Promise<void> {
  let attempt = 0
  let delay = initialDelay

  while (attempt < maxAttempts) {
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = net.createConnection({ port, host })
        socket.on('connect', () => {
          socket.destroy()
          resolve()
        })
        socket.on('error', reject)
      })
      return // Successfully connected
    } catch {
      attempt++
      if (attempt >= maxAttempts) {
        throw new Error(`Port ${port} on ${host} not available after ${maxAttempts} attempts`)
      }
      await new Promise(resolve => setTimeout(resolve, delay))
      delay = Math.min(delay * 1.5, 1000) // Exponential backoff, max 1s
    }
  }
}

/**
 * Check if a port is currently in use
 */
export async function isPortInUse(port: number, host: string = 'localhost'): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host })
    socket.on('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.on('error', () => {
      resolve(false)
    })
  })
}
