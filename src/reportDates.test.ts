import { describe, expect, it } from 'vitest'
import { isValidReportDateValue } from './reportDates'

describe('report dates', () => {
  it('accepts empty values and four-digit calendar dates, including leap days', () => {
    expect(isValidReportDateValue('')).toBe(true)
    expect(isValidReportDateValue('2024-02-29')).toBe(true)
    expect(isValidReportDateValue('0001-01-01')).toBe(true)
  })

  it('rejects incomplete, overlong, and impossible dates', () => {
    expect(isValidReportDateValue('2024')).toBe(false)
    expect(isValidReportDateValue('10000-01-01')).toBe(false)
    expect(isValidReportDateValue('2023-02-29')).toBe(false)
    expect(isValidReportDateValue('2024-13-01')).toBe(false)
  })
})
