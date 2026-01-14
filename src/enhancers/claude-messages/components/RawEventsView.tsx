import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { SSEEvent } from '../../../../shared/types'

interface RawEventsViewProps {
  events: SSEEvent[]
  selectedEventId: string | null
  eventRefs: React.MutableRefObject<Map<string, HTMLDivElement>>
  defaultExpanded?: boolean
}

function formatBody(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2)
  } catch {
    return body
  }
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

export function RawEventsView({ events, selectedEventId, eventRefs, defaultExpanded = true }: RawEventsViewProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  
  return (
    <div className="border-l-[6px] border-l-cyan-500">
      <button
        onClick={() => setExpanded(!expanded)}
        className="sticky top-11 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 z-[9] border-y border-border w-full text-left"
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
          <span className="text-xs font-medium uppercase tracking-wider text-cyan-400">
            Events
          </span>
          <span className="text-xs text-muted-foreground">
            {events.length} event{events.length !== 1 ? 's' : ''}
          </span>
        </div>
      </button>
      {expanded && (
        <div className="py-2">
          <div className="space-y-0">
            {events.map((event) => (
              <div
                key={event.eventId}
                ref={(el) => {
                  if (el) {
                    eventRefs.current.set(event.eventId, el)
                  } else {
                    eventRefs.current.delete(event.eventId)
                  }
                }}
                className={cn(
                  'border-l-4 border-cyan-500/50 ml-4 transition-colors',
                  selectedEventId === event.eventId && 'border-cyan-400 bg-cyan-500/10 ring-1 ring-cyan-500/30'
                )}
              >
                <div className="bg-muted/30 px-3 h-8 flex items-center gap-2">
                  <span className="text-xs font-mono text-cyan-400">
                    {event.event || 'message'}
                  </span>
                  {event.id && (
                    <span className="text-xs font-mono text-muted-foreground">
                      id: {event.id}
                    </span>
                  )}
                  <span className="text-xs font-mono text-muted-foreground/60 ml-auto">
                    {formatTime(event.timestamp)}
                  </span>
                </div>
                <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-all overflow-x-auto px-3 py-2">
                  {formatBody(event.data)}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

