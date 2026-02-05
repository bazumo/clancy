import type { EventProps } from '../../types'
import type {
  ConverseStreamEvent,
  ConverseContentBlockStartEvent,
  ConverseContentBlockDeltaEvent,
} from '../types'

export function ConverseEventView({ parsed }: EventProps) {
  const event = parsed as ConverseStreamEvent | null

  if (!event) {
    return <div className="text-xs text-muted-foreground">Failed to parse event</div>
  }

  // Message Start
  if ('messageStart' in event) {
    return (
      <div className="text-xs space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-emerald-400">Message Start</span>
          <span className="font-mono text-muted-foreground">role: {event.messageStart.role}</span>
        </div>
      </div>
    )
  }

  // Content Block Start
  if ('contentBlockStart' in event) {
    const startEvent = event as ConverseContentBlockStartEvent
    const start = startEvent.contentBlockStart.start

    let blockType = 'unknown'
    if (start.text !== undefined) blockType = 'text'
    else if (start.toolUse) blockType = 'tool_use'
    else if (start.reasoningContent) blockType = 'reasoning'

    return (
      <div className="text-xs space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-blue-400">Block Start</span>
          <span className="text-muted-foreground">index: {startEvent.contentBlockStart.contentBlockIndex}</span>
          <span className="font-mono px-1.5 py-0.5 rounded bg-muted text-foreground">
            {blockType}
          </span>
        </div>
        {start.toolUse && (
          <div className="text-muted-foreground">
            Tool: <span className="font-mono text-blue-400">{start.toolUse.name}</span>
            <span className="ml-2 font-mono text-muted-foreground/60">{start.toolUse.toolUseId}</span>
          </div>
        )}
      </div>
    )
  }

  // Content Block Delta
  if ('contentBlockDelta' in event) {
    const deltaEvent = event as ConverseContentBlockDeltaEvent
    const delta = deltaEvent.contentBlockDelta.delta

    let deltaType = 'unknown'
    if (delta.text !== undefined) deltaType = 'text'
    else if (delta.toolUse) deltaType = 'tool_use'
    else if (delta.reasoningContent) {
      if (delta.reasoningContent.signature) deltaType = 'signature'
      else deltaType = 'reasoning'
    }

    return (
      <div className="text-xs space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-cyan-400">Delta</span>
          <span className="text-muted-foreground">index: {deltaEvent.contentBlockDelta.contentBlockIndex}</span>
          <span className="font-mono px-1.5 py-0.5 rounded bg-muted text-foreground">
            {deltaType}
          </span>
        </div>
        {delta.text !== undefined && (
          <pre className="whitespace-pre-wrap break-words text-foreground/80 bg-muted/30 rounded px-2 py-1">
            {delta.text}
          </pre>
        )}
        {delta.toolUse && (
          <pre className="whitespace-pre-wrap break-words text-blue-400/80 bg-blue-500/10 rounded px-2 py-1">
            {delta.toolUse.input}
          </pre>
        )}
        {delta.reasoningContent?.reasoningText && (
          <pre className="whitespace-pre-wrap break-words text-purple-400/80 bg-purple-500/10 rounded px-2 py-1">
            {delta.reasoningContent.reasoningText.text}
          </pre>
        )}
        {delta.reasoningContent?.signature && (
          <pre className="whitespace-pre-wrap break-words text-purple-300/80 bg-purple-500/5 rounded px-2 py-1">
            [signature] {delta.reasoningContent.signature.slice(0, 50)}...
          </pre>
        )}
      </div>
    )
  }

  // Content Block Stop
  if ('contentBlockStop' in event) {
    return (
      <div className="text-xs flex items-center gap-2">
        <span className="font-medium text-muted-foreground">Block Stop</span>
        <span className="text-muted-foreground">index: {event.contentBlockStop.contentBlockIndex}</span>
      </div>
    )
  }

  // Message Stop
  if ('messageStop' in event) {
    return (
      <div className="text-xs space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-amber-400">Message Stop</span>
          <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">
            {event.messageStop.stopReason}
          </span>
        </div>
      </div>
    )
  }

  // Metadata
  if ('metadata' in event) {
    return (
      <div className="text-xs space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-emerald-400">Metadata</span>
        </div>
        <div className="text-muted-foreground space-y-0.5">
          <div>Input tokens: {event.metadata.usage.inputTokens.toLocaleString()}</div>
          <div>Output tokens: {event.metadata.usage.outputTokens.toLocaleString()}</div>
          {event.metadata.usage.cacheReadInputTokens !== undefined && event.metadata.usage.cacheReadInputTokens > 0 && (
            <div>Cache read: {event.metadata.usage.cacheReadInputTokens.toLocaleString()}</div>
          )}
          {event.metadata.usage.cacheWriteInputTokens !== undefined && event.metadata.usage.cacheWriteInputTokens > 0 && (
            <div>Cache write: {event.metadata.usage.cacheWriteInputTokens.toLocaleString()}</div>
          )}
          <div>Latency: {event.metadata.metrics.latencyMs}ms</div>
        </div>
      </div>
    )
  }

  // Fallback for unknown events
  return (
    <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all">
      {JSON.stringify(event, null, 2)}
    </pre>
  )
}
