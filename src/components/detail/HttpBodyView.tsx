import { HeadersView } from '@/enhancers/claude-messages/components/HeadersView'
import { BodyView } from '@/enhancers/claude-messages/components/BodyView'

interface HttpBodyViewProps {
  headers: Record<string, string | string[] | undefined>
  body?: string
}

/**
 * Reusable component that displays HTTP headers and body together.
 * This pattern was repeated 4 times in the original App.tsx.
 */
export function HttpBodyView({ headers, body }: HttpBodyViewProps) {
  return (
    <div>
      <HeadersView headers={headers} />
      {body && <BodyView body={body} />}
    </div>
  )
}

