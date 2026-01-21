import { memo } from 'react'
import { cn } from '@/lib/utils'

interface TagBadgeProps {
  tag: string
  selected?: boolean
  onClick?: () => void
  className?: string
}

export const TagBadge = memo(function TagBadge({ tag, selected, onClick, className }: TagBadgeProps) {
  const baseClasses = 'text-xs px-1.5 py-0.5 rounded bg-pink-500/15 text-pink-400'

  if (onClick) {
    return (
      <button
        onClick={onClick}
        className={cn(
          'px-2 py-0.5 text-xs rounded transition-colors',
          selected
            ? 'bg-pink-500/20 text-pink-400 ring-1 ring-pink-500/50'
            : 'bg-muted/50 text-muted-foreground hover:bg-muted',
          className
        )}
      >
        {tag}
      </button>
    )
  }

  return (
    <span className={cn(baseClasses, className)}>
      {tag}
    </span>
  )
})

interface TagListProps {
  tags: string[]
  className?: string
}

export const TagList = memo(function TagList({ tags, className }: TagListProps) {
  if (tags.length === 0) return null

  return (
    <div className={cn('flex items-center gap-1 shrink-0', className)}>
      {tags.map((tag) => (
        <TagBadge key={tag} tag={tag} />
      ))}
    </div>
  )
})

