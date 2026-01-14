import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { Tool } from '../types'

interface ToolsViewProps {
  tools: Tool[]
  defaultExpanded?: boolean
}

export function ToolsView({ tools, defaultExpanded = false }: ToolsViewProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  
  return (
    <div className="border-l-[6px] border-l-blue-500">
      <button
        onClick={() => setExpanded(!expanded)}
        className="sticky top-11 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 z-[9] border-y border-border w-full text-left"
      >
        <div className="px-4 h-9 flex items-center gap-2">
          <svg
            className={cn(
              'w-4 h-4 text-blue-400 transition-transform shrink-0',
              expanded && 'rotate-90'
            )}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-xs font-medium uppercase tracking-wider text-blue-400">
            Tools
          </span>
          <span className="text-xs text-muted-foreground">
            {tools.length} tool{tools.length !== 1 ? 's' : ''}
          </span>
          {!expanded && (
            <span className="text-xs text-muted-foreground truncate flex-1 ml-2">
              {tools.map(t => t.name).join(', ')}
            </span>
          )}
        </div>
      </button>
      {expanded && (
        <div className="px-4 py-3 space-y-2">
          {tools.map((tool, i) => (
            <div key={i} className="text-xs border border-border/50 rounded px-3 py-2 bg-muted/30">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono font-medium text-blue-400">{tool.name}</span>
              </div>
              <p className="text-muted-foreground">{tool.description}</p>
              {tool.input_schema && (
                <details className="mt-2">
                  <summary className="text-muted-foreground cursor-pointer hover:text-foreground">
                    Schema
                  </summary>
                  <pre className="mt-1 text-xs font-mono text-muted-foreground overflow-x-auto">
                    {JSON.stringify(tool.input_schema, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

