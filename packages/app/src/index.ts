import path from 'path'
import { fileURLToPath } from 'url'
import { program } from 'commander'
import { createServer, type TLSFingerprint, type TLSProvider } from '@clancyapp/backend'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Parse command-line arguments
program
  .name('clancy')
  .description('Clancy Proxy Server')
  .option('-t, --tls-provider <provider>', "TLS provider: 'utls' (Go fingerprinting) or 'native' (Node.js TLS)", 'native')
  .option('-f, --tls-fingerprint <fingerprint>', 'TLS fingerprint for utls (chrome120, firefox120, safari16, electron, etc.)', 'electron')
  .option('-p, --port <port>', 'Port to listen on', '9090')
  .option('-H, --host <host>', 'Host to bind to', 'localhost')
  .option('-c, --certs-dir <path>', 'Directory to persist CA certificates (in-memory if omitted)')
  .option('--include-hosts <hosts>', 'Only intercept TLS for these hosts (comma-separated, supports * wildcards)')
  .option('--exclude-hosts <hosts>', 'Do not intercept TLS for these hosts (comma-separated, supports * wildcards)')
  .parse()

const opts = program.opts<{ tlsProvider: string; tlsFingerprint: string; port: string; host: string; certsDir?: string; includeHosts?: string; excludeHosts?: string }>()

// Validate mutual exclusivity of host filters
if (opts.includeHosts && opts.excludeHosts) {
  console.error('Error: --include-hosts and --exclude-hosts are mutually exclusive')
  process.exit(1)
}

const includeHosts = opts.includeHosts?.split(',').map(h => h.trim()).filter(Boolean)
const excludeHosts = opts.excludeHosts?.split(',').map(h => h.trim()).filter(Boolean)

// Try to load utls provider
const providers: TLSProvider[] = []
try {
  const utls = await import('@clancyapp/utls')
  providers.push(utls.utlsProvider)
} catch (err) {
  if (opts.tlsProvider === 'utls') {
    console.warn('[TLS] @clancyapp/utls not available — falling back to native TLS')
    console.warn('[TLS] Install with: npm install @clancyapp/utls')
    console.warn('[TLS]', (err as Error).message)
  }
}

const staticDir = path.join(__dirname, 'public')

const server = createServer({
  port: parseInt(opts.port || process.env.PORT || '9090', 10),
  host: opts.host || process.env.HOST || 'localhost',
  tlsProvider: opts.tlsProvider || process.env.TLS_PROVIDER || 'native',
  tlsFingerprint: (opts.tlsFingerprint || process.env.TLS_FINGERPRINT || 'electron') as TLSFingerprint,
  staticDir,
  certsDir: opts.certsDir,
  providers,
  includeHosts,
  excludeHosts
})

server.start().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...')
  await server.stop()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('\nShutting down...')
  await server.stop()
  process.exit(0)
})
