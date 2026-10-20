import { describe, expect, it } from 'vitest'
import { formatNeedleSize, getGaugeMeasurement } from './reportFormatting'

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
})
