import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { ThinkingBlock as ThinkingBlockType } from '../types'

interface ThinkingBlockProps {
  block: ThinkingBlockType
  defaultExpanded?: boolean
}

export function ThinkingBlock({ block, defaultExpanded = false }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  const previewText = block.thinking.slice(0, 120).replace(/\n/g, ' ')
  const hasMore = block.thinking.length > 120

  return (
    <div className="my-0.5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="group flex items-start gap-1.5 text-left w-full py-0.5"
      >
        <svg
          className={cn(
            'w-3 h-3 text-purple-400/60 transition-transform shrink-0 mt-[1px]',
            expanded && 'rotate-90'
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-xs font-medium text-purple-400/70 shrink-0">thinking</span>
        {block.signature && (
          <span className="text-[10px] text-purple-400/40 shrink-0" title="Signed thinking block">
            signed
          </span>
        )}
        {!expanded && (
          <span className="text-[10px] text-muted-foreground/50 truncate flex-1 group-hover:text-muted-foreground/70 transition-colors">
            {previewText}{hasMore && '...'}
          </span>
        )}
      </button>

      {expanded && (
        <div className="pl-[18px] pb-1">
          <pre className="text-xs font-mono text-foreground/60 whitespace-pre-wrap break-words leading-relaxed">
            {block.thinking}
          </pre>
        </div>
      )}
    </div>
  )
}
