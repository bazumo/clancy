import { useCallback, useMemo } from 'react'
import type { Flow, SSEEvent } from '@clancyapp/shared'
import type {
  StreamEvent,
  ContentBlock as ContentBlockType,
  StopReason,
  Citation,
} from '../types'
import { ContentBlock } from './ContentBlock'

interface StreamedResponseViewProps {
  events: SSEEvent[]
  flow: Flow
  selectedEventId: string | null
  eventRefs: React.MutableRefObject<Map<string, HTMLDivElement>>
}

interface StreamMetadata {
  model: string | null
  messageId: string | null
  stopReason: StopReason | null
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number | null
  cacheCreationTokens: number | null
}

interface WorkingBlock {
  block: ContentBlockType
  textAccum: string
  thinkingAccum: string
  signatureAccum: string
  jsonAccum: string
  citations: Citation[]
}

function finalizeBlock(working: WorkingBlock): ContentBlockType {
  const base = working.block

  if (base.type === 'text') {
    return {
      ...base,
      text: working.textAccum,
      citations: working.citations.length > 0 ? working.citations : null,
    }
  }

  if (base.type === 'thinking') {
    return {
      ...base,
      thinking: working.thinkingAccum,
      signature: working.signatureAccum,
    }
  }

  if (base.type === 'tool_use' || base.type === 'server_tool_use') {
    let parsedInput: Record<string, unknown> = {}
    if (working.jsonAccum) {
      try {
        parsedInput = JSON.parse(working.jsonAccum)
      } catch {
        parsedInput = { _raw: working.jsonAccum }
      }
    }
    return { ...base, input: parsedInput }
  }

  return base
}

function processEvents(events: SSEEvent[]): {
  blocks: ContentBlockType[]
  metadata: StreamMetadata
  error: string | null
  eventBlockMap: Map<string, number | 'metadata' | 'error'>
} {
  const blocks: ContentBlockType[] = []
  const metadata: StreamMetadata = {
    model: null,
    messageId: null,
    stopReason: null,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: null,
    cacheCreationTokens: null,
  }
  let error: string | null = null
  const eventBlockMap = new Map<string, number | 'metadata' | 'error'>()

  const workingBlocks = new Map<number, WorkingBlock>()
  // Track which event IDs are associated with each stream index (before finalization)
  const streamIndexEventIds = new Map<number, string[]>()

  for (const sseEvent of events) {
    let parsed: StreamEvent
    try {
      parsed = JSON.parse(sseEvent.data) as StreamEvent
    } catch {
      continue
    }

    switch (parsed.type) {
      case 'message_start': {
        if (sseEvent.eventId) eventBlockMap.set(sseEvent.eventId, 'metadata')
        metadata.model = parsed.message.model
        metadata.messageId = parsed.message.id
        if (parsed.message.usage) {
          metadata.inputTokens = parsed.message.usage.input_tokens
          metadata.cacheReadTokens =
            parsed.message.usage.cache_read_input_tokens ?? null
          metadata.cacheCreationTokens =
            parsed.message.usage.cache_creation_input_tokens ?? null
        }
        break
      }

      case 'content_block_start': {
        if (sseEvent.eventId) {
          const ids = streamIndexEventIds.get(parsed.index) ?? []
          ids.push(sseEvent.eventId)
          streamIndexEventIds.set(parsed.index, ids)
        }
        const block = parsed.content_block
        workingBlocks.set(parsed.index, {
          block: { ...block },
          textAccum: block.type === 'text' ? block.text : '',
          thinkingAccum: block.type === 'thinking' ? block.thinking : '',
          signatureAccum: block.type === 'thinking' ? block.signature : '',
          jsonAccum: '',
          citations: [],
        })
        break
      }

      case 'content_block_delta': {
        if (sseEvent.eventId) {
          const ids = streamIndexEventIds.get(parsed.index) ?? []
          ids.push(sseEvent.eventId)
          streamIndexEventIds.set(parsed.index, ids)
        }
        const working = workingBlocks.get(parsed.index)
        if (!working) break

        switch (parsed.delta.type) {
          case 'text_delta':
            working.textAccum += parsed.delta.text
            break
          case 'thinking_delta':
            working.thinkingAccum += parsed.delta.thinking
            break
          case 'signature_delta':
            working.signatureAccum += parsed.delta.signature
            break
          case 'input_json_delta':
            working.jsonAccum += parsed.delta.partial_json
            break
          case 'citations_delta':
            working.citations.push(parsed.delta.citation)
            break
        }
        break
      }

      case 'content_block_stop': {
        if (sseEvent.eventId) {
          const ids = streamIndexEventIds.get(parsed.index) ?? []
          ids.push(sseEvent.eventId)
          streamIndexEventIds.set(parsed.index, ids)
        }
        const working = workingBlocks.get(parsed.index)
        if (!working) break
        const blockIndex = blocks.length
        blocks.push(finalizeBlock(working))
        workingBlocks.delete(parsed.index)
        // Map all event IDs for this stream index to the final blocks array index
        const ids = streamIndexEventIds.get(parsed.index)
        if (ids) {
          for (const id of ids) {
            eventBlockMap.set(id, blockIndex)
          }
          streamIndexEventIds.delete(parsed.index)
        }
        break
      }

      case 'message_delta': {
        if (sseEvent.eventId) eventBlockMap.set(sseEvent.eventId, 'metadata')
        metadata.stopReason = parsed.delta.stop_reason
        if (parsed.usage) {
          metadata.outputTokens = parsed.usage.output_tokens
        }
        break
      }

      case 'message_stop':
      case 'ping': {
        if (sseEvent.eventId) eventBlockMap.set(sseEvent.eventId, 'metadata')
        break
      }

      case 'error': {
        if (sseEvent.eventId) eventBlockMap.set(sseEvent.eventId, 'error')
        error = `${parsed.error.type}: ${parsed.error.message}`
        break
      }
    }
  }

  // Include any in-progress blocks (stream not yet finished)
  for (const [streamIndex, working] of workingBlocks) {
    const blockIndex = blocks.length
    blocks.push(finalizeBlock(working))
    const ids = streamIndexEventIds.get(streamIndex)
    if (ids) {
      for (const id of ids) {
        eventBlockMap.set(id, blockIndex)
      }
    }
  }

  return { blocks, metadata, error, eventBlockMap }
}

export function StreamedResponseView({
  events,
  selectedEventId,
  eventRefs,
}: StreamedResponseViewProps) {
  const { blocks, metadata, error, eventBlockMap } = useMemo(
    () => processEvents(events),
    [events],
  )

  const totalTokens = metadata.inputTokens + metadata.outputTokens

  // Determine which block index (or 'metadata'/'error') is selected
  const selectedTarget = selectedEventId
    ? eventBlockMap.get(selectedEventId) ?? null
    : null

  // Collect event IDs that map to each target for ref registration
  const eventIdsByTarget = useMemo(() => {
    const map = new Map<number | 'metadata' | 'error', string[]>()
    for (const [eventId, target] of eventBlockMap) {
      const ids = map.get(target) ?? []
      ids.push(eventId)
      map.set(target, ids)
    }
    return map
  }, [eventBlockMap])

  const makeRefCallback = useCallback(
    (target: number | 'metadata' | 'error') => {
      const ids = eventIdsByTarget.get(target)
      if (!ids || ids.length === 0) return undefined
      return (el: HTMLDivElement | null) => {
        for (const id of ids) {
          if (el) {
            eventRefs.current.set(id, el)
          } else {
            eventRefs.current.delete(id)
          }
        }
      }
    },
    [eventIdsByTarget, eventRefs],
  )

  return (
    <div className="px-4 py-3 space-y-3">
      {/* Metadata bar */}
      <div
        ref={makeRefCallback('metadata')}
        className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground font-mono${selectedTarget === 'metadata' ? ' bg-cyan-500/5 rounded' : ''}`}
      >
        {metadata.model && (
          <span className="text-foreground/80">{metadata.model}</span>
        )}
        {metadata.stopReason && (
          <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            {metadata.stopReason}
          </span>
        )}
        {(metadata.inputTokens > 0 || metadata.outputTokens > 0) && (
          <>
            <span>in: {metadata.inputTokens.toLocaleString()}</span>
            <span>out: {metadata.outputTokens.toLocaleString()}</span>
            <span>total: {totalTokens.toLocaleString()}</span>
          </>
        )}
        {metadata.cacheReadTokens != null && metadata.cacheReadTokens > 0 && (
          <span>
            cache read: {metadata.cacheReadTokens.toLocaleString()}
          </span>
        )}
        {metadata.cacheCreationTokens != null &&
          metadata.cacheCreationTokens > 0 && (
            <span>
              cache write: {metadata.cacheCreationTokens.toLocaleString()}
            </span>
          )}
      </div>

      {/* Error */}
      {error && (
        <div
          ref={makeRefCallback('error')}
          className={`border border-red-500/30 rounded-md bg-red-500/5 px-3 py-2 text-xs text-red-400${selectedTarget === 'error' ? ' bg-cyan-500/5' : ''}`}
        >
          {error}
        </div>
      )}

      {/* Content blocks */}
      {blocks.length > 0 ? (
        <div className="space-y-2">
          {blocks.map((block, i) => (
            <div
              key={i}
              ref={makeRefCallback(i)}
              className={selectedTarget === i ? 'bg-cyan-500/5 rounded' : undefined}
            >
              <ContentBlock block={block} />
            </div>
          ))}
        </div>
      ) : (
        !error && (
          <div className="text-xs text-muted-foreground">
            No content blocks yet...
          </div>
        )
      )}
    </div>
  )
}
