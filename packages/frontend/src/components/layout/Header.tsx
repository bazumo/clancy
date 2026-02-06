import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { TokenTotals } from '@/hooks/useFlowStore'

interface HeaderProps {
  connected: boolean
  flowCount: number
  eventCount: number
  tokenTotals: TokenTotals
  onClear: () => void
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k'
  return n.toString()
}

export function Header({ connected, flowCount, eventCount, tokenTotals, onClear }: HeaderProps) {
  const totalTokens = tokenTotals.inputTokens + tokenTotals.outputTokens

  return (
    <header className="h-12 border-b-4 border-border flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-medium tracking-tight">Clancy</h1>
        <div
          className={cn(
            'w-1.5 h-1.5 rounded-full',
            connected ? 'bg-emerald-400' : 'bg-muted-foreground'
          )}
        />
      </div>
      <div className="flex items-center gap-2">
        {totalTokens > 0 && (
          <>
            <span className="text-xs text-amber-400 font-mono">
              {formatCount(tokenTotals.inputTokens)} in
            </span>
            <span className="text-xs text-amber-400 font-mono">
              {formatCount(tokenTotals.outputTokens)} out
            </span>
            {tokenTotals.cacheReadTokens > 0 && (
              <span className="text-xs text-amber-400/60 font-mono">
                {formatCount(tokenTotals.cacheReadTokens)} cache read
              </span>
            )}
            {tokenTotals.cacheCreationTokens > 0 && (
              <span className="text-xs text-amber-400/60 font-mono">
                {formatCount(tokenTotals.cacheCreationTokens)} cache write
              </span>
            )}
            <span className="text-muted-foreground/30">&middot;</span>
          </>
        )}
        <span className="text-xs text-muted-foreground font-mono">{flowCount} flows</span>
        <span className="text-xs text-cyan-400 font-mono">{eventCount} events</span>
        <Button variant="ghost" size="sm" onClick={onClear} className="text-xs h-7">
          Clear
        </Button>
      </div>
    </header>
  )
}
