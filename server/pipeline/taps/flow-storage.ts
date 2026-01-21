import type { TapStage, ResponseMeta } from '../types.js'
import * as store from '../../flow-store.js'

/**
 * Flow storage tap.
 * Accumulates the response body and saves the flow on completion.
 */
export class FlowStorageTap implements TapStage {
  name = 'flow-storage'
  private bodyChunks: Buffer[] = []

  shouldActivate(_meta: ResponseMeta): boolean { // eslint-disable-line @typescript-eslint/no-unused-vars
    // Always active - we always want to save flows
    return true
  }

  onChunk(chunk: Buffer, _meta: ResponseMeta): void { // eslint-disable-line @typescript-eslint/no-unused-vars
    this.bodyChunks.push(chunk)
  }

  onEnd(meta: ResponseMeta): void {
    const body = Buffer.concat(this.bodyChunks)

    // Set response body on flow
    if (meta.flow.response) {
      meta.flow.response.body = body.toString('utf-8')
    }

    // Save the flow
    store.saveFlow(meta.flow)

    // Clear buffer for potential reuse
    this.bodyChunks = []
  }

  onError(error: Error, meta: ResponseMeta): void {
    // On error, save what we have
    if (meta.flow.response) {
      const body = Buffer.concat(this.bodyChunks)
      meta.flow.response.body = body.length > 0 ? body.toString('utf-8') : error.message
    }
    store.saveFlow(meta.flow)
    this.bodyChunks = []
  }
}
