import { cn } from '@/lib/utils'
import type { MessageContent, ContentBlock as ContentBlockType, CacheControl } from '../types'
import { ContentBlock } from './ContentBlock'
import { CacheBreakpointDivider } from '../../shared'

interface ChatMessageProps {
  message: MessageContent
  index: number
  /** Whether this message has cache_control set (marks cache boundary) */
  hasCacheBreakpoint?: boolean
}

function getCacheControl(content: string | ContentBlockType[]): CacheControl | null {
  if (typeof content === 'string') return null
  for (const block of content) {
    if ('cache_control' in block && block.cache_control) {
      return block.cache_control
    }
  }
  return null
}

export function ChatMessage({ message, index, hasCacheBreakpoint }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const content = message.content
  const cacheControl = getCacheControl(content)

  return (
    <div className="relative">
      <div className={cn(
        'relative pl-3.5',
        hasCacheBreakpoint && 'ring-1 ring-amber-500/20 rounded-md py-1 px-3.5'
      )}>
        {/* Colored left bar */}
        <div className={cn(
          'absolute left-0 top-0 bottom-0 w-1 rounded-full',
          isUser
            ? (hasCacheBreakpoint ? 'bg-gradient-to-b from-rose-500 to-amber-500' : 'bg-rose-500')
            : (hasCacheBreakpoint ? 'bg-gradient-to-b from-violet-500 to-amber-500' : 'bg-violet-500')
        )} />

        {/* Minimal role label */}
        <div className="flex items-center gap-1.5 mb-1">
          <span className={cn(
            'text-[10px] font-medium tracking-wide',
            isUser ? 'text-rose-400/70' : 'text-violet-400/70'
          )}>
            {message.role}
          </span>
          <span className="text-[10px] text-muted-foreground/30 font-mono">#{index}</span>
        </div>

        {/* Content rendered directly */}
        <div className="space-y-1.5">
          {typeof content === 'string' ? (
            <p className="text-xs whitespace-pre-wrap break-words leading-relaxed text-foreground/85">
              {content}
            </p>
          ) : (
            content.map((block: ContentBlockType, i: number) => (
              <ContentBlock key={i} block={block} />
            ))
          )}
        </div>
      </div>

      {/* Cache breakpoint indicator */}
      {cacheControl && (
        <CacheBreakpointDivider
          type={cacheControl.type}
          ttl={'ttl' in cacheControl ? cacheControl.ttl : undefined}
        />
      )}
    </div>
  )
}
