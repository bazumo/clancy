import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Supported color schemes
export type SectionColor = 
  | 'amber' 
  | 'gray' 
  | 'cyan' 
  | 'emerald' 
  | 'slate' 
  | 'zinc' 
  | 'blue' 
  | 'teal' 
  | 'red' 
  | 'orange'
  | 'violet'
  | 'purple'

const colorClasses: Record<SectionColor, { border: string; text: string }> = {
  amber:   { border: 'border-l-amber-500',   text: 'text-amber-400' },
  gray:    { border: 'border-l-gray-500',    text: 'text-gray-400' },
  cyan:    { border: 'border-l-cyan-500',    text: 'text-cyan-400' },
  emerald: { border: 'border-l-emerald-500', text: 'text-emerald-400' },
  slate:   { border: 'border-l-slate-500',   text: 'text-slate-400' },
  zinc:    { border: 'border-l-zinc-500',    text: 'text-zinc-400' },
  blue:    { border: 'border-l-blue-500',    text: 'text-blue-400' },
  teal:    { border: 'border-l-teal-500',    text: 'text-teal-400' },
  red:     { border: 'border-l-red-500',     text: 'text-red-400' },
  orange:  { border: 'border-l-orange-500',  text: 'text-orange-400' },
  violet:  { border: 'border-l-violet-500',  text: 'text-violet-400' },
  purple:  { border: 'border-l-purple-500',  text: 'text-purple-400' },
}

// Semantic section types mapped to colors - change colors here to update everywhere
export const sectionTypeColors = {
  tools: 'slate',
  events: 'slate',
  messages: 'slate',
  content: 'slate',
  general: 'slate',
  headers: 'slate',
  system: 'slate',
  usage: 'slate',
  body: 'slate',
  user: 'red',
  assistant: 'emerald',
  error: 'slate',
} as const satisfies Record<string, SectionColor>

export type SectionType = keyof typeof sectionTypeColors

// Nesting level affects sticky position and z-index
const levelClasses = {
  1: 'top-11 z-[9]',  // Top-level sections
  2: 'top-20 z-[8]',  // Nested sections (e.g., messages, events)
}

interface CollapsibleSectionProps {
  /** Title shown in the header */
  title: string
  /** Color scheme for border and text */
  color: SectionColor
  /** Nesting level (1 = top-level, 2 = nested) */
  level?: 1 | 2
  /** Content after the title (counts, badges, etc.) */
  headerContent?: ReactNode
  /** Content shown when collapsed (preview text, etc.) */
  collapsedContent?: ReactNode
  /** Initial expanded state */
  defaultExpanded?: boolean
  /** Content inside the section */
  children: ReactNode
  /** Custom border class (for conditional styling like selection) */
  borderClassName?: string
  /** Custom container class */
  className?: string
  /** Add hover effect to header */
  hoverEffect?: boolean
  /** Content wrapper class */
  contentClassName?: string
}

export function CollapsibleSection({
  title,
  color,
  level = 1,
  headerContent,
  collapsedContent,
  defaultExpanded = true,
  children,
  borderClassName,
  className,
  hoverEffect = false,
  contentClassName = 'px-4 py-3',
}: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const colors = colorClasses[color]
  const stickyClasses = levelClasses[level]
  
  return (
    <div className={cn('border-l-[6px]', borderClassName ?? colors.border, className)}>
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'sticky bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-y border-border w-full text-left',
          stickyClasses,
          hoverEffect && 'hover:bg-muted/50 transition-colors'
        )}
      >
        <div className="px-4 h-9 flex items-center gap-2">
          <svg
            className={cn(
              'w-4 h-4 transition-transform shrink-0',
              colors.text,
              expanded && 'rotate-90'
            )}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className={cn('text-xs font-medium uppercase tracking-wider', colors.text)}>
            {title}
          </span>
          {headerContent}
          {!expanded && collapsedContent}
        </div>
      </button>
      {expanded && (
        <div className={contentClassName}>
          {children}
        </div>
      )}
    </div>
  )
}

