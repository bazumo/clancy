import { useState, useMemo, useCallback } from 'react'
import type { Flow, SSEEvent } from '../../shared/types'
import { getFlowTags } from '../enhancers'

export type ItemTypeFilter = 'all' | 'flows' | 'events'

export interface FilterState {
  searchText: string
  itemType: ItemTypeFilter
  eventType: string
  tags: Set<string>
  expanded: boolean
}

export type SidebarItem =
  | { type: 'flow'; flow: Flow; timestamp: string }
  | { type: 'event'; event: SSEEvent; flow: Flow; timestamp: string }

export function useFilters(flows: Flow[], events: Map<string, SSEEvent[]>) {
  const [filterState, setFilterState] = useState<FilterState>({
    searchText: '',
    itemType: 'all',
    eventType: 'all',
    tags: new Set(),
    expanded: false,
  })

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

  // Get unique event types
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
  const filteredItems = useMemo<SidebarItem[]>(() => {
    const items: SidebarItem[] = []
    const searchLower = filterState.searchText.toLowerCase()

    // Add all flows (if not filtering to events only)
    if (filterState.itemType !== 'events') {
      for (const flow of flows) {
        // Apply tag filter
        if (filterState.tags.size > 0) {
          const flowTags = flowTagsMap.get(flow.id) || []
          const hasMatchingTag = flowTags.some((tag) => filterState.tags.has(tag))
          if (!hasMatchingTag) continue
        }

        // Apply search filter
        if (filterState.searchText) {
          const searchable =
            `${flow.host} ${flow.request.path} ${flow.request.method} ${flow.request.url} ${flow.request.body || ''} ${flow.response?.body || ''}`.toLowerCase()
          if (!searchable.includes(searchLower)) continue
        }
        items.push({ type: 'flow', flow, timestamp: flow.timestamp })
      }
    }

    // Add all events (if not filtering to flows only)
    if (filterState.itemType !== 'flows') {
      for (const [flowId, flowEvents] of events.entries()) {
        const flow = flows.find((f) => f.id === flowId)
        if (flow) {
          // Apply tag filter to parent flow
          if (filterState.tags.size > 0) {
            const flowTags = flowTagsMap.get(flow.id) || []
            const hasMatchingTag = flowTags.some((tag) => filterState.tags.has(tag))
            if (!hasMatchingTag) continue
          }

          for (const event of flowEvents) {
            // Apply event type filter
            const eventType = event.event || 'message'
            if (filterState.eventType !== 'all' && eventType !== filterState.eventType) continue

            // Apply search filter
            if (filterState.searchText) {
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
  }, [flows, events, filterState, flowTagsMap])

  // Count active filters
  const activeFilterCount = useMemo(() => {
    return (
      (filterState.searchText ? 1 : 0) +
      (filterState.itemType !== 'all' ? 1 : 0) +
      (filterState.eventType !== 'all' ? 1 : 0) +
      (filterState.tags.size > 0 ? 1 : 0)
    )
  }, [filterState])

  const setSearchText = useCallback((searchText: string) => {
    setFilterState((prev) => ({ ...prev, searchText }))
  }, [])

  const setItemType = useCallback((itemType: ItemTypeFilter) => {
    setFilterState((prev) => ({ ...prev, itemType }))
  }, [])

  const setEventType = useCallback((eventType: string) => {
    setFilterState((prev) => ({ ...prev, eventType }))
  }, [])

  const toggleTag = useCallback((tag: string) => {
    setFilterState((prev) => {
      const newTags = new Set(prev.tags)
      if (newTags.has(tag)) {
        newTags.delete(tag)
      } else {
        newTags.add(tag)
      }
      return { ...prev, tags: newTags }
    })
  }, [])

  const setExpanded = useCallback((expanded: boolean) => {
    setFilterState((prev) => ({ ...prev, expanded }))
  }, [])

  const clearFilters = useCallback(() => {
    setFilterState((prev) => ({
      ...prev,
      searchText: '',
      itemType: 'all',
      eventType: 'all',
      tags: new Set(),
    }))
  }, [])

  return {
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
  }
}

