import { describe, expect, it } from 'vitest'
import { applyMeasurementSelection, createDefaultMeasurements, isMeasurementPresetAdded, measurementPresetKeys } from './reportMeasurementSelection'
import type { ReportMeasurement } from './types'

describe('finished measurement selection', () => {
  it('creates only bust and total length as default rows', () => {
    const rows = createDefaultMeasurements((key) => key)

    expect(rows.map(({ label, pattern, finished, unit }) => ({ label, pattern, finished, unit }))).toEqual([
      { label: '가슴둘레', pattern: '', finished: '', unit: 'cm' },
      { label: '총장', pattern: '', finished: '', unit: 'cm' },
    ])
    expect(rows[0].id).not.toBe(rows[1].id)
  })

  it('keeps arm length after armhole and recognizes legacy names', () => {
    expect(measurementPresetKeys.indexOf('팔길이')).toBe(measurementPresetKeys.indexOf('암홀') + 1)
    expect(isMeasurementPresetAdded([{ id: 'legacy-length', label: '기장', pattern: '54cm', finished: '57', unit: 'cm' }], '총장')).toBe(true)
    expect(isMeasurementPresetAdded([{ id: 'legacy-sleeve', label: '소매길이', pattern: '', finished: '48', unit: 'cm' }], '팔길이')).toBe(true)
    expect(isMeasurementPresetAdded([{ id: 'bust', label: 'Bust circumference', pattern: '', finished: '', unit: 'cm' }], '가슴둘레')).toBe(true)
  })

  it('updates selected defaults without replacing ids, labels, hidden pattern, or other rows', () => {
    const total: ReportMeasurement = { id: 'total', label: '기장', pattern: 'legacy pattern size', finished: '57', unit: 'inch' }
    const other: ReportMeasurement = { id: 'custom', label: '후드 높이', pattern: '', finished: '24', unit: 'cm' }
    const result = applyMeasurementSelection([total, other], [
      { label: 'Total length', finished: '58', unit: 'cm' },
      { label: 'Arm length', finished: '48', unit: 'inch' },
    ], [{ label: '후드 폭', finished: '22', unit: 'cm' }])

    expect(result.slice(0, 2)).toEqual([{ ...total, finished: '58', unit: 'cm' }, other])
    expect(result.slice(2).map(({ label, finished, unit, pattern }) => ({ label, finished, unit, pattern }))).toEqual([
      { label: 'Arm length', finished: '48', unit: 'inch', pattern: '' },
      { label: '후드 폭', finished: '22', unit: 'cm', pattern: '' },
    ])
    expect(new Set(result.map((row) => row.id)).size).toBe(result.length)
  })

  it('removes unchecked defaults and adds only newly selected rows', () => {
    const defaults = createDefaultMeasurements((key) => key)
    const other: ReportMeasurement = { id: 'custom', label: '후드 높이', pattern: '', finished: '', unit: 'cm' }
    const result = applyMeasurementSelection([...defaults, other], [
      { label: '가슴둘레', finished: '', unit: 'cm' },
      { label: '어깨너비', finished: '41', unit: 'cm' },
    ], [])

    expect(result.map(({ label }) => label)).toEqual(['가슴둘레', '후드 높이', '어깨너비'])
    expect(result[0].id).toBe(defaults[0].id)
    expect(result[1]).toEqual(other)
  })

  it('removes both defaults when both checkboxes are cleared', () => {
    const defaults = createDefaultMeasurements((key) => key)
    expect(applyMeasurementSelection(defaults, [], [])).toEqual([])
  })

  it('updates, removes, and re-adds an optional preset through its checkbox selection', () => {
    const shoulder: ReportMeasurement = { id: 'shoulder', label: 'Shoulder width', pattern: '38', finished: '40', unit: 'cm' }

    expect(applyMeasurementSelection([shoulder], [{ label: 'Shoulder width', finished: '42', unit: 'inch' }], [])).toEqual([
      { ...shoulder, finished: '42', unit: 'inch' },
    ])
    expect(applyMeasurementSelection([shoulder], [], [])).toEqual([])
    expect(applyMeasurementSelection([], [{ label: 'Shoulder width', finished: '44', unit: 'cm' }], [])).toMatchObject([
      { label: 'Shoulder width', pattern: '', finished: '44', unit: 'cm' },
    ])
  })
})
