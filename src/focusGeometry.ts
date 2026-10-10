import type { PageRotation, ProgressChartRegion, ProgressFocusSettings, ProgressGuide } from './types'
import { guideRowPosition } from './progressLines'

const legacyFocusDimOpacity = { low: 0.15, medium: 0.22, high: 0.32 } as const

export function focusDimOpacity(focus: ProgressFocusSettings) {
  return focus.dimOpacity ?? legacyFocusDimOpacity[focus.strength]
}

export function focusBandHeightRatio(focus: ProgressFocusSettings, rowSpacing: number) {
  return Math.min(1, focus.bandHeightRatio ?? rowSpacing * (focus.range * 2 + 1))
}

export interface NormalizedRect {
  x: number
  y: number
  width: number
  height: number
}

export function displayRectToPageRect(rect: NormalizedRect, rotation: PageRotation): NormalizedRect {
  if (rotation === 90) return { x: rect.y, y: 1 - rect.x - rect.width, width: rect.height, height: rect.width }
  if (rotation === 180) return { x: 1 - rect.x - rect.width, y: 1 - rect.y - rect.height, width: rect.width, height: rect.height }
  if (rotation === 270) return { x: 1 - rect.y - rect.height, y: rect.x, width: rect.height, height: rect.width }
  return { ...rect }
}

export function pageRectToDisplayRect(rect: NormalizedRect, rotation: PageRotation): NormalizedRect {
  if (rotation === 90) return { x: 1 - rect.y - rect.height, y: rect.x, width: rect.height, height: rect.width }
  if (rotation === 180) return { x: 1 - rect.x - rect.width, y: 1 - rect.y - rect.height, width: rect.width, height: rect.height }
  if (rotation === 270) return { x: rect.y, y: 1 - rect.x - rect.width, width: rect.height, height: rect.width }
  return { ...rect }
}

export function focusRowSpacing(region: ProgressChartRegion | undefined, fallback: number, rotation: PageRotation) {
  if (!region) return fallback
  const rowCount = Math.max(1, region.lastRow - region.firstRow + 1)
  const display = pageRectToDisplayRect(region, rotation)
  return rowCount > 1 ? (region.rowLayout?.height ?? display.height) / (rowCount - 1) : fallback
}

export function guidePositionForRotation(guide: ProgressGuide, row: number, rotation: PageRotation) {
  const screenPosition = guide.rotationPositions?.[String(rotation) as '0' | '90' | '180' | '270']
  const orientedGuide = screenPosition ? { ...guide, ...screenPosition } : guide
  const effectiveRow = row - (orientedGuide.counterRowOffset ?? 0)
  const region = orientedGuide.chartRegion
  if (screenPosition?.rowSpacingStartRow !== undefined || !region) return guideRowPosition(orientedGuide, effectiveRow)
  const rowCount = Math.max(1, region.lastRow - region.firstRow + 1)
  let index = effectiveRow - region.startCounterRow
  if (region.repeat) index = ((index % rowCount) + rowCount) % rowCount
  else index = Math.max(0, Math.min(rowCount - 1, index))
  const position = region.rowPositions?.length === rowCount
    ? region.rowPositions[index]
    : (() => {
        const display = region.rowLayout
          ? { y: region.rowLayout.top, height: region.rowLayout.height }
          : pageRectToDisplayRect(region, rotation)
        const fraction = rowCount < 2 ? 0 : index / (rowCount - 1)
        const direction = region.direction === 'bottom-to-top' ? 1 - fraction : fraction
        return display.y + display.height * direction
      })()
  return Math.min(1, Math.max(0, position + (orientedGuide.positionOffset ?? 0)))
}

export function formatFocusSpacingPercent(value: number) {
  return String(Number((value * 100).toFixed(2)))
}

export function parseFocusSpacingPercent(value: string) {
  if (!value.trim()) return null
  const percent = Number(value)
  return Number.isFinite(percent) && percent >= 0.5 && percent <= 50 ? percent / 100 : null
}
