import type { RequestBodyProps } from '../../types'
import type { ClaudeMessagesRequest } from '../types'
import { GeneralView } from './GeneralView'
import { SystemPromptView } from './SystemPromptView'
import { ToolsView } from './ToolsView'
import { MessagesView } from './MessagesView'

export function ClaudeRequestBody({ parsed }: RequestBodyProps) {
  const request = parsed as ClaudeMessagesRequest | null
  
  if (!request) {
    return <div className="text-xs text-muted-foreground">Failed to parse request</div>
  }
  
  return (
    <div>
      {/* Order: General, System, Tools, Messages */}
      
      {/* General Config */}
      <GeneralView request={request} defaultExpanded={false} />
      
      {/* System Prompt */}
      {request.system && (
        <SystemPromptView system={request.system} defaultExpanded={false} />
      )}
      
      {/* Tools */}
      {request.tools && request.tools.length > 0 && (
        <ToolsView tools={request.tools} defaultExpanded={false} />
      )}
      
      {/* Messages */}
      <MessagesView messages={request.messages} defaultExpanded={true} />
    </div>
  )
}

