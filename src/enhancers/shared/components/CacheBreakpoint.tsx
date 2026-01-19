/**
 * Generic cache breakpoint indicator component
 * Used to display cache control information for both Claude and Bedrock APIs
 */

const CacheIcon = () => (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
  </svg>
)

export interface CacheBreakpointProps {
  /** The cache control type (e.g., 'ephemeral', 'default') */
  type: string
  /** Optional TTL value */
  ttl?: string
  /** Optional custom label prefix (defaults to 'cache_control') */
  labelPrefix?: string
}

/**
 * Full-width cache breakpoint divider with centered label
 * Used in message views to indicate cache boundaries
 */
export function CacheBreakpointDivider({ type, ttl, labelPrefix = 'cache_control' }: CacheBreakpointProps) {
  return (
    <div className="relative mt-2">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-dashed border-amber-500/40" />
      </div>
      <div className="relative flex justify-center">
        <span className="px-2 py-0.5 text-[10px] font-mono bg-background text-amber-400 flex items-center gap-1.5">
          <CacheIcon />
          <span className="opacity-70">↑ cached up to here</span>
          <span className="text-amber-500">
            {labelPrefix}: {type}
            {ttl && ` (${ttl})`}
          </span>
        </span>
      </div>
    </div>
  )
}

/**
 * Inline cache control badge
 * Used in tools view and other compact displays
 */
export function CacheControlBadge({ type, ttl, labelPrefix = 'cache_control' }: CacheBreakpointProps) {
  return (
    <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">
      {labelPrefix}: {type}
      {ttl && ` (${ttl})`}
    </span>
  )
}
