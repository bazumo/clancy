import { useState } from 'react'
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

function getTextPreview(content: string | ContentBlockType[]): string {
  if (typeof content === 'string') {
    return content.slice(0, 200) + (content.length > 200 ? '...' : '')
  }
  const textBlocks = content.filter(b => b.type === 'text') as Array<{ type: 'text'; text: string }>
  if (textBlocks.length > 0) {
    const text = textBlocks[0].text
    return text.slice(0, 200) + (text.length > 200 ? '...' : '')
  }
  return ''
}

function countContentTypes(content: ContentBlockType[]): Record<string, number> {
  const counts: Record<string, number> = {}
  content.forEach(block => {
    counts[block.type] = (counts[block.type] || 0) + 1
  })
  return counts
}

// Icons for user and assistant
const UserIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
  </svg>
)

const AssistantIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
  </svg>
)

// Content type badge colors
const contentTypeBadgeColors: Record<string, string> = {
  text: '',
  thinking: 'bg-purple-500/15 text-purple-400',
  redacted_thinking: 'bg-purple-500/10 text-purple-400/70',
  tool_use: 'bg-blue-500/15 text-blue-400',
  tool_result: 'bg-emerald-500/15 text-emerald-400',
  image: 'bg-cyan-500/15 text-cyan-400',
  document: 'bg-amber-500/15 text-amber-400',
  search_result: 'bg-teal-500/15 text-teal-400',
  server_tool_use: 'bg-indigo-500/15 text-indigo-400',
  web_search_tool_result: 'bg-cyan-500/15 text-cyan-400',
  web_search_result: 'bg-cyan-500/10 text-cyan-400/70',
}

export function ChatMessage({ message, index, hasCacheBreakpoint }: ChatMessageProps) {
  const [expanded, setExpanded] = useState(false)
  const isUser = message.role === 'user'
  const content = message.content
  const cacheControl = getCacheControl(content)
  
  const hasComplexContent = typeof content !== 'string' && content.some(
    b => b.type !== 'text'
  )
  
  const contentTypes = typeof content !== 'string' ? countContentTypes(content) : {}
  
  return (
    <div className="relative">
      <div className="relative pl-3">
        {/* Role indicator line - amber tint if part of cache */}
        <div className={cn(
          'absolute left-0 top-0 bottom-0 w-1 rounded-full',
          isUser 
            ? (hasCacheBreakpoint ? 'bg-gradient-to-b from-rose-500 to-amber-500' : 'bg-rose-500')
            : (hasCacheBreakpoint ? 'bg-gradient-to-b from-violet-500 to-amber-500' : 'bg-violet-500')
        )} />
        
        {/* Message header */}
        <div className="flex items-center gap-2 mb-1.5 pl-1">
          <div className={cn(
            'flex items-center gap-1.5',
            isUser ? 'text-rose-400' : 'text-violet-400'
          )}>
            {isUser ? <UserIcon /> : <AssistantIcon />}
            <span className="text-[11px] font-semibold uppercase tracking-wide">
              {message.role}
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground/50 font-mono">#{index}</span>
          {hasComplexContent && (
            <div className="flex gap-1 ml-auto flex-wrap">
              {Object.entries(contentTypes).map(([type, count]) => (
                type !== 'text' && (
                  <span 
                    key={type}
                    className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded font-medium',
                      contentTypeBadgeColors[type] || 'bg-muted text-muted-foreground'
                    )}
                  >
                    {count} {type.replace(/_/g, ' ')}
                  </span>
                )
              ))}
            </div>
          )}
        </div>
        
        {/* Message content */}
        <div className={cn(
          'rounded-lg transition-all ml-1',
          isUser 
            ? 'bg-rose-500/5 border border-rose-500/15' 
            : 'bg-violet-500/5 border border-violet-500/15',
          hasCacheBreakpoint && 'ring-1 ring-amber-500/20'
        )}>
          {/* Preview / collapsed view */}
          {!expanded && typeof content === 'string' ? (
            <div className="px-3 py-2.5">
              <p className="text-sm whitespace-pre-wrap break-words leading-relaxed text-foreground/90">
                {content}
              </p>
            </div>
          ) : !expanded ? (
            <button 
              onClick={() => setExpanded(true)}
              className="w-full text-left px-3 py-2.5 hover:bg-white/5 transition-colors rounded-lg"
            >
              {getTextPreview(content) && (
                <p className="text-sm whitespace-pre-wrap break-words leading-relaxed text-foreground/90 mb-2">
                  {getTextPreview(content)}
                </p>
              )}
              <span className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                Click to expand {(content as ContentBlockType[]).length} blocks →
              </span>
            </button>
          ) : typeof content === 'string' ? (
            <div className="px-3 py-2.5">
              <p className="text-sm whitespace-pre-wrap break-words leading-relaxed text-foreground/90">
                {content}
              </p>
            </div>
          ) : (
            <div className="px-3 py-2.5 space-y-3">
              {content.map((block: ContentBlockType, i: number) => (
                <ContentBlock key={i} block={block} />
              ))}
              <button
                onClick={() => setExpanded(false)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Collapse
              </button>
            </div>
          )}
        </div>
      </div>
      
      {/* Cache breakpoint indicator - shows below the message */}
      {cacheControl && (
        <CacheBreakpointDivider 
          type={cacheControl.type} 
          ttl={'ttl' in cacheControl ? cacheControl.ttl : undefined}
        />
      )}
    </div>
  )
}
