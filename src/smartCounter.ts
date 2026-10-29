import type { CounterHistoryEntry, CounterKind, CounterSnapshot, CounterTaskKind, CounterTaskOccurrence, CounterTaskRule, CounterTaskStatus, ProgressGuide } from './types'
import { guideRowPosition } from './progressLines'
import { guideGeometryForRotation } from './focusGeometry'
import { DEFAULT_COUNTER_COLORS } from './designTokens'

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
  const color = DEFAULT_COUNTER_COLORS[kind]
  const common = { id, kind, name: name?.trim() || defaultName(kind), color, pinned: false, value: kind === 'task' || kind === 'repeat' ? 0 : 1 }
  if (kind === 'simple') return { ...common, unit: 'row', knittingMode: 'flat', firstSide: 'rs', goalAlertEnabled: true }
  if (kind === 'pattern') return { ...common, currentRow: 1, patternRow: 1, repeatLength: 1, startRow: 1, instructions: [], patternAlertEnabled: true }
  if (kind === 'repeat') return { ...common, repeatStartRow: 1, repeatEndRow: 2, repeatTarget: 5 }
  return { ...common, currentRow: 1, taskKind: 'decrease', firstTaskRow: 4, interval: 6, total: 4, completedCount: 0, nextTaskRow: 4, taskRecords: [] }
}

function defaultName(kind: CounterKind) {
  return kind === 'simple' ? '단순 카운터' : kind === 'pattern' ? '무늬 카운터' : kind === 'task' ? '줄임·늘림 카운터' : '반복 카운터'
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
  const counts: Record<CounterKind, number> = { simple: 0, pattern: 0, task: 0, repeat: 0 }
  for (const raw of value) {
    const counter = raw as Record<string, unknown>
    if (typeof counter.id !== 'string' || !counter.id || counter.id.length > 100 || ids.has(counter.id) ||
      !['simple', 'pattern', 'task', 'repeat'].includes(String(counter.kind)) || typeof counter.name !== 'string' || counter.name.length < 1 || counter.name.length > 100 || typeof counter.color !== 'string' || !/^#[\da-f]{6}$/i.test(counter.color) ||
      typeof counter.pinned !== 'boolean' || !Number.isSafeInteger(counter.value) || Number(counter.value) < 0 || Number(counter.value) > MAX_COUNTER_ROW ||
      (counter.linkedToId !== undefined && (typeof counter.linkedToId !== 'string' || counter.linkedToId.length > 100)) ||
      (counter.legacyOverflow !== undefined && typeof counter.legacyOverflow !== 'boolean') ||
      (counter.knittingMode !== undefined && counter.knittingMode !== 'flat' && counter.knittingMode !== 'round')) return false
    ids.add(counter.id)
    counts[counter.kind as CounterKind]++
    if (counter.kind === 'simple' && !['row', 'stitch', 'round'].includes(String(counter.unit))) return false
    if (counter.kind === 'simple' && (counter.goalRow !== undefined && counter.goalRow !== null && (!Number.isSafeInteger(counter.goalRow) || Number(counter.goalRow) < 1 || Number(counter.goalRow) > MAX_COUNTER_ROW) || counter.goalFinalSide !== undefined && counter.goalFinalSide !== 'rs' && counter.goalFinalSide !== 'ws' || counter.firstSide !== undefined && counter.firstSide !== 'rs' && counter.firstSide !== 'ws' || counter.goalAlertEnabled !== undefined && typeof counter.goalAlertEnabled !== 'boolean' || counter.goalCompleted !== undefined && typeof counter.goalCompleted !== 'boolean')) return false
    if (counter.kind === 'pattern' && (!Number.isSafeInteger(counter.currentRow) || Number(counter.currentRow) < 1 ||
      !Number.isSafeInteger(counter.patternRow) || Number(counter.patternRow) < 1 ||
      !Number.isSafeInteger(counter.repeatLength) || Number(counter.repeatLength) < 1 ||
      !Number.isSafeInteger(counter.startRow) || Number(counter.startRow) < 1 ||
      !(counter.repeatCount === undefined || counter.repeatCount === null || Number.isSafeInteger(counter.repeatCount) && Number(counter.repeatCount) >= 1) ||
      !(counter.repeatStartNumber === undefined || Number.isSafeInteger(counter.repeatStartNumber) && Number(counter.repeatStartNumber) >= 1) ||
      (counter.patternAlertEnabled !== undefined && typeof counter.patternAlertEnabled !== 'boolean') ||
      (counter.patternPreviewEnabled !== undefined && typeof counter.patternPreviewEnabled !== 'boolean') ||
      (counter.instructions !== undefined && (!Array.isArray(counter.instructions) || !counter.instructions.every((item) => isObject(item) && typeof item.id === 'string' && Number.isSafeInteger(item.row) && Number(item.row) >= 1 && typeof item.message === 'string' && item.message.length <= 2000))))) return false
    if (counter.kind === 'task' && (!['decrease', 'increase'].includes(String(counter.taskKind)) || !Number.isSafeInteger(counter.currentRow) || Number(counter.currentRow) < 1 ||
      !Number.isSafeInteger(counter.firstTaskRow) || Number(counter.firstTaskRow) < 1 || !Number.isSafeInteger(counter.interval) || Number(counter.interval) < 1 ||
      !Number.isSafeInteger(counter.total) || Number(counter.total) < 1 || !Number.isSafeInteger(counter.completedCount) || Number(counter.completedCount) < 0 ||
      !Number.isSafeInteger(counter.nextTaskRow) || Number(counter.nextTaskRow) < 1 || !Array.isArray(counter.taskRecords) ||
      !counter.taskRecords.every((item) => isObject(item) && Number.isSafeInteger(item.row) && Number(item.row) >= 1 && (item.status === 'done' || item.status === 'missed')))) return false
    if (counter.kind === 'repeat' && (counter.linkedToId !== undefined || !Number.isSafeInteger(counter.repeatStartRow) || Number(counter.repeatStartRow) < 1 || Number(counter.repeatStartRow) > MAX_COUNTER_ROW ||
      !Number.isSafeInteger(counter.repeatEndRow) || Number(counter.repeatEndRow) < Number(counter.repeatStartRow) || Number(counter.repeatEndRow) > MAX_COUNTER_ROW ||
      !Number.isSafeInteger(counter.repeatTarget) || Number(counter.repeatTarget) < 1 ||
      (Number(counter.repeatEndRow) - Number(counter.repeatStartRow) + 1) * Number(counter.repeatTarget) > MAX_COUNTER_ROW ||
      Number(counter.value) > (Number(counter.repeatEndRow) - Number(counter.repeatStartRow) + 1) * Number(counter.repeatTarget) ||
      (counter.repeatLinkedToId !== undefined && (typeof counter.repeatLinkedToId !== 'string' || counter.repeatLinkedToId.length > 100)))) return false
  }
  for (const kind of ['simple', 'pattern', 'task', 'repeat'] as const) {
    const items = value.filter((item) => (item as Record<string, unknown>).kind === kind) as Record<string, unknown>[]
    if (items.length > MAX_COUNTERS_PER_TYPE && items.filter((item) => item.legacyOverflow === true).length < items.length - MAX_COUNTERS_PER_TYPE) return false
  }
  return value.every((raw) => {
    const counter = raw as Record<string, unknown>
    return counter.linkedToId === undefined || counter.linkedToId !== counter.id && value.some((candidate) => {
      const base = candidate as Record<string, unknown>
      return base.id === counter.linkedToId && base.kind === 'simple' && base.unit === 'row'
    })
  }) && value.every((raw) => {
    const counter = raw as Record<string, unknown>
    return counter.kind !== 'repeat' || counter.repeatLinkedToId === undefined || counter.repeatLinkedToId !== counter.id && value.some((candidate) => {
      const base = candidate as Record<string, unknown>
      return base.id === counter.repeatLinkedToId && base.kind === 'simple' && base.unit === 'row' && base.linkedToId === undefined
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
       result.push({ id: sourceId, kind: 'simple', name: '카운터 ' + (index + 1), color: DEFAULT_COUNTER_COLORS.simple, pinned: false, value: valueNumber, unit: 'row', knittingMode: 'flat' })
      return
    }
    const oldRules = Array.isArray(entry.taskRules) ? entry.taskRules.filter(isLegacyTaskRule).slice(0, MAX_COUNTER_TASK_RULES) : []
    const ruleIds = new Set(oldRules.map((rule) => rule.id))
    const oldOccurrences = Array.isArray(entry.taskOccurrences) ? entry.taskOccurrences.filter((item) => isLegacyOccurrence(item, ruleIds)) : []
    const repeatLength = integer(entry.repeatLength, 12, 1)
    const startRow = integer(entry.startRow, 1, 1)
    const offset = Math.max(0, valueNumber - startRow)
    const baseId = sourceId + '-row'
    result.push({ id: baseId, kind: 'simple', name: (typeof entry.repeatName === 'string' && entry.repeatName.trim() || '무늬') + ' 단', color: DEFAULT_COUNTER_COLORS.simple, pinned: false, value: valueNumber, unit: 'row' })
    const pattern: CounterSnapshot = {
      id: sourceId, kind: 'pattern', name: typeof entry.repeatName === 'string' && entry.repeatName.trim() ? entry.repeatName.trim().slice(0, 100) : '무늬', color: DEFAULT_COUNTER_COLORS.pattern,
      pinned: false, linkedToId: baseId, value: offset % repeatLength + 1, currentRow: valueNumber, patternRow: offset % repeatLength + 1,
      repeatLength, startRow, ...(Number.isSafeInteger(entry.repeatCount) && Number(entry.repeatCount) > 0 ? { repeatCount: Number(entry.repeatCount) } : {}), instructions: [],
    }
    result.push(pattern)
    for (const rule of oldRules) {
      const records = oldOccurrences.filter((item) => item.ruleId === rule.id).map((item) => ({ row: item.occurrence * rule.interval, status: item.status }))
      const nextTaskRow = rule.interval + Math.max(0, Math.ceil((valueNumber - rule.interval) / rule.interval)) * rule.interval
      const taskId = sourceId + '-task-' + rule.id
      result.push({
        id: taskId, kind: 'task', name: (rule.kind === 'decrease' ? '줄임' : '늘림') + ' ' + (result.filter((item) => item.kind === 'task' && item.taskKind === rule.kind).length + 1), color: DEFAULT_COUNTER_COLORS.task,
        pinned: false, linkedToId: baseId, value: records.filter((item) => item.status === 'done').length,
        currentRow: valueNumber, taskKind: rule.kind, firstTaskRow: rule.interval, interval: rule.interval, total: rule.total,
        completedCount: records.filter((item) => item.status === 'done').length, nextTaskRow, taskRecords: records,
      })
    }
    // The old counter advanced from the currently displayed row after completion.
    if (pattern.repeatCount !== undefined && pattern.repeatCount !== null) pattern.repeatStartNumber = 1
  })
  const counts = { simple: 0, pattern: 0, task: 0, repeat: 0 }
  result.forEach((counter) => {
    counts[counter.kind]++
    if (counts[counter.kind] > MAX_COUNTERS_PER_TYPE) counter.legacyOverflow = true
  })
  return result
}

function normalizeNewCounter(value: unknown): CounterSnapshot | null {
  if (!isObject(value) || !['simple', 'pattern', 'task', 'repeat'].includes(String(value.kind))) return null
  const kind = value.kind as CounterKind
  const id = typeof value.id === 'string' && value.id ? value.id.slice(0, 100) : crypto.randomUUID()
  const name = typeof value.name === 'string' && value.name.trim() ? value.name.trim().slice(0, 100) : defaultName(kind)
  const common: CounterSnapshot = {
    id, kind, name, color: typeof value.color === 'string' && /^#[\da-f]{6}$/i.test(value.color) ? value.color : DEFAULT_COUNTER_COLORS[kind], pinned: value.pinned === true,
    value: integer(value.value, kind === 'pattern' ? 1 : 0, 0),
    ...(kind !== 'repeat' && typeof value.linkedToId === 'string' ? { linkedToId: value.linkedToId.slice(0, 100) } : {}),
    ...(value.legacyOverflow === true ? { legacyOverflow: true } : {}),
  }
  if (kind === 'simple') return {
    ...common,
    unit: 'row',
    knittingMode: value.knittingMode === 'round' ? 'round' : 'flat',
    ...(value.goalRow === null ? { goalRow: null } : Number.isSafeInteger(value.goalRow) && Number(value.goalRow) > 0 ? { goalRow: integer(value.goalRow, 1, 1) } : {}),
    ...(value.goalFinalSide === 'rs' || value.goalFinalSide === 'ws' ? { goalFinalSide: value.goalFinalSide } : {}),
    firstSide: value.firstSide === 'ws' ? 'ws' : 'rs',
    goalAlertEnabled: value.goalAlertEnabled !== false,
    goalCompleted: value.goalCompleted === true,
  }
  if (kind === 'pattern') {
    const repeatLength = integer(value.repeatLength, 1, 1)
    const instructions = Array.isArray(value.instructions) ? value.instructions.filter((item) => isObject(item) && typeof item.id === 'string' && Number.isSafeInteger(item.row) && Number(item.row) >= 1 && typeof item.message === 'string').slice(0, 40).map((item) => ({ id: String(item.id).slice(0, 100), row: integer(item.row, 1, 1), message: String(item.message).slice(0, 2000) })) : []
    return { ...common, value: integer(value.value, 1, 1), currentRow: integer(value.currentRow, 1, 1), patternRow: integer(value.patternRow, 1, 1, repeatLength), repeatLength, startRow: integer(value.startRow, 1, 1), ...(Number.isSafeInteger(value.repeatStartNumber) && Number(value.repeatStartNumber) > 0 ? { repeatStartNumber: integer(value.repeatStartNumber, 1, 1) } : {}), ...(value.repeatCount === null ? { repeatCount: null } : Number.isSafeInteger(value.repeatCount) ? { repeatCount: integer(value.repeatCount, 1, 1) } : {}), patternAlertEnabled: value.patternAlertEnabled !== false, patternPreviewEnabled: value.patternPreviewEnabled === true, instructions }
  }
  if (kind === 'repeat') {
    const repeatStartRow = integer(value.repeatStartRow, 1, 1)
    const repeatEndRow = integer(value.repeatEndRow, Math.min(MAX_COUNTER_ROW, repeatStartRow + 1), repeatStartRow)
    const rangeLength = repeatEndRow - repeatStartRow + 1
    const repeatTarget = integer(value.repeatTarget, 5, 1, Math.floor(MAX_COUNTER_ROW / rangeLength))
    const totalRows = rangeLength * repeatTarget
    return {
      ...common,
      value: integer(value.value, 0, 0, totalRows),
      repeatStartRow,
      repeatEndRow,
      repeatTarget,
      ...(typeof value.repeatLinkedToId === 'string' ? { repeatLinkedToId: value.repeatLinkedToId.slice(0, 100) } : {}),
    }
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
  return result.map((counter) => ({
    ...counter,
    ...(counter.linkedToId && !result.some((base) => base.id === counter.linkedToId && base.kind === 'simple' && base.unit === 'row') ? { linkedToId: undefined } : {}),
    ...(counter.kind === 'repeat' && counter.repeatLinkedToId && !result.some((base) => base.id === counter.repeatLinkedToId && base.kind === 'simple' && base.unit === 'row' && !base.linkedToId) ? { repeatLinkedToId: undefined } : {}),
  }))
}

export function repeatCounterProgress(counter: CounterSnapshot) {
  if (counter.kind !== 'repeat') return null
  const startRow = counter.repeatStartRow ?? 1
  const endRow = counter.repeatEndRow ?? startRow
  const target = counter.repeatTarget ?? 1
  const rangeLength = endRow - startRow + 1
  const totalRows = rangeLength * target
  const completedRows = Math.min(counter.value, totalRows)
  const complete = completedRows >= totalRows
  return { startRow, endRow, target, rangeLength, totalRows, completedRows, completedRepeats: Math.floor(completedRows / rangeLength), nextRow: complete ? null : startRow + completedRows % rangeLength, complete }
}

export type RepeatCounterStepBlockReason = 'missing' | 'minimum' | 'complete' | 'missing-base' | 'base-complete' | 'base-limit'

export function repeatCounterStepBlock(counters: CounterSnapshot[], counterId: string, direction: -1 | 1): RepeatCounterStepBlockReason | null {
  const repeat = counters.find((counter) => counter.id === counterId && counter.kind === 'repeat')
  if (!repeat || repeat.kind !== 'repeat') return 'missing'
  if (direction < 0) return repeat.value ? null : 'minimum'
  if (repeatCounterProgress(repeat)?.complete) return 'complete'
  const base = repeat.repeatLinkedToId ? counters.find((counter) => counter.id === repeat.repeatLinkedToId && counter.kind === 'simple' && counter.unit === 'row' && !counter.linkedToId) : undefined
  if (repeat.repeatLinkedToId && !base) return 'missing-base'
  if (base?.kind === 'simple' && (base.goalCompleted || base.goalRow != null && base.value >= base.goalRow)) return 'base-complete'
  if (base?.kind === 'simple' && base.value >= MAX_COUNTER_ROW) return 'base-limit'
  return null
}

export function stepRepeatCounter(counters: CounterSnapshot[], counterId: string, direction: -1 | 1): { counters: CounterSnapshot[]; blocked: RepeatCounterStepBlockReason | null } {
  const repeat = counters.find((counter) => counter.id === counterId && counter.kind === 'repeat')
  if (!repeat || repeat.kind !== 'repeat') return { counters, blocked: 'missing' }
  const blocked = repeatCounterStepBlock(counters, counterId, direction)
  if (blocked) return { counters, blocked }
  if (direction < 0) return { counters: counters.map((counter) => counter.id === repeat.id ? { ...counter, value: counter.value - 1 } : counter), blocked: null }
  return {
    counters: counters.map((counter) => counter.id === repeat.id
      ? { ...counter, value: counter.value + 1 }
      : counter.id === repeat.repeatLinkedToId && counter.kind === 'simple' ? { ...counter, value: counter.value + 1 } : counter),
    blocked: null,
  }
}

export function stepAuxiliaryCounter(counters: CounterSnapshot[], counterId: string, direction: -1 | 1) {
  const selected = counters.find((counter) => counter.id === counterId)
  if (!selected || selected.kind === 'repeat') return { counters, blocked: 'missing' as const }
  if (selected.kind === 'simple') {
    const value = Math.max(0, Math.min(MAX_COUNTER_ROW, selected.value + direction))
    if (value === selected.value) return { counters, blocked: direction < 0 ? 'minimum' as const : 'maximum' as const }
    return { counters: counters.map((counter) => counter.id === selected.id ? { ...counter, value } : counter), blocked: null }
  }
  if (selected.kind === 'pattern') {
    const length = selected.repeatLength ?? 1
    const current = selected.patternRow ?? 1
    const patternRow = direction > 0 ? current % length + 1 : (current - 2 + length) % length + 1
    return { counters: counters.map((counter) => counter.id === selected.id ? { ...counter, value: patternRow, patternRow } : counter), blocked: null }
  }
  const completedCount = selected.completedCount ?? 0
  if (direction > 0) {
    if (completedCount >= (selected.total ?? 0)) return { counters, blocked: 'maximum' as const }
    const row = selected.nextTaskRow ?? selected.firstTaskRow ?? 1
    const taskRecords = [...(selected.taskRecords ?? [])]
    const existing = taskRecords.findIndex((item) => item.row === row)
    if (existing >= 0) taskRecords[existing] = { row, status: 'done' }
    else taskRecords.push({ row, status: 'done' })
    const nextCompleted = completedCount + 1
    return {
      counters: counters.map((counter) => counter.id === selected.id ? {
        ...counter,
        value: nextCompleted,
        completedCount: nextCompleted,
        nextTaskRow: nextCompleted < (selected.total ?? 0) ? Math.min(MAX_COUNTER_ROW, row + (selected.interval ?? 1)) : row,
        taskRecords: taskRecords.slice(-MAX_COUNTER_TASK_OCCURRENCES),
      } : counter),
      blocked: null,
    }
  }
  if (completedCount <= 0) return { counters, blocked: 'minimum' as const }
  const taskRecords = [...(selected.taskRecords ?? [])]
  let lastDoneIndex = -1
  for (let index = taskRecords.length - 1; index >= 0; index -= 1) {
    if (taskRecords[index].status === 'done') { lastDoneIndex = index; break }
  }
  const lastDone = lastDoneIndex >= 0 ? taskRecords.splice(lastDoneIndex, 1)[0] : undefined
  const nextCompleted = completedCount - 1
  return {
    counters: counters.map((counter) => counter.id === selected.id ? {
      ...counter,
      value: nextCompleted,
      completedCount: nextCompleted,
      nextTaskRow: lastDone?.row ?? Math.max(selected.firstTaskRow ?? 1, (selected.nextTaskRow ?? selected.firstTaskRow ?? 1) - (selected.interval ?? 1)),
      taskRecords,
    } : counter),
    blocked: null,
  }
}

export function duplicateCounterSnapshot(counter: CounterSnapshot, name: string): CounterSnapshot {
  const copy = { ...counter, id: crypto.randomUUID(), name, pinned: false }
  if (counter.kind === 'simple') return { ...copy, value: 0 }
  if (counter.kind === 'pattern') return { ...copy, value: 1, currentRow: 1, patternRow: 1, instructions: counter.instructions?.map((item) => ({ ...item })) }
  if (counter.kind === 'task') return { ...copy, value: 0, completedCount: 0, currentRow: 1, nextTaskRow: counter.firstTaskRow ?? 1, taskRecords: [] }
  return { ...copy, value: 0 }
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

export function counterSideForRow(counter: CounterSnapshot, row: number): 'rs' | 'ws' {
  if (counter.knittingMode === 'round') return 'rs'
  const target = counter.goalRow && counter.goalFinalSide ? counter.goalRow : 1
  const endSide = counter.goalRow && counter.goalFinalSide ? counter.goalFinalSide : counter.firstSide ?? 'rs'
  return Math.abs(target - row) % 2 === 0 ? endSide : endSide === 'rs' ? 'ws' : 'rs'
}

export function nextPatternAlertRow(counter: CounterSnapshot, row: number) {
  if (counter.kind !== 'pattern') return null
  const first = counter.startRow ?? 1
  const interval = counter.repeatLength ?? 1
  return row <= first ? first : first + Math.ceil((row - first) / interval) * interval
}

export function counterAlertState(counters: CounterSnapshot[], baseId?: string, previewEnabled = false) {
  const base = counters.find((counter) => counter.id === baseId && counter.kind === 'simple' && counter.unit === 'row') ?? counters.find((counter) => counter.kind === 'simple' && counter.unit === 'row' && !counter.linkedToId)
  if (!base || base.kind !== 'simple') return { key: '', messages: [] as string[], alerts: [] as { counterId: string; message: string }[] }
  const row = base.value
  const related = counters.filter((counter) => counter.linkedToId === base.id)
  const alerts: { counterId: string; message: string }[] = []
  if (base.goalCompleted && base.goalAlertEnabled !== false) alerts.push({ counterId: base.id, message: '목표 ' + base.goalRow + '단을 완료했어요.' })
  related.forEach((counter) => {
    if (counter.kind === 'task' && (
      counter.taskRecords?.some((record) => record.row === row && record.status === 'done') ||
      counter.nextTaskRow === row && (counter.completedCount ?? 0) < (counter.total ?? 0)
    )) alerts.push({ counterId: counter.id, message: counter.name + ' · ' + (counter.taskKind === 'increase' ? '늘림' : '줄임') + ' 작업 단이에요.' })
    if (counter.kind === 'pattern' && counter.patternAlertEnabled !== false && nextPatternAlertRow(counter, row) === row) alerts.push({ counterId: counter.id, message: counter.name + ' · 무늬 반복 단이에요.' })
  })
  if (previewEnabled) {
    if (base.goalRow === row + 1 && base.goalAlertEnabled !== false) alerts.push({ counterId: base.id, message: '다음 단에 목표 ' + base.goalRow + '단이에요.' })
    related.forEach((counter) => {
      if (counter.kind === 'task' && counter.nextTaskRow === row + 1 && (counter.completedCount ?? 0) < (counter.total ?? 0)) alerts.push({ counterId: counter.id, message: '다음 단에 ' + counter.name + ' ' + (counter.taskKind === 'increase' ? '늘림' : '줄임') + ' 작업이 있어요.' })
      if (counter.kind === 'pattern' && counter.patternPreviewEnabled === true && nextPatternAlertRow(counter, row + 1) === row + 1) alerts.push({ counterId: counter.id, message: '다음 단에 ' + counter.name + ' 무늬단이 시작돼요.' })
    })
  }
  const messages = alerts.map((alert) => alert.message)
  return { key: messages.length ? base.id + ':' + row + ':' + messages.join('|') : '', messages, alerts }
}

export function findCounterRewindCheckpoint(history: CounterHistoryEntry[], counters: CounterSnapshot[], baseId: string, targetRow: number) {
  const base = counters.find((counter) => counter.id === baseId)
  if (!base || base.kind !== 'simple' || targetRow < 1 || targetRow >= base.value) return undefined
  const duplicateName = counters.filter((counter) => counter.kind === 'simple' && counter.unit === 'row' && counter.name === base.name).length > 1
  const recent = [...history].reverse()
  const checkpoint = recent.find((entry) => {
    if (entry.actualRow !== targetRow || !(entry.label.endsWith('단 완료') || entry.label.endsWith('목표 완료'))) return false
    const savedBase = entry.counters.find((counter) => counter.id === baseId)
    if (!savedBase || savedBase.kind !== 'simple' || savedBase.value !== targetRow) return false
    if (entry.baseCounterId !== undefined) return entry.baseCounterId === baseId
    return !duplicateName && entry.label.startsWith(base.name + ' · ')
  })
  const latestCorrection = recent.find((entry) => {
    if (entry.label !== base.name + ' 숫자 보정') return false
    if (entry.baseCounterId !== undefined) return entry.baseCounterId === baseId
    const savedBase = entry.counters.find((counter) => counter.id === baseId)
    return savedBase?.kind === 'simple' && savedBase.value !== base.value
  })
  return checkpoint && (!latestCorrection || history.indexOf(checkpoint) > history.indexOf(latestCorrection)) ? checkpoint : undefined
}

export function restoreCounterGroup(current: CounterSnapshot[], saved: CounterSnapshot[], baseId: string) {
  const groupIds = new Set([...current, ...saved].filter((counter) => counter.id === baseId || counter.linkedToId === baseId).map((counter) => counter.id))
  const savedGroup = saved.filter((counter) => groupIds.has(counter.id))
  const savedById = new Map(savedGroup.map((counter) => [counter.id, counter]))
  const result = current.flatMap((counter) => {
    if (!groupIds.has(counter.id)) return [counter]
    const savedCounter = savedById.get(counter.id)
    return savedCounter ? [savedCounter] : []
  })
  const currentGroupIds = new Set(current.map((counter) => counter.id))
  const missingSavedMembers = savedGroup.filter((counter) => counter.id !== baseId && !currentGroupIds.has(counter.id))
  if (missingSavedMembers.length) result.splice(result.findIndex((counter) => counter.id === baseId) + 1, 0, ...missingSavedMembers)
  return result
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
  const effectiveRow = row - (guide.counterRowOffset ?? 0)
  const region = guide.chartRegion
  if (!region) return guideRowPosition(guide, effectiveRow)
  if (region.rowRanges?.length) return guideGeometryForRotation(guide, row, region.analysisRotation ?? 0).position
  const rowCount = Math.max(1, region.lastRow - region.firstRow + 1)
  let index = effectiveRow - region.startCounterRow
  if (region.repeat) index = ((index % rowCount) + rowCount) % rowCount
  else index = Math.max(0, Math.min(rowCount - 1, index))
  if (region.rowPositions?.length === rowCount) return Math.min(1, Math.max(0, region.rowPositions[index] + (guide.positionOffset ?? 0)))
  const fraction = rowCount < 2 ? 0 : index / (rowCount - 1)
  const direction = region.direction === 'bottom-to-top' ? 1 - fraction : fraction
  return Math.min(1, Math.max(0, region.y + region.height * direction + (guide.positionOffset ?? 0)))
}

export function progressGuideForCounter(guide: ProgressGuide, counter: CounterSnapshot, previousRow?: number): ProgressGuide {
  const row = counter.kind === 'simple' ? counter.value : counter.currentRow ?? 1
  const rowDelta = previousRow === undefined ? undefined : row - previousRow
  const advanceCalibratedGuide = (target: ProgressGuide) => {
    if (target.chartRegion?.rowRanges?.length) return target.position
    if (rowDelta === undefined || target.chartRegion || target.rowSpacing === undefined || !target.rowSpacingDirection) return guidePositionForRow(target, row)
    return Math.min(1, Math.max(0, target.position + rowDelta * target.rowSpacing * (target.rowSpacingDirection === 'down' ? 1 : -1)))
  }
  const position = advanceCalibratedGuide(guide)
  const rotationPositions = guide.rotationPositions ? { ...guide.rotationPositions } : undefined
  if (rotationPositions) {
    for (const key of Object.keys(rotationPositions) as ('0' | '90' | '180' | '270')[]) {
      const entry = rotationPositions[key]
      if (entry) {
        const oriented = { ...guide, ...entry }
        const position = advanceCalibratedGuide(oriented)
        rotationPositions[key] = { ...entry, position, ...(entry.rowSpacingStartRow === undefined ? {} : { rowSpacingStartRow: row - (guide.counterRowOffset ?? 0) }) }
      }
    }
  }
  const counterMoved = previousRow !== undefined ? previousRow !== row : position !== guide.position
  return {
    ...guide,
    name: guide.role ? guide.name ?? counter.name : counter.name,
    color: guide.role ? guide.color ?? counter.color : counter.color,
    position,
    ...(guide.rowSpacingStartRow === undefined ? {} : { rowSpacingStartRow: row - (guide.counterRowOffset ?? 0) }),
    ...(rotationPositions ? { rotationPositions } : {}),
    ...(counterMoved ? { markerProgress: undefined } : {}),
  }
}

export function reanchorProgressGuideForCounter(guide: ProgressGuide, previousRow: number, nextRow: number): ProgressGuide {
  if (previousRow === nextRow) return guide
  if (guide.chartRegion) return { ...guide, counterRowOffset: (guide.counterRowOffset ?? 0) + nextRow - previousRow }
  const effectiveRow = nextRow - (guide.counterRowOffset ?? 0)
  const rotationPositions = guide.rotationPositions
    ? Object.fromEntries(Object.entries(guide.rotationPositions).map(([rotation, entry]) => [rotation, entry?.rowSpacingStartRow === undefined ? entry : { ...entry, rowSpacingStartRow: effectiveRow }])) as ProgressGuide['rotationPositions']
    : undefined
  return {
    ...guide,
    ...(guide.rowSpacingStartRow === undefined ? {} : { rowSpacingStartRow: effectiveRow }),
    ...(rotationPositions ? { rotationPositions } : {}),
  }
}
