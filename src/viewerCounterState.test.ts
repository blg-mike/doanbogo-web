import { describe, expect, it } from 'vitest'
import { createCounter } from './smartCounter'
import type { CounterHistoryEntry, ViewerSnapshot } from './types'
import { normalizeViewerCounterState } from './viewerCounterState'

describe('viewer counter compatibility', () => {
  it('preserves the row main counter, counts and undo state without mutating the saved snapshot', () => {
    const counters = (['stitch', 'row', 'round'] as const).map((unit, index) => ({ ...createCounter('simple', unit), id: unit, unit, value: 12 + index }))
    const history: CounterHistoryEntry & { timeLapId: string } = {
      id: 'history', label: '기존 작업', counters: counters.map((counter) => ({ ...counter, value: counter.value - 1 })),
      actualRow: 12, baseCounterId: 'row', counterOnly: true, savedAt: 10, timeLapId: 'lap',
      guides: [{ pageNumber: 1, horizontalGuides: [{ id: 'guide', position: 0.25, color: '#00865D' }], verticalGuides: [] }],
    }
    const viewer: ViewerSnapshot & { counterTimeLaps: { id: string }[] } = {
      documentId: 'document', split: false, activePane: 'primary',
      primary: { page: 1, zoom: 1.25, centerX: 0.3, centerY: 0.7 },
      secondary: { page: 2, zoom: 1, centerX: 0.5, centerY: 0.5 },
      wideRatio: 0.5, tallRatio: 0.5, updatedAt: 20,
      counters, counterMainId: 'stitch', counterHistory: [history], counterTimeLaps: [{ id: 'lap' }],
    }
    const original = structuredClone(viewer)

    const normalized = normalizeViewerCounterState(viewer)

    expect(normalized.counterMainId).toBe('row')
    expect(normalized.counters).toMatchObject([
      { id: 'stitch', unit: 'row', value: 12 }, { id: 'row', unit: 'row', value: 13 }, { id: 'round', unit: 'row', value: 14 },
    ])
    expect(normalized.counterHistory).toMatchObject([{
      id: 'history', label: '기존 작업', actualRow: 12, baseCounterId: 'row', counterOnly: true, savedAt: 10, guides: history.guides,
      counters: [{ id: 'stitch', unit: 'row', value: 11 }, { id: 'row', unit: 'row', value: 12 }, { id: 'round', unit: 'row', value: 13 }],
    }])
    expect(normalized).toMatchObject({ primary: viewer.primary, secondary: viewer.secondary, wideRatio: 0.5, tallRatio: 0.5, updatedAt: 20 })
    expect(normalized).not.toHaveProperty('counterTimeLaps')
    expect(normalized.counterHistory?.[0]).not.toHaveProperty('timeLapId')
    expect(normalizeViewerCounterState(normalized)).toEqual(normalized)
    expect(viewer).toEqual(original)
  })
})
