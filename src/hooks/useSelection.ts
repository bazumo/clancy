import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { Flow, SSEEvent } from '../../shared/types'
import { getPrimaryEnhancer } from '../enhancers'
import type { EnhancerMatch } from '../enhancers'
import type { ViewMode } from '../components/ViewModeToggle'

interface UseSelectionOptions {
  flows: Flow[]
  events: Map<string, SSEEvent[]>
  flowTagsMap: Map<string, string[]>
}

export function useSelection({ flows, events, flowTagsMap }: UseSelectionOptions) {
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [requestViewMode, setRequestViewMode] = useState<ViewMode>('enhanced')
  const [responseViewMode, setResponseViewMode] = useState<ViewMode>('enhanced')
  const eventRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // Get selected flow
  const selectedFlow = useMemo(() => {
    return flows.find((f) => f.id === selectedFlowId) ?? null
  }, [flows, selectedFlowId])

  // Get events for selected flow
  const selectedFlowEvents = useMemo(() => {
    return selectedFlowId ? events.get(selectedFlowId) || [] : []
  }, [events, selectedFlowId])

  // Get enhancer for selected flow
  const selectedFlowEnhancer = useMemo<EnhancerMatch | null>(() => {
    if (!selectedFlow) return null
    return getPrimaryEnhancer(selectedFlow)
  }, [selectedFlow])

  // Get tags for selected flow
  const selectedFlowTags = useMemo(() => {
    return selectedFlow ? flowTagsMap.get(selectedFlow.id) || [] : []
  }, [selectedFlow, flowTagsMap])

  // Auto-scroll to selected event
  useEffect(() => {
    if (selectedEventId) {
      const timer = setTimeout(() => {
        const element = eventRefs.current.get(selectedEventId)
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [selectedEventId, selectedFlowId])

  const selectFlow = useCallback((flowId: string) => {
    setSelectedFlowId(flowId)
    setSelectedEventId(null)
  }, [])

  const selectEvent = useCallback((flowId: string, eventId: string) => {
    setSelectedFlowId(flowId)
    setSelectedEventId(eventId)
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedFlowId(null)
    setSelectedEventId(null)
  }, [])

  return {
    selectedFlowId,
    selectedEventId,
    selectedFlow,
    selectedFlowEvents,
    selectedFlowEnhancer,
    selectedFlowTags,
    requestViewMode,
    responseViewMode,
    eventRefs,
    selectFlow,
    selectEvent,
    clearSelection,
    setRequestViewMode,
    setResponseViewMode,
  }
}

