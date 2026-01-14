import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { ClaudeMessagesResponse } from '../types'

interface ResponseGeneralViewProps {
  response: ClaudeMessagesResponse
  defaultExpanded?: boolean
}

export function ResponseGeneralView({ response, defaultExpanded = true }: ResponseGeneralViewProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  
  return (
    <div className="border-l-[6px] border-l-zinc-500">
      <button
        onClick={() => setExpanded(!expanded)}
        className="sticky top-11 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 z-[9] border-y border-border w-full text-left"
      >
        <div className="px-4 h-9 flex items-center gap-2">
          <svg
            className={cn(
              'w-4 h-4 text-zinc-400 transition-transform shrink-0',
              expanded && 'rotate-90'
            )}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">
            General
          </span>
          <span className="text-xs font-mono text-muted-foreground">
            {response.model}
          </span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">
            {response.stop_reason}
          </span>
        </div>
      </button>
      {expanded && (
        <div className="px-4 py-3 space-y-3">
          {/* Model */}
          <div className="flex items-start gap-3">
            <span className="text-xs text-muted-foreground w-24 shrink-0">Model</span>
            <span className="text-xs font-mono text-foreground">{response.model}</span>
          </div>
          
          {/* Message ID */}
          <div className="flex items-start gap-3">
            <span className="text-xs text-muted-foreground w-24 shrink-0">Message ID</span>
            <span className="text-xs font-mono text-foreground">{response.id}</span>
          </div>
          
          {/* Stop Reason */}
          <div className="flex items-start gap-3">
            <span className="text-xs text-muted-foreground w-24 shrink-0">Stop Reason</span>
            <div>
              <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">
                {response.stop_reason}
              </span>
              <p className="text-xs text-muted-foreground mt-0.5">
                {response.stop_reason === 'end_turn' && 'Model completed its response naturally'}
                {response.stop_reason === 'max_tokens' && 'Response was cut off at max token limit'}
                {response.stop_reason === 'stop_sequence' && 'Model encountered a stop sequence'}
                {response.stop_reason === 'tool_use' && 'Model is requesting to use a tool'}
              </p>
            </div>
          </div>
          
          {/* Stop Sequence */}
          {response.stop_sequence && (
            <div className="flex items-start gap-3">
              <span className="text-xs text-muted-foreground w-24 shrink-0">Stop Sequence</span>
              <span className="text-xs font-mono text-foreground">{response.stop_sequence}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

