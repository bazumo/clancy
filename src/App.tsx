import { useEffect, useState, useRef, useMemo } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Flow, SSEEvent } from '../shared/types'
import { getFlowTags, getPrimaryEnhancer } from './enhancers'
import type { EnhancerMatch } from './enhancers'
import { HeadersView } from './enhancers/claude-messages/components/HeadersView'
import { RawBodyView } from './enhancers/claude-messages/components/RawBodyView'
import { RawEventsView } from './enhancers/claude-messages/components/RawEventsView'
import { EnhancedEventsView } from './enhancers/claude-messages/components/EnhancedEventsView'

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
  const [tagFilter, setTagFilter] = useState<Set<string>>(new Set())

  // View mode toggle (raw HTTP vs enhanced view)
  const [requestViewMode, setRequestViewMode] = useState<'raw' | 'enhanced'>('enhanced')
  const [responseViewMode, setResponseViewMode] = useState<'raw' | 'enhanced'>('enhanced')

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

  // Compute tags for all flows
  const flowTagsMap = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const flow of flows) {
      map.set(flow.id, getFlowTags(flow))
    }
    return map
  }, [flows])

  // Get unique tags across all flows
  const uniqueTags = useMemo(() => {
    const tags = new Set<string>()
    for (const flowTags of flowTagsMap.values()) {
      for (const tag of flowTags) {
        tags.add(tag)
      }
    }
    return Array.from(tags).sort()
  }, [flowTagsMap])

  // Get enhancer for selected flow
  const selectedFlowEnhancer = useMemo<EnhancerMatch | null>(() => {
    if (!selectedFlow) return null
    return getPrimaryEnhancer(selectedFlow)
  }, [selectedFlow])

  const selectedFlowTags = selectedFlow ? flowTagsMap.get(selectedFlow.id) || [] : []

  // Create unified sidebar items sorted by timestamp (newest first)
  const sidebarItems = useMemo<SidebarItem[]>(() => {
    const items: SidebarItem[] = []
    const searchLower = searchText.toLowerCase()
    
    // Add all flows (if not filtering to events only)
    if (itemTypeFilter !== 'events') {
      for (const flow of flows) {
        // Apply tag filter
        if (tagFilter.size > 0) {
          const flowTags = flowTagsMap.get(flow.id) || []
          const hasMatchingTag = flowTags.some(tag => tagFilter.has(tag))
          if (!hasMatchingTag) continue
        }
        
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
          // Apply tag filter to parent flow
          if (tagFilter.size > 0) {
            const flowTags = flowTagsMap.get(flow.id) || []
            const hasMatchingTag = flowTags.some(tag => tagFilter.has(tag))
            if (!hasMatchingTag) continue
          }
          
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
  }, [flows, events, searchText, itemTypeFilter, eventTypeFilter, tagFilter, flowTagsMap])

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

  const totalEvents = Array.from(events.values()).reduce((sum, arr) => sum + arr.length, 0)

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Top Bar */}
      <header className="h-12 border-b border-border flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-medium tracking-tight">Claudeoscope</h1>
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
              const activeFilterCount = (searchText ? 1 : 0) + (itemTypeFilter !== 'all' ? 1 : 0) + (eventTypeFilter !== 'all' ? 1 : 0) + (tagFilter.size > 0 ? 1 : 0)
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
                        setTagFilter(new Set())
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
                
                {/* Tag Filter */}
                {uniqueTags.length > 0 && (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Tags</label>
                    <div className="flex flex-wrap gap-1">
                      {uniqueTags.map((tag) => (
                        <button
                          key={tag}
                          onClick={() => {
                            const newFilter = new Set(tagFilter)
                            if (newFilter.has(tag)) {
                              newFilter.delete(tag)
                            } else {
                              newFilter.add(tag)
                            }
                            setTagFilter(newFilter)
                          }}
                          className={cn(
                            'px-2 py-0.5 text-xs rounded transition-colors',
                            tagFilter.has(tag)
                              ? 'bg-pink-500/20 text-pink-400 ring-1 ring-pink-500/50'
                              : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                          )}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Clear Filters */}
                {(searchText || itemTypeFilter !== 'all' || eventTypeFilter !== 'all' || tagFilter.size > 0) && (
                  <button
                    onClick={() => {
                      setSearchText('')
                      setItemTypeFilter('all')
                      setEventTypeFilter('all')
                      setTagFilter(new Set())
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
                    const tags = flowTagsMap.get(flow.id) || []
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
                    {tags.length > 0 && (
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        {tags.map((tag) => (
                          <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-pink-500/15 text-pink-400">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
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
        <main className="flex-1 min-w-0 overflow-x-hidden">
          {selectedFlow ? (
            <ScrollArea className="h-full">
              <div className="flex flex-col min-w-0">
                {/* Request Section */}
                <div className="min-w-0">
                  <div className="sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 z-10 border-y border-border h-11 overflow-hidden" style={{ width: 'calc(100vw - 320px)' }}>
                    <div className="px-4 h-full flex items-center gap-3">
                      <span className="text-xs font-medium uppercase tracking-wider text-violet-400 shrink-0">Request</span>
                      <span className={cn('font-mono text-xs font-medium shrink-0', getMethodColor(selectedFlow.request.method))}>
                        {selectedFlow.request.method}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground truncate">
                        {selectedFlow.request.url}
                      </span>
                      {/* Tags */}
                      {selectedFlowTags.length > 0 && (
                        <div className="flex items-center gap-1 shrink-0">
                          {selectedFlowTags.map((tag) => (
                            <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-pink-500/15 text-pink-400">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      {/* View Toggle */}
                      {selectedFlowEnhancer?.enhancer.RequestBodyComponent && (
                        <div className="flex items-center gap-0.5 shrink-0 bg-muted/50 rounded p-0.5">
                          <button
                            onClick={() => setRequestViewMode('raw')}
                            className={cn(
                              'px-2 py-1 text-xs rounded transition-colors',
                              requestViewMode === 'raw'
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                            )}
                          >
                            Raw
                          </button>
                          <button
                            onClick={() => setRequestViewMode('enhanced')}
                            className={cn(
                              'px-2 py-1 text-xs rounded transition-colors',
                              requestViewMode === 'enhanced'
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                            )}
                          >
                            Enhanced
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="min-w-0">
                    {requestViewMode === 'enhanced' && selectedFlowEnhancer?.enhancer.RequestBodyComponent && selectedFlow.request.body ? (
                      <div>
                        <selectedFlowEnhancer.enhancer.RequestBodyComponent
                          flow={selectedFlow}
                          body={selectedFlow.request.body}
                          parsed={selectedFlowEnhancer.enhancer.transformRequestBody?.(selectedFlow.request.body) ?? null}
                        />
                      </div>
                    ) : (
                      <div>
                        <HeadersView headers={selectedFlow.request.headers} />
                        {selectedFlow.request.body && (
                          <RawBodyView body={selectedFlow.request.body} />
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Response Section */}
                <div className="min-w-0">
                  <div className="sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 z-10 border-y border-border h-11">
                    <div className="px-4 h-full flex items-center gap-3 min-w-0 overflow-hidden">
                      <span className="text-xs font-medium uppercase tracking-wider text-amber-400 shrink-0">Response</span>
                      {selectedFlow.response ? (
                        <>
                          <span className={cn('font-mono text-xs font-medium px-1.5 py-0.5 rounded shrink-0', getStatusColor(selectedFlow.response.status))}>
                            {selectedFlow.response.status}
                          </span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {selectedFlow.response.statusText}
                          </span>
                          {selectedFlow.isSSE && selectedFlowEvents.length > 0 && (
                            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400 shrink-0">
                              {selectedFlowEvents.length} events
                            </span>
                          )}
                          {selectedFlow.duration && (
                            <span className="text-xs text-muted-foreground font-mono shrink-0">
                              {selectedFlow.duration}ms
                            </span>
                          )}
                          <div className="flex-1" />
                          {/* View Toggle for Response */}
                          {(selectedFlowEnhancer?.enhancer.ResponseBodyComponent || selectedFlowEnhancer?.enhancer.EventComponent) && (
                            <div className="flex items-center gap-0.5 shrink-0 bg-muted/50 rounded p-0.5">
                              <button
                                onClick={() => setResponseViewMode('raw')}
                                className={cn(
                                  'px-2 py-1 text-xs rounded transition-colors',
                                  responseViewMode === 'raw'
                                    ? 'bg-background text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
                                )}
                              >
                                Raw
                              </button>
                              <button
                                onClick={() => setResponseViewMode('enhanced')}
                                className={cn(
                                  'px-2 py-1 text-xs rounded transition-colors',
                                  responseViewMode === 'enhanced'
                                    ? 'bg-background text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
                                )}
                              >
                                Enhanced
                              </button>
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">Waiting...</span>
                      )}
                    </div>
                  </div>
                  {selectedFlow.response ? (
                    <div className="min-w-0">
                      {responseViewMode === 'raw' || !selectedFlowEnhancer ? (
                        <div>
                          <HeadersView headers={selectedFlow.response.headers} />
                          {selectedFlowEvents.length > 0 ? (
                            <RawEventsView
                              flow={selectedFlow}
                              events={selectedFlowEvents}
                              selectedEventId={selectedEventId}
                              eventRefs={eventRefs}
                            />
                          ) : selectedFlow.response.body ? (
                            <RawBodyView body={selectedFlow.response.body} />
                          ) : null}
                        </div>
                      ) : (
                        <div>
                          {/* Enhanced Events View */}
                          {(() => {
                            const EventComponent = selectedFlowEnhancer.enhancer.EventComponent
                            const ResponseBodyComponent = selectedFlowEnhancer.enhancer.ResponseBodyComponent
                            
                            if (selectedFlowEvents.length > 0 && EventComponent) {
                              return (
                                <EnhancedEventsView
                                  flow={selectedFlow}
                                  events={selectedFlowEvents}
                                  selectedEventId={selectedEventId}
                                  eventRefs={eventRefs}
                                  EventComponent={EventComponent}
                                  transformEventData={selectedFlowEnhancer.enhancer.transformEventData}
                                />
                              )
                            }
                            
                            if (selectedFlow.response.body && ResponseBodyComponent) {
                              return (
                                <ResponseBodyComponent
                                  flow={selectedFlow}
                                  body={selectedFlow.response.body}
                                  parsed={selectedFlowEnhancer.enhancer.transformResponseBody?.(selectedFlow.response.body) ?? null}
                                />
                              )
                            }
                            
                            return null
                          })()}
                        </div>
                      )}
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
