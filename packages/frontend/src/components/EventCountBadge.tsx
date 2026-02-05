import { cn } from '@/lib/utils'

interface EventCountBadgeProps {
  count: number
  className?: string
  suffix?: string
}

export function EventCountBadge({ count, className, suffix }: EventCountBadgeProps) {
  if (count === 0) return null
  
  return (
    <span className={cn('text-xs font-mono px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400 shrink-0', className)}>
      {count}{suffix ? ` ${suffix}` : ''}
    </span>
  )
}

