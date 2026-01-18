import { ChildProcess, spawn } from 'child_process'
import { Duplex } from 'stream'
import net from 'net'
import path from 'path'
import { fileURLToPath } from 'url'
import type { TLSProvider, TLSConnectOptions, TLSFingerprint } from './tls-provider.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * TLS Provider using Go utls for fingerprint spoofing
 * Spawns a Go binary that handles TLS connections with configurable ClientHello
 * 
 * Protocol: Newline-delimited JSON (NDJSON)
 * - Request:  {"host":"...", "port":443, "fingerprint":"chrome120"}\n
 * - Response: {"success":true}\n  OR  {"success":false,"error":"..."}\n
 * - After handshake: raw bidirectional byte stream
 */
export class UtlsProvider implements TLSProvider {
  readonly name = 'utls'

  private process: ChildProcess | null = null
  private socketPath: string | null = null
  private ready = false
  private defaultFingerprint: TLSFingerprint = 'electron'

  /**
   * Set the default fingerprint for new connections
   */
  setDefaultFingerprint(fingerprint: TLSFingerprint): void {
    this.defaultFingerprint = fingerprint
  }

  /**
   * Get the default fingerprint
   */
  getDefaultFingerprint(): TLSFingerprint {
    return this.defaultFingerprint
  }

  async initialize(): Promise<void> {
    if (this.ready) return

    const binaryPath = path.join(__dirname, '..', 'server', 'tls-proxy')
    const socketPath = `/tmp/claudio-tls-${process.pid}.sock`

    return new Promise((resolve, reject) => {
      const proc = spawn(binaryPath, [socketPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      this.process = proc

      let output = ''

      proc.stdout!.on('data', (data: Buffer) => {
        output += data.toString()

        // Look for LISTEN line
        const listenMatch = output.match(/LISTEN:(.+)\n/)
        if (listenMatch) {
          this.socketPath = listenMatch[1]
        }

        // Look for READY signal
        if (output.includes('READY')) {
          this.ready = true
          console.log(`[utls] Provider ready, socket: ${this.socketPath}`)
          resolve()
        }
      })

      proc.stderr!.on('data', (data: Buffer) => {
        console.error(`[utls] ${data.toString().trim()}`)
      })

      proc.on('error', (err) => {
        console.error('[utls] Failed to start Go binary:', err.message)
        this.ready = false
        reject(err)
      })

      proc.on('exit', (code) => {
        console.log(`[utls] Process exited with code ${code}`)
        this.ready = false
        this.process = null
      })

      // Timeout after 10 seconds
      setTimeout(() => {
        if (!this.ready) {
          reject(new Error('Timeout waiting for utls provider to start'))
        }
      }, 10000)
    })
  }

  async connect(options: TLSConnectOptions): Promise<Duplex> {
    if (!this.ready || !this.socketPath) {
      throw new Error('utls provider not ready')
    }

    const fingerprint = options.fingerprint || this.defaultFingerprint

    return new Promise((resolve, reject) => {
      // Connect to the Go service
      const socket = net.createConnection(this.socketPath!, () => {
        // Send connect request as newline-delimited JSON
        const request = JSON.stringify({
          host: options.host,
          port: options.port,
          fingerprint: fingerprint,
        }) + '\n'

        socket.write(request)

        // Read response line
        let responseBuffer = ''
        let resolved = false

        const onData = (chunk: Buffer) => {
          if (resolved) return
          
          responseBuffer += chunk.toString('utf-8')
          
          // Look for newline (end of response)
          const newlineIdx = responseBuffer.indexOf('\n')
          if (newlineIdx === -1) return // Need more data
          
          resolved = true
          socket.removeListener('data', onData)
          
          const responseLine = responseBuffer.slice(0, newlineIdx)
          const remaining = responseBuffer.slice(newlineIdx + 1)
          
          try {
            const response = JSON.parse(responseLine)

            if (!response.success) {
              socket.destroy()
              reject(new Error(response.error || 'Connection failed'))
              return
            }

            // If there's remaining data after the response line,
            // we need to handle it (though there shouldn't be any at this point)
            if (remaining.length > 0) {
              // Convert remaining string back to buffer and unshift
              const remainingBuf = Buffer.from(remaining, 'utf-8')
              socket.unshift(remainingBuf)
            }

            // Return the socket as a duplex stream for raw communication
            resolve(socket)
          } catch {
            socket.destroy()
            reject(new Error('Invalid response from utls service: ' + responseLine))
          }
        }

        socket.on('data', onData)
      })

      socket.on('error', (err) => {
        reject(err)
      })

      // Timeout
      socket.setTimeout(30000, () => {
        socket.destroy()
        reject(new Error('Connection timeout'))
      })
    })
  }

  async shutdown(): Promise<void> {
    if (this.process) {
      this.process.kill('SIGTERM')

      // Wait for process to exit
      await new Promise<void>((resolve) => {
        if (!this.process) {
          resolve()
          return
        }

        const timeout = setTimeout(() => {
          this.process?.kill('SIGKILL')
          resolve()
        }, 5000)

        this.process.on('exit', () => {
          clearTimeout(timeout)
          resolve()
        })
      })

      this.process = null
    }

    this.ready = false
    this.socketPath = null
    console.log('[utls] Provider shut down')
  }

  isReady(): boolean {
    return this.ready
  }
}

// Export singleton instance
export const utlsProvider = new UtlsProvider()
