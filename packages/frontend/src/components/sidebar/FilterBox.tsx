import { useState } from 'react'
import { cn } from '@/lib/utils'
import { TagBadge } from '@/components/TagBadge'
import { useFilterParams } from '@/hooks/useFilterParams'

interface FilterBoxProps {
  uniqueEventTypes: string[]
  uniqueTags: string[]
}

export function FilterBox({ uniqueEventTypes, uniqueTags }: FilterBoxProps) {
  // URL-synced filter state
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

  // Local UI state for expansion
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border-b border-border shrink-0 bg-background">
      <div className="flex items-center bg-background">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-1 px-3 h-9 flex items-center gap-2 hover:bg-muted/30 transition-colors"
        >
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Filter
          </span>
          {activeFilterCount > 0 && (
            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400">
              {activeFilterCount}
            </span>
          )}
          <svg
            className={cn(
              'w-4 h-4 text-muted-foreground transition-transform ml-auto',
              expanded && 'rotate-180'
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
            onClick={clearFilters}
            className="px-2 py-2 text-muted-foreground hover:text-foreground transition-colors"
            title="Clear all filters"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>
      {expanded && (
        <div className="px-3 pb-3 space-y-3">
          {/* Search Input */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Search</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value || null)}
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
                  onClick={() => setItemType(type === 'all' ? null : type)}
                  className={cn(
                    'px-2 py-1 text-xs rounded transition-colors',
                    itemType === type
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
          {(itemType === 'all' || itemType === 'events') && uniqueEventTypes.length > 0 && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Event Type</label>
              <select
                value={eventType}
                onChange={(e) => setEventType(e.target.value === 'all' ? null : e.target.value)}
                className="w-full px-2 py-1.5 text-xs bg-muted/50 border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="all">All Events</option>
                {uniqueEventTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
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
                  <TagBadge key={tag} tag={tag} selected={tags.has(tag)} onClick={() => toggleTag(tag)} />
                ))}
              </div>
            </div>
          )}

          {/* Clear Filters */}
          {activeFilterCount > 0 && (
            <button
              onClick={clearFilters}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  )
}
