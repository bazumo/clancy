import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { ThinkingBlock as ThinkingBlockType } from '../types'

interface ThinkingBlockProps {
  block: ThinkingBlockType
  defaultExpanded?: boolean
}

export function ThinkingBlock({ block, defaultExpanded = false }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  
  const previewText = block.thinking.slice(0, 100).replace(/\n/g, ' ')
  const hasMore = block.thinking.length > 100
  
  return (
    <div className="border border-purple-500/30 rounded-md overflow-hidden bg-purple-500/5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-purple-500/10 transition-colors text-left"
      >
        <svg
          className={cn(
            'w-4 h-4 text-purple-400 transition-transform shrink-0',
            expanded && 'rotate-90'
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-xs font-medium text-purple-400 uppercase tracking-wider shrink-0">
          Thinking
        </span>
        {block.signature && (
          <span className="text-xs text-purple-400/60 shrink-0" title="Signed thinking block">
            [signed]
          </span>
        )}
        {!expanded && (
          <span className="text-xs text-muted-foreground truncate flex-1">
            {previewText}{hasMore && '...'}
          </span>
        )}
      </button>
      
      {expanded && (
        <div className="px-3 pb-3 border-t border-purple-500/20">
          <pre className="text-xs font-mono text-foreground/80 whitespace-pre-wrap break-words mt-2">
            {block.thinking}
          </pre>
        </div>
      )}
    </div>
  )
}

