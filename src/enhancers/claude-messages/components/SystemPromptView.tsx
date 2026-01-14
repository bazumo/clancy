import type { SystemBlock } from '../types'

interface SystemPromptViewProps {
  system: string | SystemBlock[]
}

export function SystemPromptView({ system }: SystemPromptViewProps) {
  if (typeof system === 'string') {
    return (
      <div className="border-l-4 border-amber-500/50 rounded-r-md bg-amber-500/5">
        <div className="px-3 py-2 flex items-center gap-2 border-b border-border/50">
          <span className="text-xs font-medium px-2 py-0.5 rounded uppercase bg-amber-500/15 text-amber-400">
            System
          </span>
        </div>
        <div className="px-3 py-2">
          <p className="text-xs whitespace-pre-wrap break-words">{system}</p>
        </div>
      </div>
    )
  }
  
  return (
    <div className="border-l-4 border-amber-500/50 rounded-r-md bg-amber-500/5">
      <div className="px-3 py-2 flex items-center gap-2 border-b border-border/50">
        <span className="text-xs font-medium px-2 py-0.5 rounded uppercase bg-amber-500/15 text-amber-400">
          System
        </span>
        <span className="text-xs text-muted-foreground">
          {system.length} block{system.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="px-3 py-2 space-y-2">
        {system.map((block, i) => (
          <div key={i} className="text-xs">
            {block.cache_control && (
              <span className="px-1 py-0.5 rounded bg-amber-500/15 text-amber-400 mr-2">
                cached
              </span>
            )}
            <span className="whitespace-pre-wrap break-words">{block.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

