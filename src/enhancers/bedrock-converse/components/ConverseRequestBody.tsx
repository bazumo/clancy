import type { RequestBodyProps } from '../../types'
import type { ConverseStreamRequest } from '../types'
import { converseRequestToClaudeRequest } from '../adapters'

// Reuse Claude components
import { GeneralView } from '../../claude-messages/components/GeneralView'
import { SystemPromptView } from '../../claude-messages/components/SystemPromptView'
import { ToolsView } from '../../claude-messages/components/ToolsView'
import { MessagesView } from '../../claude-messages/components/MessagesView'

export function ConverseRequestBody({ parsed, flow }: RequestBodyProps) {
  const request = parsed as ConverseStreamRequest | null

  // Extract model ID from path
  const pathMatch = flow.request.path.match(/^\/model\/([^/]+)\/converse/)
  const modelId = pathMatch ? pathMatch[1] : null

  if (!request) {
    return <div className="text-xs text-muted-foreground">Failed to parse request</div>
  }

  // Convert to Claude format for reusing components
  const claudeRequest = converseRequestToClaudeRequest(request, modelId)

  return (
    <div>
      {/* Reuse Claude components with adapted data */}
      
      {/* General Config */}
      <GeneralView request={claudeRequest} defaultExpanded={false} />

      {/* System Prompt */}
      {claudeRequest.system && (
        <SystemPromptView system={claudeRequest.system} defaultExpanded={false} />
      )}

      {/* Tools */}
      {claudeRequest.tools && claudeRequest.tools.length > 0 && (
        <ToolsView tools={claudeRequest.tools} defaultExpanded={false} />
      )}

      {/* Messages */}
      <MessagesView messages={claudeRequest.messages} defaultExpanded={true} />
    </div>
  )
}
