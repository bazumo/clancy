import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const binaryPath = path.join(__dirname, 'bin', 'tls-proxy')
