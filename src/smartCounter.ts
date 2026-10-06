import type { CounterHistoryEntry, CounterKind, CounterSnapshot, CounterTaskKind, CounterTaskOccurrence, CounterTaskRule, CounterTaskStatus, ProgressGuide } from './types'

export const COUNTER_COUNT = 5
export const MAX_COUNTER_ROW = 9999
export const MAX_COUNTER_TASK_RULES = 10
export const MAX_COUNTERS_PER_TYPE = 5
export const MAX_COUNTERS = 80
export const MAX_COUNTER_HISTORY = 200
const MAX_COUNTER_TASK_OCCURRENCES = MAX_COUNTER_ROW * MAX_COUNTER_TASK_RULES

type LegacyCounter = {
  mode?: unknown
  value?: unknown
  repeatName?: unknown
  startRow?: unknown
  repeatLength?: unknown
  repeatCount?: unknown
  taskRules?: unknown
  taskOccurrences?: unknown
}

export function createDefaultCounters(): CounterSnapshot[] {
  return []
}

export function createCounter(kind: CounterKind, name?: string): CounterSnapshot {
  const id = crypto.randomUUID()
  const color = kind === 'simple' ? '#2673e8' : kind === 'pattern' ? '#8266c2' : '#df8545'
  const common = { id, kind, name: name?.trim() || defaultName(kind), color, pinned: false, value: kind === 'task' ? 0 : 1 }
  if (kind === 'simple') return { ...common, unit: 'row' }
  if (kind === 'pattern') return { ...common, currentRow: 1, patternRow: 1, repeatLength: 1, startRow: 1, instructions: [] }
  return { ...common, currentRow: 1, taskKind: 'decrease', firstTaskRow: 4, interval: 6, total: 4, completedCount: 0, nextTaskRow: 4, taskRecords: [] }
}

function defaultName(kind: CounterKind) {
  return kind === 'simple' ? '단순 카운터' : kind === 'pattern' ? '무늬 카운터' : '줄임·늘림 카운터'
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function integer(value: unknown, fallback: number, min = 0, max = MAX_COUNTER_ROW) {
  return Number.isSafeInteger(value) ? Math.max(min, Math.min(max, Number(value))) : fallback
}

function isLegacyCounter(value: unknown): value is LegacyCounter {
  return isObject(value) && (value.mode === 'simple' || value.mode === 'repeat')
}

function isLegacyTaskRule(value: unknown): value is CounterTaskRule {
  if (!isObject(value)) return false
  return typeof value.id === 'string' && (value.kind === 'decrease' || value.kind === 'increase') &&
    Number.isSafeInteger(value.interval) && Number(value.interval) >= 1 && Number.isSafeInteger(value.total) && Number(value.total) >= 1
}

function isLegacyOccurrence(value: unknown, ruleIds: Set<string>): value is CounterTaskOccurrence {
  return isObject(value) && typeof value.ruleId === 'string' && ruleIds.has(value.ruleId) && Number.isSafeInteger(value.occurrence) &&
    Number(value.occurrence) >= 1 && (value.status === 'done' || value.status === 'missed')
}

export function isCurrentCounterSnapshots(value: unknown): value is CounterSnapshot[] {
  if (!Array.isArray(value) || value.length > MAX_COUNTERS || !value.every(isObject)) return false
  const ids = new Set<string>()
  const counts: Record<CounterKind, number> = { simple: 0, pattern: 0, task: 0 }
  for (const raw of value) {
    const counter = raw as Record<string, unknown>
    if (typeof counter.id !== 'string' || !counter.id || counter.id.length > 100 || ids.has(counter.id) ||
      !['simple', 'pattern', 'task'].includes(String(counter.kind)) || typeof counter.name !== 'string' || counter.name.length < 1 || counter.name.length > 100 || typeof counter.color !== 'string' || !/^#[\da-f]{6}$/i.test(counter.color) ||
      typeof counter.pinned !== 'boolean' || !Number.isSafeInteger(counter.value) || Number(counter.value) < 0 || Number(counter.value) > MAX_COUNTER_ROW ||
      (counter.linkedToId !== undefined && (typeof counter.linkedToId !== 'string' || counter.linkedToId.length > 100)) ||
      (counter.legacyOverflow !== undefined && typeof counter.legacyOverflow !== 'boolean')) return false
    ids.add(counter.id)
    counts[counter.kind as CounterKind]++
    if (counter.kind === 'simple' && !['row', 'stitch', 'round'].includes(String(counter.unit))) return false
    if (counter.kind === 'pattern' && (!Number.isSafeInteger(counter.currentRow) || Number(counter.currentRow) < 1 ||
      !Number.isSafeInteger(counter.patternRow) || Number(counter.patternRow) < 1 ||
      !Number.isSafeInteger(counter.repeatLength) || Number(counter.repeatLength) < 1 ||
      !Number.isSafeInteger(counter.startRow) || Number(counter.startRow) < 1 ||
      !(counter.repeatCount === undefined || counter.repeatCount === null || Number.isSafeInteger(counter.repeatCount) && Number(counter.repeatCount) >= 1) ||
      !(counter.repeatStartNumber === undefined || Number.isSafeInteger(counter.repeatStartNumber) && Number(counter.repeatStartNumber) >= 1) ||
      (counter.instructions !== undefined && (!Array.isArray(counter.instructions) || !counter.instructions.every((item) => isObject(item) && typeof item.id === 'string' && Number.isSafeInteger(item.row) && Number(item.row) >= 1 && typeof item.message === 'string' && item.message.length <= 2000))))) return false
    if (counter.kind === 'task' && (!['decrease', 'increase'].includes(String(counter.taskKind)) || !Number.isSafeInteger(counter.currentRow) || Number(counter.currentRow) < 1 ||
      !Number.isSafeInteger(counter.firstTaskRow) || Number(counter.firstTaskRow) < 1 || !Number.isSafeInteger(counter.interval) || Number(counter.interval) < 1 ||
      !Number.isSafeInteger(counter.total) || Number(counter.total) < 1 || !Number.isSafeInteger(counter.completedCount) || Number(counter.completedCount) < 0 ||
      !Number.isSafeInteger(counter.nextTaskRow) || Number(counter.nextTaskRow) < 1 || !Array.isArray(counter.taskRecords) ||
      !counter.taskRecords.every((item) => isObject(item) && Number.isSafeInteger(item.row) && Number(item.row) >= 1 && (item.status === 'done' || item.status === 'missed')))) return false
  }
  for (const kind of ['simple', 'pattern', 'task'] as const) {
    const items = value.filter((item) => (item as Record<string, unknown>).kind === kind) as Record<string, unknown>[]
    if (items.length > MAX_COUNTERS_PER_TYPE && items.filter((item) => item.legacyOverflow === true).length < items.length - MAX_COUNTERS_PER_TYPE) return false
  }
  return value.every((raw) => {
    const counter = raw as Record<string, unknown>
    return counter.linkedToId === undefined || counter.linkedToId !== counter.id && value.some((candidate) => {
      const base = candidate as Record<string, unknown>
      return base.id === counter.linkedToId && base.kind === 'simple' && base.unit === 'row'
    })
  })
}

export function isLegacyCounterSnapshots(value: unknown): boolean {
  if (!Array.isArray(value) || value.length !== 5 || !value.every(isLegacyCounter)) return false
  return value.every((raw) => {
    const counter = raw as LegacyCounter
    return Number.isSafeInteger(counter.value) && typeof counter.repeatName === 'string' && Array.isArray(counter.taskRules) && counter.taskRules.every(isLegacyTaskRule) &&
      Array.isArray(counter.taskOccurrences) && counter.taskOccurrences.every((item) => isLegacyOccurrence(item, new Set((counter.taskRules as CounterTaskRule[]).map((rule) => rule.id))))
  })
}

export function isCounterSnapshots(value: unknown): value is CounterSnapshot[] {
  return isCurrentCounterSnapshots(value) || isLegacyCounterSnapshots(value)
}

function migrateLegacyCounters(value: unknown): CounterSnapshot[] {
  if (!Array.isArray(value) || !value.length || !value.every(isLegacyCounter)) return []
  const entries = value as LegacyCounter[]
  const isUnusedDefaults = entries.every((entry) => entry.mode === 'simple' && entry.value === 0 && (!Array.isArray(entry.taskRules) || !entry.taskRules.length))
  if (isUnusedDefaults) return []
  const result: CounterSnapshot[] = []
  entries.forEach((entry, index) => {
    const sourceId = 'legacy-counter-' + index
    const valueNumber = integer(entry.value, entry.mode === 'repeat' ? 1 : 0, entry.mode === 'repeat' ? 1 : 0)
    if (entry.mode === 'simple') {
      result.push({ id: sourceId, kind: 'simple', name: '카운터 ' + (index + 1), color: '#2673e8', pinned: false, value: valueNumber, unit: 'row' })
      return
    }
    const oldRules = Array.isArray(entry.taskRules) ? entry.taskRules.filter(isLegacyTaskRule).slice(0, MAX_COUNTER_TASK_RULES) : []
    const ruleIds = new Set(oldRules.map((rule) => rule.id))
    const oldOccurrences = Array.isArray(entry.taskOccurrences) ? entry.taskOccurrences.filter((item) => isLegacyOccurrence(item, ruleIds)) : []
    const repeatLength = integer(entry.repeatLength, 12, 1)
    const startRow = integer(entry.startRow, 1, 1)
    const offset = Math.max(0, valueNumber - startRow)
    const baseId = sourceId + '-row'
    result.push({ id: baseId, kind: 'simple', name: (typeof entry.repeatName === 'string' && entry.repeatName.trim() || '무늬') + ' 단', color: '#2673e8', pinned: false, value: valueNumber, unit: 'row' })
    const pattern: CounterSnapshot = {
      id: sourceId, kind: 'pattern', name: typeof entry.repeatName === 'string' && entry.repeatName.trim() ? entry.repeatName.trim().slice(0, 100) : '무늬', color: '#8266c2',
      pinned: false, linkedToId: baseId, value: offset % repeatLength + 1, currentRow: valueNumber, patternRow: offset % repeatLength + 1,
      repeatLength, startRow, ...(Number.isSafeInteger(entry.repeatCount) && Number(entry.repeatCount) > 0 ? { repeatCount: Number(entry.repeatCount) } : {}), instructions: [],
    }
    result.push(pattern)
    for (const rule of oldRules) {
      const records = oldOccurrences.filter((item) => item.ruleId === rule.id).map((item) => ({ row: item.occurrence * rule.interval, status: item.status }))
      const nextTaskRow = rule.interval + Math.max(0, Math.ceil((valueNumber - rule.interval) / rule.interval)) * rule.interval
      const taskId = sourceId + '-task-' + rule.id
      result.push({
        id: taskId, kind: 'task', name: (rule.kind === 'decrease' ? '줄임' : '늘림') + ' ' + (result.filter((item) => item.kind === 'task' && item.taskKind === rule.kind).length + 1), color: '#df8545',
        pinned: false, linkedToId: baseId, value: records.filter((item) => item.status === 'done').length,
        currentRow: valueNumber, taskKind: rule.kind, firstTaskRow: rule.interval, interval: rule.interval, total: rule.total,
        completedCount: records.filter((item) => item.status === 'done').length, nextTaskRow, taskRecords: records,
      })
    }
    // The old counter advanced from the currently displayed row after completion.
    if (pattern.repeatCount !== undefined && pattern.repeatCount !== null) pattern.repeatStartNumber = 1
  })
  const counts = { simple: 0, pattern: 0, task: 0 }
  result.forEach((counter) => {
    counts[counter.kind]++
    if (counts[counter.kind] > MAX_COUNTERS_PER_TYPE) counter.legacyOverflow = true
  })
  return result
}

function normalizeNewCounter(value: unknown): CounterSnapshot | null {
  if (!isObject(value) || !['simple', 'pattern', 'task'].includes(String(value.kind))) return null
  const kind = value.kind as CounterKind
  const id = typeof value.id === 'string' && value.id ? value.id.slice(0, 100) : crypto.randomUUID()
  const name = typeof value.name === 'string' && value.name.trim() ? value.name.trim().slice(0, 100) : defaultName(kind)
  const common: CounterSnapshot = {
    id, kind, name, color: typeof value.color === 'string' && /^#[\da-f]{6}$/i.test(value.color) ? value.color : kind === 'simple' ? '#2673e8' : kind === 'pattern' ? '#8266c2' : '#df8545', pinned: value.pinned === true,
    value: integer(value.value, kind === 'pattern' ? 1 : 0, 0),
    ...(typeof value.linkedToId === 'string' ? { linkedToId: value.linkedToId.slice(0, 100) } : {}),
    ...(value.legacyOverflow === true ? { legacyOverflow: true } : {}),
  }
  if (kind === 'simple') return { ...common, unit: value.unit === 'stitch' || value.unit === 'round' ? value.unit : 'row' }
  if (kind === 'pattern') {
    const repeatLength = integer(value.repeatLength, 1, 1)
    const instructions = Array.isArray(value.instructions) ? value.instructions.filter((item) => isObject(item) && typeof item.id === 'string' && Number.isSafeInteger(item.row) && Number(item.row) >= 1 && typeof item.message === 'string').slice(0, 40).map((item) => ({ id: String(item.id).slice(0, 100), row: integer(item.row, 1, 1), message: String(item.message).slice(0, 2000) })) : []
    return { ...common, value: integer(value.value, 1, 1), currentRow: integer(value.currentRow, 1, 1), patternRow: integer(value.patternRow, 1, 1, repeatLength), repeatLength, startRow: integer(value.startRow, 1, 1), ...(Number.isSafeInteger(value.repeatStartNumber) && Number(value.repeatStartNumber) > 0 ? { repeatStartNumber: integer(value.repeatStartNumber, 1, 1) } : {}), ...(value.repeatCount === null ? { repeatCount: null } : Number.isSafeInteger(value.repeatCount) ? { repeatCount: integer(value.repeatCount, 1, 1) } : {}), instructions }
  }
  const taskKind: CounterTaskKind = value.taskKind === 'increase' ? 'increase' : 'decrease'
  const taskRecords = Array.isArray(value.taskRecords) ? value.taskRecords.filter((item) => isObject(item) && Number.isSafeInteger(item.row) && Number(item.row) > 0 && (item.status === 'done' || item.status === 'missed')).slice(-MAX_COUNTER_TASK_OCCURRENCES).map((item) => ({ row: integer(item.row, 1, 1), status: item.status as CounterTaskStatus })) : []
  const completedCount = integer(value.completedCount, taskRecords.filter((item) => item.status === 'done').length)
  return { ...common, value: completedCount, currentRow: integer(value.currentRow, 1, 1), taskKind, firstTaskRow: integer(value.firstTaskRow, 1, 1), interval: integer(value.interval, 1, 1), total: integer(value.total, 1, 1), completedCount, nextTaskRow: integer(value.nextTaskRow, 1, 1), taskRecords }
}

export function normalizeCounterSnapshots(value: unknown): CounterSnapshot[] {
  if (!Array.isArray(value)) return []
  const legacy = value.some(isLegacyCounter)
  if (legacy) return migrateLegacyCounters(value)
  const result: CounterSnapshot[] = []
  const ids = new Set<string>()
  for (const candidate of value.slice(0, MAX_COUNTERS)) {
    const counter = normalizeNewCounter(candidate)
    if (!counter || ids.has(counter.id)) continue
    ids.add(counter.id)
    result.push(counter)
  }
  return result.map((counter) => counter.linkedToId && !result.some((base) => base.id === counter.linkedToId && base.kind === 'simple' && base.unit === 'row')
    ? { ...counter, linkedToId: undefined }
    : counter)
}

export function counterPatternState(counter: CounterSnapshot) {
  if (counter.kind !== 'pattern') return { kind: 'before' as const }
  return { kind: 'active' as const, patternRow: counter.patternRow ?? 1, ...(counter.repeatStartNumber === undefined ? {} : { repeatNumber: counter.repeatStartNumber }) }
}

export function nextPatternRow(counter: CounterSnapshot) {
  if (counter.kind !== 'pattern') return 1
  return (counter.patternRow ?? 1) % (counter.repeatLength ?? 1) + 1
}

export function patternRowAfterCompletion(counter: CounterSnapshot, completedRow: number) {
  if (counter.kind !== 'pattern') return 1
  const nextRow = completedRow + 1
  if (nextRow < (counter.startRow ?? 1)) return counter.patternRow ?? 1
  if (nextRow === (counter.startRow ?? 1)) return 1
  return nextPatternRow(counter)
}

export function taskSchedule(counter: CounterSnapshot, count = 4) {
  if (counter.kind !== 'task') return []
  const first = counter.nextTaskRow ?? counter.firstTaskRow ?? 1
  const interval = counter.interval ?? 1
  const total = counter.total ?? count
  return Array.from({ length: Math.min(count, Math.max(0, total - (counter.completedCount ?? 0))) }, (_, index) => first + interval * index)
}

export function advanceLinkedCounters(counters: CounterSnapshot[], baseCounterId: string, row: number): CounterSnapshot[] {
  return counters.map((counter) => {
    if (counter.id === baseCounterId && counter.kind === 'simple' && counter.unit === 'row') return { ...counter, value: Math.min(MAX_COUNTER_ROW, counter.value + 1) }
    if (counter.linkedToId !== baseCounterId) return counter
    if (counter.kind === 'pattern') {
      const patternRow = patternRowAfterCompletion(counter, row)
      return { ...counter, currentRow: row + 1, patternRow, value: patternRow }
    }
    if (counter.kind === 'task') {
      const due = row === counter.nextTaskRow
      const taskRecords = due ? [...(counter.taskRecords ?? []), { row, status: 'done' as const }].slice(-MAX_COUNTER_TASK_OCCURRENCES) : counter.taskRecords ?? []
      return { ...counter, currentRow: row + 1, value: (counter.completedCount ?? 0) + (due ? 1 : 0), completedCount: (counter.completedCount ?? 0) + (due ? 1 : 0), nextTaskRow: due && (counter.completedCount ?? 0) + 1 < (counter.total ?? 0) ? row + (counter.interval ?? 1) : counter.nextTaskRow, taskRecords }
    }
    if (counter.kind === 'simple') return { ...counter, value: Math.min(MAX_COUNTER_ROW, counter.value + 1) }
    return counter
  })
}

export function setCounterGroupRow(counters: CounterSnapshot[], baseCounterId: string, nextRow: number): CounterSnapshot[] {
  const base = counters.find((counter) => counter.id === baseCounterId)
  if (!base || base.kind !== 'simple' || base.unit !== 'row' || base.linkedToId) return counters
  const boundedRow = Math.max(1, Math.min(MAX_COUNTER_ROW, Math.trunc(nextRow)))
  const delta = boundedRow - base.value
  return counters.map((counter) => {
    if (counter.id === baseCounterId) return { ...counter, value: boundedRow }
    if (counter.linkedToId !== baseCounterId) return counter
    if (counter.kind === 'pattern') {
      const start = counter.startRow ?? 1
      const length = counter.repeatLength ?? 1
      const patternRow = boundedRow < start ? 1 : ((boundedRow - start) % length) + 1
      return { ...counter, currentRow: boundedRow, patternRow, value: patternRow }
    }
    if (counter.kind === 'task') {
      const first = counter.firstTaskRow ?? 1
      const interval = counter.interval ?? 1
      const taskRecords = (counter.taskRecords ?? []).filter((record) => record.row < boundedRow)
      const completedCount = taskRecords.filter((record) => record.status === 'done').length
      const nextTaskRow = first + Math.max(0, Math.ceil((boundedRow - first) / interval)) * interval
      return { ...counter, currentRow: boundedRow, taskRecords, completedCount, value: completedCount, nextTaskRow: Math.min(MAX_COUNTER_ROW, nextTaskRow) }
    }
    return { ...counter, value: Math.max(0, Math.min(MAX_COUNTER_ROW, counter.value + delta)) }
  })
}

export interface DueCounterTask {
  counter: CounterSnapshot
  row: number
}

export function dueCounterTasks(counters: CounterSnapshot[], row: number): DueCounterTask[] {
  return counters.filter((counter) => counter.kind === 'task' && counter.nextTaskRow === row && (counter.completedCount ?? 0) < (counter.total ?? 0)).map((counter) => ({ counter, row }))
}

export function counterTaskProgress(counter: CounterSnapshot) {
  const completed = counter.kind === 'task' ? counter.completedCount ?? 0 : 0
  const missed = counter.kind === 'task' ? (counter.taskRecords ?? []).filter((item) => item.status === 'missed').length : 0
  return { completed, missed, remaining: Math.max(0, (counter.total ?? 0) - completed) }
}

export function shouldPlayCounterTaskSound(history: CounterHistoryEntry | undefined, baseName: string, currentRow: number, previousHistoryId: string | null, previousRow: number | null) {
  return Boolean(history && history.id !== previousHistoryId && history.label.startsWith(baseName + ' · ') && history.actualRow === currentRow - 1 && history.label.endsWith('단 완료') && previousRow !== currentRow)
}

export function createCounterTaskRule(kind: CounterTaskKind = 'decrease'): CounterTaskRule {
  return { id: crypto.randomUUID(), kind, interval: 6, total: 8 }
}

export function counterTaskKey(ruleId: string, occurrence: number) {
  return ruleId + ':' + occurrence
}

export function setCounterTaskOccurrences(counter: CounterSnapshot, tasks: DueCounterTask[], status?: CounterTaskStatus): CounterSnapshot {
  if (counter.kind !== 'task') return counter
  const rows = new Set(tasks.map((task) => task.row))
  const remaining = (counter.taskRecords ?? []).filter((item) => !rows.has(item.row))
  if (status) tasks.forEach((task) => remaining.push({ row: task.row, status }))
  const completedCount = remaining.filter((item) => item.status === 'done').length
  return { ...counter, taskRecords: remaining, completedCount, value: completedCount }
}

export function maxCountersForType(counters: CounterSnapshot[], kind: CounterKind) {
  return counters.filter((counter) => counter.kind === kind).length
}

export function guidePositionForRow(guide: ProgressGuide, row: number) {
  const region = guide.chartRegion
  if (!region) return guide.position
  const rowCount = Math.max(1, region.lastRow - region.firstRow + 1)
  let index = row - region.startCounterRow
  if (region.repeat) index = ((index % rowCount) + rowCount) % rowCount
  else index = Math.max(0, Math.min(rowCount - 1, index))
  if (region.rowPositions?.length === rowCount) return region.rowPositions[index]
  const fraction = rowCount < 2 ? 0 : index / (rowCount - 1)
  const direction = region.direction === 'bottom-to-top' ? 1 - fraction : fraction
  return region.y + region.height * direction
}

export function progressGuideForCounter(guide: ProgressGuide, counter: CounterSnapshot): ProgressGuide {
  const row = counter.kind === 'simple' ? counter.value : counter.currentRow ?? 1
  return { ...guide, name: counter.name, color: counter.color, position: guidePositionForRow(guide, row) }
}
