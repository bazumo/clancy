import type { MessageContent, ContentBlock as ContentBlockType } from '../types'
import { ContentBlock } from './ContentBlock'
import { CollapsibleSection, sectionTypeColors } from '@/components/CollapsibleSection'

interface MessageViewProps {
  message: MessageContent
  index: number
  defaultExpanded?: boolean
}

const roleColors = {
  user: sectionTypeColors.user,
  assistant: sectionTypeColors.assistant,
} as const

function hasCache(content: string | ContentBlockType[]): boolean {
  if (typeof content === 'string') return false
  return content.some(block => 'cache_control' in block && block.cache_control)
}

function getPreview(content: string | ContentBlockType[]): string {
  if (typeof content === 'string') {
    return content.slice(0, 80) + (content.length > 80 ? '...' : '')
  }
  const textBlocks = content.filter(b => b.type === 'text') as Array<{ type: 'text'; text: string }>
  if (textBlocks.length > 0) {
    const text = textBlocks[0].text
    return text.slice(0, 80) + (text.length > 80 ? '...' : '')
  }
  return `${content.length} block${content.length !== 1 ? 's' : ''}`
}

export function MessageView({ message, index, defaultExpanded = true }: MessageViewProps) {
  const color = roleColors[message.role] ?? 'slate'
  const content = message.content
  const cached = hasCache(content)
  
  return (
    <CollapsibleSection
      title={message.role}
      color={color}
      level={2}
      defaultExpanded={defaultExpanded}
      hoverEffect
      headerContent={
        <>
          <span className="text-xs text-muted-foreground font-mono">
            #{index}
          </span>
          {cached && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">
              cached
            </span>
          )}
        </>
      }
      collapsedContent={
        <span className="text-xs text-muted-foreground truncate flex-1 ml-2">
          {getPreview(content)}
        </span>
      }
    >
      {typeof content === 'string' ? (
        <p className="text-xs whitespace-pre-wrap break-words">{content}</p>
      ) : (
        <div className="space-y-2">
          {content.map((block: ContentBlockType, i: number) => (
            <ContentBlock key={i} block={block} />
          ))}
        </div>
      )}
    </CollapsibleSection>
  )
}
