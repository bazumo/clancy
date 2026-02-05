import { CollapsibleSection, sectionTypeColors } from '@/components/CollapsibleSection'
import { isJson, formatJson, highlightJson } from '@/lib/json-highlight'
import { useMemo } from 'react'

// 10MB size limit for displaying body content
const MAX_BODY_SIZE = 10 * 1024 * 1024

interface BodyViewProps {
  body: string
  defaultExpanded?: boolean
}

export function BodyView({ body, defaultExpanded = true }: BodyViewProps) {
  const isBodyTooLarge = body.length > MAX_BODY_SIZE
  const formattedBody = useMemo(() => isBodyTooLarge ? '' : formatJson(body), [body, isBodyTooLarge])
  const isJsonBody = useMemo(() => isBodyTooLarge ? false : isJson(body), [body, isBodyTooLarge])
  
  return (
    <CollapsibleSection
      title="Body"
      color={sectionTypeColors.body}
      defaultExpanded={defaultExpanded}
    >
      {isBodyTooLarge ? (
        <span className="text-xs text-muted-foreground italic">Body too large to display</span>
      ) : (
        <pre className="text-xs font-mono whitespace-pre-wrap break-all overflow-x-auto">
          {isJsonBody ? highlightJson(formattedBody) : <span className="text-foreground">{formattedBody}</span>}
        </pre>
      )}
    </CollapsibleSection>
  )
}
