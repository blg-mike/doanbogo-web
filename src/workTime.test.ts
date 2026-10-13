import { describe, expect, it } from 'vitest'
import { formatWorkTime, formatWorkTimeHoursMinutes, isWorkDateKey, normalizeWorkTimeDays } from './workTime'

describe('work time formatting', () => {
  it('shows hours, minutes, and seconds without wrapping long totals', () => {
    expect(formatWorkTime(0)).toBe('00:00:00')
    expect(formatWorkTime(3_723_999)).toBe('01:02:03')
    expect(formatWorkTime(360_000_000)).toBe('100:00:00')
  })

  it('formats daily durations and orders distinct work dates', () => {
    expect(formatWorkTimeHoursMinutes(1_230_000)).toEqual({ hours: '00', minutes: '20' })
    expect(formatWorkTimeHoursMinutes(90_000_000)).toEqual({ hours: '25', minutes: '00' })
    expect(normalizeWorkTimeDays([
      { date: '2026-10-14', elapsedMs: 10_000 },
      { date: '2026-10-13', elapsedMs: 50_000 },
    ], '2026-10-14', 8_000)).toEqual([
      { date: '2026-10-13', elapsedMs: 50_000 },
      { date: '2026-10-14', elapsedMs: 10_000 },
    ])
    expect(normalizeWorkTimeDays(undefined, '2026-10-13', 20_000)).toEqual([{ date: '2026-10-13', elapsedMs: 20_000 }])
  })

  it('accepts only real calendar dates for timer history', () => {
    expect(isWorkDateKey('2026-10-13')).toBe(true)
    expect(isWorkDateKey('2026-02-30')).toBe(false)
    expect(isWorkDateKey('13-10-2026')).toBe(false)
  })
})
