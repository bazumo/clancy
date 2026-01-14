import { cn } from '@/lib/utils'
import type { ContentBlock as ContentBlockType } from '../types'
import { ThinkingBlock } from './ThinkingBlock'

interface ContentBlockProps {
  block: ContentBlockType
  compact?: boolean
}

export function ContentBlock({ block, compact = false }: ContentBlockProps) {
  switch (block.type) {
    case 'text':
      return (
        <div className={cn('text-xs', compact ? 'inline' : 'my-1')}>
          {block.cache_control && (
            <span className="text-xs px-1 py-0.5 rounded bg-amber-500/15 text-amber-400 mr-2">
              cached
            </span>
          )}
          <span className="whitespace-pre-wrap break-words">{block.text}</span>
        </div>
      )
    
    case 'thinking':
      return <ThinkingBlock block={block} />
    
    case 'tool_use':
      return (
        <div className="border border-blue-500/30 rounded-md overflow-hidden bg-blue-500/5 my-1">
          <div className="px-3 py-2 flex items-center gap-2 border-b border-blue-500/20">
            <span className="text-xs font-medium text-blue-400 uppercase tracking-wider">
              Tool Call
            </span>
            <span className="text-xs font-mono text-foreground">
              {block.name}
            </span>
            <span className="text-xs text-muted-foreground font-mono ml-auto">
              {block.id}
            </span>
          </div>
          <pre className="text-xs font-mono text-foreground/80 whitespace-pre-wrap break-all px-3 py-2">
            {JSON.stringify(block.input, null, 2)}
          </pre>
        </div>
      )
    
    case 'tool_result':
      return (
        <div className={cn(
          'border rounded-md overflow-hidden my-1',
          block.is_error 
            ? 'border-red-500/30 bg-red-500/5' 
            : 'border-green-500/30 bg-green-500/5'
        )}>
          <div className={cn(
            'px-3 py-2 flex items-center gap-2 border-b',
            block.is_error ? 'border-red-500/20' : 'border-green-500/20'
          )}>
            <span className={cn(
              'text-xs font-medium uppercase tracking-wider',
              block.is_error ? 'text-red-400' : 'text-green-400'
            )}>
              {block.is_error ? 'Tool Error' : 'Tool Result'}
            </span>
            <span className="text-xs text-muted-foreground font-mono ml-auto">
              {block.tool_use_id}
            </span>
          </div>
          <div className="px-3 py-2">
            {typeof block.content === 'string' ? (
              <pre className="text-xs font-mono text-foreground/80 whitespace-pre-wrap break-all">
                {block.content}
              </pre>
            ) : (
              <div className="space-y-1">
                {block.content.map((inner, i) => (
                  <ContentBlock key={i} block={inner} compact />
                ))}
              </div>
            )}
          </div>
        </div>
      )
    
    case 'image':
      return (
        <div className="border border-cyan-500/30 rounded-md overflow-hidden bg-cyan-500/5 my-1">
          <div className="px-3 py-2 flex items-center gap-2">
            <span className="text-xs font-medium text-cyan-400 uppercase tracking-wider">
              Image
            </span>
            <span className="text-xs text-muted-foreground">
              {block.source.type === 'base64' 
                ? `${block.source.media_type || 'image'} (base64)` 
                : block.source.url}
            </span>
          </div>
          {block.source.type === 'base64' && block.source.data && (
            <img 
              src={`data:${block.source.media_type || 'image/png'};base64,${block.source.data}`}
              alt="Embedded image"
              className="max-w-full max-h-64 object-contain mx-auto"
            />
          )}
        </div>
      )
    
    default:
      return (
        <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all my-1">
          {JSON.stringify(block, null, 2)}
        </pre>
      )
  }
}

