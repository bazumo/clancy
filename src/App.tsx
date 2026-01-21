import { useCallback } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { FlowProvider, useFlowContext, SelectionProvider, useSelectionContext } from '@/contexts'
import { useFilters } from '@/hooks'
import { Header } from '@/components/layout/Header'
import { FilterBox } from '@/components/sidebar/FilterBox'
import { VirtualizedFlowList } from '@/components/sidebar/VirtualizedFlowList'
import { RequestSection } from '@/components/detail/RequestSection'
import { ResponseSection } from '@/components/detail/ResponseSection'

function AppContent() {
  // Get data from context
  const { flows, events, connected, totalEvents, clearAll } = useFlowContext()

  // Filtering (uses URL params internally via useFilterParams)
  const { filteredItems, flowTagsMap, uniqueTags, uniqueEventTypes } = useFilters(flows, events)

  // Selection from context
  const {
    selectedFlowId,
    selectedEventId,
    selectedFlow,
    selectedFlowEvents,
    selectedFlowEnhancer,
    requestViewMode,
    responseViewMode,
    eventRefs,
    selectFlow,
    selectEvent,
    clearSelection,
    setRequestViewMode,
    setResponseViewMode,
  } = useSelectionContext()

  // Clear all data and selection
  const handleClear = useCallback(() => {
    clearAll()
    clearSelection()
  }, [clearAll, clearSelection])

  return (
    <div className="h-screen flex flex-col bg-background">
      <Header
        connected={connected}
        flowCount={flows.length}
        eventCount={totalEvents}
        onClear={handleClear}
      />

      <div className="flex-1 flex min-h-0">
        {/* Sidebar */}
        <aside className="w-80 border-r border-border shrink-0 flex flex-col min-h-0">
          <FilterBox uniqueEventTypes={uniqueEventTypes} uniqueTags={uniqueTags} />

          <VirtualizedFlowList
            items={filteredItems}
            selectedFlowId={selectedFlowId}
            selectedEventId={selectedEventId}
            flowTagsMap={flowTagsMap}
            events={events}
            onSelectFlow={selectFlow}
            onSelectEvent={selectEvent}
          />
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0 overflow-x-hidden">
          {selectedFlow ? (
            <ScrollArea className="h-full">
              <div className="flex flex-col min-w-0" style={{ maxWidth: 'calc(100vw - 320px)' }}>
                <RequestSection
                  flow={selectedFlow}
                  enhancer={selectedFlowEnhancer}
                  viewMode={requestViewMode}
                  onViewModeChange={setRequestViewMode}
                />
                <ResponseSection
                  flow={selectedFlow}
                  events={selectedFlowEvents}
                  enhancer={selectedFlowEnhancer}
                  selectedEventId={selectedEventId}
                  eventRefs={eventRefs}
                  viewMode={responseViewMode}
                  onViewModeChange={setResponseViewMode}
                />
              </div>
            </ScrollArea>
          ) : flows.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="max-w-lg space-y-4 p-8 text-muted-foreground">
                <h2 className="text-lg font-medium mb-4">Usage</h2>
                <div className="space-y-2">
                  <h3 className="text-xs font-medium">Claude Code (or other node.js/bun based app)</h3>
                  <pre className="bg-muted/50 p-3 rounded-md text-xs overflow-x-auto"><code>{`HTTP_PROXY=http://localhost:9090 \\
HTTPS_PROXY=http://localhost:9090 \\
NODE_TLS_REJECT_UNAUTHORIZED=0 \\
claude`}</code></pre>
                </div>

                <div className="space-y-2">
                  <h3 className="text-xs font-medium">curl</h3>
                  <pre className="bg-muted/50 p-3 rounded-md text-xs overflow-x-auto"><code>{`curl -x http://localhost:9090 -k https://api.anthropic.com/v1/messages`}</code></pre>
                </div>

              </div>
            </div>
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

function AppWithSelection() {
  const { flows, events } = useFlowContext()
  const { flowTagsMap } = useFilters(flows, events)

  return (
    <SelectionProvider flowTagsMap={flowTagsMap}>
      <AppContent />
    </SelectionProvider>
  )
}

function App() {
  return (
    <FlowProvider>
      <AppWithSelection />
    </FlowProvider>
  )
}

export default App
