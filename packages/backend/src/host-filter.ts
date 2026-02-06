/**
 * Host pattern matching for --include-hosts / --exclude-hosts.
 *
 * Patterns support `*` as a wildcard that matches any sequence of characters.
 *   *.example.com   → matches fonts.example.com, api.example.com
 *   api.*           → matches api.google.com, api.example.org
 *   *cdn*           → matches cdn.example.com, my-cdn-host.net
 *   example.com     → exact match only
 *
 * Trailing :port is stripped from patterns (e.g. "example.com:443" → "example.com")
 * because the CONNECT handler already parses the port separately.
 */

/** Strip a trailing `:port` (digits only) from a pattern. */
export function normalizePattern(pattern: string): string {
  return pattern.replace(/:\d+$/, '')
}

function patternToRegex(pattern: string): RegExp {
  // Escape regex special chars except *, then replace * with .*
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
  const regexStr = escaped.replace(/\*/g, '.*')
  return new RegExp(`^${regexStr}$`)
}

export function hostMatchesPattern(host: string, pattern: string): boolean {
  if (!pattern.includes('*')) {
    return host === pattern
  }
  return patternToRegex(pattern).test(host)
}

export function hostMatchesAny(host: string, patterns: string[]): boolean {
  return patterns.some((p) => hostMatchesPattern(host, p))
}

export function createHostFilter(
  includeHosts?: string[],
  excludeHosts?: string[]
): (host: string) => boolean {
  const normalized = (includeHosts ?? excludeHosts)?.map(normalizePattern)
  if (includeHosts) return (host) => hostMatchesAny(host, normalized!)
  if (excludeHosts) return (host) => !hostMatchesAny(host, normalized!)
  return () => true
}
