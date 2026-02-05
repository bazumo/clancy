import type { ResponseBodyProps } from '../../types'
import type { ConverseResponse } from '../types'
import { converseResponseToClaudeResponse } from '../adapters'

// Reuse Claude components
import { ResponseGeneralView } from '../../claude-messages/components/ResponseGeneralView'
import { UsageView } from '../../claude-messages/components/UsageView'
import { ContentView } from '../../claude-messages/components/ContentView'

export function ConverseResponseBody({ parsed, flow }: ResponseBodyProps) {
  const response = parsed as ConverseResponse | null

  // Extract model ID from path
  const pathMatch = flow.request.path.match(/^\/model\/([^/]+)\/converse/)
  const modelId = pathMatch ? pathMatch[1] : null

  if (!response) {
    // For streaming responses, the body is a placeholder - events are shown separately
    if (flow.isSSE || flow.request.path.includes('converse-stream')) {
      return (
        <div className="px-4 py-2 text-xs text-muted-foreground">
          Streaming response - view events above
        </div>
      )
    }
    return <div className="text-xs text-muted-foreground">Failed to parse response</div>
  }

  // Convert to Claude format for reusing components
  const claudeResponse = converseResponseToClaudeResponse(response, modelId)

  return (
    <div>
      {/* Reuse Claude components with adapted data */}
      
      {/* General */}
      <ResponseGeneralView response={claudeResponse} defaultExpanded={false} />

      {/* Usage */}
      {claudeResponse.usage && (
        <UsageView usage={claudeResponse.usage} defaultExpanded={false} />
      )}

      {/* Content */}
      {claudeResponse.content && claudeResponse.content.length > 0 && (
        <ContentView content={claudeResponse.content} defaultExpanded={true} />
      )}
    </div>
  )
}
