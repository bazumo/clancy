import { ScrollArea } from '@/components/ui/scroll-area'
import type { SidebarItem } from '@/hooks/useFilters'
import type { SSEEvent } from '../../../shared/types'

interface SidebarProps {
  filterBox: React.ReactNode
  items: SidebarItem[]
  selectedFlowId: string | null
  selectedEventId: string | null
  events: Map<string, SSEEvent[]>
  flowTagsMap: Map<string, string[]>
  onSelectFlow: (flowId: string) => void
  onSelectEvent: (flowId: string, eventId: string) => void
  renderFlowItem: (props: {
    item: Extract<SidebarItem, { type: 'flow' }>
    isSelected: boolean
    eventCount: number
    tags: string[]
    onSelect: () => void
  }) => React.ReactNode
  renderEventItem: (props: {
    item: Extract<SidebarItem, { type: 'event' }>
    isFlowSelected: boolean
    isEventSelected: boolean
    onSelect: () => void
  }) => React.ReactNode
}

export function Sidebar({
  filterBox,
  items,
  selectedFlowId,
  selectedEventId,
  events,
  flowTagsMap,
  onSelectFlow,
  onSelectEvent,
  renderFlowItem,
  renderEventItem,
}: SidebarProps) {
  return (
    <aside className="w-80 border-r border-border shrink-0 flex flex-col min-h-0">
      {filterBox}
      <ScrollArea className="flex-1 min-h-0">
        {items.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">
            Waiting for requests...
          </div>
        ) : (
          <div className="divide-y divide-border w-80">
            {items.map((item) => {
              if (item.type === 'flow') {
                const eventCount = events.get(item.flow.id)?.length || 0
                const tags = flowTagsMap.get(item.flow.id) || []
                return renderFlowItem({
                  item,
                  isSelected: selectedFlowId === item.flow.id,
                  eventCount,
                  tags,
                  onSelect: () => onSelectFlow(item.flow.id),
                })
              } else {
                return renderEventItem({
                  item,
                  isFlowSelected: selectedFlowId === item.flow.id,
                  isEventSelected: selectedEventId === item.event.eventId,
                  onSelect: () => onSelectEvent(item.flow.id, item.event.eventId),
                })
              }
            })}
          </div>
        )}
      </ScrollArea>
    </aside>
  )
}

