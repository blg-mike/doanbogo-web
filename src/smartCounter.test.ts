import { describe, expect, it } from 'vitest'
import { advanceLinkedCounters, counterAlertState, counterSideForRow, createCounter, createDefaultCounters, findCounterRewindCheckpoint, guidePositionForRow, isCounterSnapshots, isCurrentCounterSnapshots, isLegacyCounterSnapshots, maxCountersForType, nextPatternAlertRow, normalizeCounterSnapshots, patternRowAfterCompletion, progressGuideForCounter, restoreCounterGroup, setCounterGroupRow, shouldPlayCounterTaskSound, taskSchedule } from './smartCounter'

describe('counter model', () => {
  it('starts with no counters and enforces each type limit in the model', () => {
    const counters = createDefaultCounters()
    expect(counters).toEqual([])
    const five = Array.from({ length: 5 }, (_, index) => ({ ...createCounter('pattern'), id: 'pattern-' + index }))
    expect(maxCountersForType(five, 'pattern')).toBe(5)
    expect(isCurrentCounterSnapshots(five)).toBe(true)
    expect(isCounterSnapshots(five)).toBe(true)
  })

  it('migrates old repeat and task data without losing counts or work records', () => {
    const legacy = Array.from({ length: 5 }, (_, index) => ({
      mode: index === 0 ? 'repeat' : 'simple', value: index === 0 ? 19 : 0, repeatName: '몸판', startRow: 5,
      repeatLength: 12, repeatCount: 3,
      taskRules: index === 0 ? [{ id: 'dec', kind: 'decrease', interval: 6, total: 8 }] : [],
      taskOccurrences: index === 0 ? [{ ruleId: 'dec', occurrence: 1, status: 'done' }, { ruleId: 'dec', occurrence: 2, status: 'missed' }] : [],
    }))
    expect(isLegacyCounterSnapshots(legacy)).toBe(true)
    const counters = normalizeCounterSnapshots(legacy)
    expect(counters.find((counter) => counter.kind === 'pattern')).toMatchObject({ name: '몸판', currentRow: 19, patternRow: 3, repeatLength: 12, repeatCount: 3 })
    expect(counters.find((counter) => counter.kind === 'task')).toMatchObject({ taskKind: 'decrease', completedCount: 1, taskRecords: [{ row: 6, status: 'done' }, { row: 12, status: 'missed' }] })
    expect(counters.filter((counter) => counter.kind === 'simple')).toHaveLength(5)
    expect(counters.filter((counter) => counter.kind === 'simple').slice(1)).toMatchObject([
      { value: 0 }, { value: 0 }, { value: 0 }, { value: 0 },
    ])
  })

  it('preserves task first row, independent next action, and schedule preview', () => {
    const task = { ...createCounter('task'), firstTaskRow: 4, interval: 6, total: 4, nextTaskRow: 4 }
    expect(taskSchedule(task)).toEqual([4, 10, 16, 22])
    expect(normalizeCounterSnapshots([{ ...task, nextTaskRow: 7 }])[0].nextTaskRow).toBe(7)
  })

  it('starts a pattern at its configured row and keeps its cycle independent', () => {
    const pattern = { ...createCounter('pattern'), startRow: 5, repeatLength: 4, currentRow: 4, patternRow: 1 }
    expect(patternRowAfterCompletion(pattern, 4)).toBe(1)
    expect(patternRowAfterCompletion(pattern, 5)).toBe(2)
    expect(patternRowAfterCompletion({ ...pattern, patternRow: 4 }, 8)).toBe(1)
    expect(patternRowAfterCompletion({ ...pattern, patternRow: 3 }, 2)).toBe(3)
  })

  it('advances only one linked group and completes work only on its scheduled row', () => {
    const base = { ...createCounter('simple'), id: 'base', value: 4, unit: 'row' as const }
    const pattern = { ...createCounter('pattern'), id: 'pattern', linkedToId: 'base', currentRow: 4, patternRow: 3, repeatLength: 4 }
    const task = { ...createCounter('task'), id: 'task', linkedToId: 'base', currentRow: 4, firstTaskRow: 4, nextTaskRow: 4, interval: 6, total: 3 }
    const otherBase = { ...createCounter('simple'), id: 'other', value: 9, unit: 'row' as const }
    const next = advanceLinkedCounters([base, pattern, task, otherBase], 'base', 4)
    expect(next).toMatchObject([
      { id: 'base', value: 5 },
      { id: 'pattern', currentRow: 5, patternRow: 4 },
      { id: 'task', currentRow: 5, completedCount: 1, nextTaskRow: 10, taskRecords: [{ row: 4, status: 'done' }] },
      { id: 'other', value: 9 },
    ])
  })

  it('maps rows to evenly spaced, irregular, and repeating chart positions', () => {
    const guide = { id: 'guide', position: 0.5, chartRegion: { x: 0.1, y: 0.2, width: 0.8, height: 0.6, firstRow: 1, lastRow: 4, startCounterRow: 10, repeat: false, direction: 'top-to-bottom' as const } }
    expect(guidePositionForRow(guide, 10)).toBe(0.2)
    expect(guidePositionForRow(guide, 12)).toBeCloseTo(0.6)
    expect(guidePositionForRow(guide, 20)).toBe(0.8)
    expect(guidePositionForRow({ ...guide, chartRegion: { ...guide.chartRegion, repeat: true, rowPositions: [0.22, 0.37, 0.61, 0.77] } }, 14)).toBe(0.22)
  })

  it('keeps linked guide labels and colors in sync with counter edits', () => {
    const counter = { ...createCounter('simple', '몸판'), id: 'base', value: 6, color: '#123456' }
    const guide = { id: 'guide', position: 0.5, linkedCounterId: counter.id, chartRegion: { x: 0, y: 0.2, width: 1, height: 0.6, firstRow: 1, lastRow: 6, startCounterRow: 1, repeat: false, direction: 'top-to-bottom' as const } }
    expect(progressGuideForCounter(guide, counter)).toMatchObject({ name: '몸판', color: '#123456', position: 0.8 })
  })

  it('plays one task sound only for the matching completed row entry', () => {
    const history = { id: 'entry-2', label: '몸판 · 24단 완료', counters: [], guides: [], actualRow: 24, savedAt: 2 }
    expect(shouldPlayCounterTaskSound(history, '몸판', 25, 'entry-1', 24)).toBe(true)
    expect(shouldPlayCounterTaskSound(history, '몸판', 25, 'entry-2', 24)).toBe(false)
    expect(shouldPlayCounterTaskSound(history, '소매', 25, 'entry-1', 24)).toBe(false)
    expect(shouldPlayCounterTaskSound({ ...history, label: '단 되돌아가기' }, '몸판', 25, 'entry-1', 24)).toBe(false)
  })

  it('restores only one linked group and recalculates dependent pattern and task state', () => {
    const base = { ...createCounter('simple'), id: 'base', value: 25, unit: 'row' as const }
    const pattern = { ...createCounter('pattern'), id: 'pattern', linkedToId: 'base', currentRow: 25, patternRow: 1, repeatLength: 8, startRow: 1 }
    const task = { ...createCounter('task'), id: 'task', linkedToId: 'base', currentRow: 25, completedCount: 3, value: 3, firstTaskRow: 4, interval: 6, total: 8, nextTaskRow: 28, taskRecords: [{ row: 4, status: 'done' as const }, { row: 10, status: 'done' as const }, { row: 16, status: 'missed' as const }, { row: 22, status: 'done' as const }] }
    const secondGroup = { ...createCounter('simple'), id: 'other-base', value: 9, unit: 'row' as const }
    const changed = setCounterGroupRow([base, pattern, task, secondGroup], 'base', 19)
    expect(changed).toMatchObject([
      { id: 'base', value: 19 },
      { id: 'pattern', currentRow: 19, patternRow: 3 },
      { id: 'task', currentRow: 19, completedCount: 2, nextTaskRow: 22, taskRecords: [{ row: 4, status: 'done' }, { row: 10, status: 'done' }, { row: 16, status: 'missed' }] },
      { id: 'other-base', value: 9 },
    ])
  })

  it('allows over-limit imported counters only when marked as legacy entries', () => {
    const counters = Array.from({ length: 6 }, (_, index) => ({ ...createCounter('simple'), id: 'simple-' + index, ...(index === 5 ? { legacyOverflow: true } : {}) }))
    expect(isCurrentCounterSnapshots(counters)).toBe(true)
    expect(maxCountersForType(counters, 'simple')).toBe(6)
    counters[5] = { ...counters[5], legacyOverflow: false }
    expect(isCurrentCounterSnapshots(counters)).toBe(false)
  })

  it('derives RS/WS from the target row and advances repeat alerts from the first pattern row', () => {
    const base = { ...createCounter('simple'), id: 'base', value: 36, goalRow: 36, goalFinalSide: 'rs' as const }
    const pattern = { ...createCounter('pattern'), id: 'pattern', startRow: 6, repeatLength: 8 }
    expect(counterSideForRow(base, 36)).toBe('rs')
    expect(counterSideForRow(base, 35)).toBe('ws')
    expect(counterSideForRow({ ...base, goalRow: null, firstSide: 'ws' }, 1)).toBe('ws')
    expect([6, 14, 22, 30].map((row) => nextPatternAlertRow(pattern, row))).toEqual([6, 14, 22, 30])
  })

  it('shows due and one-row-ahead alerts for the selected linked counter group', () => {
    const base = { ...createCounter('simple'), id: 'base', value: 5, goalRow: 6 }
    const pattern = { ...createCounter('pattern'), id: 'pattern', name: '꽈배기 A', linkedToId: 'base', startRow: 6, repeatLength: 8, patternPreviewEnabled: true }
    const task = { ...createCounter('task'), id: 'task', name: '소매 감소', linkedToId: 'base', nextTaskRow: 6, total: 4 }
    expect(counterAlertState([base, pattern, task], 'base', true).messages).toHaveLength(3)
    expect(counterAlertState([{ ...base, value: 6 }, pattern, { ...task, currentRow: 6 }], 'base').messages).toEqual([
      '꽈배기 A · 무늬 반복 단이에요.',
      '소매 감소 · 줄임 작업 단이에요.',
    ])
  })

  it('finds an exact rewind checkpoint for one base and restores only that group', () => {
    const base = { ...createCounter('simple'), id: 'base', name: '몸판', value: 25, unit: 'row' as const }
    const pattern = { ...createCounter('pattern'), id: 'pattern', linkedToId: 'base', currentRow: 25 }
    const other = { ...createCounter('simple'), id: 'other', name: '소매', value: 9, unit: 'row' as const }
    const checkpointBase = { ...base, value: 24 }
    const checkpointPattern = { ...pattern, currentRow: 24, patternRow: 4 }
    const checkpoint = { id: 'row-24', label: '몸판 · 24단 완료', counters: [checkpointBase, checkpointPattern, other], guides: [], actualRow: 24, baseCounterId: 'base', savedAt: 24 }
    expect(findCounterRewindCheckpoint([checkpoint], [base, pattern, other], 'base', 24)).toBe(checkpoint)
    const restored = restoreCounterGroup([base, pattern, other], [checkpointBase, checkpointPattern, other], 'base')
    expect(restored).toMatchObject([{ id: 'base', value: 24 }, { id: 'pattern', currentRow: 24, patternRow: 4 }, { id: 'other', value: 9 }])
    expect(findCounterRewindCheckpoint([checkpoint], [base, pattern, other], 'other', 24)).toBeUndefined()
  })
})
