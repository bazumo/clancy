import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { SSEEvent, Flow } from '../../../../shared/types'
import type { EventProps } from '../../types'

interface EventItemViewProps {
  flow: Flow
  event: SSEEvent
  index: number
  isSelected: boolean
  EventComponent?: React.ComponentType<EventProps>
  transformEventData?: (data: string) => unknown
  defaultExpanded?: boolean
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

function formatBody(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2)
  } catch {
    return body
  }
}

function getPreview(data: string): string {
  try {
    const parsed = JSON.parse(data)
    if (parsed.type) {
      return parsed.type
    }
    const keys = Object.keys(parsed)
    return keys.slice(0, 3).join(', ') + (keys.length > 3 ? '...' : '')
  } catch {
    return data.slice(0, 50) + (data.length > 50 ? '...' : '')
  }
}

export function EventItemView({ 
  flow, 
  event, 
  index, 
  isSelected, 
  EventComponent, 
  transformEventData,
  defaultExpanded = true 
}: EventItemViewProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  
  return (
    <div 
      className={cn(
        'border-l-[6px] border-l-cyan-500/50 transition-colors',
        isSelected && 'border-l-cyan-400 bg-cyan-500/10'
      )}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="sticky top-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 z-[8] border-y border-border w-full text-left hover:bg-muted/50 transition-colors"
      >
        <div className="px-4 h-9 flex items-center gap-2">
          <svg
            className={cn(
              'w-4 h-4 text-cyan-400 transition-transform shrink-0',
              expanded && 'rotate-90'
            )}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-xs font-mono text-cyan-400">
            {event.event || 'message'}
          </span>
          <span className="text-xs text-muted-foreground font-mono">
            #{index}
          </span>
          {event.id && (
            <span className="text-xs font-mono text-muted-foreground">
              id: {event.id}
            </span>
          )}
          <span className="text-xs font-mono text-muted-foreground/60 ml-auto shrink-0">
            {formatTime(event.timestamp)}
          </span>
          {!expanded && (
            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
              {getPreview(event.data)}
            </span>
          )}
        </div>
      </button>
      {expanded && (
        <div className="px-4 py-3">
          {EventComponent ? (
            <EventComponent
              flow={flow}
              event={event}
              parsed={transformEventData?.(event.data) ?? null}
            />
          ) : (
            <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-all overflow-x-auto">
              {formatBody(event.data)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

