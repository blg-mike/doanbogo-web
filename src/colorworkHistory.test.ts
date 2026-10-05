import { describe, expect, it } from 'vitest'
import { applyColorworkCellChanges } from './colorworkHistory'

describe('colorwork history deltas', () => {
  it('undoes and redoes changed cells without replacing the source grid', () => {
    const original = [null, { color: '#ff0000', opacity: 1 }, null]
    const changes = [
      { index: 0, before: null, after: { color: '#00ff00', opacity: 0.5 } },
      { index: 1, before: { color: '#ff0000', opacity: 1 }, after: null },
    ]

    const painted = applyColorworkCellChanges(original, changes, 'redo')
    const restored = applyColorworkCellChanges(painted, changes, 'undo')

    expect(painted).toEqual([{ color: '#00ff00', opacity: 0.5 }, null, null])
    expect(restored).toEqual(original)
    expect(original).toEqual([null, { color: '#ff0000', opacity: 1 }, null])
  })
})
