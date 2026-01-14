import { CollapsibleSection } from '@/components'

interface RawBodyViewProps {
  body: string
  defaultExpanded?: boolean
}

function formatBody(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2)
  } catch {
    return body
  }
}

export function RawBodyView({ body, defaultExpanded = true }: RawBodyViewProps) {
  return (
    <CollapsibleSection
      title="Body"
      color="slate"
      defaultExpanded={defaultExpanded}
    >
      <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-all overflow-x-auto">
        {formatBody(body)}
      </pre>
    </CollapsibleSection>
  )
}
