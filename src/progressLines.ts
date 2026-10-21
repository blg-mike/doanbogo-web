import type { PageWorkRecord, ProgressGuide } from './types'

export const DEFAULT_PROGRESS_LINE_THICKNESS = 12

export function progressGuideMoveExceededThreshold(startX: number, startY: number, nextX: number, nextY: number) {
  return Math.hypot(nextX - startX, nextY - startY) > 8
}

export function progressMarkerProgressFromPointer(pointerX: number, start: number, end: number, grabOffset = 0) {
  return Math.min(1, Math.max(0, (pointerX - grabOffset - start) / Math.max(0.001, end - start)))
}

export function progressLineStrokeWidth(thickness: number, pageWidth: number, cssWidth: number, renderedZoom: number) {
  return thickness * pageWidth / Math.max(cssWidth, 1) * renderedZoom
}

export function progressLinePopoverPageAnchor(xRatio: number, yOffset: number, guidePosition: number) {
  return { x: Math.min(1, Math.max(0, xRatio)), y: Math.min(1, Math.max(0, guidePosition + yOffset)) }
}

export function progressLinePopoverScreenPoint(anchor: { x: number; y: number }, pageWidth: number, pageHeight: number, matrix: { a: number; b: number; c: number; d: number; e: number; f: number }) {
  const x = anchor.x * pageWidth
  const y = anchor.y * pageHeight
  return { x: matrix.a * x + matrix.c * y + matrix.e, y: matrix.b * x + matrix.d * y + matrix.f }
}

export function keepProgressLinePopoverOpenDuringZoom(pointerType: string, isZoomControl: boolean, isPdfPage: boolean) {
  return isZoomControl || (pointerType === 'touch' && isPdfPage)
}

export interface ProgressPopoverRect {
  left: number
  top: number
  right: number
  bottom: number
}

export function progressLinePopoverPlacement(anchor: { x: number; y: number }, size: { width: number; height: number }, bounds: ProgressPopoverRect) {
  const margin = 8
  const candidates = [
    { left: anchor.x - size.width - margin, top: anchor.y - size.height / 2 },
    { left: anchor.x + margin, top: anchor.y - size.height / 2 },
    { left: anchor.x - size.width / 2, top: anchor.y + margin },
    { left: anchor.x - size.width / 2, top: anchor.y - size.height - margin },
  ]
  const maxLeft = bounds.right - margin - size.width
  const maxTop = bounds.bottom - margin - size.height
  const fits = (left: number, top: number) => left >= bounds.left + margin && top >= bounds.top + margin && left <= maxLeft && top <= maxTop
  const preferred = candidates.find(({ left, top }) => fits(left, top))
  if (preferred) return preferred
  const first = candidates[0]
  return {
    left: Math.max(bounds.left + margin, Math.min(first.left, maxLeft)),
    top: Math.max(bounds.top + margin, Math.min(first.top, maxTop)),
  }
}

export function progressMarkerGeometry(lineY: number, lineStroke: number, svgUnitsPerCssPixel = 1) {
  const halfLength = (lineStroke / 2 + 4 * svgUnitsPerCssPixel) * 1.8
  return {
    top: lineY - halfLength,
    bottom: lineY + halfLength,
  }
}

export function progressMarkerOpacity(lineOpacity: number) {
  return Math.min(1, Math.max(0, lineOpacity) * 2)
}

export function createDefaultPrimaryProgressGuide(position: number): ProgressGuide {
  return {
    id: crypto.randomUUID(),
    position,
    role: 'primary',
    xStartRatio: 0,
    xEndRatio: 1,
    opacity: 0.4,
    thickness: DEFAULT_PROGRESS_LINE_THICKNESS,
  }
}

export interface ProgressGuideCandidate {
  axis: 'horizontal' | 'vertical'
  guide: ProgressGuide
}

export function progressGuideCandidates(work: PageWorkRecord): ProgressGuideCandidate[] {
  return [
    ...(work.horizontalGuides ?? []).map((guide) => ({ axis: 'horizontal' as const, guide })),
    ...(work.verticalGuides ?? []).map((guide) => ({ axis: 'vertical' as const, guide })),
  ]
}

export function prepareProgressGuidesForDirectInteraction(work: PageWorkRecord): PageWorkRecord {
  const candidates = progressGuideCandidates(work)
  const hasLegacyGuide = candidates.some(({ guide }) => guide.role !== 'primary' && guide.role !== 'reference')
  if (work.progressMigration !== 'pending' && !hasLegacyGuide) return work
  const preferred = candidates.find(({ axis, guide }) => axis === 'horizontal' && guide.linkedCounterId) ??
    candidates.find(({ axis }) => axis === 'horizontal') ?? candidates[0]
  return migrateProgressGuides(work, preferred ? preferred.axis + ':' + preferred.guide.id : '', [])
}

export function ensurePrimaryProgressGuide(work: PageWorkRecord): PageWorkRecord {
  if (work.horizontalGuides?.some((guide) => guide.role === 'primary')) return work
  return {
    ...work,
    progressMigration: 'complete',
    horizontalGuides: [...(work.horizontalGuides ?? []), createDefaultPrimaryProgressGuide(work.horizontalPosition ?? 0.5)],
  }
}

export function migrateProgressGuides(work: PageWorkRecord, primaryKey: string, referenceKeys: string[]): PageWorkRecord {
  const candidates = progressGuideCandidates(work)
  const keyOf = ({ axis, guide }: ProgressGuideCandidate) => axis + ':' + guide.id
  const primary = candidates.find((candidate) => keyOf(candidate) === primaryKey)
  if (candidates.length && !primary) throw new Error('주 진행선을 선택해 주세요.')
  const references = [...new Set(referenceKeys)].filter((key) => key !== primaryKey).slice(0, 2)
  const byKey = new Map(candidates.map((candidate) => [keyOf(candidate), candidate]))
  const convert = (candidate: ProgressGuideCandidate, role: ProgressGuide['role']): ProgressGuide => ({
    ...candidate.guide,
    role,
    xStartRatio: candidate.guide.xStartRatio ?? 0.15,
    xEndRatio: candidate.guide.xEndRatio ?? 0.85,
    ...(role === 'reference' ? { linkedCounterId: undefined, chartRegion: undefined } : {}),
  })
  const selectedReferences = references.map((key) => byKey.get(key)).filter((candidate): candidate is ProgressGuideCandidate => Boolean(candidate))
  const mainGuide: ProgressGuide = primary
    ? convert(primary, 'primary')
    : createDefaultPrimaryProgressGuide(work.horizontalPosition ?? 0.5)

  return {
    ...work,
    horizontalPosition: mainGuide.position,
    horizontalGuides: [mainGuide, ...selectedReferences.map((candidate) => convert(candidate, 'reference'))],
    verticalGuides: [],
    progressMigration: 'complete',
    legacyProgressGuides: {
      horizontalGuides: (work.horizontalGuides ?? []).map((guide) => ({ ...guide })),
      verticalGuides: (work.verticalGuides ?? []).map((guide) => ({ ...guide })),
    },
  }
}

export function guideRowPosition(guide: ProgressGuide, row: number) {
  const mapped = guide.rowSpacing === undefined || guide.rowSpacingStartRow === undefined || !guide.rowSpacingDirection
    ? guide.position
    : guide.position + (row - guide.rowSpacingStartRow) * guide.rowSpacing * (guide.rowSpacingDirection === 'down' ? 1 : -1)
  return Math.min(1, Math.max(0, mapped + (guide.positionOffset ?? 0)))
}
