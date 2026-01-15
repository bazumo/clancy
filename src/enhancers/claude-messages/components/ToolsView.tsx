import { useState } from 'react'
import { cn } from '@/lib/utils'
import * as Tabs from '@radix-ui/react-tabs'
import Markdown from 'react-markdown'
import type { Tool } from '../types'
import { CollapsibleSection, sectionTypeColors, sectionIcons } from '@/components'

interface ToolsViewProps {
  tools: Tool[]
  defaultExpanded?: boolean
}

export function ToolsView({ tools, defaultExpanded = true }: ToolsViewProps) {
  const [selectedTool, setSelectedTool] = useState(tools[0]?.name ?? '')
  
  const activeTool = tools.find(t => t.name === selectedTool) ?? tools[0]
  
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
        </span>
      }
      collapsedContent={
        <span className="text-xs text-muted-foreground truncate flex-1 ml-2">
          {tools.map(t => t.name).join(', ')}
        </span>
      }
    >
      {tools.length > 0 && (
        <Tabs.Root value={selectedTool} onValueChange={setSelectedTool} className="flex flex-col">
          {/* Tool tabs */}
          <div className="border-b border-border bg-muted/30">
            <Tabs.List className="flex flex-wrap gap-0 px-2 py-1.5">
              {tools.map((tool) => (
                <Tabs.Trigger
                  key={tool.name}
                  value={tool.name}
                  className={cn(
                    'px-3 py-1.5 text-xs font-mono rounded transition-colors',
                    'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                    'data-[state=active]:bg-blue-500/15 data-[state=active]:text-blue-400'
                  )}
                >
                  {tool.name}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
          </div>
          
          {/* Tool content */}
          {activeTool && (
            <Tabs.Content value={activeTool.name} className="px-4 py-4" forceMount>
              {/* Description */}
              {activeTool.description && (
                <div className="mb-4">
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
                      {activeTool.description}
                    </Markdown>
                  </div>
                </div>
              )}
              
              {/* Input Schema */}
              {activeTool.input_schema && (
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                    Input Schema
                  </h4>
                  <div className="bg-muted/50 rounded border border-border/50 overflow-hidden">
                    <pre className="text-xs font-mono text-foreground p-3 overflow-x-auto">
                      {JSON.stringify(activeTool.input_schema, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </Tabs.Content>
          )}
        </Tabs.Root>
      )}
    </CollapsibleSection>
  )
}
