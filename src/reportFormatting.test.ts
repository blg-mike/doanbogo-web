import { describe, expect, it } from 'vitest'
import { createGaugeSample, formatNeedleSize, getGaugeMeasurement, getGaugePer10Cm, getGaugeSamplePer10Cm, getGaugeSamples } from './reportFormatting'

describe('report field formatting', () => {
  it('keeps legacy gauge counts and derives only the display defaults from its old reference', () => {
    expect(getGaugeMeasurement({ 'gauge.unit': '4in', 'gauge.beforeStitches': '24', 'gauge.beforeRows': '16' }, 'before')).toEqual({
      stitches: '24', rows: '16', width: '4', height: '4', unit: 'inch',
    })
    expect(getGaugeMeasurement({ 'gauge.beforeWidth': '', 'gauge.beforeHeight': '5.5', 'gauge.beforeUnit': 'cm' }, 'before')).toEqual({
      stitches: '', rows: '', width: '', height: '5.5', unit: 'cm',
    })
    expect(getGaugeMeasurement({ 'gauge.afterWidth': '8', 'gauge.afterHeight': '6', 'gauge.afterUnit': 'inch' }, 'after')).toMatchObject({ width: '8', height: '6', unit: 'inch' })
  })

  it('adds only the selected needle notation and leaves legacy sizes untouched', () => {
    expect(formatNeedleSize({ size: '4.5', sizeUnit: 'mm' })).toBe('4.5 mm')
    expect(formatNeedleSize({ size: '4.5 mm', sizeUnit: 'mm' })).toBe('4.5 mm')
    expect(formatNeedleSize({ size: '6', sizeUnit: 'US' })).toBe('US 6')
    expect(formatNeedleSize({ size: '6', sizeUnit: 'us' })).toBe('US 6')
    expect(formatNeedleSize({ size: '5', sizeUnit: 'uk' })).toBe('UK 5')
    expect(formatNeedleSize({ size: '13', sizeUnit: 'jp' })).toBe('JP 13')
    expect(formatNeedleSize({ size: '13', sizeUnit: 'JP' })).toBe('JP 13')
    expect(formatNeedleSize({ size: '4.5', sizeUnit: undefined })).toBe('4.5')
  })

  it('reads legacy gauge samples without a pattern as empty and initializes new samples with an empty pattern', () => {
    const fields = { 'gauge.samples': JSON.stringify([{ before: { stitches: '21', rows: '30', width: '10', height: '14' }, after: {} }]) }
    expect(getGaugeSamples(fields)[0]).toMatchObject({ pattern: '', before: { stitches: '21' } })
    expect(createGaugeSample()).toMatchObject({ pattern: '', before: { stitches: '' }, after: { height: '' } })
  })

  it('calculates extra gauge measurements with the same formula and rounding as primary gauges', () => {
    const sample = createGaugeSample()
    sample.before = { stitches: '21', rows: '30', width: '10', height: '14' }
    expect(getGaugeSamplePer10Cm(sample, 'before')).toEqual({ stitches: 21, rows: 21.43 })
    expect(getGaugePer10Cm({ 'gauge.beforeStitches': '21', 'gauge.beforeRows': '30', 'gauge.beforeWidth': '10', 'gauge.beforeHeight': '14', 'gauge.beforeUnit': 'cm' }, 'before')).toEqual(getGaugeSamplePer10Cm(sample, 'before'))
    expect(getGaugeSamplePer10Cm(createGaugeSample(), 'after')).toEqual({ stitches: null, rows: null })
    sample.after = { stitches: '21', rows: 'bad', width: '0', height: '10' }
    expect(getGaugeSamplePer10Cm(sample, 'after')).toEqual({ stitches: null, rows: null })
  })

  it('normalizes inches to centimeters for the primary gauge result', () => {
    expect(getGaugePer10Cm({ 'gauge.beforeStitches': '24', 'gauge.beforeRows': '32', 'gauge.beforeWidth': '4', 'gauge.beforeHeight': '4', 'gauge.beforeUnit': 'inch' }, 'before')).toEqual({ stitches: 23.62, rows: 31.5 })
  })
})
