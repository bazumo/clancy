import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { SystemBlock } from '../types'

interface SystemPromptViewProps {
  system: string | SystemBlock[]
  defaultExpanded?: boolean
}

export function SystemPromptView({ system, defaultExpanded = true }: SystemPromptViewProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const isArray = Array.isArray(system)
  const hasCache = isArray && system.some(block => block.cache_control)
  
  return (
    <div className="border-l-[6px] border-l-amber-500">
      <button
        onClick={() => setExpanded(!expanded)}
        className="sticky top-11 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 z-[9] border-y border-border w-full text-left"
      >
        <div className="px-4 h-9 flex items-center gap-2">
          <svg
            className={cn(
              'w-4 h-4 text-amber-400 transition-transform shrink-0',
              expanded && 'rotate-90'
            )}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-xs font-medium uppercase tracking-wider text-amber-400">
            System
          </span>
          {isArray && (
            <span className="text-xs text-muted-foreground">
              {system.length} block{system.length !== 1 ? 's' : ''}
            </span>
          )}
          {hasCache && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">
              cached
            </span>
          )}
        </div>
      </button>
      {expanded && (
        <div className="px-4 py-3">
          {typeof system === 'string' ? (
            <p className="text-xs whitespace-pre-wrap break-words">{system}</p>
          ) : (
            <div className="space-y-2">
              {system.map((block, i) => (
                <p key={i} className="text-xs whitespace-pre-wrap break-words">
                  {block.text}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

