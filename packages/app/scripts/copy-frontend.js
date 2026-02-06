import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const src = path.resolve(__dirname, '..', '..', 'frontend', 'dist')
const dest = path.resolve(__dirname, '..', 'dist', 'public')

if (!fs.existsSync(src)) {
  console.warn(`[copy-frontend] Source not found: ${src} — skipping`)
  process.exit(0)
}

fs.cpSync(src, dest, { recursive: true })
console.log(`[copy-frontend] Copied frontend dist → ${dest}`)
