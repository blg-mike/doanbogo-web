import { describe, expect, it } from 'vitest'
import { snapFocusBandHeight, stepFocusBandHeight } from './progressLineBand'

describe('focus band height control', () => {
  it('changes by 0.75 percentage points from the current value', () => {
    expect(stepFocusBandHeight(0.03, 1)).toBe(0.0375)
    expect(stepFocusBandHeight(0.03, -1)).toBe(0.0225)
    expect(snapFocusBandHeight(0.034, 0.03)).toBe(0.0375)
  })

  it('keeps both 1% and 30% endpoints reachable', () => {
    expect(stepFocusBandHeight(0.01, -1)).toBe(0.01)
    expect(stepFocusBandHeight(0.01, 1)).toBe(0.0175)
    expect(stepFocusBandHeight(0.3, 1)).toBe(0.3)
    expect(stepFocusBandHeight(0.3, -1)).toBe(0.2925)
    expect(snapFocusBandHeight(0.01, 0.012)).toBe(0.01)
    expect(snapFocusBandHeight(0.3, 0.012)).toBe(0.3)
  })
})
