import type { ResponseBodyProps } from '../../types'
import type { ClaudeMessagesResponse, ContentBlock as ContentBlockType } from '../types'
import { ContentBlock } from './ContentBlock'

export function ClaudeResponseBody({ parsed }: ResponseBodyProps) {
  const response = parsed as ClaudeMessagesResponse | null
  
  if (!response) {
    return <div className="text-xs text-muted-foreground">Failed to parse response</div>
  }
  
  return (
    <div className="space-y-4">
      {/* Response Info */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-mono px-2 py-1 rounded bg-foreground/10 text-foreground">
          {response.model}
        </span>
        <span className="text-xs text-muted-foreground font-mono">
          {response.id}
        </span>
        <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">
          {response.stop_reason}
        </span>
      </div>
      
      {/* Usage */}
      {response.usage && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>
            Input: <span className="font-mono">{response.usage.input_tokens.toLocaleString()}</span>
          </span>
          <span>
            Output: <span className="font-mono">{response.usage.output_tokens.toLocaleString()}</span>
          </span>
          {response.usage.cache_read_input_tokens !== undefined && response.usage.cache_read_input_tokens > 0 && (
            <span className="text-amber-400">
              Cache read: <span className="font-mono">{response.usage.cache_read_input_tokens.toLocaleString()}</span>
            </span>
          )}
          {response.usage.cache_creation_input_tokens !== undefined && response.usage.cache_creation_input_tokens > 0 && (
            <span className="text-amber-400">
              Cache created: <span className="font-mono">{response.usage.cache_creation_input_tokens.toLocaleString()}</span>
            </span>
          )}
        </div>
      )}
      
      {/* Content */}
      {response.content && response.content.length > 0 && (
        <div className="space-y-2">
          {response.content.map((block: ContentBlockType, i: number) => (
            <ContentBlock key={i} block={block} />
          ))}
        </div>
      )}
    </div>
  )
}

