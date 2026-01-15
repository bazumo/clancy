import { useQueryState, parseAsString, parseAsStringLiteral, parseAsArrayOf } from 'nuqs'
import { useCallback, useMemo } from 'react'

export type ItemTypeFilter = 'all' | 'flows' | 'events'

const itemTypeParser = parseAsStringLiteral(['all', 'flows', 'events'] as const).withDefault('all')

export function useFilterParams() {
  // URL-synced filter state
  const [search, setSearch] = useQueryState('q', parseAsString.withDefault(''))
  const [itemType, setItemType] = useQueryState('type', itemTypeParser)
  const [eventType, setEventType] = useQueryState('event', parseAsString.withDefault('all'))
  const [tagsArray, setTagsArray] = useQueryState(
    'tags',
    parseAsArrayOf(parseAsString, ',').withDefault([])
  )

  // Convert tags array to Set for easier use
  const tags = useMemo(() => new Set(tagsArray), [tagsArray])

  // Toggle a tag
  const toggleTag = useCallback(
    (tag: string) => {
      const newTags = new Set(tagsArray)
      if (newTags.has(tag)) {
        newTags.delete(tag)
      } else {
        newTags.add(tag)
      }
      setTagsArray(Array.from(newTags))
    },
    [tagsArray, setTagsArray]
  )

  // Clear all filters
  const clearFilters = useCallback(() => {
    setSearch(null)
    setItemType(null)
    setEventType(null)
    setTagsArray(null)
  }, [setSearch, setItemType, setEventType, setTagsArray])

  // Count active filters
  const activeFilterCount = useMemo(() => {
    return (
      (search ? 1 : 0) +
      (itemType !== 'all' ? 1 : 0) +
      (eventType !== 'all' ? 1 : 0) +
      (tagsArray.length > 0 ? 1 : 0)
    )
  }, [search, itemType, eventType, tagsArray])

  return {
    // Values
    search,
    itemType,
    eventType,
    tags,
    // Setters
    setSearch,
    setItemType,
    setEventType,
    toggleTag,
    // Utilities
    clearFilters,
    activeFilterCount,
  }
}

