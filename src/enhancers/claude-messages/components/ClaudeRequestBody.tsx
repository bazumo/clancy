import type { RequestBodyProps } from '../../types'
import type { ClaudeMessagesRequest } from '../types'
import { MessageView } from './MessageView'
import { SystemPromptView } from './SystemPromptView'

export function ClaudeRequestBody({ parsed }: RequestBodyProps) {
  const request = parsed as ClaudeMessagesRequest | null
  
  if (!request) {
    return <div className="text-xs text-muted-foreground">Failed to parse request</div>
  }
  
  return (
    <div className="space-y-4">
      {/* Model and Config */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-mono px-2 py-1 rounded bg-foreground/10 text-foreground">
          {request.model}
        </span>
        {request.max_tokens && (
          <span className="text-xs text-muted-foreground">
            max: {request.max_tokens.toLocaleString()}
          </span>
        )}
        {request.temperature !== undefined && (
          <span className="text-xs text-muted-foreground">
            temp: {request.temperature}
          </span>
        )}
        {request.stream && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400">
            streaming
          </span>
        )}
        {request.thinking?.type === 'enabled' && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400">
            thinking ({request.thinking.budget_tokens.toLocaleString()})
          </span>
        )}
        {request.tools && request.tools.length > 0 && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400">
            {request.tools.length} tool{request.tools.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      
      {/* System Prompt */}
      {request.system && (
        <SystemPromptView system={request.system} />
      )}
      
      {/* Messages */}
      <div className="space-y-3">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Messages ({request.messages.length})
        </h4>
        {request.messages.map((message, i) => (
          <MessageView key={i} message={message} index={i} />
        ))}
      </div>
      
      {/* Tools */}
      {request.tools && request.tools.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Tools
          </h4>
          <div className="space-y-1">
            {request.tools.map((tool, i) => (
              <div key={i} className="text-xs border border-border/50 rounded px-2 py-1.5 bg-muted/30">
                <span className="font-mono font-medium text-blue-400">{tool.name}</span>
                <span className="text-muted-foreground ml-2">{tool.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

