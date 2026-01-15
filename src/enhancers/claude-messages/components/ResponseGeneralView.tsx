import { cn } from '@/lib/utils'
import type { ClaudeMessagesResponse, StopReason } from '../types'
import { CollapsibleSection, sectionTypeColors, sectionIcons } from '@/components'

interface ResponseGeneralViewProps {
  response: ClaudeMessagesResponse
  defaultExpanded?: boolean
}

function getStopReasonDescription(stopReason: StopReason | null): string {
  switch (stopReason) {
    case 'end_turn':
      return 'Model completed its response naturally'
    case 'max_tokens':
      return 'Response was cut off at max token limit'
    case 'stop_sequence':
      return 'Model encountered a stop sequence'
    case 'tool_use':
      return 'Model is requesting to use a tool'
    case 'pause_turn':
      return 'Long-running turn was paused - can be continued'
    case 'refusal':
      return 'Response was blocked by streaming classifiers'
    default:
      return 'Unknown stop reason'
  }
}

function getStopReasonColor(stopReason: StopReason | null): string {
  switch (stopReason) {
    case 'end_turn':
      return 'bg-emerald-500/15 text-emerald-400'
    case 'max_tokens':
      return 'bg-amber-500/15 text-amber-400'
    case 'stop_sequence':
      return 'bg-blue-500/15 text-blue-400'
    case 'tool_use':
      return 'bg-cyan-500/15 text-cyan-400'
    case 'pause_turn':
      return 'bg-purple-500/15 text-purple-400'
    case 'refusal':
      return 'bg-red-500/15 text-red-400'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

export function ResponseGeneralView({ response, defaultExpanded = true }: ResponseGeneralViewProps) {
  const stopReasonColor = getStopReasonColor(response.stop_reason)
  
  return (
    <CollapsibleSection
      title="General"
      color={sectionTypeColors.general}
      icon={sectionIcons.general}
      defaultExpanded={defaultExpanded}
      contentClassName="px-4 py-3 space-y-3"
      headerContent={
        <>
          <span className="text-xs font-mono text-muted-foreground">
            {response.model}
          </span>
          {response.stop_reason && (
            <span className={cn('text-xs px-1.5 py-0.5 rounded', stopReasonColor)}>
              {response.stop_reason}
            </span>
          )}
        </>
      }
    >
      {/* Model */}
      <div className="flex items-start gap-3">
        <span className="text-xs text-muted-foreground w-28 shrink-0">Model</span>
        <span className="text-xs font-mono text-foreground">{response.model}</span>
      </div>
      
      {/* Message ID */}
      <div className="flex items-start gap-3">
        <span className="text-xs text-muted-foreground w-28 shrink-0">Message ID</span>
        <span className="text-xs font-mono text-foreground">{response.id}</span>
      </div>
      
      {/* Type */}
      <div className="flex items-start gap-3">
        <span className="text-xs text-muted-foreground w-28 shrink-0">Type</span>
        <span className="text-xs font-mono text-foreground">{response.type}</span>
      </div>
      
      {/* Role */}
      <div className="flex items-start gap-3">
        <span className="text-xs text-muted-foreground w-28 shrink-0">Role</span>
        <span className="text-xs font-mono text-foreground">{response.role}</span>
      </div>
      
      {/* Stop Reason */}
      <div className="flex items-start gap-3">
        <span className="text-xs text-muted-foreground w-28 shrink-0">Stop Reason</span>
        <div>
          <span className={cn('text-xs px-1.5 py-0.5 rounded', stopReasonColor)}>
            {response.stop_reason ?? 'null'}
          </span>
          <p className="text-xs text-muted-foreground mt-0.5">
            {getStopReasonDescription(response.stop_reason)}
          </p>
        </div>
      </div>
      
      {/* Stop Sequence */}
      {response.stop_sequence && (
        <div className="flex items-start gap-3">
          <span className="text-xs text-muted-foreground w-28 shrink-0">Stop Sequence</span>
          <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-muted text-foreground">
            {JSON.stringify(response.stop_sequence)}
          </span>
        </div>
      )}
      
      {/* Content Summary */}
      <div className="flex items-start gap-3">
        <span className="text-xs text-muted-foreground w-28 shrink-0">Content Blocks</span>
        <div className="flex flex-wrap gap-1">
          {response.content.length === 0 ? (
            <span className="text-xs text-muted-foreground italic">empty</span>
          ) : (
            (() => {
              const typeCounts: Record<string, number> = {}
              response.content.forEach(block => {
                typeCounts[block.type] = (typeCounts[block.type] || 0) + 1
              })
              return Object.entries(typeCounts).map(([type, count]) => (
                <span 
                  key={type}
                  className={cn(
                    'text-xs px-1.5 py-0.5 rounded',
                    type === 'text' && 'bg-foreground/10 text-foreground',
                    type === 'thinking' && 'bg-purple-500/15 text-purple-400',
                    type === 'redacted_thinking' && 'bg-purple-500/10 text-purple-400/70',
                    type === 'tool_use' && 'bg-blue-500/15 text-blue-400',
                    type === 'server_tool_use' && 'bg-indigo-500/15 text-indigo-400',
                    type === 'web_search_tool_result' && 'bg-cyan-500/15 text-cyan-400',
                  )}
                >
                  {count}× {type.replace(/_/g, ' ')}
                </span>
              ))
            })()
          )}
        </div>
      </div>
    </CollapsibleSection>
  )
}
