import { useEffect, useState, useRef } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface FlowRequest {
  method: string
  url: string
  path: string
  headers: Record<string, string | string[] | undefined>
  body?: string
}

interface SSEEvent {
  event?: string
  data: string
  id?: string
  retry?: string
}

interface FlowResponse {
  status: number
  statusText: string
  headers: Record<string, string | string[] | undefined>
  body?: string
  events?: SSEEvent[]
}

interface Flow {
  id: string
  timestamp: string
  host: string
  type: 'http' | 'https'
  request: FlowRequest
  response?: FlowResponse
  duration?: number
}

function App() {
  const [flows, setFlows] = useState<Flow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  const selectedFlow = flows.find((f) => f.id === selectedId)

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}`)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)
    ws.onerror = () => setConnected(false)

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      
      if (data.type === 'init') {
        setFlows(data.flows.reverse())
      } else if (data.type === 'flow') {
        const flow: Flow = data.flow
        setFlows((prev) => {
          const existing = prev.find((f) => f.id === flow.id)
          if (existing) {
            return prev.map((f) => (f.id === flow.id ? flow : f))
          }
          return [flow, ...prev].slice(0, 200)
        })
      }
    }

    return () => ws.close()
  }, [])

  const clearFlows = () => {
    setFlows([])
    setSelectedId(null)
  }

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
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
          <Button variant="ghost" size="sm" onClick={clearFlows} className="text-xs h-7">
            Clear
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Sidebar - Request List */}
        <aside className="w-80 border-r border-border shrink-0 overflow-hidden">
          <ScrollArea className="h-full">
            {flows.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">
                Waiting for requests...
              </div>
            ) : (
              <div className="divide-y divide-border">
                {flows.map((flow) => (
                  <button
                    key={flow.id}
                    onClick={() => setSelectedId(flow.id)}
                    className={cn(
                      'w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors',
                      selectedId === flow.id && 'bg-muted'
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn('font-mono text-xs font-medium', getMethodColor(flow.request.method))}>
                        {flow.request.method}
                      </span>
                      <span className="text-xs text-muted-foreground truncate flex-1">
                        {flow.host}
                      </span>
                      {flow.response && (
                        <span className={cn('text-xs font-mono px-1.5 py-0.5 rounded', getStatusColor(flow.response.status))}>
                          {flow.response.status}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground truncate flex-1">
                        {flow.request.path}
                      </span>
                      <span className="text-xs text-muted-foreground/60 shrink-0">
                        {formatTime(flow.timestamp)}
                      </span>
                    </div>
                  </button>
                ))}
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
                          {selectedFlow.response.events && (
                            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400">
                              {selectedFlow.response.events.length} events
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

                      {/* SSE Events */}
                      {selectedFlow.response.events && selectedFlow.response.events.length > 0 ? (
                        <div>
                          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Events</h3>
                          <div className="space-y-2">
                            {selectedFlow.response.events.map((event, idx) => (
                              <div key={idx} className="border-l-4 border-cyan-500/50">
                                <div className="bg-muted/30 px-3 py-1.5 flex items-center gap-2">
                                  <span className="text-xs font-mono text-cyan-400">
                                    {event.event || 'message'}
                                  </span>
                                  {event.id && (
                                    <span className="text-xs font-mono text-muted-foreground">
                                      id: {event.id}
                                    </span>
                                  )}
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
