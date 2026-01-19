import { cn } from '@/lib/utils'
import type { SystemBlock } from '../types'
import { CollapsibleSection, sectionTypeColors, sectionIcons } from '@/components'
import { CacheBreakpointDivider } from '../../shared'

interface SystemPromptViewProps {
  system: string | SystemBlock[]
  defaultExpanded?: boolean
}

// Find the last block index with cache_control
function findLastCacheIndex(blocks: SystemBlock[]): number {
  let lastIndex = -1
  blocks.forEach((block, index) => {
    if (block.cache_control) {
      lastIndex = index
    }
  })
  return lastIndex
}

export function SystemPromptView({ system, defaultExpanded = true }: SystemPromptViewProps) {
  const isArray = Array.isArray(system)
  const lastCacheIndex = isArray ? findLastCacheIndex(system) : -1
  
  return (
    <CollapsibleSection
      title="System"
      color={sectionTypeColors.system}
      icon={sectionIcons.system}
      defaultExpanded={defaultExpanded}
      headerContent={
        <>
          {isArray && (
            <span className="text-xs text-muted-foreground">
              {system.length} block{system.length !== 1 ? 's' : ''}
            </span>
          )}
        </>
      }
    >
      {typeof system === 'string' ? (
        <p className="text-xs whitespace-pre-wrap break-words">{system}</p>
      ) : (
        <div className="space-y-3">
          {system.map((block, i) => {
            const isInCacheRegion = i <= lastCacheIndex
            const isCacheBreakpoint = block.cache_control
            
            return (
              <div key={i} className="relative">
                <div className={cn(
                  'relative pl-3',
                  isInCacheRegion && 'border-l-2 border-amber-500/30'
                )}>
                  <p className="text-xs whitespace-pre-wrap break-words">
                    {block.text}
                  </p>
                </div>
                
                {/* Cache breakpoint indicator - at the bottom */}
                {isCacheBreakpoint && block.cache_control && (
                  <CacheBreakpointDivider 
                    type={block.cache_control.type}
                    ttl={'ttl' in block.cache_control ? block.cache_control.ttl : undefined}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
    </CollapsibleSection>
  )
}
