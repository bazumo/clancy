import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { Message, ContentBlock as ContentBlockType } from '../types'
import { ContentBlock } from './ContentBlock'

interface MessageViewProps {
  message: Message
  index: number
  defaultExpanded?: boolean
}

const roleColors = {
  user: {
    border: 'border-l-red-500',
    badge: 'text-red-400',
  },
  assistant: {
    border: 'border-l-orange-500',
    badge: 'text-orange-400',
  },
}

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
  const [expanded, setExpanded] = useState(defaultExpanded)
  const colors = roleColors[message.role]
  const content = message.content
  const cached = hasCache(content)
  
  return (
    <div className={cn('border-l-[6px]', colors.border)}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="sticky top-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 z-[8] border-y border-border w-full text-left hover:bg-muted/50 transition-colors"
      >
        <div className="px-4 h-9 flex items-center gap-2">
          <svg
            className={cn(
              'w-4 h-4 transition-transform shrink-0',
              colors.badge,
              expanded && 'rotate-90'
            )}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className={cn('text-xs font-medium uppercase tracking-wider', colors.badge)}>
            {message.role}
          </span>
          <span className="text-xs text-muted-foreground font-mono">
            #{index}
          </span>
          {cached && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">
              cached
            </span>
          )}
          {!expanded && (
            <span className="text-xs text-muted-foreground truncate flex-1 ml-2">
              {getPreview(content)}
            </span>
          )}
        </div>
      </button>
      {expanded && (
        <div className="px-4 py-3">
          {typeof content === 'string' ? (
            <p className="text-xs whitespace-pre-wrap break-words">{content}</p>
          ) : (
            <div className="space-y-2">
              {content.map((block: ContentBlockType, i: number) => (
                <ContentBlock key={i} block={block} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

