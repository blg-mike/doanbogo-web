import { describe, expect, it } from 'vitest'
import { formatWorkTime, formatWorkTimeHoursMinutes, isWorkDateKey, localWorkDateKey, normalizeWorkTimeDays, splitWorkTimeSession, summarizeWorkTime, workTimeChartBuckets } from './workTime'

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

  it('splits a work session at local midnight without losing elapsed time', () => {
    const startedAt = new Date(2026, 9, 14, 23, 30).getTime()
    const endedAt = new Date(2026, 9, 15, 0, 15).getTime()
    const [beforeMidnight, afterMidnight] = splitWorkTimeSession('timer-session', startedAt, endedAt)

    expect([beforeMidnight.workDate, afterMidnight.workDate]).toEqual([
      localWorkDateKey(new Date(startedAt)), localWorkDateKey(new Date(endedAt)),
    ])
    expect(beforeMidnight).toMatchObject({ id: 'timer-session:' + localWorkDateKey(new Date(startedAt)), elapsedMs: 30 * 60_000 })
    expect(afterMidnight).toMatchObject({ id: 'timer-session:' + localWorkDateKey(new Date(endedAt)), elapsedMs: 15 * 60_000 })
    expect(beforeMidnight.elapsedMs + afterMidnight.elapsedMs).toBe(endedAt - startedAt)
  })

  it('summarizes dated time separately from an unknown historical balance', () => {
    expect(summarizeWorkTime(2_000, [
      { date: '2026-10-13', elapsedMs: 300 },
      { date: '2026-10-14', elapsedMs: 700 },
    ])).toEqual({
      recordedDays: [{ date: '2026-10-13', elapsedMs: 300 }, { date: '2026-10-14', elapsedMs: 700 }],
      unknownMs: 1_000,
      averageMs: 500,
      longestDayMs: 700,
    })
  })

  it('builds daily, Monday-based weekly, and monthly buckets with empty periods', () => {
    const now = new Date(2026, 9, 14, 12)
    const days = [
      { date: '2026-10-12', elapsedMs: 60_000 },
      { date: '2026-10-13', elapsedMs: 120_000 },
      { date: '2026-10-13', elapsedMs: 30_000 },
    ]
    const daily = workTimeChartBuckets(days, 'day', 7, now)
    const weekly = workTimeChartBuckets(days, 'week', 8, now)
    const monthly = workTimeChartBuckets(days, 'month', 12, now)

    expect(daily).toHaveLength(7)
    expect(daily.at(-2)).toMatchObject({ key: '2026-10-13', elapsedMs: 150_000 })
    expect(daily.at(-1)).toMatchObject({ key: '2026-10-14', elapsedMs: 0 })
    expect(weekly).toHaveLength(8)
    expect(weekly.at(-1)).toMatchObject({ key: '2026-10-12', elapsedMs: 210_000 })
    expect(weekly[0].elapsedMs).toBe(0)
    expect(monthly).toHaveLength(12)
    expect(monthly.at(-1)).toMatchObject({ key: '2026-10', elapsedMs: 210_000 })
    expect(monthly[0].elapsedMs).toBe(0)
  })
})
