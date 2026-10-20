import { describe, expect, it } from 'vitest'
import { anchoredScrollOffset, canStartPaneGesture, classifyWheelInput, clientPointForPagePosition, isEditableTarget, nearestZoomLevel, pagePositionAtClientPoint, pinchPreviewTranslation, regionHighlightPointerAction, scrollOffsetForZoomFocus, stepZoomLevel, visiblePageCrop, wheelActionForBurst, wheelZoom, ZOOM_LEVELS } from './viewerInteraction'

describe('PDF viewer input helpers', () => {
  it('selects a region on first contact and allows a later drag to move it with either selection tool', () => {
    expect(regionHighlightPointerAction('pan', true)).toBe('select')
    expect(regionHighlightPointerAction('pan', true, true)).toBe('move')
    expect(regionHighlightPointerAction('region-highlight', true)).toBe('select')
    expect(regionHighlightPointerAction('region-highlight', true, true)).toBe('move')
    expect(regionHighlightPointerAction('region-highlight', false)).toBe('create')
    expect(regionHighlightPointerAction('pen', true)).toBe('ignore')
  })

  it('keeps simultaneous pan gestures in one viewer pane while allowing a same-pane pinch', () => {
    expect(canStartPaneGesture(null, 'primary')).toBe(true)
    expect(canStartPaneGesture('primary', 'primary')).toBe(true)
    expect(canStartPaneGesture('primary', 'secondary')).toBe(false)
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

  it('steps zoom through the fixed viewer levels and snaps pinch results to the nearest level', () => {
    expect(ZOOM_LEVELS).toEqual([0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 5])
    expect(stepZoomLevel(1, -1)).toBe(0.75)
    expect(stepZoomLevel(1, 1)).toBe(1.25)
    expect(stepZoomLevel(1.1, -1)).toBe(1)
    expect(stepZoomLevel(1.1, 1)).toBe(1.25)
    expect(nearestZoomLevel(1.38)).toBe(1.5)
    expect(nearestZoomLevel(1.36)).toBe(1.25)
    expect(wheelZoom(1, { deltaX: 0, deltaY: -100, deltaMode: 0, ctrlKey: false })).toBe(1.25)
    expect(wheelZoom(2, { deltaX: 0, deltaY: 100, deltaMode: 0, ctrlKey: false })).toBe(1.5)
    expect(wheelZoom(4.9, { deltaX: 0, deltaY: -300, deltaMode: 0, ctrlKey: false })).toBe(5)
    expect(wheelZoom(1.1, { deltaX: 0, deltaY: 300, deltaMode: 0, ctrlKey: false })).toBe(0.5)
    expect(wheelZoom(1, { deltaX: 0, deltaY: -100, deltaMode: 0, ctrlKey: true })).toBe(1.25)
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

  it('maps the visible viewport crop back to page coordinates through rotation', () => {
    expect(visiblePageCrop(
      { left: 100, top: 100, width: 400, height: 200 } as DOMRect,
      { left: 200, top: 150, right: 300, bottom: 200 } as DOMRect,
      400, 200, 0, 1,
    )).toEqual({ x: 0.25, y: 0.25, width: 0.25, height: 0.25 })
    const rotatedCrop = visiblePageCrop(
      { left: 100, top: 100, width: 200, height: 400 } as DOMRect,
      { left: 150, top: 200, right: 200, bottom: 300 } as DOMRect,
      400, 200, 90, 1,
    )
    expect(rotatedCrop?.x).toBeCloseTo(0.25)
    expect(rotatedCrop?.y).toBeCloseTo(0.5)
    expect(rotatedCrop?.width).toBeCloseTo(0.25)
    expect(rotatedCrop?.height).toBeCloseTo(0.25)
    expect(visiblePageCrop(
      { left: 100, top: 100, width: 400, height: 200 } as DOMRect,
      { left: 0, top: 0, right: 50, bottom: 50 } as DOMRect,
      400, 200, 0, 1,
    )).toBeNull()
    for (const rotation of [0, 90, 180, 270]) {
      const width = rotation % 180 ? 200 : 400
      const height = rotation % 180 ? 400 : 200
      const rect = { left: 100, top: 100, width, height } as DOMRect
      const crop = visiblePageCrop(rect, { left: 100 + width / 4, top: 100 + height / 4, right: 100 + width * 3 / 4, bottom: 100 + height * 3 / 4 } as DOMRect, 400, 200, rotation, 1)
      expect(crop?.x).toBeCloseTo(0.25)
      expect(crop?.y).toBeCloseTo(0.25)
      expect(crop?.width).toBeCloseTo(0.5)
      expect(crop?.height).toBeCloseTo(0.5)
    }
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
