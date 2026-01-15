import { createContext, useContext, type ReactNode } from 'react'
import type { Flow, SSEEvent } from '../../shared/types'
import { useFlowStore } from '@/hooks/useFlowStore'
import { useWebSocket } from '@/hooks/useWebSocket'

interface FlowContextValue {
  // Connection state
  connected: boolean
  // Flow data
  flows: Flow[]
  events: Map<string, SSEEvent[]>
  totalEvents: number
  // Actions
  clearAll: () => void
  getFlowEvents: (flowId: string) => SSEEvent[]
}

const FlowContext = createContext<FlowContextValue | null>(null)

interface FlowProviderProps {
  children: ReactNode
}

export function FlowProvider({ children }: FlowProviderProps) {
  const flowStore = useFlowStore()
  const { connected } = useWebSocket({ onMessage: flowStore.handleMessage })

  const value: FlowContextValue = {
    connected,
    flows: flowStore.flows,
    events: flowStore.events,
    totalEvents: flowStore.totalEvents,
    clearAll: flowStore.clearAll,
    getFlowEvents: flowStore.getFlowEvents,
  }

  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>
}

export function useFlowContext(): FlowContextValue {
  const context = useContext(FlowContext)
  if (!context) {
    throw new Error('useFlowContext must be used within a FlowProvider')
  }
  return context
}

