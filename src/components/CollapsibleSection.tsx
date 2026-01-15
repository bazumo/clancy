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

const colorClasses: Record<SectionColor, { icon: string; text: string }> = {
  amber:   { icon: 'text-amber-400',   text: 'text-amber-400' },
  gray:    { icon: 'text-gray-400',    text: 'text-gray-400' },
  cyan:    { icon: 'text-cyan-400',    text: 'text-cyan-400' },
  emerald: { icon: 'text-emerald-400', text: 'text-emerald-400' },
  slate:   { icon: 'text-slate-400',   text: 'text-slate-400' },
  zinc:    { icon: 'text-zinc-400',    text: 'text-zinc-400' },
  blue:    { icon: 'text-blue-400',    text: 'text-blue-400' },
  teal:    { icon: 'text-teal-400',    text: 'text-teal-400' },
  red:     { icon: 'text-red-400',     text: 'text-red-400' },
  orange:  { icon: 'text-orange-400',  text: 'text-orange-400' },
  violet:  { icon: 'text-violet-400',  text: 'text-violet-400' },
  purple:  { icon: 'text-purple-400',  text: 'text-purple-400' },
}

// Semantic section types mapped to colors - change colors here to update everywhere
export const sectionTypeColors = {
  tools: 'blue',
  events: 'slate',
  messages: 'teal',
  content: 'slate',
  general: 'slate',
  headers: 'slate',
  system: 'amber',
  usage: 'slate',
  body: 'slate',
  user: 'red',
  assistant: 'purple',
  error: 'slate',
} as const satisfies Record<string, SectionColor>

export type SectionType = keyof typeof sectionTypeColors

// SVG icon paths for common section types
export const sectionIcons = {
  general: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
  ),
  system: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
  ),
  tools: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
  ),
  messages: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  ),
  events: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
  ),
  content: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
  ),
  headers: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
  ),
  body: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
  ),
  usage: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
  ),
} as const

interface CollapsibleSectionProps {
  /** Title shown in the header */
  title: string
  /** Color scheme for icon and text */
  color: SectionColor
  /** Icon to display (use sectionIcons or custom SVG path) */
  icon?: ReactNode
  /** Content after the title (counts, badges, etc.) */
  headerContent?: ReactNode
  /** Content shown when collapsed (preview text, etc.) */
  collapsedContent?: ReactNode
  /** Initial expanded state */
  defaultExpanded?: boolean
  /** Content inside the section */
  children: ReactNode
  /** Custom container class */
  className?: string
  /** Add hover effect to header */
  hoverEffect?: boolean
  /** Content wrapper class */
  contentClassName?: string
  /** @deprecated - no longer used, sections don't have nested borders */
  level?: 1 | 2
  /** @deprecated - no longer used */
  borderClassName?: string
}

export function CollapsibleSection({
  title,
  color,
  icon,
  headerContent,
  collapsedContent,
  defaultExpanded = true,
  children,
  className,
  hoverEffect = false,
  contentClassName = 'px-4 py-3',
}: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const colors = colorClasses[color]
  
  return (
    <div className={cn('border-b border-border', className)}>
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'sticky top-11 z-[9] bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 w-full text-left',
          hoverEffect && 'hover:bg-muted/50 transition-colors'
        )}
      >
        <div className="px-4 h-11 flex items-center gap-2 border-b border-border">
          <svg
            className={cn(
              'w-3.5 h-3.5 transition-transform shrink-0 text-muted-foreground/60',
              expanded && 'rotate-90'
            )}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          {icon && (
            <svg
              className={cn('w-4 h-4 shrink-0', colors.icon)}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              {icon}
            </svg>
          )}
          <span className={cn('text-sm font-medium', colors.text)}>
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
