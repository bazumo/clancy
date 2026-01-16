import { cn } from '@/lib/utils'
import type { SystemBlock } from '../types'
import { CollapsibleSection, sectionTypeColors, sectionIcons } from '@/components'

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

const CacheIcon = () => (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
  </svg>
)

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
                {isCacheBreakpoint && (
                  <div className="relative mt-2">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-dashed border-amber-500/40" />
                    </div>
                    <div className="relative flex justify-center">
                      <span className="px-2 py-0.5 text-[10px] font-mono bg-background text-amber-400 flex items-center gap-1.5">
                        <CacheIcon />
                        <span className="opacity-70">↑ cached up to here</span>
                        <span className="text-amber-500">cache_control: {block.cache_control?.type}</span>
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </CollapsibleSection>
  )
}
