import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { Message } from '../types'
import { MessageView } from './MessageView'

interface MessagesViewProps {
  messages: Message[]
  defaultExpanded?: boolean
}

export function MessagesView({ messages, defaultExpanded = true }: MessagesViewProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  
  return (
    <div className="border-l-[6px] border-l-slate-500">
      <button
        onClick={() => setExpanded(!expanded)}
        className="sticky top-11 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 z-[9] border-y border-border w-full text-left"
      >
        <div className="px-4 h-9 flex items-center gap-2">
          <svg
            className={cn(
              'w-4 h-4 text-slate-400 transition-transform shrink-0',
              expanded && 'rotate-90'
            )}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Messages
          </span>
          <span className="text-xs text-muted-foreground">
            {messages.length} message{messages.length !== 1 ? 's' : ''}
          </span>
        </div>
      </button>
      {expanded && (
        <div>
          {messages.map((message, i) => (
            <MessageView key={i} message={message} index={i} defaultExpanded={true} />
          ))}
        </div>
      )}
    </div>
  )
}

