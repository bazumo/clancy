import { cn } from '@/lib/utils'
import type { ClaudeMessagesRequest, ToolChoiceExtended } from '../types'
import { CollapsibleSection, sectionTypeColors, sectionIcons } from '@/components'

interface GeneralViewProps {
  request: ClaudeMessagesRequest
  defaultExpanded?: boolean
}

function formatToolChoice(toolChoice: ToolChoiceExtended): string {
  switch (toolChoice.type) {
    case 'auto':
      return toolChoice.disable_parallel_tool_use ? 'auto (no parallel)' : 'auto'
    case 'any':
      return toolChoice.disable_parallel_tool_use ? 'any (no parallel)' : 'any'
    case 'tool':
      return `tool: ${toolChoice.name}${toolChoice.disable_parallel_tool_use ? ' (no parallel)' : ''}`
    case 'none':
      return 'none'
    default:
      return JSON.stringify(toolChoice)
  }
}

export function GeneralView({ request, defaultExpanded = true }: GeneralViewProps) {
  const hasAdvancedParams = request.top_p !== undefined || 
                            request.top_k !== undefined || 
                            request.stop_sequences?.length ||
                            request.service_tier !== undefined ||
                            request.betas?.length

  return (
    <CollapsibleSection
      title="General"
      color={sectionTypeColors.general}
      icon={sectionIcons.general}
      defaultExpanded={defaultExpanded}
      headerContent={
        <>
          <span className="text-xs font-mono text-muted-foreground">
            {request.model}
          </span>

        </>
      }
    >
      <div className="space-y-3">
        {/* Model */}
        <div className="flex items-start gap-3">
          <span className="text-xs text-muted-foreground w-28 shrink-0">Model</span>
          <span className="text-xs font-mono text-foreground">{request.model}</span>
        </div>
        
        {/* Max Tokens */}
        <div className="flex items-start gap-3">
          <span className="text-xs text-muted-foreground w-28 shrink-0">Max Tokens</span>
          <div>
            <span className="text-xs font-mono text-foreground">{request.max_tokens.toLocaleString()}</span>
            <p className="text-xs text-muted-foreground mt-0.5">Maximum tokens in response</p>
          </div>
        </div>
        
        {/* Temperature */}
        {request.temperature !== undefined && (
          <div className="flex items-start gap-3">
            <span className="text-xs text-muted-foreground w-28 shrink-0">Temperature</span>
            <div>
              <span className="text-xs font-mono text-foreground">{request.temperature}</span>
              <p className="text-xs text-muted-foreground mt-0.5">
                Controls randomness (0 = deterministic, 1 = creative)
              </p>
            </div>
          </div>
        )}
        
        
        {/* Thinking */}
        {request.thinking && (
          <div className="flex items-start gap-3">
            <span className="text-xs text-muted-foreground w-28 shrink-0">Thinking</span>
            <div>
              <span className={cn(
                'text-xs px-1.5 py-0.5 rounded',
                request.thinking.type === 'enabled' 
                  ? 'bg-purple-500/15 text-purple-400' 
                  : 'bg-muted text-muted-foreground'
              )}>
                {request.thinking.type}
              </span>
              {request.thinking.type === 'enabled' && (
                <>
                  <span className="text-xs font-mono text-foreground ml-2">
                    {request.thinking.budget_tokens.toLocaleString()} tokens
                  </span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Extended thinking budget for complex reasoning
                  </p>
                </>
              )}
            </div>
          </div>
        )}
        
        {/* Tool Choice */}
        {request.tool_choice && (
          <div className="flex items-start gap-3">
            <span className="text-xs text-muted-foreground w-28 shrink-0">Tool Choice</span>
            <div>
              <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400">
                {formatToolChoice(request.tool_choice)}
              </span>
              <p className="text-xs text-muted-foreground mt-0.5">
                {request.tool_choice.type === 'auto' && 'Model decides when to use tools'}
                {request.tool_choice.type === 'any' && 'Model must use a tool'}
                {request.tool_choice.type === 'tool' && 'Model must use the specified tool'}
                {request.tool_choice.type === 'none' && 'Tools are disabled'}
              </p>
            </div>
          </div>
        )}

        {/* Advanced Parameters Section */}
        {hasAdvancedParams && (
          <>
            <div className="border-t border-border pt-3 mt-3">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                Advanced Parameters
              </span>
            </div>

            {/* Top P */}
            {request.top_p !== undefined && (
              <div className="flex items-start gap-3">
                <span className="text-xs text-muted-foreground w-28 shrink-0">Top P</span>
                <div>
                  <span className="text-xs font-mono text-foreground">{request.top_p}</span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Nucleus sampling parameter
                  </p>
                </div>
              </div>
            )}

            {/* Top K */}
            {request.top_k !== undefined && (
              <div className="flex items-start gap-3">
                <span className="text-xs text-muted-foreground w-28 shrink-0">Top K</span>
                <div>
                  <span className="text-xs font-mono text-foreground">{request.top_k}</span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Sample from top K options
                  </p>
                </div>
              </div>
            )}

            {/* Stop Sequences */}
            {request.stop_sequences && request.stop_sequences.length > 0 && (
              <div className="flex items-start gap-3">
                <span className="text-xs text-muted-foreground w-28 shrink-0">Stop Sequences</span>
                <div className="flex flex-wrap gap-1">
                  {request.stop_sequences.map((seq, i) => (
                    <span 
                      key={i}
                      className="text-xs font-mono px-1.5 py-0.5 rounded bg-muted text-foreground"
                    >
                      {JSON.stringify(seq)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Service Tier */}
            {request.service_tier !== undefined && (
              <div className="flex items-start gap-3">
                <span className="text-xs text-muted-foreground w-28 shrink-0">Service Tier</span>
                <span className="text-xs font-mono text-foreground">{request.service_tier}</span>
              </div>
            )}

            {/* Betas */}
            {request.betas && request.betas.length > 0 && (
              <div className="flex items-start gap-3">
                <span className="text-xs text-muted-foreground w-28 shrink-0">Beta Features</span>
                <div className="flex flex-wrap gap-1">
                  {request.betas.map((beta, i) => (
                    <span 
                      key={i}
                      className="text-xs font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400"
                    >
                      {beta}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
        
        {/* Metadata */}
        {request.metadata && Object.keys(request.metadata).length > 0 && (
          <div className="flex items-start gap-3">
            <span className="text-xs text-muted-foreground w-28 shrink-0">Metadata</span>
            <pre className="text-xs font-mono text-muted-foreground bg-muted/50 rounded px-2 py-1">
              {JSON.stringify(request.metadata, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </CollapsibleSection>
  )
}
