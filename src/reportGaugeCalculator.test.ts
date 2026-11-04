import { describe, expect, it } from 'vitest'
import { applyGaugeResultToFields, calculateGaugePer10Cm } from './reportGaugeCalculator'

describe('calculateGaugePer10Cm', () => {
  it('returns the same counts for a 10 by 10 cm swatch', () => {
    expect(calculateGaugePer10Cm({ stitches: 10, rows: 10, widthCm: 10, heightCm: 10 })).toEqual({
      stitchesPer10Cm: 10,
      rowsPer10Cm: 10,
    })
  })

  it('normalizes stitch and row counts independently', () => {
    expect(calculateGaugePer10Cm({ stitches: 24, rows: 18, widthCm: 8, heightCm: 9 })).toEqual({
      stitchesPer10Cm: 30,
      rowsPer10Cm: 20,
    })
  })

  it('rounds results to two decimal places without retaining trailing zeroes', () => {
    expect(calculateGaugePer10Cm({ stitches: 7, rows: 5, widthCm: 3, heightCm: 4 })).toEqual({
      stitchesPer10Cm: 23.33,
      rowsPer10Cm: 12.5,
    })
  })

  it.each([
    { stitches: 0, rows: 10, widthCm: 10, heightCm: 10 },
    { stitches: -1, rows: 10, widthCm: 10, heightCm: 10 },
    { stitches: 1.5, rows: 10, widthCm: 10, heightCm: 10 },
    { stitches: 10, rows: 0, widthCm: 10, heightCm: 10 },
    { stitches: 10, rows: 10, widthCm: 0, heightCm: 10 },
    { stitches: 10, rows: 10, widthCm: -1, heightCm: 10 },
    { stitches: 10, rows: 10, widthCm: 10, heightCm: Number.NaN },
    { stitches: 10, rows: 10, widthCm: Number.MIN_VALUE, heightCm: 10 },
  ])('rejects invalid input $stitches/$rows over $widthCm/$heightCm cm', (input) => {
    expect(calculateGaugePer10Cm(input)).toBeNull()
  })

  it('applies a result to one report side and leaves the other side unchanged', () => {
    const fields = {
      'gauge.beforeStitches': '24',
      'gauge.beforeRows': '32',
      'gauge.afterStitches': '20',
      'gauge.afterRows': '28',
      'gauge.afterWidth': '8',
      'gauge.afterHeight': '9',
      'gauge.afterUnit': 'inch',
    }

    expect(applyGaugeResultToFields(fields, 'before', { stitchesPer10Cm: 23.33, rowsPer10Cm: 12.5 })).toEqual({
      ...fields,
      'gauge.beforeStitches': '23.33',
      'gauge.beforeRows': '12.5',
      'gauge.beforeWidth': '10',
      'gauge.beforeHeight': '10',
      'gauge.beforeUnit': 'cm',
    })
  })
})
