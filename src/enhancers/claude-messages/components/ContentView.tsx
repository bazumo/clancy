import type { ContentBlock as ContentBlockType } from '../types'
import { ContentBlock } from './ContentBlock'
import { CollapsibleSection, sectionTypeColors, sectionIcons } from '@/components'

interface ContentViewProps {
  content: ContentBlockType[]
  defaultExpanded?: boolean
}

export function ContentView({ content, defaultExpanded = true }: ContentViewProps) {
  return (
    <CollapsibleSection
      title="Content"
      color={sectionTypeColors.content}
      icon={sectionIcons.content}
      defaultExpanded={defaultExpanded}
      contentClassName="px-4 py-3 space-y-2"
      headerContent={
        <>
          <span className="text-xs text-muted-foreground">
            {content.length} block{content.length !== 1 ? 's' : ''}
          </span>
        </>
      }
    >
      {content.map((block, i) => (
        <ContentBlock key={i} block={block} />
      ))}
    </CollapsibleSection>
  )
}
