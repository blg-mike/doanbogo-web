import { describe, expect, it } from 'vitest'
import { focusBandHeightFromSlider, focusBandSliderValue, MAX_BAND_HEIGHT, MIN_BAND_HEIGHT, snapFocusBandHeight, stepFocusBandHeight } from './progressLineBand'

describe('focus band height control', () => {
  it('changes by 0.75 percentage points from the current value', () => {
    expect(stepFocusBandHeight(0.02, 1)).toBe(0.0275)
    expect(stepFocusBandHeight(0.02, -1)).toBe(0.0125)
    expect(snapFocusBandHeight(0.024, 0.02)).toBe(0.0275)
  })

  it('keeps the slider travel and both 1% and 15% endpoints', () => {
    expect(stepFocusBandHeight(0.01, -1)).toBe(0.01)
    expect(stepFocusBandHeight(0.01, 1)).toBe(0.0175)
    expect(stepFocusBandHeight(0.15, 1)).toBe(0.15)
    expect(stepFocusBandHeight(0.15, -1)).toBe(0.1425)
    expect(snapFocusBandHeight(0.01, 0.012)).toBe(0.01)
    expect(snapFocusBandHeight(0.15, 0.012)).toBe(0.15)
    expect(focusBandSliderValue(MIN_BAND_HEIGHT)).toBe(1)
    expect(focusBandSliderValue(MAX_BAND_HEIGHT)).toBe(30)
    expect(focusBandHeightFromSlider(1)).toBe(MIN_BAND_HEIGHT)
    expect(focusBandHeightFromSlider(30)).toBe(0.15)
  })
})
