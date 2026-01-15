import { cn } from '@/lib/utils'
import type { Flow, SSEEvent } from '../../../shared/types'
import { formatTime } from '@/lib/format'

interface EventListItemProps {
  flow: Flow
  event: SSEEvent
  isFlowSelected: boolean
  isEventSelected: boolean
  onSelect: () => void
}

export function EventListItem({
  flow,
  event,
  isFlowSelected,
  isEventSelected,
  onSelect,
}: EventListItemProps) {
  const eventType = event.event || 'message'

  // Try to show a meaningful preview of the event data
  const preview = (() => {
    try {
      const parsed = JSON.parse(event.data)
      if (parsed.type) return `type: ${parsed.type}`
      return event.data.slice(0, 50) + (event.data.length > 50 ? '...' : '')
    } catch {
      return event.data.slice(0, 50) + (event.data.length > 50 ? '...' : '')
    }
  })()

  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-80 text-left px-3 py-2 hover:bg-cyan-500/10 transition-colors overflow-hidden border-l-4 border-cyan-500/50',
        isFlowSelected && 'bg-cyan-500/10',
        isEventSelected && 'bg-cyan-500/20'
      )}
    >
      <div className="flex items-center gap-2 mb-1 w-full">
        <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400 shrink-0">
          {eventType}
        </span>
        <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">{flow.host}</span>
        <span className="text-xs text-muted-foreground/60 shrink-0">
          {formatTime(event.timestamp)}
        </span>
      </div>
      <div className="font-mono text-xs text-muted-foreground truncate w-full">{preview}</div>
    </button>
  )
}

