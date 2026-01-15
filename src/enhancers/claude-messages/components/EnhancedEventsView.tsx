import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { SSEEvent, Flow } from '../../../../shared/types'
import type { EventProps } from '../../types'
import { LogEventItem } from './LogEventItem'

interface EnhancedEventsViewProps {
  flow: Flow
  events: SSEEvent[]
  selectedEventId: string | null
  eventRefs: React.MutableRefObject<Map<string, HTMLDivElement>>
  EventComponent: React.ComponentType<EventProps>
  transformEventData?: (data: string) => unknown
  defaultExpanded?: boolean
}

export function EnhancedEventsView({ 
  flow, 
  events, 
  selectedEventId, 
  eventRefs, 
  EventComponent, 
  transformEventData,
  defaultExpanded = true 
}: EnhancedEventsViewProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  
  return (
    <div className="border-b border-border">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="sticky top-11 z-[9] bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 w-full text-left"
      >
        <div className="px-4 h-11 flex items-center gap-3 border-b border-border">
          <svg
            className={cn(
              'w-4 h-4 transition-transform shrink-0 text-slate-400',
              expanded && 'rotate-90'
            )}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            <span className="text-sm font-medium text-slate-400">
              Events
            </span>
          </div>
          
          <span className="text-xs text-muted-foreground tabular-nums">
            {events.length} event{events.length !== 1 ? 's' : ''}
          </span>
          
          {/* Event type breakdown */}
          <div className="flex items-center gap-2 ml-auto text-xs text-muted-foreground">
            <span className="opacity-50">
              streamed response log
            </span>
          </div>
        </div>
      </button>
      
      {/* Log entries */}
      {expanded && (
        <div className="font-mono text-xs bg-black/20">
          {/* Log header row */}
          <div className="px-3 py-1 flex items-center gap-2 text-muted-foreground/40 border-b border-border/30 text-[10px] uppercase tracking-wider">
            <span className="w-3" />
            <span className="w-24">Time</span>
            <span className="w-1.5" />
            <span className="min-w-[140px]">Event</span>
            <span>#</span>
            <span className="flex-1">Preview</span>
          </div>
          
          {events.map((event, index) => (
            <div
              key={event.eventId}
              ref={(el) => {
                if (el) {
                  eventRefs.current.set(event.eventId, el)
                } else {
                  eventRefs.current.delete(event.eventId)
                }
              }}
            >
              <LogEventItem
                flow={flow}
                event={event}
                index={index}
                isSelected={selectedEventId === event.eventId}
                EventComponent={EventComponent}
                transformEventData={transformEventData}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
