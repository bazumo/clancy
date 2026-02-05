import { useEffect, useState } from 'react'
import { CollapsibleSection, sectionTypeColors } from '@/components/CollapsibleSection'

interface FetchedRawHttpViewProps {
  flowId: string
  type: 'request' | 'response'
  defaultExpanded?: boolean
}

export function FetchedRawHttpView({ flowId, type, defaultExpanded = true }: FetchedRawHttpViewProps) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    // Use relative URL - Vite proxy handles /api in dev, same origin in prod
    fetch(`/api/flows/${flowId}/raw`)
      .then(res => {
        if (!res.ok) throw new Error('Raw HTTP not available')
        return res.json()
      })
      .then(data => {
        if (!cancelled) {
          setContent(type === 'request' ? data.request : data.response)
          setLoading(false)
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err.message)
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [flowId, type])

  return (
    <CollapsibleSection
      title="Raw HTTP"
      color={sectionTypeColors.body}
      defaultExpanded={defaultExpanded}
    >
      {loading ? (
        <div className="text-xs text-muted-foreground">Loading...</div>
      ) : error ? (
        <div className="text-xs text-red-400">{error}</div>
      ) : (
        <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-all overflow-x-auto">
          {content}
        </pre>
      )}
    </CollapsibleSection>
  )
}

