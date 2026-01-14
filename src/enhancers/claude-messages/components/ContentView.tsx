import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { ContentBlock as ContentBlockType } from '../types'
import { ContentBlock } from './ContentBlock'

interface ContentViewProps {
  content: ContentBlockType[]
  defaultExpanded?: boolean
}

export function ContentView({ content, defaultExpanded = true }: ContentViewProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  
  const hasThinking = content.some(b => b.type === 'thinking')
  const hasToolUse = content.some(b => b.type === 'tool_use')
  
  return (
    <div className="border-l-[6px] border-l-emerald-500">
      <button
        onClick={() => setExpanded(!expanded)}
        className="sticky top-11 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 z-[9] border-y border-border w-full text-left"
      >
        <div className="px-4 h-9 flex items-center gap-2">
          <svg
            className={cn(
              'w-4 h-4 text-emerald-400 transition-transform shrink-0',
              expanded && 'rotate-90'
            )}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-xs font-medium uppercase tracking-wider text-emerald-400">
            Content
          </span>
          <span className="text-xs text-muted-foreground">
            {content.length} block{content.length !== 1 ? 's' : ''}
          </span>
          {hasThinking && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400">
              thinking
            </span>
          )}
          {hasToolUse && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400">
              tool_use
            </span>
          )}
        </div>
      </button>
      {expanded && (
        <div className="px-4 py-3 space-y-2">
          {content.map((block, i) => (
            <ContentBlock key={i} block={block} />
          ))}
        </div>
      )}
    </div>
  )
}

