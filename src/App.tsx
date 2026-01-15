import { useCallback } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useWebSocket, useFlowStore, useFilters, useSelection } from '@/hooks'
import { Header } from '@/components/layout/Header'
import { FilterBox } from '@/components/sidebar/FilterBox'
import { FlowListItem } from '@/components/sidebar/FlowListItem'
import { EventListItem } from '@/components/sidebar/EventListItem'
import { RequestSection } from '@/components/detail/RequestSection'
import { ResponseSection } from '@/components/detail/ResponseSection'

function App() {
  // Data management
  const { flows, events, handleMessage, clearAll, totalEvents } = useFlowStore()

  // WebSocket connection
  const { connected } = useWebSocket({ onMessage: handleMessage })

  // Filtering
  const {
    filterState,
    filteredItems,
    flowTagsMap,
    uniqueTags,
    uniqueEventTypes,
    activeFilterCount,
    setSearchText,
    setItemType,
    setEventType,
    toggleTag,
    setExpanded,
    clearFilters,
  } = useFilters(flows, events)

  // Selection state
  const {
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
  } = useSelection({ flows, events, flowTagsMap })

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
          <FilterBox
            expanded={filterState.expanded}
            onExpandedChange={setExpanded}
            searchText={filterState.searchText}
            onSearchTextChange={setSearchText}
            itemType={filterState.itemType}
            onItemTypeChange={setItemType}
            eventType={filterState.eventType}
            onEventTypeChange={setEventType}
            tags={filterState.tags}
            onTagToggle={toggleTag}
            onClearFilters={clearFilters}
            activeFilterCount={activeFilterCount}
            uniqueEventTypes={uniqueEventTypes}
            uniqueTags={uniqueTags}
          />

          <ScrollArea className="flex-1 min-h-0">
            {filteredItems.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">
                Waiting for requests...
              </div>
            ) : (
              <div className="divide-y divide-border w-80">
                {filteredItems.map((item) =>
                  item.type === 'flow' ? (
                    <FlowListItem
                      key={`flow-${item.flow.id}`}
                      flow={item.flow}
                      isSelected={selectedFlowId === item.flow.id}
                      eventCount={events.get(item.flow.id)?.length || 0}
                      tags={flowTagsMap.get(item.flow.id) || []}
                      onSelect={() => selectFlow(item.flow.id)}
                    />
                  ) : (
                    <EventListItem
                      key={`event-${item.event.eventId}`}
                      flow={item.flow}
                      event={item.event}
                      isFlowSelected={selectedFlowId === item.flow.id}
                      isEventSelected={selectedEventId === item.event.eventId}
                      onSelect={() => selectEvent(item.flow.id, item.event.eventId)}
                    />
                  )
                )}
              </div>
            )}
          </ScrollArea>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0 overflow-x-hidden">
          {selectedFlow ? (
            <ScrollArea className="h-full">
              <div className="flex flex-col min-w-0" style={{ maxWidth: 'calc(100vw - 320px)' }}>
                <RequestSection
                  flow={selectedFlow}
                  enhancer={selectedFlowEnhancer}
                  tags={selectedFlowTags}
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
