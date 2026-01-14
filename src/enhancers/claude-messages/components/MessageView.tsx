import { cn } from '@/lib/utils'
import type { Message, ContentBlock as ContentBlockType } from '../types'
import { ContentBlock } from './ContentBlock'

interface MessageViewProps {
  message: Message
  index: number
}

const roleColors = {
  user: {
    border: 'border-emerald-500/50',
    bg: 'bg-emerald-500/5',
    badge: 'bg-emerald-500/15 text-emerald-400',
  },
  assistant: {
    border: 'border-violet-500/50',
    bg: 'bg-violet-500/5',
    badge: 'bg-violet-500/15 text-violet-400',
  },
}

export function MessageView({ message, index }: MessageViewProps) {
  const colors = roleColors[message.role]
  const content = message.content
  
  return (
    <div className={cn('border-l-4 rounded-r-md', colors.border, colors.bg)}>
      <div className="px-3 py-2 flex items-center gap-2 border-b border-border/50">
        <span className={cn('text-xs font-medium px-2 py-0.5 rounded uppercase', colors.badge)}>
          {message.role}
        </span>
        <span className="text-xs text-muted-foreground font-mono">
          #{index}
        </span>
      </div>
      <div className="px-3 py-2">
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
    </div>
  )
}

