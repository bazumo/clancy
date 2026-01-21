import { useRef, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { FlowListItem } from './FlowListItem'
import { EventListItem } from './EventListItem'
import type { Flow, SSEEvent } from '../../../shared/types'

interface FlowItem {
  type: 'flow'
  flow: Flow
}

interface EventItem {
  type: 'event'
  flow: Flow
  event: SSEEvent
}

type ListItem = FlowItem | EventItem

interface VirtualizedFlowListProps {
  items: ListItem[]
  selectedFlowId: string | null
  selectedEventId: string | null
  flowTagsMap: Map<string, string[]>
  events: Map<string, SSEEvent[]>
  onSelectFlow: (flowId: string) => void
  onSelectEvent: (flowId: string, eventId: string) => void
}

// Fixed heights
const FLOW_HEIGHT = 61 // 60px + 1px border
const EVENT_HEIGHT = 33 // 32px + 1px border

export function VirtualizedFlowList({
  items,
  selectedFlowId,
  selectedEventId,
  flowTagsMap,
  events,
  onSelectFlow,
  onSelectEvent,
}: VirtualizedFlowListProps) {
  const parentRef = useRef<HTMLDivElement>(null)

  // Calculate total height based on actual item counts
  const totalHeight = useMemo(() => {
    let flowCount = 0
    let eventCount = 0

    for (const item of items) {
      if (item.type === 'flow') {
        flowCount++
      } else {
        eventCount++
      }
    }

    return flowCount * FLOW_HEIGHT + eventCount * EVENT_HEIGHT
  }, [items])

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const item = items[index]
      return item.type === 'event' ? EVENT_HEIGHT : FLOW_HEIGHT
    },
    overscan: 15,
  })

  return (
    <div
      ref={parentRef}
      className="flex-1 min-h-0 bg-background overflow-y-auto overflow-x-hidden flow-list-scroll pr-2"
    >
      {items.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">
          Waiting for requests...
        </div>
      ) : (
        <div
          style={{
            height: `${totalHeight}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const item = items[virtualItem.index]

            return (
              <div
                key={virtualItem.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                {item.type === 'flow' ? (
                  <FlowListItem
                    flow={item.flow}
                    isSelected={selectedFlowId === item.flow.id}
                    eventCount={events.get(item.flow.id)?.length || 0}
                    tags={flowTagsMap.get(item.flow.id) || []}
                    onSelect={() => onSelectFlow(item.flow.id)}
                  />
                ) : (
                  <EventListItem
                    flow={item.flow}
                    event={item.event}
                    isFlowSelected={selectedFlowId === item.flow.id}
                    isEventSelected={selectedEventId === item.event.eventId}
                    onSelect={() => onSelectEvent(item.flow.id, item.event.eventId)}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
