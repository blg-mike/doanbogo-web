import { describe, expect, it } from 'vitest'
import { applyGaugeMeasurementToFields, applyGaugeResultToFields, calculateGaugePer10Cm } from './reportGaugeCalculator'

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

    expect(applyGaugeResultToFields(fields, { sampleIndex: null, side: 'before' }, { stitchesPer10Cm: 23.33, rowsPer10Cm: 12.5 })).toEqual({
      ...fields,
      'gauge.beforeStitches': '23.33',
      'gauge.beforeRows': '12.5',
      'gauge.beforeWidth': '10',
      'gauge.beforeHeight': '10',
      'gauge.beforeUnit': 'cm',
    })
  })

  it('applies a result to one added gauge and preserves its pattern and other side', () => {
    const fields = { 'gauge.samples': JSON.stringify([{ pattern: 'cable', before: { stitches: '20', rows: '20', width: '10', height: '10' }, after: { stitches: '18', rows: '22', width: '10', height: '10' } }]) }
    const result = applyGaugeResultToFields(fields, { sampleIndex: 0, side: 'after' }, { stitchesPer10Cm: 21, rowsPer10Cm: 21.43 })
    expect(JSON.parse(result['gauge.samples'])).toEqual([{ pattern: 'cable', before: { stitches: '20', rows: '20', width: '10', height: '10' }, after: { stitches: '21', rows: '21.43', width: '10', height: '10' } }])
  })

  it('leaves the report unchanged for an unknown added gauge', () => {
    const fields = { 'gauge.samples': '[]' }
    expect(applyGaugeResultToFields(fields, { sampleIndex: 2, side: 'before' }, { stitchesPer10Cm: 21, rowsPer10Cm: 21.43 })).toBe(fields)
  })

  it('preserves the original input size and unit when applying the calculator', () => {
    const fields = { 'gauge.beforeStitches': '20', 'gauge.beforeRows': '30', 'gauge.beforeWidth': '4', 'gauge.beforeHeight': '4', 'gauge.beforeUnit': 'inch' }
    const measurement = { stitches: '21', rows: '28', width: '4.25', height: '4.1' }
    expect(applyGaugeMeasurementToFields(fields, { sampleIndex: null, side: 'before' }, measurement, 'inch')).toEqual({
      ...fields,
      'gauge.beforeStitches': '21',
      'gauge.beforeRows': '28',
      'gauge.beforeWidth': '4.25',
      'gauge.beforeHeight': '4.1',
      'gauge.beforeUnit': 'inch',
    })
  })
})
