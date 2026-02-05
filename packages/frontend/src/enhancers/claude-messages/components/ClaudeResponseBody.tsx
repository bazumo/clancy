import type { ResponseBodyProps } from '../../types'
import type { ClaudeMessagesResponse } from '../types'
import { ResponseGeneralView } from './ResponseGeneralView'
import { UsageView } from './UsageView'
import { ContentView } from './ContentView'

export function ClaudeResponseBody({ parsed }: ResponseBodyProps) {
  const response = parsed as ClaudeMessagesResponse | null
  
  if (!response) {
    return <div className="text-xs text-muted-foreground">Failed to parse response</div>
  }
  
  return (
    <div>
      {/* General */}
      <ResponseGeneralView response={response} defaultExpanded={false} />
      
      {/* Usage */}
      {response.usage && (
        <UsageView usage={response.usage} defaultExpanded={false} />
      )}
      
      {/* Content */}
      {response.content && response.content.length > 0 && (
        <ContentView content={response.content} defaultExpanded={true} />
      )}
    </div>
  )
}

