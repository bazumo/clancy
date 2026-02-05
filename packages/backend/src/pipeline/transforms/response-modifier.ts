import type { TransformStage, ResponseMeta, TransformResult } from '../types.js'
import { matchModifiers } from '../../modifiers/registry.js'

/**
 * Response modifier transform stage.
 * Buffers non-streaming responses and applies modifiers before sending to client.
 *
 * Note: Only activates for non-streaming responses with matching modifiers
 */
export class ResponseModifierStage implements TransformStage {
  name = 'response-modifier'
  private buffer: Buffer[] = []

  shouldActivate(meta: ResponseMeta): boolean {
    // Only activate for non-streaming responses with modifiers
    if (meta.isStreaming) {
      return false
    }

    const matches = matchModifiers(meta.flow)
    return matches.some((match) => !!match.modifier.modifyResponse)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  process(chunk: Buffer, _meta: ResponseMeta): TransformResult | null {
    // Buffer the chunk - we need the full response to modify it
    this.buffer.push(chunk)

    // Return null to indicate we're buffering
    return null
  }

  flush(meta: ResponseMeta): TransformResult | null {
    if (this.buffer.length === 0) {
      return null
    }

    const rawData = Buffer.concat(this.buffer)
    const originalBody = rawData.toString('utf-8')

    try {
      // Apply response modifiers synchronously
      // Note: Only synchronous modifiers are supported in the pipeline
      // For async modifiers, they should handle promises internally
      const matches = matchModifiers(meta.flow)
      let modifiedBody = originalBody
      let modifiedHeaders: Record<string, string> = meta.headers as Record<string, string>

      // Apply each modifier synchronously
      for (const match of matches) {
        if (match.modifier.modifyResponse) {
          try {
            const response = {
              status: meta.statusCode,
              statusText: meta.statusMessage,
              headers: modifiedHeaders,
              body: modifiedBody,
            }
            const request = {
              method: meta.flow.request.method || 'GET',
              url: meta.flow.request.url || '',
              path: meta.flow.request.path || '',
              host: meta.flow.host,
              headers: (meta.flow.request.headers as Record<string, string>) || {},
              body: meta.flow.request.body || '',
            }

            const result = match.modifier.modifyResponse(response, request)

            // If the result is a promise, we can't handle it here (pipeline is sync)
            // Just use the original data
            if (result instanceof Promise) {
              console.warn(`[ResponseModifier] Async modifier "${match.modifier.name}" not supported in pipeline, skipping`)
              continue
            }

            modifiedBody = result.body
            modifiedHeaders = result.headers
          } catch (err) {
            console.error(
              `[ResponseModifier] Error in modifier "${match.modifier.name}":`,
              (err as Error).message
            )
          }
        }
      }

      // Check if response was actually modified
      if (modifiedBody !== originalBody) {
        console.log(`[ResponseModifier] Modified response for flow ${meta.flow.id}`)

        const modifiedData = Buffer.from(modifiedBody, 'utf-8')
        this.buffer = [] // Clear buffer

        return {
          data: modifiedData,
          headerMods: {
            set: {
              'content-length': String(modifiedData.length),
              ...modifiedHeaders,
            },
            remove: ['transfer-encoding'], // Remove chunked encoding
          },
        }
      }

      // No modification, return original
      this.buffer = []
      return { data: rawData }
    } catch (err) {
      console.error(`[ResponseModifier] Error modifying response:`, (err as Error).message)
      // On error, return original data
      this.buffer = []
      return { data: rawData }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getHeaderModifications(_meta: ResponseMeta): { set?: Record<string, string>; remove?: string[] } {
    // We'll handle header modifications in flush() after modifying the body
    return {}
  }
}
