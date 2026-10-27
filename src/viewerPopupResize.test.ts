import { describe, expect, it } from 'vitest'
import { getDefaultViewerPopupSize, getViewerPopupAvailableBounds, getViewerPopupDragRect, getViewerPopupResizeRect, getViewerPopupSize, getViewerPopupSizeClass, type ViewerPopupRect } from './viewerPopupResize'

const start: ViewerPopupRect = { left: 100, top: 80, width: 300, height: 240 }
const bounds: ViewerPopupRect = { left: 0, top: 0, width: 500, height: 400 }
const resize = (handle: 'bottom-left' | 'bottom-right', deltaX: number, deltaY: number, nextBounds = bounds) => getViewerPopupResizeRect({
  handle, start, deltaX, deltaY, bounds: nextBounds, minWidth: 260, minHeight: 180,
})

describe('counter popover resize', () => {
  it('keeps the top-left anchor when resizing from the bottom-right', () => {
    expect(resize('bottom-right', 50, 30)).toEqual({ left: 100, top: 80, width: 350, height: 270 })
  })

  it('keeps the top-right anchor when resizing from the bottom-left', () => {
    expect(resize('bottom-left', -40, 30)).toEqual({ left: 60, top: 80, width: 340, height: 270 })
  })

  it('stops at the minimum while keeping the opposite top corner fixed', () => {
    expect(resize('bottom-right', -100, -100)).toEqual({ left: 100, top: 80, width: 260, height: 180 })
    expect(resize('bottom-left', 100, -100)).toEqual({ left: 140, top: 80, width: 260, height: 180 })
  })

  it('clamps to the available maximum and remains inside bounds', () => {
    expect(resize('bottom-right', 500, 500)).toEqual({ left: 100, top: 80, width: 400, height: 320 })
    expect(resize('bottom-left', -500, 500)).toEqual({ left: 0, top: 80, width: 400, height: 320 })
  })

  it('honors viewport bounds smaller than the configured minimum', () => {
    expect(resize('bottom-right', 500, 500, { left: 10, top: 20, width: 200, height: 100 })).toEqual({ left: 10, top: 20, width: 200, height: 100 })
  })

  it('applies cumulative deltas from the same starting rectangle without drift', () => {
    expect(resize('bottom-right', 10, 20)).toEqual(resize('bottom-right', 10, 20))
    expect(resize('bottom-left', -10, 20)).toEqual({ left: 90, top: 80, width: 310, height: 260 })
  })

  it('rejects invalid bounds and min/max dimensions', () => {
    expect(getViewerPopupResizeRect({ handle: 'bottom-right', start, deltaX: 0, deltaY: 0, bounds: { ...bounds, width: 0 }, minWidth: 260, minHeight: 180 })).toBeNull()
    expect(getViewerPopupResizeRect({ handle: 'bottom-right', start, deltaX: 0, deltaY: 0, bounds, minWidth: Number.NaN, minHeight: 180 })).toBeNull()
    expect(getViewerPopupResizeRect({ handle: 'bottom-right', start, deltaX: 0, deltaY: 0, bounds, minWidth: 260, minHeight: -1 })).toBeNull()
  })

  it('intersects the viewer, visual viewport and safe-area margins', () => {
    expect(getViewerPopupAvailableBounds({
      shell: { left: 0, top: 24, width: 800, height: 900 },
      viewport: { left: 20, top: 30, width: 600, height: 500 },
      safeArea: { top: 10, right: 20, bottom: 30, left: 15 },
    })).toEqual({ left: 43, top: 48, width: 549, height: 444 })
    expect(getViewerPopupAvailableBounds({ shell: { left: 0, top: 0, width: 100, height: 100 }, viewport: { left: 200, top: 0, width: 100, height: 100 }, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } })).toBeNull()
  })

  it('clamps a preferred size to the available area without changing the preference', () => {
    const preferred = { width: 480, height: 600 }
    expect(getViewerPopupSize(preferred, { left: 0, top: 0, width: 320, height: 300 }, 220)).toEqual({ width: 320, height: 300 })
    expect(preferred).toEqual({ width: 480, height: 600 })
  })

  it('uses the planned default sizes and width breakpoints', () => {
    expect(getDefaultViewerPopupSize('counterPanel', bounds, 200)).toEqual({ width: 360, height: 300 })
    expect(getDefaultViewerPopupSize('timerBar', bounds, 180)).toEqual({ width: 400, height: 220 })
    expect(getDefaultViewerPopupSize('counterPanel', bounds, 200, 360)).toEqual({ width: 360, height: 300 })
    expect(getDefaultViewerPopupSize('timerBar', bounds, 180, 480)).toEqual({ width: 480, height: 220 })
    expect([339, 340, 479, 480].map(getViewerPopupSizeClass)).toEqual(['small', 'medium', 'medium', 'large'])
  })

  it('moves from the original pointer offset and clamps the popup to screen bounds', () => {
    expect(getViewerPopupDragRect(start, bounds, 50, 30)).toEqual({ left: 150, top: 110, width: 300, height: 240 })
    expect(getViewerPopupDragRect(start, bounds, 500, 500)).toEqual({ left: 200, top: 160, width: 300, height: 240 })
    expect(getViewerPopupDragRect(start, bounds, -500, -500)).toEqual({ left: 0, top: 0, width: 300, height: 240 })
  })
})
