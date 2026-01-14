import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { SSEEvent, Flow } from '../../../../shared/types'
import type { EventProps } from '../../types'
import { EventItemView } from './EventItemView'

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
        <div className="">
          <div className="space-y-0">
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
                <EventItemView
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
        </div>
      )}
    </div>
  )
}
