import { useState, useMemo } from 'react'
import type { Flow, SSEEvent } from '../../shared/types'
import { getFlowTags } from '../enhancers'
import { useFilterParams } from './useFilterParams'

export type { ItemTypeFilter } from './useFilterParams'

export type SidebarItem =
  | { type: 'flow'; flow: Flow; timestamp: string; sequence?: number }
  | { type: 'event'; event: SSEEvent; flow: Flow; timestamp: string; sequence?: number }

export function useFilters(flows: Flow[], events: Map<string, SSEEvent[]>) {
  // URL-synced filter params
  const {
    search,
    itemType,
    eventType,
    tags,
    setSearch,
    setItemType,
    setEventType,
    toggleTag,
    clearFilters,
    activeFilterCount,
  } = useFilterParams()

  // Local UI state (not persisted to URL)
  const [expanded, setExpanded] = useState(false)

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
    const tagsSet = new Set<string>()
    for (const flowTags of flowTagsMap.values()) {
      for (const tag of flowTags) {
        tagsSet.add(tag)
      }
    }
    return Array.from(tagsSet).sort()
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
    const searchLower = search.toLowerCase()

    // Pre-compute flows matching tag filter for O(1) lookups
    const matchingFlowIds = new Set<string>()
    const flowsById = new Map<string, Flow>()

    for (const flow of flows) {
      flowsById.set(flow.id, flow)

      // Apply tag filter once
      if (tags.size > 0) {
        const flowTags = flowTagsMap.get(flow.id) || []
        const hasMatchingTag = flowTags.some((tag) => tags.has(tag))
        if (hasMatchingTag) {
          matchingFlowIds.add(flow.id)
        }
      } else {
        // No tag filter - all flows match
        matchingFlowIds.add(flow.id)
      }
    }

    // Add all flows (if not filtering to events only)
    if (itemType !== 'events') {
      for (const flow of flows) {
        // Check tag filter (already computed)
        if (!matchingFlowIds.has(flow.id)) continue

        // Apply search filter with early exit
        if (search) {
          const searchable =
            `${flow.host} ${flow.request.path} ${flow.request.method} ${flow.request.url} ${flow.request.body || ''} ${flow.response?.body || ''}`.toLowerCase()
          if (!searchable.includes(searchLower)) continue
        }
        items.push({ type: 'flow', flow, timestamp: flow.timestamp })
      }
    }

    // Add all events (if not filtering to events only)
    if (itemType !== 'flows') {
      for (const [flowId, flowEvents] of events.entries()) {
        // O(1) lookup instead of O(n) find
        if (!matchingFlowIds.has(flowId)) continue

        const flow = flowsById.get(flowId)
        if (flow) {
          for (const event of flowEvents) {
            // Apply event type filter with early exit
            const evtType = event.event || 'message'
            if (eventType !== 'all' && evtType !== eventType) continue

            // Apply search filter with early exit
            if (search) {
              const searchable = `${flow.host} ${evtType} ${event.data}`.toLowerCase()
              if (!searchable.includes(searchLower)) continue
            }

            items.push({ type: 'event', event, flow, timestamp: event.timestamp, sequence: event.sequence })
          }
        }
      }
    }

    // Sort by timestamp (newest first), with sequence as tiebreaker for events
    items.sort((a, b) => {
      const timeDiff = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      if (timeDiff !== 0) return timeDiff
      // For events with same timestamp, use sequence (lower sequence = earlier = should appear first when reversed)
      // Since we want newest first, higher sequence should come first
      return (b.sequence || 0) - (a.sequence || 0)
    })

    return items
  }, [flows, events, search, itemType, eventType, tags, flowTagsMap])

  // Build filter state object for backward compatibility
  const filterState = useMemo(
    () => ({
      searchText: search,
      itemType,
      eventType,
      tags,
      expanded,
    }),
    [search, itemType, eventType, tags, expanded]
  )

  return {
    filterState,
    filteredItems,
    flowTagsMap,
    uniqueTags,
    uniqueEventTypes,
    activeFilterCount,
    setSearchText: setSearch,
    setItemType,
    setEventType,
    toggleTag,
    setExpanded,
    clearFilters,
  }
}
