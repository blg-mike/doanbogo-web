import { describe, expect, it } from 'vitest'
import { anchoredScrollOffset, classifyWheelInput, clientPointForPagePosition, isEditableTarget, pagePositionAtClientPoint, pinchPreviewTranslation, regionHighlightPointerAction, scrollOffsetForZoomFocus, wheelActionForBurst, wheelZoom } from './viewerInteraction'

describe('PDF viewer input helpers', () => {
  it('moves an existing region only when the region highlight tool is active', () => {
    expect(regionHighlightPointerAction('pan', true)).toBe('select')
    expect(regionHighlightPointerAction('region-highlight', true)).toBe('move')
    expect(regionHighlightPointerAction('region-highlight', false)).toBe('create')
    expect(regionHighlightPointerAction('pen', true)).toBe('ignore')
  })

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

  it('keeps the pinch anchor under the moving midpoint for both page orientations', () => {
    for (const rotation of [0, 90]) {
      const translation = pinchPreviewTranslation(300, 400, 400, 800, rotation, 1.8, 0.27, 0.64, 280, 450)
      const anchor = clientPointForPagePosition({ left: 299.5, top: 399.5, width: 1, height: 1 } as DOMRect, 400, 800, rotation, 1.8, 0.27, 0.64)
      expect({ x: anchor.x + translation.x, y: anchor.y + translation.y }).toEqual({ x: 280, y: 450 })
    }
  })

  it('keeps the final pinch point under the same midpoint after the PDF raster changes size', () => {
    const baseWidth = 400
    const baseHeight = 800
    const point = { x: 0.27, y: 0.64 }
    const target = { x: 280, y: 450 }
    const zoom = 1.8

    for (const rotation of [0, 90, 180, 270]) {
      const initialRect = {
        left: 100,
        top: 100,
        width: rotation % 180 === 0 ? baseWidth : baseHeight,
        height: rotation % 180 === 0 ? baseHeight : baseWidth,
      } as DOMRect
      const translation = pinchPreviewTranslation(
        initialRect.left + initialRect.width / 2,
        initialRect.top + initialRect.height / 2,
        baseWidth,
        baseHeight,
        rotation,
        zoom,
        point.x,
        point.y,
        target.x,
        target.y,
      )
      const previewPoint = clientPointForPagePosition(initialRect, baseWidth, baseHeight, rotation, zoom, point.x, point.y)
      expect({ x: previewPoint.x + translation.x, y: previewPoint.y + translation.y }).toEqual(target)

      const finalWidth = baseWidth * zoom
      const finalHeight = baseHeight * zoom
      const finalRect = {
        left: 120,
        top: 90,
        width: rotation % 180 === 0 ? finalWidth : finalHeight,
        height: rotation % 180 === 0 ? finalHeight : finalWidth,
      } as DOMRect
      const finalPoint = clientPointForPagePosition(finalRect, finalWidth, finalHeight, rotation, 1, point.x, point.y)
      const oldScroll = { x: 500, y: 500 }
      const nextScroll = {
        x: scrollOffsetForZoomFocus(oldScroll.x, finalPoint.x, target.x, 5000, 1000),
        y: scrollOffsetForZoomFocus(oldScroll.y, finalPoint.y, target.y, 5000, 1000),
      }

      expect(finalPoint.x - (nextScroll.x - oldScroll.x)).toBeCloseTo(target.x)
      expect(finalPoint.y - (nextScroll.y - oldScroll.y)).toBeCloseTo(target.y)
    }
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
