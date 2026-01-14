import { useState } from 'react'
import { cn } from '@/lib/utils'

interface HeadersViewProps {
  headers: Record<string, string | string[] | undefined>
  defaultExpanded?: boolean
}

function formatHeaders(headers: Record<string, string | string[] | undefined>): string {
  return Object.entries(headers)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
    .join('\n')
}

export function HeadersView({ headers, defaultExpanded = true }: HeadersViewProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  
  return (
    <div className="border-l-[6px] border-l-gray-500">
      <button
        onClick={() => setExpanded(!expanded)}
        className="sticky top-11 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 z-[9] border-y border-border w-full text-left"
      >
        <div className="px-4 h-9 flex items-center gap-2">
          <svg
            className={cn(
              'w-4 h-4 text-gray-400 transition-transform shrink-0',
              expanded && 'rotate-90'
            )}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
            Headers
          </span>
        
        </div>
      </button>
      {expanded && (
        <div className="px-4 py-3">
          <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all overflow-x-auto">
            {formatHeaders(headers)}
          </pre>
        </div>
      )}
    </div>
  )
}

