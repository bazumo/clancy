import { useState } from 'react'
import { cn } from '@/lib/utils'
import type {
  ContentBlock as ContentBlockType,
  Citation,
  WebSearchResultBlock,
  WebSearchToolResultError,
} from '../types'
import { ThinkingBlock } from './ThinkingBlock'

interface ContentBlockProps {
  block: ContentBlockType
  compact?: boolean
}

// Chevron icon for collapsible sections
function Chevron({ expanded, className }: { expanded: boolean; className?: string }) {
  return (
    <svg
      className={cn(
        'w-3 h-3 transition-transform shrink-0',
        expanded && 'rotate-90',
        className
      )}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  )
}

// Citation display component
function CitationDisplay({ citation }: { citation: Citation }) {
  return (
    <span className="inline-flex items-center gap-1 px-1 py-0.5 rounded bg-blue-500/8 text-blue-400/80 text-[10px] font-mono">
      {citation.type === 'char_location' && (
        <>
          <span className="opacity-60">doc[{citation.document_index}]</span>
          <span>chars {citation.start_char_index}-{citation.end_char_index}</span>
        </>
      )}
      {citation.type === 'page_location' && (
        <>
          <span className="opacity-60">doc[{citation.document_index}]</span>
          <span>pages {citation.start_page_number}-{citation.end_page_number}</span>
        </>
      )}
      {citation.type === 'content_block_location' && (
        <>
          <span className="opacity-60">doc[{citation.document_index}]</span>
          <span>blocks {citation.start_block_index}-{citation.end_block_index}</span>
        </>
      )}
      {citation.type === 'web_search_result_location' && (
        <a href={citation.url} target="_blank" rel="noopener noreferrer" className="underline">
          {citation.title || citation.url}
        </a>
      )}
      {citation.type === 'search_result_location' && (
        <>
          <span className="opacity-60">{citation.source}</span>
          <span>{citation.title}</span>
        </>
      )}
    </span>
  )
}

// Web search result display
function WebSearchResult({ result }: { result: WebSearchResultBlock }) {
  return (
    <div className="rounded px-2 py-1.5 bg-cyan-500/5">
      <a
        href={result.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-cyan-400/90 hover:text-cyan-300 hover:underline transition-colors"
      >
        {result.title}
      </a>
      <p className="text-[10px] text-muted-foreground/50 truncate">{result.url}</p>
      {result.page_age && (
        <span className="text-[10px] text-muted-foreground/40">{result.page_age}</span>
      )}
    </div>
  )
}

// Web search error display
function WebSearchError({ error }: { error: WebSearchToolResultError }) {
  return (
    <div className="rounded px-2 py-1.5 bg-red-500/5">
      <span className="text-xs text-red-400/80">Search Error</span>
      <p className="text-[10px] text-red-400/60 font-mono">{error.error_code}</p>
    </div>
  )
}

// Extract the most meaningful field from tool input for an at-a-glance preview
function getToolInputPreview(input: Record<string, unknown>): string | null {
  const keys = ['file_path', 'path', 'command', 'pattern', 'url', 'query', 'glob', 'description', 'notebook_path', 'skill', 'prompt']
  for (const key of keys) {
    if (key in input && typeof input[key] === 'string' && (input[key] as string).length > 0) {
      const val = input[key] as string
      return val.length > 80 ? val.slice(0, 80) + '...' : val
    }
  }
  return null
}

// Get a content preview for tool results
function getToolResultPreview(content: string | ContentBlockType[] | undefined | null): string | null {
  if (!content) return null
  if (typeof content === 'string') {
    if (content.length === 0) return null
    const firstLine = content.split('\n')[0]
    return firstLine.length > 80 ? firstLine.slice(0, 80) + '...' : firstLine
  }
  return `${content.length} block${content.length === 1 ? '' : 's'}`
}

// Collapsible tool call block
function ToolUseBlock({ block }: { block: Extract<ContentBlockType, { type: 'tool_use' }> }) {
  const [expanded, setExpanded] = useState(false)
  const inputStr = JSON.stringify(block.input, null, 2)
  const isLarge = inputStr.length > 100
  const preview = !expanded ? getToolInputPreview(block.input as Record<string, unknown>) : null

  return (
    <div className="border-l-2 border-blue-500/30 pl-2.5 my-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="group flex items-center gap-1.5 w-full text-left min-w-0"
      >
        {isLarge && <Chevron expanded={expanded} className="text-blue-400/50" />}
        <span className="text-xs font-mono font-medium text-blue-400/80 shrink-0">
          {block.name}
        </span>
        {preview && (
          <span className="text-[11px] text-muted-foreground/50 font-mono truncate min-w-0">
            {preview}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground/30 font-mono ml-auto shrink-0 truncate max-w-[140px]">
          {block.id}
        </span>
      </button>
      {(expanded || !isLarge) && (
        <pre className="text-[11px] font-mono text-foreground/50 whitespace-pre-wrap break-all leading-relaxed mt-1">
          {inputStr}
        </pre>
      )}
    </div>
  )
}

// Collapsible server tool block
function ServerToolUseBlock({ block }: { block: Extract<ContentBlockType, { type: 'server_tool_use' }> }) {
  const [expanded, setExpanded] = useState(false)
  const inputStr = JSON.stringify(block.input, null, 2)
  const isLarge = inputStr.length > 100
  const preview = !expanded ? getToolInputPreview(block.input as Record<string, unknown>) : null

  return (
    <div className="border-l-2 border-indigo-500/30 pl-2.5 my-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="group flex items-center gap-1.5 w-full text-left min-w-0"
      >
        {isLarge && <Chevron expanded={expanded} className="text-indigo-400/50" />}
        <span className="text-[10px] text-indigo-400/60 shrink-0">server</span>
        <span className="text-xs font-mono font-medium text-indigo-400/80 shrink-0">
          {block.name}
        </span>
        {preview && (
          <span className="text-[11px] text-muted-foreground/50 font-mono truncate min-w-0">
            {preview}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground/30 font-mono ml-auto shrink-0 truncate max-w-[140px]">
          {block.id}
        </span>
      </button>
      {(expanded || !isLarge) && (
        <pre className="text-[11px] font-mono text-foreground/50 whitespace-pre-wrap break-all leading-relaxed mt-1">
          {inputStr}
        </pre>
      )}
    </div>
  )
}

// Collapsible tool result block
function ToolResultBlock({ block }: { block: Extract<ContentBlockType, { type: 'tool_result' }> }) {
  const [expanded, setExpanded] = useState(false)

  const contentStr = typeof block.content === 'string' ? block.content : ''
  const hasArrayContent = typeof block.content !== 'string' && block.content && block.content.length > 0
  const isLarge = contentStr.length > 100 || hasArrayContent

  return (
    <div className={cn(
      'border-l-2 pl-2.5 my-1',
      block.is_error ? 'border-red-500/30' : 'border-emerald-500/25'
    )}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="group flex items-center gap-1.5 w-full text-left"
      >
        {isLarge && (
          <Chevron
            expanded={expanded}
            className={block.is_error ? 'text-red-400/50' : 'text-emerald-400/50'}
          />
        )}
        <span className={cn(
          'text-xs font-medium',
          block.is_error ? 'text-red-400/70' : 'text-emerald-400/60'
        )}>
          {block.is_error ? 'error' : 'result'}
        </span>
        {!expanded && (
          <span className="text-[11px] text-muted-foreground/50 font-mono truncate min-w-0">
            {getToolResultPreview(block.content) || ''}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground/30 font-mono ml-auto truncate max-w-[140px]">
          {block.tool_use_id}
        </span>
      </button>
      {(expanded || !isLarge) && (
        <div className="mt-1">
          {typeof block.content === 'string' ? (
            <pre className="text-[11px] font-mono text-foreground/50 whitespace-pre-wrap break-all leading-relaxed">
              {block.content}
            </pre>
          ) : block.content ? (
            <div className="space-y-1">
              {block.content.map((inner, i) => (
                <ContentBlock key={i} block={inner} compact />
              ))}
            </div>
          ) : (
            <span className="text-[10px] text-muted-foreground/40 italic">No content</span>
          )}
        </div>
      )}
    </div>
  )
}

export function ContentBlock({ block, compact = false }: ContentBlockProps) {
  switch (block.type) {
    case 'text':
      return (
        <div className={cn('text-xs', compact ? 'inline' : 'my-0.5')}>
          <span className="whitespace-pre-wrap break-words text-foreground/85 leading-relaxed">{block.text}</span>
          {block.citations && block.citations.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {block.citations.map((citation, i) => (
                <CitationDisplay key={i} citation={citation} />
              ))}
            </div>
          )}
        </div>
      )

    case 'thinking':
      return <ThinkingBlock block={block} />

    case 'redacted_thinking':
      return (
        <div className="flex items-center gap-2 py-0.5 my-0.5">
          <span className="text-[10px] font-medium text-purple-400/50">redacted thinking</span>
          <span className="text-[10px] text-muted-foreground/30 font-mono">
            {block.data.length} chars
          </span>
        </div>
      )

    case 'tool_use':
      return <ToolUseBlock block={block} />

    case 'server_tool_use':
      return <ServerToolUseBlock block={block} />

    case 'tool_result':
      return <ToolResultBlock block={block} />

    case 'image':
      return (
        <div className="border-l-2 border-cyan-500/25 pl-2.5 my-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-medium text-cyan-400/60">image</span>
            <span className="text-[10px] text-muted-foreground/40">
              {block.source.type === 'base64'
                ? `${block.source.media_type}`
                : block.source.url}
            </span>
          </div>
          {block.source.type === 'base64' && block.source.data && (
            <img
              src={`data:${block.source.media_type};base64,${block.source.data}`}
              alt="Embedded image"
              className="max-w-full max-h-64 object-contain rounded"
            />
          )}
          {block.source.type === 'url' && (
            <img
              src={block.source.url}
              alt="External image"
              className="max-w-full max-h-64 object-contain rounded"
            />
          )}
        </div>
      )

    case 'document':
      return (
        <div className="border-l-2 border-amber-500/25 pl-2.5 my-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-medium text-amber-400/60">document</span>
            {block.title && (
              <span className="text-xs font-mono text-foreground/60 truncate">
                {block.title}
              </span>
            )}
            <span className="text-[10px] text-muted-foreground/40 ml-auto">
              {block.source.type === 'base64' && 'media_type' in block.source && block.source.media_type}
              {block.source.type === 'url' && 'URL'}
              {block.source.type === 'text' && 'text'}
              {block.source.type === 'content' && 'content'}
            </span>
          </div>
          <div>
            {block.context && (
              <p className="text-[11px] text-muted-foreground/50 mb-1">{block.context}</p>
            )}
            {block.source.type === 'url' && (
              <a
                href={block.source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-amber-400/70 hover:text-amber-300 hover:underline transition-colors"
              >
                {block.source.url}
              </a>
            )}
            {block.source.type === 'base64' && (
              <span className="text-[11px] text-muted-foreground/40">
                Base64 ({block.source.data.length} chars)
              </span>
            )}
            {block.source.type === 'text' && (
              <pre className="text-[11px] font-mono text-foreground/50 whitespace-pre-wrap break-all max-h-32 overflow-auto leading-relaxed">
                {block.source.data.slice(0, 500)}
                {block.source.data.length > 500 && '...'}
              </pre>
            )}
            {block.source.type === 'content' && (
              <div className="space-y-1">
                {typeof block.source.content === 'string' ? (
                  <pre className="text-[11px] font-mono text-foreground/50 whitespace-pre-wrap break-all">
                    {block.source.content}
                  </pre>
                ) : (
                  block.source.content.map((inner, i) => (
                    <ContentBlock key={i} block={inner} compact />
                  ))
                )}
              </div>
            )}
            {block.citations?.enabled && (
              <span className="text-[10px] px-1 py-0.5 rounded bg-blue-500/8 text-blue-400/60 mt-1 inline-block">
                citations enabled
              </span>
            )}
          </div>
        </div>
      )

    case 'search_result':
      return (
        <div className="border-l-2 border-teal-500/25 pl-2.5 my-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-medium text-teal-400/60">search</span>
            <span className="text-xs font-mono text-foreground/60 truncate">
              {block.title}
            </span>
            <span className="text-[10px] text-muted-foreground/40 ml-auto">
              {block.source}
            </span>
          </div>
          <div className="space-y-0.5">
            {block.content.map((textBlock, i) => (
              <ContentBlock key={i} block={textBlock} compact />
            ))}
          </div>
        </div>
      )

    case 'web_search_tool_result':
      return (
        <div className="border-l-2 border-cyan-500/25 pl-2.5 my-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-medium text-cyan-400/60">web search</span>
            <span className="text-[10px] text-muted-foreground/30 font-mono ml-auto truncate max-w-[140px]">
              {block.tool_use_id}
            </span>
          </div>
          {Array.isArray(block.content) ? (
            <div className="space-y-1">
              {block.content.map((result, i) => (
                <WebSearchResult key={i} result={result} />
              ))}
            </div>
          ) : (
            <WebSearchError error={block.content} />
          )}
        </div>
      )

    case 'web_search_result':
      return <WebSearchResult result={block} />

    default:
      return (
        <pre className="text-[11px] font-mono text-muted-foreground/40 whitespace-pre-wrap break-all my-0.5">
          {JSON.stringify(block, null, 2)}
        </pre>
      )
  }
}
