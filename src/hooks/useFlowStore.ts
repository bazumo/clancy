import { useState, useCallback, useMemo } from 'react'
import type { Flow, SSEEvent } from '../../shared/types'
import type { WebSocketMessage } from './useWebSocket'

export function useFlowStore() {
  const [flows, setFlows] = useState<Flow[]>([])
  const [events, setEvents] = useState<Map<string, SSEEvent[]>>(new Map())

  const handleMessage = useCallback((data: WebSocketMessage) => {
    if (data.type === 'init') {
      const initData = data as unknown as { flows: Flow[]; events?: Record<string, SSEEvent[]> }
      setFlows(initData.flows.reverse())
      
      // Convert events Record to Map
      const eventsMap = new Map<string, SSEEvent[]>()
      if (initData.events) {
        for (const [flowId, flowEvents] of Object.entries(initData.events)) {
          eventsMap.set(flowId, flowEvents)
        }
      }
      setEvents(eventsMap)
    } else if (data.type === 'flow') {
      const flow = (data as unknown as { flow: Flow }).flow
      setFlows((prev) => {
        const existing = prev.find((f) => f.id === flow.id)
        if (existing) {
          return prev.map((f) => (f.id === flow.id ? flow : f))
        }
        return [flow, ...prev].slice(0, 200)
      })
    } else if (data.type === 'event') {
      const { flowId, event } = data as unknown as { flowId: string; event: SSEEvent }
      setEvents((prev) => {
        const newMap = new Map(prev)
        const flowEvents = newMap.get(flowId) || []
        newMap.set(flowId, [...flowEvents, event])
        return newMap
      })
    }
  }, [])

  const clearAll = useCallback(() => {
    setFlows([])
    setEvents(new Map())
  }, [])

  const getFlowEvents = useCallback((flowId: string): SSEEvent[] => {
    return events.get(flowId) || []
  }, [events])

  const totalEvents = useMemo(() => {
    return Array.from(events.values()).reduce((sum, arr) => sum + arr.length, 0)
  }, [events])

  return {
    flows,
    events,
    handleMessage,
    clearAll,
    getFlowEvents,
    totalEvents,
  }
}

