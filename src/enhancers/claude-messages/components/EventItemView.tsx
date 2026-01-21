import { cn } from '@/lib/utils'
import type { SSEEvent, Flow } from '../../../../shared/types'
import type { EventProps } from '../../types'
import { CollapsibleSection, sectionTypeColors } from '@/components/CollapsibleSection'

interface EventItemViewProps {
  flow: Flow
  event: SSEEvent
  index: number
  isSelected: boolean
  EventComponent?: React.ComponentType<EventProps>
  transformEventData?: (data: string) => unknown
  defaultExpanded?: boolean
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

function formatBody(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2)
  } catch {
    return body
  }
}

function getPreview(data: string): string {
  try {
    const parsed = JSON.parse(data)
    if (parsed.type) {
      return parsed.type
    }
    const keys = Object.keys(parsed)
    return keys.slice(0, 3).join(', ') + (keys.length > 3 ? '...' : '')
  } catch {
    return data.slice(0, 50) + (data.length > 50 ? '...' : '')
  }
}

export function EventItemView({ 
  flow, 
  event, 
  index, 
  isSelected, 
  EventComponent, 
  transformEventData,
  defaultExpanded = true 
}: EventItemViewProps) {
  return (
    <CollapsibleSection
      title={event.event || 'message'}
      color={sectionTypeColors.events}
      level={2}
      defaultExpanded={defaultExpanded}
      hoverEffect
      borderClassName={cn(
        'border-l-cyan-500/50 transition-colors',
        isSelected && 'border-l-cyan-400 bg-cyan-500/10'
      )}
      className={isSelected ? 'bg-cyan-500/10' : undefined}
      headerContent={
        <>
          <span className="text-xs text-muted-foreground font-mono">
            #{index}
          </span>
          {event.id && (
            <span className="text-xs font-mono text-muted-foreground">
              id: {event.id}
            </span>
          )}
          <span className="text-xs font-mono text-muted-foreground/60 ml-auto shrink-0">
            {formatTime(event.timestamp)}
          </span>
        </>
      }
      collapsedContent={
        <span className="text-xs text-muted-foreground truncate max-w-[200px]">
          {getPreview(event.data)}
        </span>
      }
    >
      {EventComponent ? (
        <EventComponent
          flow={flow}
          event={event}
          parsed={transformEventData?.(event.data) ?? null}
        />
      ) : (
        <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-all overflow-x-auto">
          {formatBody(event.data)}
        </pre>
      )}
    </CollapsibleSection>
  )
}
