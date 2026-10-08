import type { PageRotation, ProgressChartRegion, ProgressGuide } from './types'
import { guideRowPosition } from './progressLines'

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
  if (screenPosition?.rowSpacingStartRow !== undefined) return guideRowPosition(orientedGuide, row)
  const region = orientedGuide.chartRegion
  if (!region) return guideRowPosition(orientedGuide, row)
  const rowCount = Math.max(1, region.lastRow - region.firstRow + 1)
  let index = row - region.startCounterRow
  if (region.repeat) index = ((index % rowCount) + rowCount) % rowCount
  else index = Math.max(0, Math.min(rowCount - 1, index))
  if (region.rowPositions?.length === rowCount) return region.rowPositions[index]
  const display = region.rowLayout
    ? { y: region.rowLayout.top, height: region.rowLayout.height }
    : pageRectToDisplayRect(region, rotation)
  const fraction = rowCount < 2 ? 0 : index / (rowCount - 1)
  const direction = region.direction === 'bottom-to-top' ? 1 - fraction : fraction
  return display.y + display.height * direction
}

export function formatFocusSpacingPercent(value: number) {
  return String(Number((value * 100).toFixed(2)))
}

export function parseFocusSpacingPercent(value: string) {
  if (!value.trim()) return null
  const percent = Number(value)
  return Number.isFinite(percent) && percent >= 0.5 && percent <= 50 ? percent / 100 : null
}
