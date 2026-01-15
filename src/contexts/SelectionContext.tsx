import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react'
import { useQueryState, parseAsString } from 'nuqs'
import type { Flow, SSEEvent } from '../../shared/types'
import { getPrimaryEnhancer } from '../enhancers'
import type { EnhancerMatch } from '../enhancers'
import type { ViewMode } from '../components/ViewModeToggle'
import { useFlowContext } from './FlowContext'

interface SelectionContextValue {
  // Selection state
  selectedFlowId: string | null
  selectedEventId: string | null
  selectedFlow: Flow | null
  selectedFlowEvents: SSEEvent[]
  selectedFlowEnhancer: EnhancerMatch | null
  selectedFlowTags: string[]
  // View modes
  requestViewMode: ViewMode
  responseViewMode: ViewMode
  setRequestViewMode: (mode: ViewMode) => void
  setResponseViewMode: (mode: ViewMode) => void
  // Event refs for scrolling
  eventRefs: React.MutableRefObject<Map<string, HTMLDivElement>>
  // Actions
  selectFlow: (flowId: string) => void
  selectEvent: (flowId: string, eventId: string) => void
  clearSelection: () => void
}

const SelectionContext = createContext<SelectionContextValue | null>(null)

interface SelectionProviderProps {
  children: ReactNode
  flowTagsMap: Map<string, string[]>
}

export function SelectionProvider({ children, flowTagsMap }: SelectionProviderProps) {
  const { flows, events } = useFlowContext()

  // URL-synced flow selection
  const [selectedFlowId, setSelectedFlowId] = useQueryState('flow', parseAsString)

  // Local state (not URL-synced)
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

  const selectFlow = useCallback(
    (flowId: string) => {
      setSelectedFlowId(flowId)
      setSelectedEventId(null)
    },
    [setSelectedFlowId]
  )

  const selectEvent = useCallback(
    (flowId: string, eventId: string) => {
      setSelectedFlowId(flowId)
      setSelectedEventId(eventId)
    },
    [setSelectedFlowId]
  )

  const clearSelection = useCallback(() => {
    setSelectedFlowId(null)
    setSelectedEventId(null)
  }, [setSelectedFlowId])

  const value: SelectionContextValue = {
    selectedFlowId,
    selectedEventId,
    selectedFlow,
    selectedFlowEvents,
    selectedFlowEnhancer,
    selectedFlowTags,
    requestViewMode,
    responseViewMode,
    setRequestViewMode,
    setResponseViewMode,
    eventRefs,
    selectFlow,
    selectEvent,
    clearSelection,
  }

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>
}

export function useSelectionContext(): SelectionContextValue {
  const context = useContext(SelectionContext)
  if (!context) {
    throw new Error('useSelectionContext must be used within a SelectionProvider')
  }
  return context
}

