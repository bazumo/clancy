import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { ClaudeMessagesRequest } from '../types'

interface GeneralViewProps {
  request: ClaudeMessagesRequest
  defaultExpanded?: boolean
}

export function GeneralView({ request, defaultExpanded = false }: GeneralViewProps) {
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
            {request.model}
          </span>
          {request.stream && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400">
              streaming
            </span>
          )}
        </div>
      </button>
      {expanded && (
        <div className="px-4 py-3 space-y-3">
          {/* Model */}
          <div className="flex items-start gap-3">
            <span className="text-xs text-muted-foreground w-24 shrink-0">Model</span>
            <span className="text-xs font-mono text-foreground">{request.model}</span>
          </div>
          
          {/* Max Tokens */}
          {request.max_tokens && (
            <div className="flex items-start gap-3">
              <span className="text-xs text-muted-foreground w-24 shrink-0">Max Tokens</span>
              <div>
                <span className="text-xs font-mono text-foreground">{request.max_tokens.toLocaleString()}</span>
                <p className="text-xs text-muted-foreground mt-0.5">Maximum number of tokens in the response</p>
              </div>
            </div>
          )}
          
          {/* Temperature */}
          {request.temperature !== undefined && (
            <div className="flex items-start gap-3">
              <span className="text-xs text-muted-foreground w-24 shrink-0">Temperature</span>
              <div>
                <span className="text-xs font-mono text-foreground">{request.temperature}</span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Controls randomness (0 = deterministic, 1 = creative)
                </p>
              </div>
            </div>
          )}
          
          {/* Stream */}
          <div className="flex items-start gap-3">
            <span className="text-xs text-muted-foreground w-24 shrink-0">Streaming</span>
            <div>
              <span className={cn(
                'text-xs px-1.5 py-0.5 rounded',
                request.stream ? 'bg-cyan-500/15 text-cyan-400' : 'bg-muted text-muted-foreground'
              )}>
                {request.stream ? 'enabled' : 'disabled'}
              </span>
              <p className="text-xs text-muted-foreground mt-0.5">
                {request.stream ? 'Response sent as server-sent events' : 'Response sent as single JSON'}
              </p>
            </div>
          </div>
          
          {/* Thinking */}
          {request.thinking && (
            <div className="flex items-start gap-3">
              <span className="text-xs text-muted-foreground w-24 shrink-0">Thinking</span>
              <div>
                <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400">
                  {request.thinking.type === 'enabled' ? 'enabled' : 'disabled'}
                </span>
                {request.thinking.type === 'enabled' && (
                  <>
                    <span className="text-xs font-mono text-foreground ml-2">
                      {request.thinking.budget_tokens.toLocaleString()} tokens
                    </span>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Extended thinking budget for complex reasoning
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
          
          {/* Top P */}
          {request.metadata && Object.keys(request.metadata).length > 0 && (
            <div className="flex items-start gap-3">
              <span className="text-xs text-muted-foreground w-24 shrink-0">Metadata</span>
              <pre className="text-xs font-mono text-muted-foreground">
                {JSON.stringify(request.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

