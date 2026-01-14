import type { SSEEvent, Flow } from '../../../../shared/types'
import type { EventProps } from '../../types'
import { EventItemView } from './EventItemView'
import { CollapsibleSection, sectionTypeColors } from '@/components'

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
  return (
    <CollapsibleSection
      title="Events"
      color={sectionTypeColors.events}
      defaultExpanded={defaultExpanded}
      contentClassName=""
      headerContent={
        <span className="text-xs text-muted-foreground">
          {events.length} event{events.length !== 1 ? 's' : ''}
        </span>
      }
    >
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
    </CollapsibleSection>
  )
}
