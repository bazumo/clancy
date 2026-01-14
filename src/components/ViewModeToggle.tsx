import { cn } from '@/lib/utils'

type ViewMode = 'raw' | 'enhanced'

interface ViewModeToggleProps {
  value: ViewMode
  onChange: (mode: ViewMode) => void
  className?: string
}

export function ViewModeToggle({ value, onChange, className }: ViewModeToggleProps) {
  return (
    <div className={cn('flex items-center gap-0.5 shrink-0 bg-muted/50 rounded p-0.5', className)}>
      <button
        onClick={() => onChange('raw')}
        className={cn(
          'px-2 py-1 text-xs rounded transition-colors',
          value === 'raw'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        Raw
      </button>
      <button
        onClick={() => onChange('enhanced')}
        className={cn(
          'px-2 py-1 text-xs rounded transition-colors',
          value === 'enhanced'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        Enhanced
      </button>
    </div>
  )
}

