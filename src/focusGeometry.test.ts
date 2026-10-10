import { describe, expect, it } from 'vitest'
import { displayRectToPageRect, focusBandHeightRatio, focusDimOpacity, focusRowSpacing, formatFocusSpacingPercent, guidePositionForRotation, pageRectToDisplayRect, parseFocusSpacingPercent } from './focusGeometry'
import type { ProgressFocusSettings, ProgressGuide } from './types'

describe('focus view rotation geometry', () => {
  const rect = { x: 0.17, y: 0.23, width: 0.41, height: 0.52 }

  it.each([0, 90, 180, 270] as const)('round-trips page and display rectangles at %i degrees', (rotation) => {
    const display = pageRectToDisplayRect(rect, rotation)
    const page = displayRectToPageRect(display, rotation)
    expect(page.x).toBeCloseTo(rect.x)
    expect(page.y).toBeCloseTo(rect.y)
    expect(page.width).toBeCloseTo(rect.width)
    expect(page.height).toBeCloseTo(rect.height)
  })

  it('keeps a horizontal focus band horizontal on screen after all page rotations', () => {
    const band = { x: 0, y: 0.4, width: 1, height: 0.06 }
    const at90 = displayRectToPageRect(band, 90)
    const at270 = displayRectToPageRect(band, 270)
    expect(at90.width).toBeCloseTo(0.06)
    expect(at90.height).toBeCloseTo(1)
    expect(at270.width).toBeCloseTo(0.06)
    expect(at270.height).toBeCloseTo(1)
    expect(displayRectToPageRect(band, 0).height).toBeCloseTo(0.06)
    expect(displayRectToPageRect(band, 180).height).toBeCloseTo(0.06)
  })

  it('maps counter rows and focus spacing along the displayed vertical axis', () => {
    const guide: ProgressGuide = {
      id: 'guide',
      position: 0.5,
      chartRegion: { x: 0.2, y: 0.1, width: 0.4, height: 0.8, firstRow: 1, lastRow: 5, startCounterRow: 1, repeat: false, direction: 'top-to-bottom' },
    }
    expect(guidePositionForRotation(guide, 3, 90)).toBeCloseTo(0.4)
    expect(guidePositionForRotation(guide, 3, 270)).toBeCloseTo(0.6)
    expect(focusRowSpacing(guide.chartRegion, 0.03, 90)).toBeCloseTo(0.1)
    const adjusted = { ...guide, chartRegion: { ...guide.chartRegion!, rowLayout: { top: 0.25, height: 0.5 } } }
    expect(guidePositionForRotation(adjusted, 5, 90)).toBeCloseTo(0.75)
    expect(focusRowSpacing(adjusted.chartRegion, 0.03, 90)).toBeCloseTo(0.125)
  })
})

describe('focus spacing percentage input', () => {
  it('preserves decimal steps such as 7.5 percent', () => {
    expect(formatFocusSpacingPercent(0.08)).toBe('8')
    expect(parseFocusSpacingPercent('7.5')).toBe(0.075)
  })

  it('rejects empty, out-of-range, and non-numeric spacing', () => {
    expect(parseFocusSpacingPercent('')).toBeNull()
    expect(parseFocusSpacingPercent('0.4')).toBeNull()
    expect(parseFocusSpacingPercent('50.5')).toBeNull()
    expect(parseFocusSpacingPercent('abc')).toBeNull()
  })
})

describe('focus overlay settings', () => {
  const legacyFocus: ProgressFocusSettings = { enabled: true, strength: 'low', range: 1, scope: 'page', rowSpacing: 0.04 }

  it('keeps old focus strengths and row-based band widths when new values are absent', () => {
    expect(focusDimOpacity(legacyFocus)).toBe(0.15)
    expect(focusBandHeightRatio(legacyFocus, legacyFocus.rowSpacing)).toBeCloseTo(0.12)
  })

  it('uses the saved slider values after a user adjusts the focus overlay', () => {
    const adjusted = { ...legacyFocus, dimOpacity: 0.58, bandHeightRatio: 0.17 }
    expect(focusDimOpacity(adjusted)).toBe(0.58)
    expect(focusBandHeightRatio(adjusted, legacyFocus.rowSpacing)).toBe(0.17)
    expect(focusBandHeightRatio({ ...adjusted, bandHeightRatio: undefined }, 0.9)).toBe(1)
  })
})
