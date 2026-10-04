import { describe, expect, it } from 'vitest'
import { clampCounterValue, counterValueFromInput } from './counter'

describe('number counters', () => {
  it('clamps button changes at zero and ninety-nine', () => {
    expect(clampCounterValue(-1)).toBe(0)
    expect(clampCounterValue(0)).toBe(0)
    expect(clampCounterValue(1)).toBe(1)
    expect(clampCounterValue(100)).toBe(99)
  })

  it('accepts integer input and clamps it to the supported range', () => {
    expect(counterValueFromInput('42', 5)).toBe(42)
    expect(counterValueFromInput('-3', 5)).toBe(0)
    expect(counterValueFromInput('100', 5)).toBe(99)
  })

  it('keeps the current value for blank or non-integer input', () => {
    expect(counterValueFromInput('', 7)).toBe(7)
    expect(counterValueFromInput('  ', 7)).toBe(7)
    expect(counterValueFromInput('2.5', 7)).toBe(7)
  })
})
