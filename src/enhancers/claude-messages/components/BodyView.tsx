import { CollapsibleSection, sectionTypeColors, sectionIcons } from '@/components'
import { isJson, formatJson, highlightJson } from '@/lib/json-highlight'
import { useMemo } from 'react'

interface BodyViewProps {
  body: string
  defaultExpanded?: boolean
}

export function BodyView({ body, defaultExpanded = true }: BodyViewProps) {
  const formattedBody = useMemo(() => formatJson(body), [body])
  const isJsonBody = useMemo(() => isJson(body), [body])
  
  return (
    <CollapsibleSection
      title="Body"
      color={sectionTypeColors.body}
      icon={sectionIcons.body}
      defaultExpanded={defaultExpanded}
    >
      <pre className="text-xs font-mono whitespace-pre-wrap break-all overflow-x-auto">
        {isJsonBody ? highlightJson(formattedBody) : <span className="text-foreground">{formattedBody}</span>}
      </pre>
    </CollapsibleSection>
  )
}
