import type { ContentBlock as ContentBlockType } from '../types'
import { ContentBlock } from './ContentBlock'
import { CollapsibleSection, sectionTypeColors } from '@/components'

interface ContentViewProps {
  content: ContentBlockType[]
  defaultExpanded?: boolean
}

export function ContentView({ content, defaultExpanded = true }: ContentViewProps) {
  const hasThinking = content.some(b => b.type === 'thinking')
  const hasToolUse = content.some(b => b.type === 'tool_use')
  
  return (
    <CollapsibleSection
      title="Content"
      color={sectionTypeColors.content}
      defaultExpanded={defaultExpanded}
      contentClassName="px-4 py-3 space-y-2"
      headerContent={
        <>
          <span className="text-xs text-muted-foreground">
            {content.length} block{content.length !== 1 ? 's' : ''}
          </span>
          {hasThinking && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400">
              thinking
            </span>
          )}
          {hasToolUse && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400">
              tool_use
            </span>
          )}
        </>
      }
    >
      {content.map((block, i) => (
        <ContentBlock key={i} block={block} />
      ))}
    </CollapsibleSection>
  )
}
