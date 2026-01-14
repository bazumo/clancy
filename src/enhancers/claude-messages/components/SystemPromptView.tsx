import type { SystemBlock } from '../types'
import { CollapsibleSection } from '@/components'

interface SystemPromptViewProps {
  system: string | SystemBlock[]
  defaultExpanded?: boolean
}

export function SystemPromptView({ system, defaultExpanded = true }: SystemPromptViewProps) {
  const isArray = Array.isArray(system)
  const hasCache = isArray && system.some(block => block.cache_control)
  
  return (
    <CollapsibleSection
      title="System"
      color="amber"
      defaultExpanded={defaultExpanded}
      headerContent={
        <>
          {isArray && (
            <span className="text-xs text-muted-foreground">
              {system.length} block{system.length !== 1 ? 's' : ''}
            </span>
          )}
          {hasCache && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">
              cached
            </span>
          )}
        </>
      }
    >
      {typeof system === 'string' ? (
        <p className="text-xs whitespace-pre-wrap break-words">{system}</p>
      ) : (
        <div className="space-y-2">
          {system.map((block, i) => (
            <p key={i} className="text-xs whitespace-pre-wrap break-words">
              {block.text}
            </p>
          ))}
        </div>
      )}
    </CollapsibleSection>
  )
}
