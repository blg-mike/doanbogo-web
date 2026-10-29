import { describe, expect, it } from 'vitest'
import { advanceLinkedCounters, counterAlertState, counterSideForRow, createCounter, createDefaultCounters, duplicateCounterSnapshot, findCounterRewindCheckpoint, guidePositionForRow, isCounterSnapshots, isCurrentCounterSnapshots, isLegacyCounterSnapshots, maxCountersForType, nextPatternAlertRow, normalizeCounterSnapshots, patternRowAfterCompletion, progressGuideForCounter, reanchorProgressGuideForCounter, repeatCounterProgress, repeatCounterStepBlock, restoreCounterGroup, setCounterGroupRow, shouldPlayCounterTaskSound, stepAuxiliaryCounter, stepRepeatCounter, taskSchedule, type RepeatCounterStepBlockReason } from './smartCounter'
import type { CounterSnapshot, ProgressGuide } from './types'

describe('counter model', () => {
  it('converts existing free counter units to rows without changing their counts', () => {
    const counters = (['row', 'stitch', 'round'] as const).map((unit, index) => ({ ...createCounter('simple', unit), id: unit, unit, value: index * 12 }))
    expect(isCurrentCounterSnapshots(counters)).toBe(true)
    const normalized = normalizeCounterSnapshots(counters)
    expect(normalized).toMatchObject(counters.map((counter) => ({ ...counter, unit: 'row' })))
    expect(counters.map((counter) => counter.unit)).toEqual(['row', 'stitch', 'round'])
    expect(normalizeCounterSnapshots(normalized)).toEqual(normalized)
  })

  it('starts with no counters and enforces each type limit in the model', () => {
    const counters = createDefaultCounters()
    expect(counters).toEqual([])
    const five = Array.from({ length: 5 }, (_, index) => ({ ...createCounter('pattern'), id: 'pattern-' + index }))
    expect(maxCountersForType(five, 'pattern')).toBe(5)
    expect(isCurrentCounterSnapshots(five)).toBe(true)
    expect(isCounterSnapshots(five)).toBe(true)
  })

  it('calculates repeat rows and completed repeats from completed rows', () => {
    const repeat = { ...createCounter('repeat', '소매 반복'), id: 'repeat', repeatStartRow: 1, repeatEndRow: 2, repeatTarget: 5, value: 0 }
    expect([0, 1, 2, 3, 4, 10].map((value) => {
      const progress = repeatCounterProgress({ ...repeat, value })!
      return [progress.completedRepeats, progress.nextRow, progress.complete]
    })).toEqual([
      [0, 1, false], [0, 2, false], [1, 1, false], [1, 2, false], [2, 1, false], [5, null, true],
    ])
    expect(isCurrentCounterSnapshots([repeat])).toBe(true)
    expect(isCurrentCounterSnapshots([{ ...repeat, repeatTarget: 5000 }])).toBe(false)
    expect(isCurrentCounterSnapshots([{ ...repeat, repeatEndRow: 10_000 }])).toBe(false)
    expect(maxCountersForType(Array.from({ length: 5 }, (_, index) => ({ ...repeat, id: 'repeat-' + index })), 'repeat')).toBe(5)
    const singleRow = { ...repeat, repeatEndRow: 1, repeatTarget: 1 }
    expect(repeatCounterProgress(singleRow)).toMatchObject({ totalRows: 1, completedRepeats: 0, nextRow: 1, complete: false })
    expect(repeatCounterProgress(stepRepeatCounter([singleRow], singleRow.id, 1).counters[0])).toMatchObject({ completedRepeats: 1, nextRow: null, complete: true })
  })

  it('links repeat plus to only the selected general row counter and keeps minus independent', () => {
    const base = { ...createCounter('simple'), id: 'base', value: 16, unit: 'row' as const }
    const pattern = { ...createCounter('pattern'), id: 'pattern', linkedToId: 'base', currentRow: 16 }
    const repeat = { ...createCounter('repeat'), id: 'repeat', repeatStartRow: 1, repeatEndRow: 2, repeatTarget: 5, repeatLinkedToId: 'base', value: 0 }
    const first = stepRepeatCounter([base, pattern, repeat], repeat.id, 1)
    const second = stepRepeatCounter(first.counters, repeat.id, 1)
    expect(second.counters).toMatchObject([{ id: 'base', value: 18 }, { id: 'pattern', currentRow: 16 }, { id: 'repeat', value: 2 }])
    const decreased = stepRepeatCounter(second.counters, repeat.id, -1)
    expect(decreased.counters.find((counter) => counter.id === 'base')).toMatchObject({ value: 18 })
    expect(decreased.counters.find((counter) => counter.id === 'repeat')).toMatchObject({ value: 1 })
    const resumed = stepRepeatCounter(decreased.counters, repeat.id, 1)
    expect(resumed.counters.find((counter) => counter.id === 'base')).toMatchObject({ value: 19 })
    expect(resumed.counters.find((counter) => counter.id === 'repeat')).toMatchObject({ value: 2 })
    expect(stepRepeatCounter([base, repeat], repeat.id, -1).blocked).toBe('minimum')
  })

  it('blocks repeat increments at completion, a reached general goal, and the row limit', () => {
    const repeat = { ...createCounter('repeat'), id: 'repeat', repeatStartRow: 1, repeatEndRow: 2, repeatTarget: 1, value: 2 }
    expect(stepRepeatCounter([repeat], repeat.id, 1).blocked).toBe('complete')
    expect(stepRepeatCounter([repeat], repeat.id, -1).counters[0].value).toBe(1)
    const goalBase = { ...createCounter('simple'), id: 'base', unit: 'row' as const, goalRow: 16, value: 16 }
    expect(stepRepeatCounter([goalBase, { ...repeat, value: 0, repeatLinkedToId: 'base' }], repeat.id, 1).blocked).toBe('base-complete')
    const fullBase = { ...goalBase, goalRow: null, value: 9999 }
    expect(stepRepeatCounter([fullBase, { ...repeat, value: 0, repeatLinkedToId: 'base' }], repeat.id, 1).blocked).toBe('base-limit')
    const linkedChild = { ...goalBase, id: 'child', linkedToId: 'parent' }
    expect(normalizeCounterSnapshots([goalBase, linkedChild, { ...repeat, repeatLinkedToId: 'child' }]).find((counter) => counter.id === repeat.id)?.repeatLinkedToId).toBeUndefined()
  })

  it('reads repeat step availability without changing progress and preserves boundary reasons', () => {
    const base = { ...createCounter('simple'), id: 'base', unit: 'row' as const, value: 16 }
    const repeat = { ...createCounter('repeat'), id: 'repeat', repeatLinkedToId: 'base', value: 1 }
    const cases: { counters: CounterSnapshot[]; direction: -1 | 1; expected: RepeatCounterStepBlockReason | null }[] = [
      { counters: [], direction: 1, expected: 'missing' },
      { counters: [{ ...base, id: repeat.id }], direction: -1, expected: 'missing' },
      { counters: [{ ...repeat, value: 0 }], direction: -1, expected: 'minimum' },
      { counters: [{ ...repeat, value: 10 }], direction: 1, expected: 'complete' },
      { counters: [repeat], direction: 1, expected: 'missing-base' },
      { counters: [{ ...base, goalRow: 16 }, repeat], direction: 1, expected: 'base-complete' },
      { counters: [{ ...base, goalCompleted: true }, repeat], direction: 1, expected: 'base-complete' },
      { counters: [{ ...base, value: 9999 }, repeat], direction: 1, expected: 'base-limit' },
      { counters: [base, repeat], direction: 1, expected: null },
      { counters: [repeat], direction: -1, expected: null },
      { counters: [{ ...repeat, value: 10 }], direction: -1, expected: null },
      { counters: [{ ...repeat, repeatLinkedToId: undefined }], direction: 1, expected: null },
    ]
    for (const { counters, direction, expected } of cases) {
      const before = structuredClone(counters)
      expect(repeatCounterStepBlock(counters, repeat.id, direction)).toBe(expected)
      expect(counters).toEqual(before)
      expect(stepRepeatCounter(counters, repeat.id, direction).blocked).toBe(expected)
      expect(counters).toEqual(before)
    }
  })

  it('steps auxiliary counters independently and duplicates only their settings', () => {
    const base = { ...createCounter('simple', '몸판'), id: 'base', unit: 'row' as const, value: 3 }
    const pattern = { ...createCounter('pattern', '무늬'), id: 'pattern', linkedToId: base.id, currentRow: 3, repeatLength: 4, patternRow: 2 }
    const task = { ...createCounter('task', '줄임'), id: 'task', linkedToId: base.id, currentRow: 3, firstTaskRow: 4, nextTaskRow: 4, interval: 6, total: 8 }
    const stitch = { ...createCounter('simple', '코'), id: 'stitch', unit: 'stitch' as const, value: 8 }
    const counters = [base, pattern, task, stitch]

    const steppedPattern = stepAuxiliaryCounter(counters, pattern.id, 1)
    expect(steppedPattern.counters).toMatchObject([{ id: 'base', value: 3 }, { id: 'pattern', currentRow: 3, patternRow: 3, value: 3 }, { id: 'task', completedCount: 0 }, { id: 'stitch', value: 8 }])
    const steppedTask = stepAuxiliaryCounter(counters, task.id, 1)
    expect(steppedTask.counters.find((counter) => counter.id === 'task')).toMatchObject({ completedCount: 1, nextTaskRow: 10, taskRecords: [{ row: 4, status: 'done' }] })
    const advanced = advanceLinkedCounters(steppedTask.counters, base.id, base.value)
    expect(advanced.find((counter) => counter.id === 'task')).toMatchObject({ completedCount: 1, taskRecords: [{ row: 4, status: 'done' }], nextTaskRow: 10 })
    const undoneTask = stepAuxiliaryCounter(steppedTask.counters, task.id, -1)
    expect(undoneTask.counters.find((counter) => counter.id === 'task')).toMatchObject({ completedCount: 0, nextTaskRow: 4, taskRecords: [] })
    expect(stepAuxiliaryCounter(counters, stitch.id, 1).counters.find((counter) => counter.id === stitch.id)?.value).toBe(9)

    const copy = duplicateCounterSnapshot(task, '줄임 복사본')
    expect(copy).toMatchObject({ name: '줄임 복사본', linkedToId: base.id, taskKind: task.taskKind, total: task.total, completedCount: 0, value: 0, taskRecords: [] })
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

  it('moves calibrated guides by one spacing and rebases after every counter step', () => {
    const guide = { id: 'guide', role: 'primary' as const, position: 0.4, linkedCounterId: 'base', rowSpacing: 0.05, rowSpacingStartRow: 42, rowSpacingDirection: 'down' as const, markerProgress: 0.6 }
    const first = progressGuideForCounter(guide, { ...createCounter('simple'), id: 'base', value: 43 }, 42)
    const second = progressGuideForCounter(first, { ...createCounter('simple'), id: 'base', value: 44 }, 43)
    const third = progressGuideForCounter(second, { ...createCounter('simple'), id: 'base', value: 45 }, 44)
    expect([first.position, second.position, third.position]).toEqual([0.45, 0.5, 0.55])
    expect([first.rowSpacingStartRow, second.rowSpacingStartRow, third.rowSpacingStartRow]).toEqual([43, 44, 45])
    expect(first.markerProgress).toBeUndefined()
  })

  it('moves a linked progress guide exactly one row for each main counter increment', () => {
    let counters: CounterSnapshot[] = [{ ...createCounter('simple'), id: 'base', value: 24, unit: 'row' }]
    let guide: ProgressGuide = { id: 'guide', role: 'primary', position: 0.2, linkedCounterId: 'base', rowSpacing: 0.018, rowSpacingStartRow: 24, rowSpacingDirection: 'down' }
    for (let step = 0; step < 6; step += 1) {
      const previousRow = counters[0].value
      counters = advanceLinkedCounters(counters, 'base', previousRow)
      const nextGuide = progressGuideForCounter(guide, counters[0], previousRow)
      expect(nextGuide.position - guide.position).toBeCloseTo(0.018)
      expect(counters[0].value).toBe(previousRow + 1)
      guide = nextGuide
    }
  })

  it.each([0, 90, 180, 270] as const)('advances the calibrated %i-degree guide by one interval even when its saved row anchor is stale', (rotation) => {
    const base = { ...createCounter('simple'), id: 'base', value: 24, unit: 'row' as const }
    const guide: ProgressGuide = {
      id: 'guide', role: 'primary', linkedCounterId: 'base', position: 0.2, rowSpacing: 0.018, rowSpacingStartRow: 20, rowSpacingDirection: 'down',
      rotationPositions: { [rotation]: { position: 0.3, rowSpacing: 0.021, rowSpacingStartRow: 20, rowSpacingDirection: 'up' } },
    }
    const next = progressGuideForCounter(guide, { ...base, value: 25 }, 24)
    expect(next.position - guide.position).toBeCloseTo(0.018)
    expect(next.rotationPositions?.[String(rotation) as '0' | '90' | '180' | '270']?.position).toBeCloseTo(0.279)
  })

  it('keeps the line in place after a direct counter correction and moves one spacing next', () => {
    const guide = { id: 'guide', role: 'primary' as const, position: 0.4, linkedCounterId: 'base', rowSpacing: 0.05, rowSpacingStartRow: 42, rowSpacingDirection: 'down' as const, markerProgress: 0.6 }
    const corrected = reanchorProgressGuideForCounter(guide, 42, 68)
    const next = progressGuideForCounter(corrected, { ...createCounter('simple'), id: 'base', value: 69 }, 68)
    expect(corrected).toMatchObject({ position: 0.4, rowSpacingStartRow: 68, markerProgress: 0.6 })
    expect(next.position).toBeCloseTo(0.45)
  })

  it('preserves chart-region position across direct count correction while retaining repeat mapping', () => {
    const guide = { id: 'guide', linkedCounterId: 'base', position: 0.2, chartRegion: { x: 0, y: 0.2, width: 1, height: 0.6, firstRow: 1, lastRow: 4, startCounterRow: 40, repeat: true, direction: 'top-to-bottom' as const } }
    const before = guidePositionForRow(guide, 42)
    const corrected = reanchorProgressGuideForCounter(guide, 42, 68)
    expect(guidePositionForRow(corrected, 68)).toBeCloseTo(before)
    expect(guidePositionForRow(corrected, 69)).toBeCloseTo(guidePositionForRow(guide, 43))
  })

  it('follows saved chart row ranges without rewriting their geometry into the guide', () => {
    const guide = {
      id: 'guide', role: 'primary' as const, linkedCounterId: 'base', position: 0.5, markerProgress: 0.4,
      chartRegion: {
        x: 0.1, y: 0.2, width: 0.8, height: 0.6, firstRow: 1, lastRow: 3, startCounterRow: 10,
        repeat: false, direction: 'bottom-to-top' as const, analysisRotation: 0 as const, autoFollow: true,
        rowRanges: [
          { x: 0.2, y: 0.7, width: 0.3, height: 0.05 },
          { x: 0.1, y: 0.4, width: 0.6, height: 0.04 },
          { x: 0.5, y: 0.2, width: 0.4, height: 0.03 },
        ],
      },
    }
    const moved = progressGuideForCounter(guide, { ...createCounter('simple'), id: 'base', value: 11 }, 10)

    const positions = [10, 11, 12].map((row) => guidePositionForRow(guide, row))
    expect(positions[0]).toBeCloseTo(0.725)
    expect(positions[1]).toBeCloseTo(0.42)
    expect(positions[2]).toBeCloseTo(0.215)
    expect(moved).toMatchObject({ position: 0.5, markerProgress: undefined, chartRegion: guide.chartRegion })
  })

  it('clears the marker when the counter row changes even if the line is clamped', () => {
    const guide = { id: 'guide', role: 'primary' as const, position: 0.99, linkedCounterId: 'base', rowSpacing: 0.05, rowSpacingStartRow: 4, rowSpacingDirection: 'down' as const, markerProgress: 0.6 }
    const moved = progressGuideForCounter(guide, { ...createCounter('simple'), id: 'base', value: 5 }, 4)
    expect(moved.position).toBe(1)
    expect(moved.markerProgress).toBeUndefined()
  })

  it('plays one task sound only for the matching completed row entry', () => {
    const history = { id: 'entry-2', label: '몸판 · 24단 완료', counters: [], guides: [], actualRow: 24, savedAt: 2 }
    expect(shouldPlayCounterTaskSound(history, '몸판', 25, 'entry-1', 24)).toBe(true)
    expect(shouldPlayCounterTaskSound(history, '몸판', 25, 'entry-2', 24)).toBe(false)
    expect(shouldPlayCounterTaskSound(history, '소매', 25, 'entry-1', 24)).toBe(false)
    expect(shouldPlayCounterTaskSound({ ...history, label: '단 되돌아가기' }, '몸판', 25, 'entry-1', 24)).toBe(false)
  })

  it('acknowledges the due auxiliary alert on the next row action while keeping later alerts distinct', () => {
    const base = { ...createCounter('simple'), id: 'base', value: 5, unit: 'row' as const }
    const pattern = { ...createCounter('pattern'), id: 'pattern', linkedToId: 'base', currentRow: 5, patternRow: 5, startRow: 1, repeatLength: 5 }
    const task = { ...createCounter('task'), id: 'task', linkedToId: 'base', currentRow: 5, firstTaskRow: 6, nextTaskRow: 6, interval: 4, total: 2, completedCount: 0 }
    const before = [base, pattern, task]
    const firstStep = advanceLinkedCounters(before, 'base', base.value)
    const due = counterAlertState(firstStep, 'base')
    expect(due.messages).toHaveLength(2)

    const secondStep = advanceLinkedCounters(firstStep, 'base', firstStep[0].value)
    const nextAlert = counterAlertState(secondStep, 'base')
    expect(nextAlert.messages).toEqual([])
    expect(nextAlert.key).not.toBe(due.key)
  })

  it('keeps a due task alert visible after its auxiliary counter is incremented until the main row advances', () => {
    const base = { ...createCounter('simple'), id: 'base', value: 6, unit: 'row' as const }
    const task = { ...createCounter('task', '줄임'), id: 'task', linkedToId: base.id, currentRow: 6, firstTaskRow: 6, nextTaskRow: 6, interval: 4, total: 8, completedCount: 0 }
    const completed = stepAuxiliaryCounter([base, task], task.id, 1)
    const afterTaskStep = counterAlertState(completed.counters, base.id)
    expect(afterTaskStep.alerts.map(({ counterId }) => counterId)).toEqual([task.id])

    const afterMainStep = advanceLinkedCounters(completed.counters, base.id, base.value)
    expect(counterAlertState(afterMainStep, base.id).alerts).toEqual([])
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
    expect(counterSideForRow({ ...base, knittingMode: 'round', firstSide: 'ws', goalFinalSide: 'ws' }, 35)).toBe('rs')
    expect([6, 14, 22, 30].map((row) => nextPatternAlertRow(pattern, row))).toEqual([6, 14, 22, 30])
  })

  it('defaults saved counters to flat and preserves a valid round mode', () => {
    const legacyMode = { ...createCounter('simple'), id: 'legacy-mode', knittingMode: undefined }
    const roundMode = { ...createCounter('simple'), id: 'round-mode', knittingMode: 'round' as const }
    expect(normalizeCounterSnapshots([legacyMode, roundMode]).map((counter) => counter.knittingMode)).toEqual(['flat', 'round'])
    expect(isCurrentCounterSnapshots([{ ...roundMode, knittingMode: 'circular' }])).toBe(false)
  })

  it('shows due and one-row-ahead alerts for the selected linked counter group', () => {
    const base = { ...createCounter('simple'), id: 'base', value: 5, goalRow: 6 }
    const pattern = { ...createCounter('pattern'), id: 'pattern', name: '꽈배기 A', linkedToId: 'base', startRow: 6, repeatLength: 8, patternPreviewEnabled: true }
    const task = { ...createCounter('task'), id: 'task', name: '소매 감소', linkedToId: 'base', nextTaskRow: 6, total: 4, taskKind: 'decrease' as const }
    const increase = { ...createCounter('task'), id: 'increase', name: '소매 늘림', linkedToId: 'base', nextTaskRow: 6, total: 4, taskKind: 'increase' as const }
    const preview = counterAlertState([base, pattern, task, increase], 'base', true)
    expect(preview.messages).toHaveLength(4)
    expect(preview.alerts.map(({ counterId }) => counterId)).toEqual(['base', 'pattern', 'task', 'increase'])
    const due = counterAlertState([{ ...base, value: 6 }, pattern, { ...task, currentRow: 6 }, { ...increase, currentRow: 6 }], 'base')
    expect(due.messages).toEqual([
      '꽈배기 A · 무늬 반복 단이에요.',
      '소매 감소 · 줄임 작업 단이에요.',
      '소매 늘림 · 늘림 작업 단이에요.',
    ])
    expect(due.alerts.map(({ counterId }) => counterId)).toEqual(['pattern', 'task', 'increase'])
  })

  it('finds an exact rewind checkpoint for one base and restores only that group', () => {
    const base = { ...createCounter('simple'), id: 'base', name: '몸판', value: 25, unit: 'row' as const }
    const pattern = { ...createCounter('pattern'), id: 'pattern', linkedToId: 'base', currentRow: 25 }
    const other = { ...createCounter('simple'), id: 'other', name: '소매', value: 9, unit: 'row' as const }
    const checkpointBase = { ...base, value: 24 }
    const checkpointPattern = { ...pattern, currentRow: 24, patternRow: 4 }
    const checkpoint = { id: 'row-24', label: '몸판 · 24단 완료', counters: [checkpointBase, checkpointPattern, other], guides: [], actualRow: 24, baseCounterId: 'base', savedAt: 24 }
    expect(findCounterRewindCheckpoint([checkpoint], [base, pattern, other], 'base', 24)).toBe(checkpoint)
    const correction = { ...checkpoint, id: 'manual-correction', label: '몸판 숫자 보정', counters: [{ ...base, value: 40 }, pattern, other], actualRow: 25, baseCounterId: 'base' }
    expect(findCounterRewindCheckpoint([checkpoint, correction], [base, pattern, other], 'base', 24)).toBeUndefined()
    const nextCheckpoint = { ...checkpoint, id: 'row-25', label: '몸판 · 25단 완료', counters: [base, pattern, other], actualRow: 25 }
    expect(findCounterRewindCheckpoint([checkpoint, correction, nextCheckpoint], [{ ...base, value: 26 }, pattern, other], 'base', 25)).toBe(nextCheckpoint)
    const restored = restoreCounterGroup([base, pattern, other], [checkpointBase, checkpointPattern, other], 'base')
    expect(restored).toMatchObject([{ id: 'base', value: 24 }, { id: 'pattern', currentRow: 24, patternRow: 4 }, { id: 'other', value: 9 }])
    expect(findCounterRewindCheckpoint([checkpoint], [base, pattern, other], 'other', 24)).toBeUndefined()
  })
})
