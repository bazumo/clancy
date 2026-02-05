import type { EventProps } from '../../types'
import type { 
  StreamEvent, 
  ContentBlockStartEvent, 
  ContentBlockDeltaEvent,
  TextDelta,
  ThinkingDelta,
  InputJsonDelta,
  SignatureDelta,
  CitationsDelta,
} from '../types'

export function ClaudeEventView({ parsed }: EventProps) {
  const event = parsed as StreamEvent | null
  
  if (!event) {
    return <div className="text-xs text-muted-foreground">Failed to parse event</div>
  }
  
  switch (event.type) {
    case 'message_start':
      return (
        <div className="text-xs space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-emerald-400">Message Start</span>
            <span className="font-mono text-muted-foreground">{event.message.id}</span>
          </div>
          <div className="text-muted-foreground">
            Model: {event.message.model}
          </div>
          {event.message.usage && (
            <div className="text-muted-foreground">
              Input tokens: {event.message.usage.input_tokens.toLocaleString()}
            </div>
          )}
        </div>
      )
    
    case 'content_block_start': {
      const blockEvent = event as ContentBlockStartEvent
      return (
        <div className="text-xs space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-blue-400">Block Start</span>
            <span className="text-muted-foreground">index: {blockEvent.index}</span>
            <span className="font-mono px-1.5 py-0.5 rounded bg-muted text-foreground">
              {blockEvent.content_block.type}
            </span>
          </div>
        </div>
      )
    }
    
    case 'content_block_delta': {
      const deltaEvent = event as ContentBlockDeltaEvent
      const delta = deltaEvent.delta
      
      return (
        <div className="text-xs space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-cyan-400">Delta</span>
            <span className="text-muted-foreground">index: {deltaEvent.index}</span>
            <span className="font-mono px-1.5 py-0.5 rounded bg-muted text-foreground">
              {delta.type}
            </span>
          </div>
          {delta.type === 'text_delta' && (
            <pre className="whitespace-pre-wrap break-words text-foreground/80 bg-muted/30 rounded px-2 py-1">
              {(delta as TextDelta).text}
            </pre>
          )}
          {delta.type === 'thinking_delta' && (
            <pre className="whitespace-pre-wrap break-words text-purple-400/80 bg-purple-500/10 rounded px-2 py-1">
              {(delta as ThinkingDelta).thinking}
            </pre>
          )}
          {delta.type === 'signature_delta' && (
            <pre className="whitespace-pre-wrap break-words text-purple-300/80 bg-purple-500/5 rounded px-2 py-1">
              [signature] {(delta as SignatureDelta).signature.slice(0, 50)}...
            </pre>
          )}
          {delta.type === 'input_json_delta' && (
            <pre className="whitespace-pre-wrap break-words text-blue-400/80 bg-blue-500/10 rounded px-2 py-1">
              {(delta as InputJsonDelta).partial_json}
            </pre>
          )}
          {delta.type === 'citations_delta' && (
            <div className="text-cyan-400/80 bg-cyan-500/10 rounded px-2 py-1">
              Citation: {(delta as CitationsDelta).citation.type}
            </div>
          )}
        </div>
      )
    }
    
    case 'content_block_stop':
      return (
        <div className="text-xs flex items-center gap-2">
          <span className="font-medium text-muted-foreground">Block Stop</span>
          <span className="text-muted-foreground">index: {event.index}</span>
        </div>
      )
    
    case 'message_delta':
      return (
        <div className="text-xs space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-amber-400">Message Delta</span>
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">
              {event.delta.stop_reason}
            </span>
          </div>
          <div className="text-muted-foreground">
            Output tokens: {event.usage.output_tokens.toLocaleString()}
          </div>
        </div>
      )
    
    case 'message_stop':
      return (
        <div className="text-xs flex items-center gap-2">
          <span className="font-medium text-emerald-400">Message Stop</span>
        </div>
      )
    
    case 'ping':
      return (
        <div className="text-xs text-muted-foreground">
          Ping
        </div>
      )
    
    case 'error':
      return (
        <div className="text-xs space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-red-400">Error</span>
            <span className="text-muted-foreground">{event.error.type}</span>
          </div>
          <div className="text-red-400/80">{event.error.message}</div>
        </div>
      )
    
    default:
      return (
        <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all">
          {JSON.stringify(event, null, 2)}
        </pre>
      )
  }
}
