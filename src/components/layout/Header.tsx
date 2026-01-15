import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface HeaderProps {
  connected: boolean
  flowCount: number
  eventCount: number
  onClear: () => void
}

export function Header({ connected, flowCount, eventCount, onClear }: HeaderProps) {
  return (
    <header className="h-12 border-b border-border flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-medium tracking-tight">Claudeoscope</h1>
        <div
          className={cn(
            'w-1.5 h-1.5 rounded-full',
            connected ? 'bg-emerald-400' : 'bg-muted-foreground'
          )}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground font-mono">{flowCount} flows</span>
        <span className="text-xs text-cyan-400 font-mono">{eventCount} events</span>
        <Button variant="ghost" size="sm" onClick={onClear} className="text-xs h-7">
          Clear
        </Button>
      </div>
    </header>
  )
}

