import { useState } from 'react'
import { cn } from '@/lib/utils'
import * as Tabs from '@radix-ui/react-tabs'
import Markdown from 'react-markdown'
import type { ToolUnion } from '../types'
import { CollapsibleSection, sectionTypeColors, sectionIcons } from '@/components/CollapsibleSection'
import { CacheControlBadge } from '../../shared'

interface ToolsViewProps {
  tools: ToolUnion[]
  defaultExpanded?: boolean
}

function getToolName(tool: ToolUnion): string {
  return tool.name
}

function getToolType(tool: ToolUnion): string {
  if ('type' in tool && tool.type) {
    return tool.type
  }
  return 'custom'
}

function isBuiltInTool(tool: ToolUnion): boolean {
  const type = getToolType(tool)
  return type !== 'custom' && type !== null
}

function getToolTypeLabel(tool: ToolUnion): { label: string; color: string } {
  const type = getToolType(tool)
  
  if (type.startsWith('bash')) {
    return { label: 'Bash', color: 'bg-green-500/15 text-green-400' }
  }
  if (type.startsWith('text_editor')) {
    return { label: 'Text Editor', color: 'bg-amber-500/15 text-amber-400' }
  }
  if (type.startsWith('web_search')) {
    return { label: 'Web Search', color: 'bg-cyan-500/15 text-cyan-400' }
  }
  return { label: 'Custom', color: 'bg-blue-500/15 text-blue-400' }
}

function ToolDetails({ tool }: { tool: ToolUnion }) {
  const type = getToolType(tool)
  
  // Web Search Tool
  if (type.startsWith('web_search') && 'max_uses' in tool) {
    return (
      <div className="space-y-4">
        <div>
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Configuration
          </h4>
          <div className="space-y-2">
            {tool.max_uses !== undefined && tool.max_uses !== null && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-28">Max Uses:</span>
                <span className="text-xs font-mono text-foreground">{tool.max_uses}</span>
              </div>
            )}
            {tool.allowed_domains && tool.allowed_domains.length > 0 && (
              <div className="flex items-start gap-2">
                <span className="text-xs text-muted-foreground w-28 shrink-0">Allowed Domains:</span>
                <div className="flex flex-wrap gap-1">
                  {tool.allowed_domains.map((domain, i) => (
                    <span key={i} className="text-xs font-mono px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">
                      {domain}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {tool.blocked_domains && tool.blocked_domains.length > 0 && (
              <div className="flex items-start gap-2">
                <span className="text-xs text-muted-foreground w-28 shrink-0">Blocked Domains:</span>
                <div className="flex flex-wrap gap-1">
                  {tool.blocked_domains.map((domain, i) => (
                    <span key={i} className="text-xs font-mono px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">
                      {domain}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {tool.user_location && (
              <div className="flex items-start gap-2">
                <span className="text-xs text-muted-foreground w-28 shrink-0">User Location:</span>
                <div className="text-xs">
                  {tool.user_location.city && <span className="text-foreground">{tool.user_location.city}</span>}
                  {tool.user_location.region && <span className="text-muted-foreground">, {tool.user_location.region}</span>}
                  {tool.user_location.country && <span className="text-muted-foreground">, {tool.user_location.country}</span>}
                  {tool.user_location.timezone && (
                    <span className="text-muted-foreground/70 ml-2">({tool.user_location.timezone})</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }
  
  // Text Editor Tool with max_characters
  if (type === 'text_editor_20250728' && 'max_characters' in tool && tool.max_characters) {
    return (
      <div>
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
          Configuration
        </h4>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-28">Max Characters:</span>
          <span className="text-xs font-mono text-foreground">{tool.max_characters.toLocaleString()}</span>
        </div>
      </div>
    )
  }
  
  // Bash / Text Editor (no config)
  if (type.startsWith('bash') || type.startsWith('text_editor')) {
    return (
      <div className="text-xs text-muted-foreground italic">
        Built-in tool with no additional configuration
      </div>
    )
  }
  
  // Custom Tool
  if ('description' in tool || 'input_schema' in tool) {
    return (
      <div className="space-y-4">
        {/* Description */}
        {'description' in tool && tool.description && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Description
            </h4>
            <div className="prose prose-sm prose-invert max-w-none text-xs text-foreground">
              <Markdown
                components={{
                  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                  code: ({ children }) => (
                    <code className="bg-muted px-1 py-0.5 rounded text-blue-400 font-mono text-[11px]">
                      {children}
                    </code>
                  ),
                  pre: ({ children }) => (
                    <pre className="bg-muted p-2 rounded overflow-x-auto my-2">
                      {children}
                    </pre>
                  ),
                  ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
                  li: ({ children }) => <li className="text-xs">{children}</li>,
                  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                  em: ({ children }) => <em className="italic">{children}</em>,
                  h1: ({ children }) => <h1 className="text-sm font-bold mb-2">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-xs font-bold mb-2">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-xs font-semibold mb-1">{children}</h3>,
                }}
              >
                {tool.description}
              </Markdown>
            </div>
          </div>
        )}
        
        {/* Input Schema */}
        {'input_schema' in tool && tool.input_schema && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Input Schema
            </h4>
            <div className="bg-muted/50 rounded border border-border/50 overflow-hidden">
              <pre className="text-xs font-mono text-foreground p-3 overflow-x-auto">
                {JSON.stringify(tool.input_schema, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    )
  }
  
  return null
}

export function ToolsView({ tools, defaultExpanded = true }: ToolsViewProps) {
  const [selectedTool, setSelectedTool] = useState(tools[0] ? getToolName(tools[0]) : '')
  
  const activeTool = tools.find(t => getToolName(t) === selectedTool) ?? tools[0]
  
  // Group tools by type for summary
  const builtInCount = tools.filter(isBuiltInTool).length
  const customCount = tools.length - builtInCount
  
  return (
    <CollapsibleSection
      title="Tools"
      color={sectionTypeColors.tools}
      icon={sectionIcons.tools}
      defaultExpanded={defaultExpanded}
      contentClassName=""
      headerContent={
        <span className="text-xs text-muted-foreground">
          {tools.length} tool{tools.length !== 1 ? 's' : ''}
          {builtInCount > 0 && (
            <span className="ml-1 text-muted-foreground/60">
              ({builtInCount} built-in{customCount > 0 ? `, ${customCount} custom` : ''})
            </span>
          )}
        </span>
      }
      collapsedContent={
        <span className="text-xs text-muted-foreground truncate flex-1 ml-2">
          {tools.map(t => getToolName(t)).join(', ')}
        </span>
      }
    >
      {tools.length > 0 && (
        <Tabs.Root value={selectedTool} onValueChange={setSelectedTool} className="flex flex-col">
          {/* Tool tabs */}
          <div className="border-b border-border bg-muted/30">
            <Tabs.List className="flex flex-wrap gap-0 px-2 py-1.5">
              {tools.map((tool) => {
                const name = getToolName(tool)
                const { label, color } = getToolTypeLabel(tool)
                return (
                  <Tabs.Trigger
                    key={name}
                    value={name}
                    className={cn(
                      'px-3 py-1.5 text-xs font-mono rounded transition-colors flex items-center gap-1.5',
                      'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                      'data-[state=active]:bg-blue-500/15 data-[state=active]:text-blue-400'
                    )}
                  >
                    <span>{name}</span>
                    {isBuiltInTool(tool) && (
                      <span className={cn('text-[10px] px-1 py-0.5 rounded', color)}>
                        {label}
                      </span>
                    )}
                  </Tabs.Trigger>
                )
              })}
            </Tabs.List>
          </div>
          
          {/* Tool content */}
          {activeTool && (
            <Tabs.Content value={getToolName(activeTool)} className="px-4 py-4" forceMount>
              {/* Tool type header */}
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs font-mono text-foreground">{getToolName(activeTool)}</span>
                {(() => {
                  const { label, color } = getToolTypeLabel(activeTool)
                  return (
                    <span className={cn('text-xs px-1.5 py-0.5 rounded', color)}>
                      {label}
                    </span>
                  )
                })()}
                
              </div>
              
              <ToolDetails tool={activeTool} />
              
              {/* Cache control indicator */}
              {'cache_control' in activeTool && activeTool.cache_control && (
                <div className="mt-4 pt-3 border-t border-border">
                  <CacheControlBadge 
                    type={activeTool.cache_control.type}
                    ttl={'ttl' in activeTool.cache_control ? activeTool.cache_control.ttl : undefined}
                  />
                </div>
              )}
            </Tabs.Content>
          )}
        </Tabs.Root>
      )}
    </CollapsibleSection>
  )
}
