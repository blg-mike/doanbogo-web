import { describe, expect, it } from 'vitest'
import { canStartCounterPopoverDrag, getCounterPopoverDragPosition, shouldCancelCounterPopoverLongPress } from './counterPopoverDrag'

describe('counter popover drag', () => {
  it('starts mouse drag immediately and touch drag after a long press', () => {
    expect(canStartCounterPopoverDrag('mouse', 0)).toBe(true)
    expect(canStartCounterPopoverDrag('touch', 449)).toBe(false)
    expect(canStartCounterPopoverDrag('touch', 450)).toBe(true)
  })

  it('cancels a pending touch drag after the finger moves', () => {
    expect(shouldCancelCounterPopoverLongPress(4, 4)).toBe(false)
    expect(shouldCancelCounterPopoverLongPress(0, 9)).toBe(true)
  })

  it('keeps the panel inside its parent or viewport, even when it is oversized', () => {
    expect(getCounterPopoverDragPosition({ left: 80, top: 50, deltaX: 500, deltaY: 400, panelWidth: 200, panelHeight: 100, boundsWidth: 400, boundsHeight: 300 })).toEqual({ left: 192, top: 192 })
    expect(getCounterPopoverDragPosition({ left: 0, top: 0, deltaX: -20, deltaY: -20, panelWidth: 500, panelHeight: 500, boundsWidth: 300, boundsHeight: 200 })).toEqual({ left: 8, top: 8 })
  })
})
