import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { SSEEvent, Flow } from '../../../../shared/types'
import type { EventProps } from '../../types'

interface LogEventItemProps {
  flow: Flow
  event: SSEEvent
  index: number
  isSelected: boolean
  EventComponent?: React.ComponentType<EventProps>
  transformEventData?: (data: string) => unknown
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  })
}

function formatBody(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2)
  } catch {
    return body
  }
}

// Map event types to colors for the log view
const eventTypeColors: Record<string, { dot: string; text: string; bg: string }> = {
  message_start: { dot: 'bg-emerald-400', text: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  message_delta: { dot: 'bg-amber-400', text: 'text-amber-400', bg: 'bg-amber-500/10' },
  message_stop: { dot: 'bg-emerald-400', text: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  content_block_start: { dot: 'bg-blue-400', text: 'text-blue-400', bg: 'bg-blue-500/10' },
  content_block_delta: { dot: 'bg-cyan-400', text: 'text-cyan-400', bg: 'bg-cyan-500/10' },
  content_block_stop: { dot: 'bg-slate-400', text: 'text-slate-400', bg: 'bg-slate-500/10' },
  ping: { dot: 'bg-slate-500', text: 'text-slate-500', bg: 'bg-slate-500/5' },
  error: { dot: 'bg-red-400', text: 'text-red-400', bg: 'bg-red-500/10' },
}

function getEventType(data: string): string {
  try {
    const parsed = JSON.parse(data)
    return parsed.type || 'unknown'
  } catch {
    return 'unknown'
  }
}

function getPreview(data: string): string {
  try {
    const parsed = JSON.parse(data)
    
    // For content_block_delta, show the text/thinking preview
    if (parsed.type === 'content_block_delta' && parsed.delta) {
      if (parsed.delta.text) return parsed.delta.text.slice(0, 60)
      if (parsed.delta.thinking) return parsed.delta.thinking.slice(0, 60)
      if (parsed.delta.partial_json) return 'partial_json'
    }
    
    // For message_start, show model
    if (parsed.type === 'message_start' && parsed.message?.model) {
      return parsed.message.model
    }
    
    // For message_delta, show stop reason
    if (parsed.type === 'message_delta' && parsed.delta?.stop_reason) {
      return parsed.delta.stop_reason
    }
    
    // For content_block_start, show block type
    if (parsed.type === 'content_block_start' && parsed.content_block?.type) {
      return parsed.content_block.type
    }
    
    return ''
  } catch {
    return ''
  }
}

export function LogEventItem({ 
  flow, 
  event, 
  index, 
  isSelected, 
  EventComponent, 
  transformEventData 
}: LogEventItemProps) {
  const [expanded, setExpanded] = useState(false)
  const eventType = event.event || getEventType(event.data)
  const colors = eventTypeColors[eventType] || { dot: 'bg-slate-400', text: 'text-slate-400', bg: 'bg-slate-500/5' }
  const preview = getPreview(event.data)
  
  return (
    <div className={cn(
      'border-b border-border/50 transition-colors',
      isSelected && 'bg-cyan-500/5',
      expanded && colors.bg
    )}>
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-white/[0.02] transition-colors',
          'font-mono text-xs'
        )}
      >
        {/* Expand indicator */}
        <svg
          className={cn(
            'w-3 h-3 transition-transform shrink-0 text-muted-foreground/50',
            expanded && 'rotate-90'
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        
        {/* Timestamp */}
        <span className="text-muted-foreground/60 tabular-nums shrink-0 w-24">
          {formatTime(event.timestamp)}
        </span>
        
        {/* Event type dot + label */}
        <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', colors.dot)} />
        <span className={cn('shrink-0 min-w-[140px]', colors.text)}>
          {eventType}
        </span>
        
        {/* Index */}
        <span className="text-muted-foreground/40 shrink-0">
          #{index}
        </span>
        
        {/* Preview */}
        {preview && (
          <span className="text-muted-foreground/60 truncate flex-1">
            {preview}
          </span>
        )}
        
        {/* Event ID if present */}
        {event.id && (
          <span className="text-muted-foreground/30 shrink-0 ml-auto">
            id:{event.id}
          </span>
        )}
      </button>
      
      {/* Expanded content */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 ml-[38px] border-l border-border/30">
          {EventComponent ? (
            <EventComponent
              flow={flow}
              event={event}
              parsed={transformEventData?.(event.data) ?? null}
            />
          ) : (
            <pre className="text-xs font-mono text-foreground/70 whitespace-pre-wrap break-all overflow-x-auto">
              {formatBody(event.data)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

