import type { DocumentWorkTimeDay, DocumentWorkTimeSession } from './types'

export type WorkTimeChartMode = 'day' | 'week' | 'month'
export type WorkTimeChartBucket = { key: string; label: string; elapsedMs: number }

export function formatWorkTime(milliseconds: number) {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60
  return [hours, minutes, remainingSeconds].map((value) => String(value).padStart(2, '0')).join(':')
}

export function formatWorkTimeHoursMinutes(milliseconds: number) {
  const totalMinutes = Math.floor(Math.max(0, milliseconds) / 60_000)
  return {
    hours: String(Math.floor(totalMinutes / 60)).padStart(2, '0'),
    minutes: String(totalMinutes % 60).padStart(2, '0'),
  }
}

export function isWorkDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(value + 'T00:00:00.000Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function normalizeWorkTimeDays(days?: DocumentWorkTimeDay[], todayDate?: string, todayWorkTimeMs?: number) {
  const totals = new Map<string, number>()
  for (const day of days ?? []) {
    if (!isWorkDateKey(day.date) || !Number.isSafeInteger(day.elapsedMs) || day.elapsedMs <= 0) continue
    const total = (totals.get(day.date) ?? 0) + day.elapsedMs
    if (Number.isSafeInteger(total)) totals.set(day.date, total)
  }
  if (isWorkDateKey(todayDate) && typeof todayWorkTimeMs === 'number' && Number.isSafeInteger(todayWorkTimeMs) && todayWorkTimeMs > 0) {
    totals.set(todayDate, Math.max(totals.get(todayDate) ?? 0, todayWorkTimeMs))
  }
  return [...totals.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, elapsedMs]) => ({ date, elapsedMs }))
}

export function localWorkDateKey(date = new Date()) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}

export function splitWorkTimeSession(id: string, startedAt: number, endedAt: number): DocumentWorkTimeSession[] {
  if (!id || !Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt <= startedAt) return []
  const segments: DocumentWorkTimeSession[] = []
  let cursor = Math.floor(startedAt)
  const end = Math.floor(endedAt)
  while (cursor < end) {
    const startDate = new Date(cursor)
    const workDate = localWorkDateKey(startDate)
    const nextMidnight = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + 1).getTime()
    const segmentEnd = Math.min(end, nextMidnight)
    const elapsedMs = segmentEnd - cursor
    if (elapsedMs > 0) segments.push({ id: `${id}:${workDate}`, startedAt: cursor, endedAt: segmentEnd, elapsedMs, workDate })
    cursor = segmentEnd
  }
  return segments
}

export function summarizeWorkTime(totalWorkTimeMs: number, days: readonly DocumentWorkTimeDay[]) {
  const recordedDays = normalizeWorkTimeDays([...days]).filter((day) => day.elapsedMs > 0)
  const recordedMs = recordedDays.reduce((sum, day) => sum + day.elapsedMs, 0)
  return {
    recordedDays,
    unknownMs: Math.max(0, totalWorkTimeMs - recordedMs),
    averageMs: recordedDays.length ? Math.floor(recordedMs / recordedDays.length) : 0,
    longestDayMs: recordedDays.reduce((longest, day) => Math.max(longest, day.elapsedMs), 0),
  }
}

export function workTimeChartBuckets(days: readonly DocumentWorkTimeDay[], mode: WorkTimeChartMode, count: number, now = new Date()): WorkTimeChartBucket[] {
  const totals = new Map(normalizeWorkTimeDays([...days]).map((day) => [day.date, day.elapsedMs]))
  const buckets: WorkTimeChartBucket[] = []
  if (mode === 'day') {
    for (let offset = count - 1; offset >= 0; offset -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset)
      const key = localWorkDateKey(date)
      buckets.push({ key, label: `${date.getMonth() + 1}.${String(date.getDate()).padStart(2, '0')}`, elapsedMs: totals.get(key) ?? 0 })
    }
    return buckets
  }
  if (mode === 'week') {
    const currentMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    currentMonday.setDate(currentMonday.getDate() - (currentMonday.getDay() + 6) % 7)
    for (let offset = count - 1; offset >= 0; offset -= 1) {
      const start = new Date(currentMonday.getFullYear(), currentMonday.getMonth(), currentMonday.getDate() - offset * 7)
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7)
      const key = localWorkDateKey(start)
      const elapsedMs = [...totals].reduce((sum, [date, value]) => sum + (date >= key && date < localWorkDateKey(end) ? value : 0), 0)
      buckets.push({ key, label: `${start.getMonth() + 1}.${String(start.getDate()).padStart(2, '0')}`, elapsedMs })
    }
    return buckets
  }
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const elapsedMs = [...totals].reduce((sum, [day, value]) => sum + (day.startsWith(key) ? value : 0), 0)
    buckets.push({ key, label: `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}`, elapsedMs })
  }
  return buckets
}
