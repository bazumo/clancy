import { useState, useCallback, useMemo, useRef } from 'react'
import type { Flow, SSEEvent } from '@clancyapp/shared'
import type { WebSocketMessage } from './useWebSocket'

export interface TokenTotals {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
}

// Extract token counts from a flow's SSE events.
// Only parses message_start (input + cache) and message_delta (output) events.
function extractTokens(events: SSEEvent[]): TokenTotals {
  const totals: TokenTotals = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  }

  for (const evt of events) {
    let parsed: { type: string; message?: { usage?: Record<string, number> }; usage?: Record<string, number> }
    try {
      parsed = JSON.parse(evt.data)
    } catch {
      continue
    }

    if (parsed.type === 'message_start' && parsed.message?.usage) {
      const u = parsed.message.usage
      totals.inputTokens += u.input_tokens ?? 0
      totals.cacheReadTokens += u.cache_read_input_tokens ?? 0
      totals.cacheCreationTokens += u.cache_creation_input_tokens ?? 0
    } else if (parsed.type === 'message_delta' && parsed.usage) {
      totals.outputTokens += parsed.usage.output_tokens ?? 0
    }
  }

  return totals
}

export function useFlowStore() {
  const [flows, setFlows] = useState<Flow[]>([])
  const [events, setEvents] = useState<Map<string, SSEEvent[]>>(new Map())

  // Cache token counts per flowId to avoid re-parsing completed flows
  const tokenCache = useRef<Map<string, TokenTotals>>(new Map())

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
      // Clear cache on init since we have new data
      tokenCache.current.clear()
    } else if (data.type === 'flow') {
      const flow = (data as unknown as { flow: Flow }).flow
      setFlows((prev) => {
        const existing = prev.find((f) => f.id === flow.id)
        if (existing) {
          return prev.map((f) => (f.id === flow.id ? flow : f))
        }
        return [flow, ...prev]
      })
      // Invalidate cache for this flow when it updates (response may have finished)
      tokenCache.current.delete(flow.id)
    } else if (data.type === 'event') {
      const { flowId, event } = data as unknown as { flowId: string; event: SSEEvent }
      setEvents((prev) => {
        const newMap = new Map(prev)
        const flowEvents = newMap.get(flowId) || []
        newMap.set(flowId, [...flowEvents, event])
        return newMap
      })
      // Invalidate cache since events changed
      tokenCache.current.delete(flowId)
    } else if (data.type === 'clear') {
      // Server cleared all data, sync local state
      setFlows([])
      setEvents(new Map())
      tokenCache.current.clear()
    }
  }, [])

  const clearAll = useCallback(async () => {
    // Call server API to clear data
    try {
      await fetch('/api/flows', { method: 'DELETE' })
    } catch (err) {
      console.error('Failed to clear flows on server:', err)
    }
    // Local state will be cleared via WebSocket 'clear' message
  }, [])

  const getFlowEvents = useCallback((flowId: string): SSEEvent[] => {
    return events.get(flowId) || []
  }, [events])

  const totalEvents = useMemo(() => {
    return Array.from(events.values()).reduce((sum, arr) => sum + arr.length, 0)
  }, [events])

  const tokenTotals = useMemo(() => {
    const totals: TokenTotals = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    }

    for (const [flowId, flowEvents] of events) {
      let cached = tokenCache.current.get(flowId)
      if (!cached) {
        cached = extractTokens(flowEvents)
        tokenCache.current.set(flowId, cached)
      }
      totals.inputTokens += cached.inputTokens
      totals.outputTokens += cached.outputTokens
      totals.cacheReadTokens += cached.cacheReadTokens
      totals.cacheCreationTokens += cached.cacheCreationTokens
    }

    return totals
  }, [events])

  return {
    flows,
    events,
    handleMessage,
    clearAll,
    getFlowEvents,
    totalEvents,
    tokenTotals,
  }
}
