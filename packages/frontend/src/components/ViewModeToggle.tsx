import { cn } from '@/lib/utils'

export type ViewMode = 'raw' | 'http' | 'events' | 'enhanced'

interface ViewModeToggleProps {
  value: ViewMode
  onChange: (mode: ViewMode) => void
  modes: ViewMode[]
  className?: string
}

const modeLabels: Record<ViewMode, string> = {
  raw: 'Raw',
  http: 'HTTP',
  events: 'Events',
  enhanced: 'Enhanced',
}

export function ViewModeToggle({ value, onChange, modes, className }: ViewModeToggleProps) {
  return (
    <div className={cn('flex items-center gap-0.5 shrink-0 bg-muted/50 rounded p-0.5', className)}>
      {modes.map((mode) => (
        <button
          key={mode}
          onClick={() => onChange(mode)}
          className={cn(
            'px-2 py-1 text-xs rounded transition-colors',
            value === mode
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {modeLabels[mode]}
        </button>
      ))}
    </div>
  )
}

