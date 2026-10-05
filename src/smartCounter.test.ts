import { describe, expect, it } from 'vitest'
import { counterPatternState, counterTaskProgress, createCounterTaskRule, createDefaultCounters, dueCounterTasks, isCounterSnapshots, normalizeCounterSnapshots, setCounterTaskOccurrences } from './smartCounter'

describe('smart counter calculations', () => {
  it('keeps five existing simple counters as the default', () => {
    const counters = createDefaultCounters()
    expect(counters).toHaveLength(5)
    expect(counters.every((counter) => counter.mode === 'simple' && counter.value === 0)).toBe(true)
    expect(isCounterSnapshots(counters)).toBe(true)
  })

  it('normalizes a saved repeat counter without resetting its values', () => {
    const counters = createDefaultCounters()
    counters[0] = {
      ...counters[0], mode: 'repeat', value: 19, repeatName: '몸판 무늬', startRow: 5, repeatLength: 12, repeatCount: 3,
      taskRules: [{ id: 'decrease-1', kind: 'decrease', interval: 6, total: 8 }],
      taskOccurrences: [{ ruleId: 'decrease-1', occurrence: 1, status: 'done' }, { ruleId: 'decrease-1', occurrence: 2, status: 'missed' }],
    }
    expect(normalizeCounterSnapshots(counters)[0]).toMatchObject({ mode: 'repeat', value: 19, repeatName: '몸판 무늬', taskRules: [{ id: 'decrease-1' }] })
  })

  it('calculates the pattern row and repeat number from the configured start row', () => {
    const [counter] = createDefaultCounters()
    const configured = { ...counter, mode: 'repeat' as const, value: 19, startRow: 5, repeatLength: 12 }
    expect(counterPatternState(configured)).toEqual({ kind: 'active', patternRow: 3, repeatNumber: 2 })
    expect(counterPatternState({ ...configured, value: 4 })).toEqual({ kind: 'before' })
    expect(counterPatternState({ ...configured, value: 29, repeatCount: 2 })).toEqual({ kind: 'complete' })
  })

  it('signals every configured interval and counts completed and missed work separately', () => {
    const [base] = createDefaultCounters()
    const rule = { ...createCounterTaskRule(), interval: 6, total: 8 }
    const counter = { ...base, mode: 'repeat' as const, value: 30, taskRules: [rule] }
    expect(dueCounterTasks(counter)).toMatchObject([{ rule, occurrence: 5 }])
    const done = setCounterTaskOccurrences(counter, dueCounterTasks(counter), 'done')
    expect(counterTaskProgress(done, rule)).toEqual({ completed: 1, missed: 0, remaining: 7 })
    const missed = setCounterTaskOccurrences(done, dueCounterTasks(done), 'missed')
    expect(counterTaskProgress(missed, rule)).toEqual({ completed: 0, missed: 1, remaining: 8 })
  })

  it('does not schedule beyond the configured number of actions', () => {
    const [base] = createDefaultCounters()
    const rule = { ...createCounterTaskRule('increase'), interval: 6, total: 2 }
    expect(dueCounterTasks({ ...base, mode: 'repeat', value: 18, taskRules: [rule] })).toEqual([])
  })

  it('keeps a completed task complete when another task on that row is skipped', () => {
    const [base] = createDefaultCounters()
    const decrease = { ...createCounterTaskRule('decrease'), interval: 6, total: 8 }
    const increase = { ...createCounterTaskRule('increase'), interval: 6, total: 4 }
    const counter = { ...base, mode: 'repeat' as const, value: 12, taskRules: [decrease, increase] }
    const due = dueCounterTasks(counter)
    const withOneDone = setCounterTaskOccurrences(counter, [due[0]], 'done')
    const tasksToMiss = dueCounterTasks(withOneDone).filter((task) => task.status === undefined)
    const withOneMissed = setCounterTaskOccurrences(withOneDone, tasksToMiss, 'missed')
    expect(dueCounterTasks(withOneMissed)).toMatchObject([{ rule: decrease, occurrence: 2, status: 'done' }, { rule: increase, occurrence: 2, status: 'missed' }])
  })
})
