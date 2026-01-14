import type { SSEEvent, Flow } from '../../../../shared/types'
import { EventItemView } from './EventItemView'
import { CollapsibleSection, sectionTypeColors } from '@/components'

interface RawEventsViewProps {
  flow: Flow
  events: SSEEvent[]
  selectedEventId: string | null
  eventRefs: React.MutableRefObject<Map<string, HTMLDivElement>>
  defaultExpanded?: boolean
}

export function RawEventsView({ flow, events, selectedEventId, eventRefs, defaultExpanded = true }: RawEventsViewProps) {
  return (
    <CollapsibleSection
      title="Events"
      color={sectionTypeColors.events}
      defaultExpanded={defaultExpanded}
      contentClassName="py-2"
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
            />
          </div>
        ))}
      </div>
    </CollapsibleSection>
  )
}
