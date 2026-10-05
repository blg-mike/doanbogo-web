import type { CounterSnapshot, CounterTaskKind, CounterTaskOccurrence, CounterTaskRule, CounterTaskStatus } from './types'

export const COUNTER_COUNT = 5
export const MAX_COUNTER_ROW = 9999
export const MAX_COUNTER_TASK_RULES = 10
const MAX_COUNTER_TASK_OCCURRENCES = MAX_COUNTER_ROW * MAX_COUNTER_TASK_RULES

export function createDefaultCounters(): CounterSnapshot[] {
  return Array.from({ length: COUNTER_COUNT }, () => ({
    mode: 'simple',
    value: 0,
    repeatName: '무늬',
    startRow: 1,
    repeatLength: 12,
    repeatCount: null,
    taskRules: [],
    taskOccurrences: [],
  }))
}

function isCounterTaskRule(value: unknown): value is CounterTaskRule {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const rule = value as Record<string, unknown>
  return typeof rule.id === 'string' && rule.id.length > 0 && rule.id.length <= 64 &&
    (rule.kind === 'decrease' || rule.kind === 'increase') &&
    Number.isSafeInteger(rule.interval) && Number(rule.interval) >= 1 && Number(rule.interval) <= MAX_COUNTER_ROW &&
    Number.isSafeInteger(rule.total) && Number(rule.total) >= 1 && Number(rule.total) <= MAX_COUNTER_ROW
}

function isCounterTaskOccurrence(value: unknown, ruleIds: Set<string>): value is CounterTaskOccurrence {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const occurrence = value as Record<string, unknown>
  return typeof occurrence.ruleId === 'string' && ruleIds.has(occurrence.ruleId) &&
    Number.isSafeInteger(occurrence.occurrence) && Number(occurrence.occurrence) >= 1 &&
    (occurrence.status === 'done' || occurrence.status === 'missed')
}

export function isCounterSnapshots(value: unknown): value is CounterSnapshot[] {
  if (!Array.isArray(value) || value.length !== COUNTER_COUNT) return false
  return value.every((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false
    const counter = entry as Record<string, unknown>
    if ((counter.mode !== 'simple' && counter.mode !== 'repeat') || !Number.isSafeInteger(counter.value) ||
      (counter.mode === 'simple' && (Number(counter.value) < 0 || Number(counter.value) > 99)) ||
      (counter.mode === 'repeat' && (Number(counter.value) < 1 || Number(counter.value) > MAX_COUNTER_ROW)) ||
      typeof counter.repeatName !== 'string' || counter.repeatName.length < 1 || counter.repeatName.length > 100 ||
      !Number.isSafeInteger(counter.startRow) || Number(counter.startRow) < 1 || Number(counter.startRow) > MAX_COUNTER_ROW ||
      !Number.isSafeInteger(counter.repeatLength) || Number(counter.repeatLength) < 1 || Number(counter.repeatLength) > MAX_COUNTER_ROW ||
      !(counter.repeatCount === null || Number.isSafeInteger(counter.repeatCount) && Number(counter.repeatCount) >= 1 && Number(counter.repeatCount) <= MAX_COUNTER_ROW) ||
      !Array.isArray(counter.taskRules) || counter.taskRules.length > MAX_COUNTER_TASK_RULES ||
      !counter.taskRules.every(isCounterTaskRule) || !Array.isArray(counter.taskOccurrences) || counter.taskOccurrences.length > MAX_COUNTER_TASK_OCCURRENCES) return false
    const ruleIds = new Set((counter.taskRules as CounterTaskRule[]).map((rule) => rule.id))
    if (ruleIds.size !== counter.taskRules.length) return false
    const occurrenceKeys = new Set<string>()
    for (const item of counter.taskOccurrences) {
      if (!isCounterTaskOccurrence(item, ruleIds)) return false
      const rule = (counter.taskRules as CounterTaskRule[]).find((candidate) => candidate.id === item.ruleId)
      if (!rule || item.occurrence > rule.total) return false
      const key = counterTaskKey(item.ruleId, item.occurrence)
      if (occurrenceKeys.has(key)) return false
      occurrenceKeys.add(key)
    }
    return true
  })
}

export function normalizeCounterSnapshots(value: unknown): CounterSnapshot[] {
  const defaults = createDefaultCounters()
  if (!Array.isArray(value)) return defaults
  return defaults.map((fallback, index) => {
    const candidate = value[index]
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return fallback
    const current = candidate as Record<string, unknown>
    const ruleIdsSeen = new Set<string>()
    const rules = Array.isArray(current.taskRules) ? current.taskRules.filter((item): item is CounterTaskRule => {
      if (!isCounterTaskRule(item) || ruleIdsSeen.has(item.id)) return false
      ruleIdsSeen.add(item.id)
      return true
    }).slice(0, MAX_COUNTER_TASK_RULES) : []
    const ids = new Set(rules.map((rule) => rule.id))
    const occurrences = Array.isArray(current.taskOccurrences) ? current.taskOccurrences
      .filter((item): item is CounterTaskOccurrence => isCounterTaskOccurrence(item, ids))
      .filter((item) => item.occurrence <= (rules.find((rule) => rule.id === item.ruleId)?.total ?? 0))
      .slice(-MAX_COUNTER_TASK_OCCURRENCES) : []
    const uniqueOccurrences = new Map<string, CounterTaskOccurrence>()
    occurrences.forEach((item) => uniqueOccurrences.set(counterTaskKey(item.ruleId, item.occurrence), item))
    const mode = current.mode === 'repeat' ? 'repeat' : 'simple'
    const asInteger = (value: unknown, defaultValue: number, min: number, max: number) =>
      Number.isSafeInteger(value) ? Math.min(max, Math.max(min, Number(value))) : defaultValue
    const repeatName = typeof current.repeatName === 'string' ? current.repeatName.trim().slice(0, 100) : ''
    const repeatCount = current.repeatCount === null ? null : asInteger(current.repeatCount, 1, 1, MAX_COUNTER_ROW)
    return {
      mode,
      value: asInteger(current.value, mode === 'repeat' ? 1 : 0, mode === 'repeat' ? 1 : 0, mode === 'repeat' ? MAX_COUNTER_ROW : 99),
      repeatName: repeatName || fallback.repeatName,
      startRow: asInteger(current.startRow, fallback.startRow, 1, MAX_COUNTER_ROW),
      repeatLength: asInteger(current.repeatLength, fallback.repeatLength, 1, MAX_COUNTER_ROW),
      repeatCount,
      taskRules: rules,
      taskOccurrences: [...uniqueOccurrences.values()],
    }
  })
}

export function createCounterTaskRule(kind: CounterTaskKind = 'decrease'): CounterTaskRule {
  return { id: crypto.randomUUID(), kind, interval: 6, total: 8 }
}

export function counterTaskKey(ruleId: string, occurrence: number) {
  return ruleId + ':' + occurrence
}

export function counterPatternState(counter: CounterSnapshot): { kind: 'before' } | { kind: 'complete' } | { kind: 'active'; patternRow: number; repeatNumber: number } {
  if (counter.value < counter.startRow) return { kind: 'before' }
  const offset = counter.value - counter.startRow
  const repeatNumber = Math.floor(offset / counter.repeatLength) + 1
  if (counter.repeatCount !== null && repeatNumber > counter.repeatCount) return { kind: 'complete' }
  return { kind: 'active', patternRow: offset % counter.repeatLength + 1, repeatNumber }
}

export interface DueCounterTask {
  rule: CounterTaskRule
  occurrence: number
  status?: CounterTaskStatus
}

export function dueCounterTasks(counter: CounterSnapshot): DueCounterTask[] {
  if (counter.mode !== 'repeat') return []
  return counter.taskRules.flatMap((rule) => {
    if (counter.value % rule.interval !== 0) return []
    const occurrence = counter.value / rule.interval
    if (occurrence > rule.total) return []
    const saved = counter.taskOccurrences.find((item) => item.ruleId === rule.id && item.occurrence === occurrence)
    return [{ rule, occurrence, status: saved?.status }]
  })
}

export function counterTaskProgress(counter: CounterSnapshot, rule: CounterTaskRule) {
  const completed = counter.taskOccurrences.filter((item) => item.ruleId === rule.id && item.status === 'done').length
  const missed = counter.taskOccurrences.filter((item) => item.ruleId === rule.id && item.status === 'missed').length
  return { completed, missed, remaining: Math.max(0, rule.total - completed) }
}

export function setCounterTaskOccurrences(counter: CounterSnapshot, tasks: DueCounterTask[], status?: CounterTaskStatus): CounterSnapshot {
  const keys = new Set(tasks.map((task) => counterTaskKey(task.rule.id, task.occurrence)))
  const remaining = counter.taskOccurrences.filter((item) => !keys.has(counterTaskKey(item.ruleId, item.occurrence)))
  if (status) tasks.forEach((task) => remaining.push({ ruleId: task.rule.id, occurrence: task.occurrence, status }))
  return { ...counter, taskOccurrences: remaining }
}
