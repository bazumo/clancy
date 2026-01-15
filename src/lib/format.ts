import type { Flow } from '../../shared/types'
import type { EnhancerMatch } from '@/enhancers'
import type { ViewMode } from '@/components/ViewModeToggle'

export function formatTime(timestamp: string): string {
  const date = new Date(timestamp)
  const time = date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  return time
}

export function getRequestViewModes(
  flow: Flow,
  enhancer: EnhancerMatch | null
): ViewMode[] {
  const modes: ViewMode[] = flow.hasRawHttp ? ['raw', 'http'] : ['http']
  if (enhancer?.enhancer.RequestBodyComponent) {
    modes.push('enhanced')
  }
  return modes
}

export function getResponseViewModes(
  flow: Flow,
  enhancer: EnhancerMatch | null,
  hasEvents: boolean
): ViewMode[] {
  const hasEnhancer =
    enhancer?.enhancer.ResponseBodyComponent || enhancer?.enhancer.EventComponent

  const modes: ViewMode[] = [
    ...(flow.hasRawHttp ? (['raw'] as ViewMode[]) : []),
    'http',
    ...(hasEvents ? (['events'] as ViewMode[]) : []),
    ...(hasEnhancer ? (['enhanced'] as ViewMode[]) : []),
  ]

  return modes
}

export function getEffectiveResponseViewMode(
  mode: ViewMode,
  flow: Flow,
  hasEvents: boolean
): ViewMode {
  if (mode === 'raw' && !flow.hasRawHttp) return 'http'
  if (mode === 'events' && !hasEvents) return 'http'
  return mode
}

