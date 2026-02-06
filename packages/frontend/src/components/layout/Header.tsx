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
        <span className="text-xs text-muted-foreground font-mono">{flowCount} flows</span>
        <span className="text-xs text-cyan-400 font-mono">{eventCount} events</span>
        {totalTokens > 0 && (
          <div className="relative group">
            <span className="text-xs text-amber-400 font-mono cursor-default">
              {formatCount(totalTokens)} tokens
            </span>
            <div className="absolute right-0 top-full mt-1.5 hidden group-hover:block z-50">
              <div className="bg-popover border border-border rounded-md shadow-md px-3 py-2 text-[11px] font-mono whitespace-nowrap space-y-0.5">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">input</span>
                  <span className="text-foreground">{tokenTotals.inputTokens.toLocaleString()}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">output</span>
                  <span className="text-foreground">{tokenTotals.outputTokens.toLocaleString()}</span>
                </div>
                {tokenTotals.cacheReadTokens > 0 && (
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">cache read</span>
                    <span className="text-foreground">{tokenTotals.cacheReadTokens.toLocaleString()}</span>
                  </div>
                )}
                {tokenTotals.cacheCreationTokens > 0 && (
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">cache write</span>
                    <span className="text-foreground">{tokenTotals.cacheCreationTokens.toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        <Button variant="ghost" size="sm" onClick={onClear} className="text-xs h-7">
          Clear
        </Button>
      </div>
    </header>
  )
}
