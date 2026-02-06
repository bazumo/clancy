import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { MessageContent, ContentBlock as ContentBlockType } from '../types'
import { ChatMessage } from './ChatMessage'
import { sectionIcons } from '@/components/CollapsibleSection'

interface MessagesViewProps {
  messages: MessageContent[]
  defaultExpanded?: boolean
}

// Find the last index that has cache_control set
function findLastCacheBreakpointIndex(messages: MessageContent[]): number {
  // Iterate in reverse for early exit (cache typically at end)
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (typeof message.content !== 'string') {
      const hasCache = (message.content as ContentBlockType[]).some(
        (block: ContentBlockType) => 'cache_control' in block && block.cache_control
      )
      if (hasCache) {
        return index
      }
    }
  }
  return -1
}

export function MessagesView({ messages, defaultExpanded = true }: MessagesViewProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  // Find the cache breakpoint index
  const lastCacheIndex = useMemo(() => findLastCacheBreakpointIndex(messages), [messages])

  return (
    <div className="border-b border-border">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="sticky top-11 z-[9] bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 w-full text-left"
      >
        <div className="px-4 h-11 flex items-center gap-2">
          <svg
            className={cn(
              'w-3.5 h-3.5 transition-transform shrink-0 text-muted-foreground/60',
              expanded && 'rotate-90'
            )}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>

          <svg className="w-4 h-4 text-teal-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {sectionIcons.messages}
          </svg>
          <span className="text-sm font-medium text-teal-400">
            Messages
          </span>

          <span className="text-[11px] text-muted-foreground/50 font-mono ml-1">
            {messages.length}
          </span>
        </div>
      </button>

      {/* Chat messages */}
      {expanded && (
        <div className="py-3 px-4 space-y-4 border-t border-border">
          {messages.map((message, i) => (
            <ChatMessage
              key={i}
              message={message}
              index={i}
              hasCacheBreakpoint={i <= lastCacheIndex}
            />
          ))}
        </div>
      )}
    </div>
  )
}
