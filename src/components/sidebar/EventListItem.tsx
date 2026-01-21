import { memo } from 'react'
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

// Get event type from data
function getEventType(data: string): string {
  try {
    const parsed = JSON.parse(data)
    return parsed.type || 'message'
  } catch {
    return 'message'
  }
}

// Get preview text
function getPreview(data: string): string {
  try {
    const parsed = JSON.parse(data)

    // For content_block_delta, show the text/thinking preview
    if (parsed.type === 'content_block_delta' && parsed.delta) {
      if (parsed.delta.type === 'text_delta' && parsed.delta.text) {
        return parsed.delta.text.slice(0, 40)
      }
      if (parsed.delta.type === 'thinking_delta' && parsed.delta.thinking) {
        return `[thinking] ${parsed.delta.thinking.slice(0, 30)}`
      }
    }

    // For message_start, show model
    if (parsed.type === 'message_start' && parsed.message?.model) {
      return parsed.message.model
    }

    // For content_block_start, show block type
    if (parsed.type === 'content_block_start' && parsed.content_block?.type) {
      return parsed.content_block.type
    }

    return data.slice(0, 40)
  } catch {
    return data.slice(0, 40)
  }
}

export const EventListItem = memo(function EventListItem({
  event,
  isFlowSelected,
  isEventSelected,
  onSelect,
}: EventListItemProps) {
  const eventType = event.event || getEventType(event.data)
  const preview = getPreview(event.data)

  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full text-left px-3 py-1 hover:bg-cyan-500/10 transition-colors overflow-hidden border-l-2 border-cyan-500/30 h-[32px] flex items-center gap-2',
        'font-mono text-xs',
        isFlowSelected && 'bg-cyan-500/5',
        isEventSelected && 'bg-cyan-500/15'
      )}
    >
      {/* Dot indicator */}
      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />

      {/* Event type */}
      <span className="text-cyan-400 shrink-0 min-w-[100px] truncate">
        {eventType}
      </span>

      {/* Sequence number */}
      {event.sequence !== undefined && (
        <span className="text-muted-foreground/40 shrink-0 text-[10px] w-[3ch] text-right tabular-nums">
          #{event.sequence}
        </span>
      )}

      {/* Preview */}
      <span className="text-muted-foreground/60 truncate flex-1 text-[10px]">
        {preview}
      </span>

      {/* Time */}
      <span className="text-muted-foreground/40 shrink-0 text-[10px] tabular-nums">
        {formatTime(event.timestamp).split(' ')[0]}
      </span>
    </button>
  )
})

