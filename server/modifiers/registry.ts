import type { Flow } from '../../shared/types'
import type { FlowModifier, ModifierMatch } from './types'

const modifiers: FlowModifier[] = []

export function registerModifier(modifier: FlowModifier): void {
  // Prevent duplicate registration
  const existing = modifiers.find((m) => m.id === modifier.id)
  if (existing) {
    //console.warn(`Modifier with id "${modifier.id}" already registered, skipping`)
    return
  }

  modifiers.push(modifier)
  //console.log(`Registered modifier: ${modifier.name} (${modifier.id})`)
}

export function getModifiers(): FlowModifier[] {
  return modifiers
}

export function matchModifiers(flow: Flow): ModifierMatch[] {
  return modifiers
    .filter((modifier) => modifier.match(flow))
    .map((modifier) => ({ modifier }))
}

export function hasModifiers(flow: Flow): boolean {
  return modifiers.some((modifier) => modifier.match(flow))
}
