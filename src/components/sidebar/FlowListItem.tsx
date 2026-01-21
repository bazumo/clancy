import { cn } from '@/lib/utils'
import { MethodBadge, StatusBadge, EventCountBadge } from '@/components'
import type { Flow } from '../../../shared/types'
import { formatTime } from '@/lib/format'

interface FlowListItemProps {
  flow: Flow
  isSelected: boolean
  eventCount: number
  tags: string[]
  onSelect: () => void
}

export function FlowListItem({ flow, isSelected, eventCount, onSelect }: FlowListItemProps) { // eslint-disable-line @typescript-eslint/no-unused-vars
  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors overflow-hidden h-[60px] flex flex-col justify-center',
        isSelected && 'bg-muted'
      )}
    >
      <div className="flex items-center gap-2 mb-1 w-full">
        <MethodBadge method={flow.request.method} className="shrink-0" />
        <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">{flow.host}</span>
        {flow.isSSE && <EventCountBadge count={eventCount} />}
        {flow.response && <StatusBadge status={flow.response.status} className="shrink-0" />}
      </div>
      <div className="flex items-center gap-2 w-full">
        <span className="font-mono text-xs text-muted-foreground truncate flex-1 min-w-0">
          {flow.request.path}
        </span>
        <span className="text-xs text-muted-foreground/60 shrink-0">
          {formatTime(flow.timestamp)}
        </span>
      </div>
    </button>
  )
}

