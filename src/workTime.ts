import type { DocumentWorkTimeDay } from './types'

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
