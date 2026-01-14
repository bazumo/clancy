import { cn } from '@/lib/utils'

function getStatusColor(status?: number) {
  if (!status) return 'bg-muted text-muted-foreground'
  if (status >= 200 && status < 300) return 'bg-emerald-500/15 text-emerald-400'
  if (status >= 400 && status < 500) return 'bg-amber-500/15 text-amber-400'
  if (status >= 500) return 'bg-red-500/15 text-red-400'
  return 'bg-muted text-muted-foreground'
}

interface StatusBadgeProps {
  status?: number
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  if (!status) return null
  
  return (
    <span className={cn('text-xs font-mono px-1.5 py-0.5 rounded', getStatusColor(status), className)}>
      {status}
    </span>
  )
}

function getMethodColor(method: string) {
  switch (method) {
    case 'GET': return 'text-blue-400'
    case 'POST': return 'text-green-400'
    case 'PUT': return 'text-amber-400'
    case 'DELETE': return 'text-red-400'
    case 'CONNECT': return 'text-purple-400'
    default: return 'text-muted-foreground'
  }
}

interface MethodBadgeProps {
  method: string
  className?: string
}

export function MethodBadge({ method, className }: MethodBadgeProps) {
  return (
    <span className={cn('font-mono text-xs font-medium', getMethodColor(method), className)}>
      {method}
    </span>
  )
}

