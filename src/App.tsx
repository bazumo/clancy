import { useEffect, useState, useRef, useMemo } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Flow, SSEEvent } from '../shared/types'

type SidebarItem = 
  | { type: 'flow'; flow: Flow; timestamp: string }
  | { type: 'event'; event: SSEEvent; flow: Flow; timestamp: string }

function App() {
  const [flows, setFlows] = useState<Flow[]>([])
  const [events, setEvents] = useState<Map<string, SSEEvent[]>>(new Map())
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const eventRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // Filter state
  const [filterExpanded, setFilterExpanded] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [itemTypeFilter, setItemTypeFilter] = useState<'all' | 'flows' | 'events'>('all')
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all')

  const selectedFlow = flows.find((f) => f.id === selectedFlowId)
  const selectedFlowEvents = selectedFlowId ? events.get(selectedFlowId) || [] : []

  // Auto-scroll to selected event
  useEffect(() => {
    if (selectedEventId) {
      // Small delay to ensure DOM is rendered
      const timer = setTimeout(() => {
        const element = eventRefs.current.get(selectedEventId)
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [selectedEventId, selectedFlowId])

  // Get unique event types for filter dropdown
  const uniqueEventTypes = useMemo(() => {
    const types = new Set<string>()
    for (const flowEvents of events.values()) {
      for (const event of flowEvents) {
        types.add(event.event || 'message')
      }
    }
    return Array.from(types).sort()
  }, [events])

  // Create unified sidebar items sorted by timestamp (newest first)
  const sidebarItems = useMemo<SidebarItem[]>(() => {
    const items: SidebarItem[] = []
    const searchLower = searchText.toLowerCase()
    
    // Add all flows (if not filtering to events only)
    if (itemTypeFilter !== 'events') {
      for (const flow of flows) {
        // Apply search filter
        if (searchText) {
          const searchable = `${flow.host} ${flow.request.path} ${flow.request.method} ${flow.request.url} ${flow.request.body || ''} ${flow.response?.body || ''}`.toLowerCase()
          if (!searchable.includes(searchLower)) continue
        }
        items.push({ type: 'flow', flow, timestamp: flow.timestamp })
      }
    }
    
    // Add all events (if not filtering to flows only)
    if (itemTypeFilter !== 'flows') {
      for (const [flowId, flowEvents] of events.entries()) {
        const flow = flows.find(f => f.id === flowId)
        if (flow) {
          for (const event of flowEvents) {
            // Apply event type filter
            const eventType = event.event || 'message'
            if (eventTypeFilter !== 'all' && eventType !== eventTypeFilter) continue
            
            // Apply search filter
            if (searchText) {
              const searchable = `${flow.host} ${eventType} ${event.data}`.toLowerCase()
              if (!searchable.includes(searchLower)) continue
            }
            
            items.push({ type: 'event', event, flow, timestamp: event.timestamp })
          }
        }
      }
    }
    
    // Sort by timestamp (newest first)
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    
    return items
  }, [flows, events, searchText, itemTypeFilter, eventTypeFilter])

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = import.meta.env.DEV ? 'localhost:9090' : window.location.host
    const ws = new WebSocket(`${protocol}//${host}`)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)
    ws.onerror = () => setConnected(false)

    ws.onmessage = (msgEvent) => {
      const data = JSON.parse(msgEvent.data)
      
      if (data.type === 'init') {
        setFlows(data.flows.reverse())
        // Convert events Record to Map
        const eventsMap = new Map<string, SSEEvent[]>()
        if (data.events) {
          for (const [flowId, flowEvents] of Object.entries(data.events)) {
            eventsMap.set(flowId, flowEvents as SSEEvent[])
          }
        }
        setEvents(eventsMap)
      } else if (data.type === 'flow') {
        const flow: Flow = data.flow
        setFlows((prev) => {
          const existing = prev.find((f) => f.id === flow.id)
          if (existing) {
            return prev.map((f) => (f.id === flow.id ? flow : f))
          }
          return [flow, ...prev].slice(0, 200)
        })
      } else if (data.type === 'event') {
        const { flowId, event } = data as { flowId: string; event: SSEEvent }
        setEvents((prev) => {
          const newMap = new Map(prev)
          const flowEvents = newMap.get(flowId) || []
          newMap.set(flowId, [...flowEvents, event])
          return newMap
        })
      }
    }

    return () => ws.close()
  }, [])

  const clearFlows = () => {
    setFlows([])
    setEvents(new Map())
    setSelectedFlowId(null)
    setSelectedEventId(null)
  }

  const selectFlow = (flowId: string) => {
    setSelectedFlowId(flowId)
    setSelectedEventId(null)
  }

  const selectEvent = (flowId: string, eventId: string) => {
    setSelectedFlowId(flowId)
    setSelectedEventId(eventId)
  }

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const time = date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
    return `${time}`
  }

  const getStatusColor = (status?: number) => {
    if (!status) return 'bg-muted text-muted-foreground'
    if (status >= 200 && status < 300) return 'bg-emerald-500/15 text-emerald-400'
    if (status >= 400 && status < 500) return 'bg-amber-500/15 text-amber-400'
    if (status >= 500) return 'bg-red-500/15 text-red-400'
    return 'bg-muted text-muted-foreground'
  }

  const getMethodColor = (method: string) => {
    switch (method) {
      case 'GET': return 'text-blue-400'
      case 'POST': return 'text-green-400'
      case 'PUT': return 'text-amber-400'
      case 'DELETE': return 'text-red-400'
      case 'CONNECT': return 'text-purple-400'
      default: return 'text-muted-foreground'
    }
  }

  const formatHeaders = (headers: Record<string, string | string[] | undefined>) => {
    return Object.entries(headers)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
      .join('\n')
  }

  const formatBody = (body?: string) => {
    if (!body) return ''
    try {
      return JSON.stringify(JSON.parse(body), null, 2)
    } catch {
      return body
    }
  }

  const totalEvents = Array.from(events.values()).reduce((sum, arr) => sum + arr.length, 0)

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Top Bar */}
      <header className="h-12 border-b border-border flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-medium tracking-tight">claudio</h1>
          <div className={cn(
            'w-1.5 h-1.5 rounded-full',
            connected ? 'bg-emerald-400' : 'bg-muted-foreground'
          )} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-mono">{flows.length} flows</span>
          <span className="text-xs text-cyan-400 font-mono">{totalEvents} events</span>
          <Button variant="ghost" size="sm" onClick={clearFlows} className="text-xs h-7">
            Clear
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Sidebar - Unified List */}
        <aside className="w-80 border-r border-border shrink-0 flex flex-col min-h-0">
          {/* Filter Box */}
          <div className="border-b border-border shrink-0">
            {(() => {
              const activeFilterCount = (searchText ? 1 : 0) + (itemTypeFilter !== 'all' ? 1 : 0) + (eventTypeFilter !== 'all' ? 1 : 0)
              return (
                <div className="flex items-center">
                  <button
                    onClick={() => setFilterExpanded(!filterExpanded)}
                    className="flex-1 px-3 py-2 flex items-center gap-2 hover:bg-muted/50 transition-colors"
                  >
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Filter</span>
                    {activeFilterCount > 0 && (
                      <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400">
                        {activeFilterCount}
                      </span>
                    )}
                    <svg
                      className={cn(
                        'w-4 h-4 text-muted-foreground transition-transform ml-auto',
                        filterExpanded && 'rotate-180'
                      )}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {activeFilterCount > 0 && (
                    <button
                      onClick={() => {
                        setSearchText('')
                        setItemTypeFilter('all')
                        setEventTypeFilter('all')
                      }}
                      className="px-2 py-2 text-muted-foreground hover:text-foreground transition-colors"
                      title="Clear all filters"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              )
            })()}
            {filterExpanded && (
              <div className="px-3 pb-3 space-y-3">
                {/* Search Input */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Search</label>
                  <input
                    type="text"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="Filter by text..."
                    className="w-full px-2 py-1.5 text-xs bg-muted/50 border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
                  />
                </div>
                
                {/* Item Type Filter */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Type</label>
                  <div className="flex gap-1">
                    {(['all', 'flows', 'events'] as const).map((type) => (
                      <button
                        key={type}
                        onClick={() => setItemTypeFilter(type)}
                        className={cn(
                          'px-2 py-1 text-xs rounded transition-colors',
                          itemTypeFilter === type
                            ? 'bg-foreground text-background'
                            : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                        )}
                      >
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                
                {/* Event Type Filter */}
                {(itemTypeFilter === 'all' || itemTypeFilter === 'events') && uniqueEventTypes.length > 0 && (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Event Type</label>
                    <select
                      value={eventTypeFilter}
                      onChange={(e) => setEventTypeFilter(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs bg-muted/50 border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="all">All Events</option>
                      {uniqueEventTypes.map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>
                )}
                
                {/* Clear Filters */}
                {(searchText || itemTypeFilter !== 'all' || eventTypeFilter !== 'all') && (
                  <button
                    onClick={() => {
                      setSearchText('')
                      setItemTypeFilter('all')
                      setEventTypeFilter('all')
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </div>
          
          <ScrollArea className="flex-1 min-h-0">
            {sidebarItems.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">
                Waiting for requests...
              </div>
            ) : (
              <div className="divide-y divide-border w-80">
                {sidebarItems.map((item) => {
                  if (item.type === 'flow') {
                    const flow = item.flow
                    const flowEventCount = events.get(flow.id)?.length || 0
                    return (
                  <button
                        key={`flow-${flow.id}`}
                        onClick={() => selectFlow(flow.id)}
                    className={cn(
                      'w-80 text-left px-3 py-2.5 hover:bg-muted/50 transition-colors overflow-hidden',
                          selectedFlowId === flow.id && 'bg-muted'
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1 w-full">
                      <span className={cn('font-mono text-xs font-medium shrink-0', getMethodColor(flow.request.method))}>
                        {flow.request.method}
                      </span>
                      <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">
                        {flow.host}
                      </span>
                          {flow.isSSE && flowEventCount > 0 && (
                        <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400 shrink-0">
                              {flowEventCount}
                        </span>
                      )}
                      {flow.response && (
                        <span className={cn('text-xs font-mono px-1.5 py-0.5 rounded shrink-0', getStatusColor(flow.response.status))}>
                          {flow.response.status}
                        </span>
                      )}
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
                  } else {
                    const { event, flow } = item
                    return (
                      <button
                        key={`event-${event.eventId}`}
                        onClick={() => selectEvent(flow.id, event.eventId)}
                        className={cn(
                          'w-80 text-left px-3 py-2 hover:bg-cyan-500/10 transition-colors overflow-hidden border-l-4 border-cyan-500/50',
                          selectedFlowId === flow.id && 'bg-cyan-500/10',
                          selectedEventId === event.eventId && 'bg-cyan-500/20'
                        )}
                      >
                        <div className="flex items-center gap-2 mb-1 w-full">
                          <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400 shrink-0">
                            {event.event || 'message'}
                          </span>
                          <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">
                            {flow.host}
                          </span>
                          <span className="text-xs text-muted-foreground/60 shrink-0">
                            {formatTime(event.timestamp)}
                          </span>
                        </div>
                        <div className="font-mono text-xs text-muted-foreground truncate w-full">
                          {(() => {
                            try {
                              const parsed = JSON.parse(event.data)
                              // Try to show a meaningful preview
                              if (parsed.type) return `type: ${parsed.type}`
                              return event.data.slice(0, 50) + (event.data.length > 50 ? '...' : '')
                            } catch {
                              return event.data.slice(0, 50) + (event.data.length > 50 ? '...' : '')
                            }
                          })()}
                        </div>
                      </button>
                    )
                  }
                })}
              </div>
            )}
          </ScrollArea>
        </aside>

        {/* Main Area - Flow Detail */}
        <main className="flex-1 min-w-0 overflow-hidden">
          {selectedFlow ? (
            <ScrollArea className="h-full">
              <div className="flex flex-col">
                {/* Request Section */}
                <div className="border-l-[8px] border-violet-500">
                  <div className="sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 z-10 border-y border-border">
                    <div className="px-4 py-3 flex items-center gap-3">
                      <span className="text-xs font-medium uppercase tracking-wider text-violet-400">Request</span>
                      <span className={cn('font-mono text-xs font-medium', getMethodColor(selectedFlow.request.method))}>
                        {selectedFlow.request.method}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground truncate">
                        {selectedFlow.request.url}
                      </span>
                    </div>
                  </div>
                  <div className="px-4 pb-4">
                    <div className="mb-4">
                      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Headers</h3>
                      <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all">
                        {formatHeaders(selectedFlow.request.headers)}
                      </pre>
                    </div>
                    {selectedFlow.request.body && (
                      <div>
                        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Body</h3>
                        <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-all">
                          {formatBody(selectedFlow.request.body)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>

                {/* Response Section */}
                <div className="border-l-[8px] border-amber-400">
                  <div className="sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 z-10 border-y border-border">
                    <div className="px-4 py-3 flex items-center gap-3">
                      <span className="text-xs font-medium uppercase tracking-wider text-amber-400">Response</span>
                      {selectedFlow.response ? (
                        <>
                          <span className={cn('font-mono text-xs font-medium px-1.5 py-0.5 rounded', getStatusColor(selectedFlow.response.status))}>
                            {selectedFlow.response.status}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {selectedFlow.response.statusText}
                          </span>
                          {selectedFlow.isSSE && selectedFlowEvents.length > 0 && (
                            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400">
                              {selectedFlowEvents.length} events
                            </span>
                          )}
                          {selectedFlow.duration && (
                            <span className="text-xs text-muted-foreground ml-auto font-mono">
                              {selectedFlow.duration}ms
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">Waiting...</span>
                      )}
                    </div>
                  </div>
                  {selectedFlow.response ? (
                    <div className="px-4 pb-4">
                      <div className="mb-4">
                        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Headers</h3>
                        <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all">
                          {formatHeaders(selectedFlow.response.headers)}
                        </pre>
                      </div>

                      {/* SSE Events - look up from events map */}
                      {selectedFlowEvents.length > 0 ? (
                        <div>
                          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Events</h3>
                          <div className="space-y-2">
                            {selectedFlowEvents.map((event) => (
                              <div
                                key={event.eventId}
                                ref={(el) => {
                                  if (el) {
                                    eventRefs.current.set(event.eventId, el)
                                  } else {
                                    eventRefs.current.delete(event.eventId)
                                  }
                                }}
                                className={cn(
                                  'border-l-4 border-cyan-500/50 transition-colors',
                                  selectedEventId === event.eventId && 'border-cyan-400 bg-cyan-500/10 ring-1 ring-cyan-500/30'
                                )}
                              >
                                <div className="bg-muted/30 px-3 py-1.5 flex items-center gap-2">
                                  <span className="text-xs font-mono text-cyan-400">
                                    {event.event || 'message'}
                                  </span>
                                  {event.id && (
                                    <span className="text-xs font-mono text-muted-foreground">
                                      id: {event.id}
                                    </span>
                                  )}
                                  <span className="text-xs font-mono text-muted-foreground/60 ml-auto">
                                    {formatTime(event.timestamp)}
                                  </span>
                                </div>
                                <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-all px-3 py-2">
                                  {formatBody(event.data)}
                                </pre>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : selectedFlow.response.body ? (
                        <div>
                          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Body</h3>
                          <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-all">
                            {formatBody(selectedFlow.response.body)}
                          </pre>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="px-4 pb-4 text-xs text-muted-foreground">
                      Waiting for response...
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
              Select a request to view details
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export default App
