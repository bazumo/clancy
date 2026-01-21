/**
 * Test case matrix generation utilities
 * Generates cartesian products for comprehensive test coverage
 */
import type { Compression, TransferMode, Protocol, TestCase } from './types.js'

/**
 * Standard compression options
 */
export const COMPRESSIONS: Compression[] = ['none', 'gzip', 'deflate', 'br', 'zstd']

/**
 * Standard transfer mode options
 */
export const TRANSFER_MODES: TransferMode[] = ['content-length', 'chunked']

/**
 * Standard body size test values
 */
export const BODY_SIZES = [100, 5000]

/**
 * Generate cartesian product of multiple arrays
 */
export function cartesian<T>(...arrays: T[][]): T[][] {
  if (arrays.length === 0) return []
  if (arrays.length === 1) return arrays[0].map(item => [item])

  const [first, ...rest] = arrays
  const restProduct = cartesian(...rest)

  return first.flatMap(item =>
    restProduct.map(combo => [item, ...combo])
  )
}

/**
 * Generate standard test matrix for response testing
 */
export interface ResponseMatrixOptions {
  protocols?: Protocol[]
  compressions?: Compression[]
  transferModes?: TransferMode[]
  bodySizes?: number[]
}

export function generateResponseMatrix(options: ResponseMatrixOptions = {}): TestCase[] {
  const protocols = options.protocols || ['http', 'https']
  const compressions = options.compressions || COMPRESSIONS
  const transferModes = options.transferModes || TRANSFER_MODES
  const bodySizes = options.bodySizes || BODY_SIZES

  const combinations = cartesian(protocols, compressions, transferModes, bodySizes)

  return combinations.map(([protocol, compression, transferMode, bodySize]) => ({
    protocol: protocol as Protocol,
    compression: compression as Compression,
    transferMode: transferMode as TransferMode,
    bodySize: bodySize as number
  }))
}

/**
 * Generate test cases for streaming endpoints (SSE, Bedrock)
 */
export interface StreamMatrixOptions {
  protocols?: Protocol[]
  compressions?: Compression[]
  transferModes?: TransferMode[]
  eventCounts?: number[]
}

export function generateStreamMatrix(options: StreamMatrixOptions = {}): TestCase[] {
  const protocols = options.protocols || ['http', 'https']
  const compressions = options.compressions || ['none', 'gzip']
  const transferModes = options.transferModes || ['chunked']
  const eventCounts = options.eventCounts || [5, 10]

  const combinations = cartesian(protocols, compressions, transferModes, eventCounts)

  return combinations.map(([protocol, compression, transferMode, eventCount]) => ({
    protocol: protocol as Protocol,
    compression: compression as Compression,
    transferMode: transferMode as TransferMode,
    bodySize: eventCount as number // Reuse bodySize field for event count
  }))
}

/**
 * Filter test cases by predicate
 */
export function filterTestCases(
  cases: TestCase[],
  predicate: (tc: TestCase) => boolean
): TestCase[] {
  return cases.filter(predicate)
}

/**
 * Format test case as descriptive string
 */
export function formatTestCase(tc: TestCase): string {
  return `${tc.protocol.toUpperCase()} ${tc.compression} + ${tc.transferMode} (${tc.bodySize}b)`
}
