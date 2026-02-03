import type { Flow } from '../../shared/types'

/**
 * Convert a Flow object into a curl command string.
 */
export function flowToCurl(flow: Flow): string {
  const parts: string[] = ['curl']

  // Method (omit for GET since it's the default)
  if (flow.request.method !== 'GET') {
    parts.push(`-X ${flow.request.method}`)
  }

  // URL
  parts.push(`'${escapeShell(flow.request.url)}'`)

  // Headers
  for (const [key, value] of Object.entries(flow.request.headers)) {
    if (value === undefined) continue
    // Skip pseudo-headers and host (curl sets it from URL)
    const lowerKey = key.toLowerCase()
    if (lowerKey === 'host' || lowerKey === 'content-length') continue

    const values = Array.isArray(value) ? value : [value]
    for (const v of values) {
      parts.push(`-H '${escapeShell(`${key}: ${v}`)}'`)
    }
  }

  // Body
  if (flow.request.body) {
    parts.push(`-d '${escapeShell(flow.request.body)}'`)
  }

  return parts.join(' \\\n  ')
}

function escapeShell(s: string): string {
  return s.replace(/'/g, "'\\''")
}
