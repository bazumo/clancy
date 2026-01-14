import { useState } from 'react'
import { cn } from '@/lib/utils'

interface RawBodyViewProps {
  body: string
  defaultExpanded?: boolean
}

function formatBody(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2)
  } catch {
    return body
  }
}

export function RawBodyView({ body, defaultExpanded = true }: RawBodyViewProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  
  // Try to get a size estimate
  let sizeText = ''
  try {
    const parsed = JSON.parse(body)
    if (typeof parsed === 'object' && parsed !== null) {
      const keys = Object.keys(parsed)
      sizeText = `${keys.length} key${keys.length !== 1 ? 's' : ''}`
    }
  } catch {
    sizeText = `${body.length} chars`
  }
  
  return (
    <div className="border-l-[6px] border-l-slate-500">
      <button
        onClick={() => setExpanded(!expanded)}
        className="sticky top-11 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 z-[9] border-y border-border w-full text-left"
      >
        <div className="px-4 h-9 flex items-center gap-2">
          <svg
            className={cn(
              'w-4 h-4 text-slate-400 transition-transform shrink-0',
              expanded && 'rotate-90'
            )}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Body
          </span>
          <span className="text-xs text-muted-foreground">
            {sizeText}
          </span>
        </div>
      </button>
      {expanded && (
        <div className="px-4 py-3">
          <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-all overflow-x-auto">
            {formatBody(body)}
          </pre>
        </div>
      )}
    </div>
  )
}

