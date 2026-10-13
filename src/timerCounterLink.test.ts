import { describe, expect, it } from 'vitest'
import { resolveCounterTimerAction } from './timerCounterLink'

describe('counter and timer link choices', () => {
  it('starts automatically when selected', () => {
    expect(resolveCounterTimerAction('auto', null)).toBe('start')
    expect(resolveCounterTimerAction('auto', 'skip')).toBe('start')
  })

  it('asks once until a choice is remembered', () => {
    expect(resolveCounterTimerAction('ask-once', null)).toBe('prompt')
    expect(resolveCounterTimerAction('ask-once', 'start')).toBe('start')
    expect(resolveCounterTimerAction('ask-once', 'skip')).toBe('none')
  })

  it('keeps the timer independent when selected', () => {
    expect(resolveCounterTimerAction('independent', null)).toBe('none')
  })
})
