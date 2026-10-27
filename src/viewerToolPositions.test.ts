import { describe, expect, it } from 'vitest'
import { createViewerToolPosition, getViewerToolPosition, readViewerToolPosition, saveViewerToolPosition, type ViewerToolPosition } from './viewerToolPositions'

function createStorage(initial?: string) {
  let value = initial ?? null
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => { value = next },
    value: () => value,
  }
}

const bounds = { left: 20, top: 30, width: 600, height: 400 }
const rect = { left: 120, top: 105, width: 200, height: 100 }

describe('viewer tool position preferences', () => {
  it('round-trips separate normalized positions and restores them at another viewport size', () => {
    const storage = createStorage()
    const position = createViewerToolPosition(bounds, rect) as ViewerToolPosition
    expect(position).toEqual({ leftRatio: 0.25, topRatio: 0.25 })
    expect(saveViewerToolPosition('timerBar', position, storage)).toBe(true)
    expect(saveViewerToolPosition('counterPanel', { leftRatio: 1, topRatio: 1 }, storage)).toBe(true)
    expect(readViewerToolPosition('timerBar', storage)).toEqual(position)
    expect(getViewerToolPosition({ left: 0, top: 0, width: 800, height: 600 }, { width: 400, height: 200 }, position)).toEqual({ left: 100, top: 100 })
    expect(readViewerToolPosition('counterPanel', storage)).toEqual({ leftRatio: 1, topRatio: 1 })
  })

  it.each([
    'invalid json',
    '{"version":2,"timerBar":{"leftRatio":0.2,"topRatio":0.5}}',
    '{"version":1,"timerBar":{"leftRatio":-1,"topRatio":0.5}}',
    '{"version":1,"counterPanel":{"leftRatio":0.5,"topRatio":2}}',
  ])('ignores malformed preferences: %s', (raw) => {
    expect(readViewerToolPosition('timerBar', createStorage(raw))).toBeNull()
    expect(readViewerToolPosition('counterPanel', createStorage(raw))).toBeNull()
  })

  it('clamps out-of-range popup coordinates when normalizing', () => {
    expect(createViewerToolPosition(bounds, { ...rect, left: 900, top: -20 })).toEqual({ leftRatio: 1, topRatio: 0 })
    expect(getViewerToolPosition(bounds, rect, { leftRatio: 1, topRatio: 1 })).toEqual({ left: 420, top: 330 })
  })
})
