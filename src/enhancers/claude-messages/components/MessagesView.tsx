import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { Message } from '../types'
import { ChatMessage } from './ChatMessage'
import { sectionIcons } from '@/components'

interface MessagesViewProps {
  messages: Message[]
  defaultExpanded?: boolean
}

export function MessagesView({ messages, defaultExpanded = true }: MessagesViewProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  
  return (
    <div className="border-b border-border">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="sticky top-11 z-[9] bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 w-full text-left"
      >
        <div className="px-4 h-11 flex items-center gap-2 border-b border-border">
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
          
          <span className="text-xs text-muted-foreground tabular-nums">
            {messages.length}
          </span>
          
          {/* Role breakdown */}
          <div className="flex items-center gap-3 ml-auto text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-400" />
              {messages.filter(m => m.role === 'user').length} user
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-violet-400" />
              {messages.filter(m => m.role === 'assistant').length} assistant
            </span>
          </div>
        </div>
      </button>
      
      {/* Chat messages */}
      {expanded && (
        <div className="py-3 px-4 space-y-3 bg-gradient-to-b from-muted/10 to-transparent">
          {messages.map((message, i) => (
            <ChatMessage key={i} message={message} index={i} />
          ))}
        </div>
      )}
    </div>
  )
}
