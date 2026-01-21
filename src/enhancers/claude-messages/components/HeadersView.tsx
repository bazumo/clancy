import { CollapsibleSection, sectionTypeColors } from '@/components/CollapsibleSection'

interface HeadersViewProps {
  headers: Record<string, string | string[] | undefined>
  defaultExpanded?: boolean
}

function formatHeaders(headers: Record<string, string | string[] | undefined>): string {
  return Object.entries(headers)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
    .join('\n')
}

export function HeadersView({ headers, defaultExpanded = true }: HeadersViewProps) {
  return (
    <CollapsibleSection
      title="Headers"
      color={sectionTypeColors.headers}
      defaultExpanded={defaultExpanded}
    >
      <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all overflow-x-auto">
        {formatHeaders(headers)}
      </pre>
    </CollapsibleSection>
  )
}
