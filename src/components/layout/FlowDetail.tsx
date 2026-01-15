import { ScrollArea } from '@/components/ui/scroll-area'
import type { Flow, SSEEvent } from '../../../shared/types'
import type { EnhancerMatch } from '@/enhancers'
import type { ViewMode } from '@/components/ViewModeToggle'

interface FlowDetailProps {
  flow: Flow | null
  events: SSEEvent[]
  enhancer: EnhancerMatch | null
  tags: string[]
  selectedEventId: string | null
  eventRefs: React.MutableRefObject<Map<string, HTMLDivElement>>
  requestViewMode: ViewMode
  responseViewMode: ViewMode
  onRequestViewModeChange: (mode: ViewMode) => void
  onResponseViewModeChange: (mode: ViewMode) => void
  renderRequestSection: () => React.ReactNode
  renderResponseSection: () => React.ReactNode
}

export function FlowDetail({
  flow,
  renderRequestSection,
  renderResponseSection,
}: FlowDetailProps) {
  if (!flow) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        Select a request to view details
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col min-w-0" style={{ maxWidth: 'calc(100vw - 320px)' }}>
        {renderRequestSection()}
        {renderResponseSection()}
      </div>
    </ScrollArea>
  )
}

