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

// Citation display component
function CitationDisplay({ citation }: { citation: Citation }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[10px] font-mono">
      {citation.type === 'char_location' && (
        <>
          <span className="opacity-70">doc[{citation.document_index}]</span>
          <span>chars {citation.start_char_index}-{citation.end_char_index}</span>
        </>
      )}
      {citation.type === 'page_location' && (
        <>
          <span className="opacity-70">doc[{citation.document_index}]</span>
          <span>pages {citation.start_page_number}-{citation.end_page_number}</span>
        </>
      )}
      {citation.type === 'content_block_location' && (
        <>
          <span className="opacity-70">doc[{citation.document_index}]</span>
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
          <span className="opacity-70">{citation.source}</span>
          <span>{citation.title}</span>
        </>
      )}
    </span>
  )
}

// Web search result display
function WebSearchResult({ result }: { result: WebSearchResultBlock }) {
  return (
    <div className="border border-cyan-500/20 rounded p-2 bg-cyan-500/5">
      <a 
        href={result.url} 
        target="_blank" 
        rel="noopener noreferrer"
        className="text-xs font-medium text-cyan-400 hover:underline"
      >
        {result.title}
      </a>
      <p className="text-[10px] text-muted-foreground truncate">{result.url}</p>
      {result.page_age && (
        <span className="text-[10px] text-muted-foreground/60">{result.page_age}</span>
      )}
    </div>
  )
}

// Web search error display
function WebSearchError({ error }: { error: WebSearchToolResultError }) {
  return (
    <div className="border border-red-500/30 rounded p-2 bg-red-500/5">
      <span className="text-xs text-red-400 font-medium">Search Error</span>
      <p className="text-xs text-red-400/80 font-mono">{error.error_code}</p>
    </div>
  )
}

export function ContentBlock({ block, compact = false }: ContentBlockProps) {
  switch (block.type) {
    case 'text':
      return (
        <div className={cn('text-xs', compact ? 'inline' : 'my-1')}>
          <span className="whitespace-pre-wrap break-words">{block.text}</span>
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
        <div className="border border-purple-500/30 rounded-md overflow-hidden bg-purple-500/5 my-1">
          <div className="px-3 py-2 flex items-center gap-2">
            <span className="text-xs font-medium text-purple-400 uppercase tracking-wider">
              Redacted Thinking
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">
              {block.data.length} chars
            </span>
          </div>
          <div className="px-3 py-2 text-xs text-muted-foreground italic">
            Thinking content has been redacted for safety
          </div>
        </div>
      )
    
    case 'tool_use':
      return (
        <div className="border border-blue-500/30 rounded-md overflow-hidden bg-blue-500/5 my-1">
          <div className="px-3 py-2 flex items-center gap-2 border-b border-blue-500/20">
            <span className="text-xs font-medium text-blue-400 uppercase tracking-wider">
              Tool Call
            </span>
            <span className="text-xs font-mono text-foreground">
              {block.name}
            </span>
            <span className="text-xs text-muted-foreground font-mono ml-auto">
              {block.id}
            </span>
          </div>
          <pre className="text-xs font-mono text-foreground/80 whitespace-pre-wrap break-all px-3 py-2">
            {JSON.stringify(block.input, null, 2)}
          </pre>
        </div>
      )
    
    case 'server_tool_use':
      return (
        <div className="border border-indigo-500/30 rounded-md overflow-hidden bg-indigo-500/5 my-1">
          <div className="px-3 py-2 flex items-center gap-2 border-b border-indigo-500/20">
            <span className="text-xs font-medium text-indigo-400 uppercase tracking-wider">
              Server Tool
            </span>
            <span className="text-xs font-mono text-foreground">
              {block.name}
            </span>
            <span className="text-xs text-muted-foreground font-mono ml-auto">
              {block.id}
            </span>
          </div>
          <pre className="text-xs font-mono text-foreground/80 whitespace-pre-wrap break-all px-3 py-2">
            {JSON.stringify(block.input, null, 2)}
          </pre>
        </div>
      )
    
    case 'tool_result':
      return (
        <div className={cn(
          'border rounded-md overflow-hidden my-1',
          block.is_error 
            ? 'border-red-500/30 bg-red-500/5' 
            : 'border-green-500/30 bg-green-500/5'
        )}>
          <div className={cn(
            'px-3 py-2 flex items-center gap-2 border-b',
            block.is_error ? 'border-red-500/20' : 'border-green-500/20'
          )}>
            <span className={cn(
              'text-xs font-medium uppercase tracking-wider',
              block.is_error ? 'text-red-400' : 'text-green-400'
            )}>
              {block.is_error ? 'Tool Error' : 'Tool Result'}
            </span>
            <span className="text-xs text-muted-foreground font-mono ml-auto">
              {block.tool_use_id}
            </span>
          </div>
          <div className="px-3 py-2">
            {typeof block.content === 'string' ? (
              <pre className="text-xs font-mono text-foreground/80 whitespace-pre-wrap break-all">
                {block.content}
              </pre>
            ) : block.content ? (
              <div className="space-y-1">
                {block.content.map((inner, i) => (
                  <ContentBlock key={i} block={inner} compact />
                ))}
              </div>
            ) : (
              <span className="text-xs text-muted-foreground italic">No content</span>
            )}
          </div>
        </div>
      )
    
    case 'image':
      return (
        <div className="border border-cyan-500/30 rounded-md overflow-hidden bg-cyan-500/5 my-1">
          <div className="px-3 py-2 flex items-center gap-2">
            <span className="text-xs font-medium text-cyan-400 uppercase tracking-wider">
              Image
            </span>
            <span className="text-xs text-muted-foreground">
              {block.source.type === 'base64' 
                ? `${block.source.media_type} (base64)` 
                : block.source.url}
            </span>
          </div>
          {block.source.type === 'base64' && block.source.data && (
            <img 
              src={`data:${block.source.media_type};base64,${block.source.data}`}
              alt="Embedded image"
              className="max-w-full max-h-64 object-contain mx-auto"
            />
          )}
          {block.source.type === 'url' && (
            <img 
              src={block.source.url}
              alt="External image"
              className="max-w-full max-h-64 object-contain mx-auto"
            />
          )}
        </div>
      )
    
    case 'document':
      return (
        <div className="border border-amber-500/30 rounded-md overflow-hidden bg-amber-500/5 my-1">
          <div className="px-3 py-2 flex items-center gap-2 border-b border-amber-500/20">
            <span className="text-xs font-medium text-amber-400 uppercase tracking-wider">
              Document
            </span>
            {block.title && (
              <span className="text-xs font-mono text-foreground truncate">
                {block.title}
              </span>
            )}
            <span className="text-xs text-muted-foreground ml-auto">
              {block.source.type === 'base64' && 'media_type' in block.source && block.source.media_type}
              {block.source.type === 'url' && 'URL'}
              {block.source.type === 'text' && 'Plain Text'}
              {block.source.type === 'content' && 'Content Blocks'}
            </span>
          </div>
          <div className="px-3 py-2">
            {block.context && (
              <p className="text-xs text-muted-foreground mb-2">{block.context}</p>
            )}
            {block.source.type === 'url' && (
              <a 
                href={block.source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-amber-400 hover:underline"
              >
                {block.source.url}
              </a>
            )}
            {block.source.type === 'base64' && (
              <span className="text-xs text-muted-foreground">
                Base64 data ({block.source.data.length} chars)
              </span>
            )}
            {block.source.type === 'text' && (
              <pre className="text-xs font-mono text-foreground/80 whitespace-pre-wrap break-all max-h-32 overflow-auto">
                {block.source.data.slice(0, 500)}
                {block.source.data.length > 500 && '...'}
              </pre>
            )}
            {block.source.type === 'content' && (
              <div className="space-y-1">
                {typeof block.source.content === 'string' ? (
                  <pre className="text-xs font-mono text-foreground/80 whitespace-pre-wrap break-all">
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
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 mt-2 inline-block">
                citations enabled
              </span>
            )}
          </div>
        </div>
      )
    
    case 'search_result':
      return (
        <div className="border border-teal-500/30 rounded-md overflow-hidden bg-teal-500/5 my-1">
          <div className="px-3 py-2 flex items-center gap-2 border-b border-teal-500/20">
            <span className="text-xs font-medium text-teal-400 uppercase tracking-wider">
              Search Result
            </span>
            <span className="text-xs font-mono text-foreground truncate">
              {block.title}
            </span>
            <span className="text-xs text-muted-foreground ml-auto">
              {block.source}
            </span>
          </div>
          <div className="px-3 py-2 space-y-1">
            {block.content.map((textBlock, i) => (
              <ContentBlock key={i} block={textBlock} compact />
            ))}
          </div>
        </div>
      )
    
    case 'web_search_tool_result':
      return (
        <div className="border border-cyan-500/30 rounded-md overflow-hidden bg-cyan-500/5 my-1">
          <div className="px-3 py-2 flex items-center gap-2 border-b border-cyan-500/20">
            <span className="text-xs font-medium text-cyan-400 uppercase tracking-wider">
              Web Search Results
            </span>
            <span className="text-xs text-muted-foreground font-mono ml-auto">
              {block.tool_use_id}
            </span>
          </div>
          <div className="px-3 py-2">
            {Array.isArray(block.content) ? (
              <div className="space-y-2">
                {block.content.map((result, i) => (
                  <WebSearchResult key={i} result={result} />
                ))}
              </div>
            ) : (
              <WebSearchError error={block.content} />
            )}
          </div>
        </div>
      )
    
    case 'web_search_result':
      return <WebSearchResult result={block} />
    
    default:
      return (
        <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all my-1">
          {JSON.stringify(block, null, 2)}
        </pre>
      )
  }
}
