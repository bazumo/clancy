import type { TapStage, ResponseMeta } from '../types.js'
import * as store from '../../flow-store.js'

// 20MB limit for flow storage
const MAX_FLOW_SIZE_BYTES = 20 * 1024 * 1024

/**
 * Flow storage tap.
 * Accumulates the response body and saves the flow on completion.
 * Skips saving body if it exceeds 20MB.
 */
export class FlowStorageTap implements TapStage {
  name = 'flow-storage'
  private bodyChunks: Buffer[] = []
  private totalSize = 0

  shouldActivate(_meta: ResponseMeta): boolean { // eslint-disable-line @typescript-eslint/no-unused-vars
    // Always active - we always want to save flows
    return true
  }

  onChunk(chunk: Buffer, _meta: ResponseMeta): void { // eslint-disable-line @typescript-eslint/no-unused-vars
    this.totalSize += chunk.length

    // Only accumulate chunks if we haven't exceeded the limit
    if (this.totalSize <= MAX_FLOW_SIZE_BYTES) {
      this.bodyChunks.push(chunk)
    }
  }

  onEnd(meta: ResponseMeta): void {
    // Set response body on flow
    if (meta.flow.response) {
      if (this.totalSize > MAX_FLOW_SIZE_BYTES) {
        // Body too large, don't save it
        meta.flow.response.body = `[Body too large: ${(this.totalSize / 1024 / 1024).toFixed(2)}MB - not saved]`
      } else {
        const body = Buffer.concat(this.bodyChunks)
        meta.flow.response.body = body.toString('utf-8')
      }
    }

    // Save the flow
    store.saveFlow(meta.flow)

    // Clear buffer for potential reuse
    this.bodyChunks = []
    this.totalSize = 0
  }

  onError(error: Error, meta: ResponseMeta): void {
    // On error, save what we have
    if (meta.flow.response) {
      if (this.totalSize > MAX_FLOW_SIZE_BYTES) {
        meta.flow.response.body = `[Body too large: ${(this.totalSize / 1024 / 1024).toFixed(2)}MB - not saved]`
      } else {
        const body = Buffer.concat(this.bodyChunks)
        meta.flow.response.body = body.length > 0 ? body.toString('utf-8') : error.message
      }
    }
    store.saveFlow(meta.flow)
    this.bodyChunks = []
    this.totalSize = 0
  }
}
