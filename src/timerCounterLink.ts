import type { CounterTimerLinkMode } from './types'

export type CounterTimerChoice = 'start' | 'skip' | null
export type CounterTimerAction = 'start' | 'prompt' | 'none'

export function isCounterTimerLinkMode(value: unknown): value is CounterTimerLinkMode {
  return value === 'auto' || value === 'ask-once' || value === 'independent'
}

export function resolveCounterTimerAction(mode: CounterTimerLinkMode, choice: CounterTimerChoice): CounterTimerAction {
  if (mode === 'independent') return 'none'
  if (mode === 'auto' || choice === 'start') return 'start'
  if (choice === 'skip') return 'none'
  return 'prompt'
}
