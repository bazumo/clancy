import type { Usage } from '../types'
import { CollapsibleSection, sectionTypeColors, sectionIcons } from '@/components'

interface UsageViewProps {
  usage: Usage
  defaultExpanded?: boolean
}

export function UsageView({ usage, defaultExpanded = true }: UsageViewProps) {
  const hasCacheStats = (usage.cache_read_input_tokens ?? 0) > 0 ||
                        (usage.cache_creation_input_tokens ?? 0) > 0 ||
                        usage.cache_creation !== null
  const hasServerToolUsage = usage.server_tool_use !== null && usage.server_tool_use !== undefined
  
  return (
    <CollapsibleSection
      title="Usage"
      color={sectionTypeColors.usage}
      icon={sectionIcons.usage}
      defaultExpanded={defaultExpanded}
      contentClassName="px-4 py-3 space-y-3"
      headerContent={
        <>
      
          {usage.service_tier && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400">
              {usage.service_tier}
            </span>
          )}
          {hasServerToolUsage && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400">
              web search
            </span>
          )}
        </>
      }
    >
      {/* Input Tokens */}
      <div className="flex items-start gap-3">
        <span className="text-xs text-muted-foreground w-32 shrink-0">Input Tokens</span>
        <div>
          <span className="text-xs font-mono text-foreground">{usage.input_tokens.toLocaleString()}</span>
          <p className="text-xs text-muted-foreground mt-0.5">Tokens in the request (messages + system)</p>
        </div>
      </div>
      
      {/* Output Tokens */}
      <div className="flex items-start gap-3">
        <span className="text-xs text-muted-foreground w-32 shrink-0">Output Tokens</span>
        <div>
          <span className="text-xs font-mono text-foreground">{usage.output_tokens.toLocaleString()}</span>
          <p className="text-xs text-muted-foreground mt-0.5">Tokens in the response</p>
        </div>
      </div>

      {/* Cache Statistics Section */}
      {hasCacheStats && (
        <>
          <div className="border-t border-border pt-3 mt-3">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Cache Statistics
            </span>
          </div>

          {/* Cache Read */}
          <div className="flex items-start gap-3">
            <span className="text-xs text-muted-foreground w-32 shrink-0">Cache Read</span>
            <div>
              <span className="text-xs font-mono text-foreground">{(usage.cache_read_input_tokens ?? 0).toLocaleString()}</span>
              <p className="text-xs text-muted-foreground mt-0.5">Tokens read from cache (reduced cost)</p>
            </div>
          </div>
          
          {/* Cache Creation Total */}
          <div className="flex items-start gap-3">
            <span className="text-xs text-muted-foreground w-32 shrink-0">Cache Created</span>
            <div>
              <span className="text-xs font-mono text-foreground">{(usage.cache_creation_input_tokens ?? 0).toLocaleString()}</span>
              <p className="text-xs text-muted-foreground mt-0.5">Tokens written to cache for future requests</p>
            </div>
          </div>

          {/* Cache Creation Breakdown by TTL */}
          {usage.cache_creation && (
            <>
              {usage.cache_creation.ephemeral_5m_input_tokens > 0 && (
                <div className="flex items-start gap-3 ml-4">
                  <span className="text-xs text-muted-foreground w-28 shrink-0">↳ 5min TTL</span>
                  <span className="text-xs font-mono text-foreground/80">
                    {usage.cache_creation.ephemeral_5m_input_tokens.toLocaleString()}
                  </span>
                </div>
              )}
              {usage.cache_creation.ephemeral_1h_input_tokens > 0 && (
                <div className="flex items-start gap-3 ml-4">
                  <span className="text-xs text-muted-foreground w-28 shrink-0">↳ 1hr TTL</span>
                  <span className="text-xs font-mono text-foreground/80">
                    {usage.cache_creation.ephemeral_1h_input_tokens.toLocaleString()}
                  </span>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Server Tool Usage Section */}
      {hasServerToolUsage && usage.server_tool_use && (
        <>
          <div className="border-t border-border pt-3 mt-3">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Server Tool Usage
            </span>
          </div>

          <div className="flex items-start gap-3">
            <span className="text-xs text-muted-foreground w-32 shrink-0">Web Searches</span>
            <div>
              <span className="text-xs font-mono text-cyan-400">{usage.server_tool_use.web_search_requests}</span>
              <p className="text-xs text-muted-foreground mt-0.5">Number of web search requests made</p>
            </div>
          </div>
        </>
      )}

      {/* Service Tier */}
      {usage.service_tier && (
        <>
          <div className="border-t border-border pt-3 mt-3">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Service Information
            </span>
          </div>

          <div className="flex items-start gap-3">
            <span className="text-xs text-muted-foreground w-32 shrink-0">Service Tier</span>
            <div>
              <span className={`text-xs px-1.5 py-0.5 rounded ${
                usage.service_tier === 'priority' 
                  ? 'bg-purple-500/15 text-purple-400' 
                  : usage.service_tier === 'batch'
                    ? 'bg-green-500/15 text-green-400'
                    : 'bg-blue-500/15 text-blue-400'
              }`}>
                {usage.service_tier}
              </span>
              <p className="text-xs text-muted-foreground mt-0.5">
                {usage.service_tier === 'priority' && 'Priority tier - higher rate limits'}
                {usage.service_tier === 'standard' && 'Standard tier - normal rate limits'}
                {usage.service_tier === 'batch' && 'Batch tier - processed asynchronously'}
              </p>
            </div>
          </div>
        </>
      )}
      
 
    </CollapsibleSection>
  )
}
