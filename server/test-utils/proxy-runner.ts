/**
 * Proxy subprocess management for tests
 * Spawns and manages the proxy server in a child process
 */
import { spawn, ChildProcess } from 'child_process'
import { waitForPort } from './ports.js'

export interface ProxyHandle {
  port: number
  process: ChildProcess
  stop: () => Promise<void>
}

export interface ProxyOptions {
  port?: number
  verbose?: boolean
  timeout?: number
}

/**
 * Start the proxy server in a subprocess
 * Returns when the proxy is ready to accept connections
 */
export async function startProxy(options: ProxyOptions = {}): Promise<ProxyHandle> {
  const port = options.port || 0
  const timeout = options.timeout || 15000
  const verbose = options.verbose ?? false

  // Spawn proxy with tsx
  const args = ['server/index.ts', '-p', String(port)]

  const proc = spawn('npx', ['tsx', ...args], {
    stdio: 'pipe',
    env: { ...process.env, NODE_ENV: 'test' }
  })

  let actualPort = port
  let ready = false
  let stderr = ''

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!ready) {
        proc.kill('SIGTERM')
        reject(new Error(`Proxy startup timeout after ${timeout}ms. stderr: ${stderr}`))
      }
    }, timeout)

    // Capture stdout to detect startup and port
    proc.stdout?.on('data', (data: Buffer) => {
      const output = data.toString()
      if (verbose) {
        console.log('[proxy]', output)
      }

      // Look for startup message
      const match = output.match(/Clancy proxy running on .*:(\d+)/)
      if (match) {
        actualPort = parseInt(match[1])
        ready = true
        clearTimeout(timer)

        // Wait for port to be ready
        waitForPort(actualPort, 'localhost', 30, 100)
          .then(() => {
            resolve({
              port: actualPort,
              process: proc,
              stop: async () => {
                return new Promise<void>((res) => {
                  if (proc.killed) {
                    res()
                    return
                  }

                  proc.on('exit', () => res())
                  proc.kill('SIGTERM')

                  // Force kill after 5s
                  setTimeout(() => {
                    if (!proc.killed) {
                      proc.kill('SIGKILL')
                    }
                  }, 5000)
                })
              }
            })
          })
          .catch(reject)
      }
    })

    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString()
      if (verbose) {
        console.error('[proxy stderr]', data.toString())
      }
    })

    proc.on('error', (err) => {
      clearTimeout(timer)
      reject(new Error(`Failed to start proxy: ${err.message}`))
    })

    proc.on('exit', (code, signal) => {
      clearTimeout(timer)
      if (!ready) {
        reject(new Error(`Proxy exited prematurely (code=${code}, signal=${signal}). stderr: ${stderr}`))
      }
    })
  })
}
