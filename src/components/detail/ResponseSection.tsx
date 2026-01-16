import type { Flow, SSEEvent } from '../../../shared/types'
import type { EnhancerMatch } from '@/enhancers'
import type { ViewMode } from '@/components/ViewModeToggle'
import { ViewModeToggle, StatusBadge } from '@/components'
import { FetchedRawHttpView } from '@/enhancers/claude-messages/components/FetchedRawHttpView'
import { RawEventsView } from '@/enhancers/claude-messages/components/RawEventsView'
import { EnhancedEventsView } from '@/enhancers/claude-messages/components/EnhancedEventsView'
import { HttpBodyView } from './HttpBodyView'
import { getResponseViewModes, getEffectiveResponseViewMode } from '@/lib/format'

interface ResponseSectionProps {
  flow: Flow
  events: SSEEvent[]
  enhancer: EnhancerMatch | null
  selectedEventId: string | null
  eventRefs: React.MutableRefObject<Map<string, HTMLDivElement>>
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
}

export function ResponseSection({
  flow,
  events,
  enhancer,
  selectedEventId,
  eventRefs,
  viewMode,
  onViewModeChange,
}: ResponseSectionProps) {
  const hasEvents = events.length > 0
  const modes = getResponseViewModes(flow, enhancer, hasEvents)
  const effectiveMode = getEffectiveResponseViewMode(viewMode, flow, hasEvents)

  const renderContent = () => {
    if (!flow.response) {
      return (
        <div className="px-4 pb-4 text-xs text-muted-foreground">Waiting for response...</div>
      )
    }

    if (effectiveMode === 'raw' && flow.hasRawHttp) {
      return <FetchedRawHttpView flowId={flow.id} type="response" />
    }

    if (effectiveMode === 'http') {
      return <HttpBodyView headers={flow.response.headers} body={flow.response.body} />
    }

    if (effectiveMode === 'events') {
      return (
        <RawEventsView
          flow={flow}
          events={events}
          selectedEventId={selectedEventId}
          eventRefs={eventRefs}
        />
      )
    }

    if (effectiveMode === 'enhanced' && enhancer) {
      const EventComponent = enhancer.enhancer.EventComponent
      const ResponseBodyComponent = enhancer.enhancer.ResponseBodyComponent

      if (hasEvents && EventComponent) {
        return (
          <EnhancedEventsView
            flow={flow}
            events={events}
            selectedEventId={selectedEventId}
            eventRefs={eventRefs}
            EventComponent={EventComponent}
            transformEventData={enhancer.enhancer.transformEventData}
          />
        )
      }

      if (flow.response.body && ResponseBodyComponent) {
        return (
          <ResponseBodyComponent
            flow={flow}
            body={flow.response.body}
            parsed={enhancer.enhancer.transformResponseBody?.(flow.response.body) ?? null}
          />
        )
      }
    }

    // Fallback
    return <HttpBodyView headers={flow.response.headers} body={flow.response.body} />
  }

  return (
    <div className="min-w-0">
      <div className="sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 z-10 border-b border-border h-11">
        <div className="px-4 h-full flex items-center gap-3 min-w-0 overflow-hidden">
          <span className="text-xs font-medium uppercase tracking-wider text-amber-400 shrink-0">
            Response
          </span>
          {flow.response ? (
            <>
              <StatusBadge status={flow.response.status} className="shrink-0" />
           
              <div className="flex-1" />
              {modes.length > 1 && (
                <ViewModeToggle value={viewMode} onChange={onViewModeChange} modes={modes} />
              )}
            </>
          ) : (
            <span className="text-xs text-muted-foreground">Waiting...</span>
          )}
        </div>
      </div>
      <div className="min-w-0">{renderContent()}</div>
    </div>
  )
}

