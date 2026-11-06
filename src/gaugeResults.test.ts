import { describe, expect, it } from 'vitest'
import { gaugeResult, gaugeWashChanges, pickUpRatio, washChange } from './gaugeResults'

describe('gauge result summaries', () => {
  it('reduces the before and after pick-up ratios', () => {
    expect(pickUpRatio(20, 30)).toEqual({ stitches: 2, rows: 3, approximate: false })
    expect(pickUpRatio(21, 28)).toEqual({ stitches: 3, rows: 4, approximate: false })
  })

  it('bounds ratios with large denominators to twelve rows', () => {
    const ratio = pickUpRatio(20, 37)
    expect(ratio?.rows).toBeLessThanOrEqual(12)
    expect(ratio?.approximate).toBe(true)
  })

  it('formats the stitch-to-row ratio basis and wash changes', () => {
    expect(gaugeResult({ stitches: 20, rows: 30 })).toEqual({ pickUp: { stitches: 2, rows: 3, approximate: false }, stitchRow: 1.5 })
    expect(gaugeWashChanges({ stitches: 20, rows: 30 }, { stitches: 21, rows: 28 })).toEqual({ width: -4.8, height: 7.1 })
  })

  it('returns no change for equal gauges and hides incomplete comparisons', () => {
    expect(washChange(20, 20)).toBe(0)
    expect(washChange(20, null)).toBeNull()
    expect(pickUpRatio(0, 20)).toBeNull()
  })
})
