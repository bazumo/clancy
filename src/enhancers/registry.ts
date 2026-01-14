import type { Flow } from '../../shared/types'
import type { FlowEnhancer, EnhancerMatch } from './types'

// Registry of all enhancers
const enhancers: FlowEnhancer[] = []

/**
 * Register an enhancer
 */
export function registerEnhancer(enhancer: FlowEnhancer): void {
  // Avoid duplicates
  if (!enhancers.find(e => e.id === enhancer.id)) {
    enhancers.push(enhancer)
  }
}

/**
 * Get all registered enhancers
 */
export function getEnhancers(): FlowEnhancer[] {
  return [...enhancers]
}

/**
 * Find all enhancers that match a flow and return their tags
 */
export function matchEnhancers(flow: Flow): EnhancerMatch[] {
  const matches: EnhancerMatch[] = []
  
  for (const enhancer of enhancers) {
    if (enhancer.match(flow)) {
      matches.push({
        enhancer,
        tags: enhancer.tags(flow)
      })
    }
  }
  
  return matches
}

/**
 * Get all unique tags for a flow from all matching enhancers
 */
export function getFlowTags(flow: Flow): string[] {
  const matches = matchEnhancers(flow)
  const tags = new Set<string>()
  
  for (const match of matches) {
    for (const tag of match.tags) {
      tags.add(tag)
    }
  }
  
  return Array.from(tags)
}

/**
 * Get the first matching enhancer (primary enhancer for rendering)
 */
export function getPrimaryEnhancer(flow: Flow): EnhancerMatch | null {
  const matches = matchEnhancers(flow)
  return matches.length > 0 ? matches[0] : null
}

