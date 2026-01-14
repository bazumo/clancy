import type { Usage } from '../types'
import { CollapsibleSection, sectionTypeColors } from '@/components'

interface UsageViewProps {
  usage: Usage
  defaultExpanded?: boolean
}

export function UsageView({ usage, defaultExpanded = true }: UsageViewProps) {
  const totalTokens = usage.input_tokens + usage.output_tokens
  const hasCacheStats = (usage.cache_read_input_tokens && usage.cache_read_input_tokens > 0) ||
                        (usage.cache_creation_input_tokens && usage.cache_creation_input_tokens > 0)
  
  return (
    <CollapsibleSection
      title="Usage"
      color={sectionTypeColors.usage}
      defaultExpanded={defaultExpanded}
      contentClassName="px-4 py-3 space-y-3"
      headerContent={
        <>
          <span className="text-xs text-muted-foreground">
            {totalTokens.toLocaleString()} tokens
          </span>
          {hasCacheStats && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">
              cached
            </span>
          )}
        </>
      }
    >
      {/* Input Tokens */}
      <div className="flex items-start gap-3">
        <span className="text-xs text-muted-foreground w-28 shrink-0">Input Tokens</span>
        <div>
          <span className="text-xs font-mono text-foreground">{usage.input_tokens.toLocaleString()}</span>
          <p className="text-xs text-muted-foreground mt-0.5">Tokens in the request (messages + system)</p>
        </div>
      </div>
      
      {/* Output Tokens */}
      <div className="flex items-start gap-3">
        <span className="text-xs text-muted-foreground w-28 shrink-0">Output Tokens</span>
        <div>
          <span className="text-xs font-mono text-foreground">{usage.output_tokens.toLocaleString()}</span>
          <p className="text-xs text-muted-foreground mt-0.5">Tokens in the response</p>
        </div>
      </div>
      
      {/* Cache Read */}
      {usage.cache_read_input_tokens !== undefined && usage.cache_read_input_tokens > 0 && (
        <div className="flex items-start gap-3">
          <span className="text-xs text-muted-foreground w-28 shrink-0">Cache Read</span>
          <div>
            <span className="text-xs font-mono text-amber-400">{usage.cache_read_input_tokens.toLocaleString()}</span>
            <p className="text-xs text-muted-foreground mt-0.5">Tokens read from cache (reduced cost)</p>
          </div>
        </div>
      )}
      
      {/* Cache Created */}
      {usage.cache_creation_input_tokens !== undefined && usage.cache_creation_input_tokens > 0 && (
        <div className="flex items-start gap-3">
          <span className="text-xs text-muted-foreground w-28 shrink-0">Cache Created</span>
          <div>
            <span className="text-xs font-mono text-amber-400">{usage.cache_creation_input_tokens.toLocaleString()}</span>
            <p className="text-xs text-muted-foreground mt-0.5">Tokens written to cache for future requests</p>
          </div>
        </div>
      )}
      
      {/* Total */}
      <div className="flex items-start gap-3 pt-2 border-t border-border">
        <span className="text-xs text-muted-foreground w-28 shrink-0">Total</span>
        <span className="text-xs font-mono text-foreground font-medium">{totalTokens.toLocaleString()}</span>
      </div>
    </CollapsibleSection>
  )
}
