import { describe, expect, it } from 'vitest'
import { anchoredScrollOffset, classifyWheelInput, clientPointForPagePosition, isEditableTarget, pagePositionAtClientPoint, scrollOffsetForZoomFocus, wheelActionForBurst, wheelZoom } from './viewerInteraction'

describe('PDF viewer input helpers', () => {
  it('recognizes stepped mouse wheels while preserving trackpad scrolling', () => {
    expect(classifyWheelInput({ deltaX: 0, deltaY: -100, deltaMode: 0, ctrlKey: false })).toBe('zoom')
    expect(classifyWheelInput({ deltaX: 0, deltaY: 3, deltaMode: 1, ctrlKey: false })).toBe('zoom')
    expect(classifyWheelInput({ deltaX: 0, deltaY: -12.5, deltaMode: 0, ctrlKey: false })).toBe('pan')
    expect(classifyWheelInput({ deltaX: 5, deltaY: -100, deltaMode: 0, ctrlKey: false })).toBe('pan')
    expect(classifyWheelInput({ deltaX: 0, deltaY: -12, deltaMode: 0, ctrlKey: true })).toBe('zoom')
    expect(classifyWheelInput({ deltaX: -12, deltaY: 0, deltaMode: 0, ctrlKey: true })).toBe('zoom')
  })

  it('keeps a trackpad-like input burst in pan mode until 200ms of silence', () => {
    expect(wheelActionForBurst('pan', 100, 0)).toEqual({ action: 'pan', burstUntil: 300 })
    expect(wheelActionForBurst('zoom', 299, 300)).toEqual({ action: 'pan', burstUntil: 499 })
    expect(wheelActionForBurst('zoom', 300, 300)).toEqual({ action: 'zoom', burstUntil: 300 })
  })

  it('changes zoom by wheel direction and clamps to the viewer limits', () => {
    expect(wheelZoom(1, { deltaX: 0, deltaY: -100, deltaMode: 0, ctrlKey: false })).toBeCloseTo(1.1)
    expect(wheelZoom(2, { deltaX: 0, deltaY: 100, deltaMode: 0, ctrlKey: false })).toBeCloseTo(2 / 1.1)
    expect(wheelZoom(4.9, { deltaX: 0, deltaY: -300, deltaMode: 0, ctrlKey: false })).toBe(5)
    expect(wheelZoom(1.1, { deltaX: 0, deltaY: 300, deltaMode: 0, ctrlKey: false })).toBe(1)
  })

  it('keeps the selected page point under the pointer within scroll bounds', () => {
    expect(anchoredScrollOffset(20, 400, 0.25, 80, 600, 200)).toBe(40)
    expect(anchoredScrollOffset(20, 400, 0.25, 20, 600, 200)).toBe(100)
    expect(anchoredScrollOffset(0, 100, 0, 400, 300, 200)).toBe(0)
  })

  it('round-trips pointer positions through a rotated, scaled page transform', () => {
    const rect = { left: 100, top: 0, width: 400, height: 800 } as DOMRect
    const point = clientPointForPagePosition(rect, 400, 200, 90, 2, 0.25, 0.75)
    expect(point).toEqual({ x: 200, y: 200 })
    expect(pagePositionAtClientPoint(rect, 400, 200, 90, 2, point.x, point.y)).toEqual({ x: 0.25, y: 0.75 })
  })

  it('clamps zoom anchoring to the available scroll range', () => {
    expect(scrollOffsetForZoomFocus(20, 180, 80, 600, 200)).toBe(120)
    expect(scrollOffsetForZoomFocus(20, -100, 80, 600, 200)).toBe(0)
    expect(scrollOffsetForZoomFocus(20, 800, 80, 300, 200)).toBe(100)
  })

  it('identifies editable and interactive targets for temporary Space panning', () => {
    const input = { tagName: 'TEXTAREA', closest: (selector: string) => selector.includes('textarea') }
    const page = { tagName: 'DIV', closest: () => null }
    expect(isEditableTarget(input as unknown as EventTarget)).toBe(true)
    expect(isEditableTarget(page as unknown as EventTarget)).toBe(false)
  })
})
