import type { Flow } from '../../../shared/types'
import type { EnhancerMatch } from '@/enhancers'
import type { ViewMode } from '@/components/ViewModeToggle'
import { ViewModeToggle, MethodBadge } from '@/components'
import { FetchedRawHttpView } from '@/enhancers/claude-messages/components/FetchedRawHttpView'
import { HttpBodyView } from './HttpBodyView'
import { getRequestViewModes } from '@/lib/format'

interface RequestSectionProps {
  flow: Flow
  enhancer: EnhancerMatch | null
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
}

export function RequestSection({
  flow,
  enhancer,
  viewMode,
  onViewModeChange,
}: RequestSectionProps) {
  const modes = getRequestViewModes(flow, enhancer)

  const renderContent = () => {
    if (viewMode === 'raw' && flow.hasRawHttp) {
      return <FetchedRawHttpView flowId={flow.id} type="request" />
    }

    if (viewMode === 'http' || viewMode === 'raw') {
      return <HttpBodyView headers={flow.request.headers} body={flow.request.body} />
    }

    if (
      viewMode === 'enhanced' &&
      enhancer?.enhancer.RequestBodyComponent &&
      flow.request.body
    ) {
      const RequestBodyComponent = enhancer.enhancer.RequestBodyComponent
      return (
        <RequestBodyComponent
          flow={flow}
          body={flow.request.body}
          parsed={enhancer.enhancer.transformRequestBody?.(flow.request.body) ?? null}
        />
      )
    }

    // Fallback
    return <HttpBodyView headers={flow.request.headers} body={flow.request.body} />
  }

  return (
    <div className="min-w-0">
      <div
        className="sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 z-10 border-b border-border h-11 overflow-hidden"
        style={{ width: 'calc(100vw - 320px)' }}
      >
        <div className="px-4 h-full flex items-center gap-3">
          <span className="text-xs font-medium uppercase tracking-wider text-violet-400 shrink-0">
            Request
          </span>
          <MethodBadge method={flow.request.method} className="shrink-0" />
          <span className="font-mono text-xs text-muted-foreground truncate">
            {flow.request.url}
          </span>
          <div className="flex-1" />
          {modes.length > 1 && (
            <ViewModeToggle value={viewMode} onChange={onViewModeChange} modes={modes} />
          )}
        </div>
      </div>
      <div className="min-w-0">{renderContent()}</div>
    </div>
  )
}

