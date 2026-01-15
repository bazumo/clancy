import type { ClaudeMessagesResponse } from '../types'
import { CollapsibleSection, sectionTypeColors, sectionIcons } from '@/components'

interface ResponseGeneralViewProps {
  response: ClaudeMessagesResponse
  defaultExpanded?: boolean
}

export function ResponseGeneralView({ response, defaultExpanded = true }: ResponseGeneralViewProps) {
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
          <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">
            {response.stop_reason}
          </span>
        </>
      }
    >
      {/* Model */}
      <div className="flex items-start gap-3">
        <span className="text-xs text-muted-foreground w-24 shrink-0">Model</span>
        <span className="text-xs font-mono text-foreground">{response.model}</span>
      </div>
      
      {/* Message ID */}
      <div className="flex items-start gap-3">
        <span className="text-xs text-muted-foreground w-24 shrink-0">Message ID</span>
        <span className="text-xs font-mono text-foreground">{response.id}</span>
      </div>
      
      {/* Stop Reason */}
      <div className="flex items-start gap-3">
        <span className="text-xs text-muted-foreground w-24 shrink-0">Stop Reason</span>
        <div>
          <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">
            {response.stop_reason}
          </span>
          <p className="text-xs text-muted-foreground mt-0.5">
            {response.stop_reason === 'end_turn' && 'Model completed its response naturally'}
            {response.stop_reason === 'max_tokens' && 'Response was cut off at max token limit'}
            {response.stop_reason === 'stop_sequence' && 'Model encountered a stop sequence'}
            {response.stop_reason === 'tool_use' && 'Model is requesting to use a tool'}
          </p>
        </div>
      </div>
      
      {/* Stop Sequence */}
      {response.stop_sequence && (
        <div className="flex items-start gap-3">
          <span className="text-xs text-muted-foreground w-24 shrink-0">Stop Sequence</span>
          <span className="text-xs font-mono text-foreground">{response.stop_sequence}</span>
        </div>
      )}
    </CollapsibleSection>
  )
}
