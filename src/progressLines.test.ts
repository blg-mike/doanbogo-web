import { describe, expect, it } from 'vitest'
import { createDefaultPrimaryProgressGuide, DEFAULT_PROGRESS_LINE_THICKNESS, guideRowPosition, migrateProgressGuides, prepareProgressGuidesForDirectInteraction, progressGuideCandidates, progressGuideMoveExceededThreshold, progressLineStrokeWidth, progressMarkerProgressFromPointer } from './progressLines'
import type { PageWorkRecord } from './types'

function legacyWork(): PageWorkRecord {
  return {
    documentId: 'doc', pageNumber: 2, horizontalPosition: 0.4, verticalPosition: 0.7, annotations: [],
    horizontalGuides: [{ id: 'h1', position: 0.4, linkedCounterId: 'counter' }, { id: 'h2', position: 0.6 }],
    verticalGuides: [{ id: 'v1', position: 0.7 }], progressMigration: 'pending',
  }
}

describe('progress line migration', () => {
  it('offers old horizontal and vertical guides as migration choices', () => {
    expect(progressGuideCandidates(legacyWork()).map(({ axis, guide }) => axis + ':' + guide.id)).toEqual(['horizontal:h1', 'horizontal:h2', 'vertical:v1'])
  })

  it('keeps one primary and up to two references while archiving every old guide', () => {
    const work = legacyWork()
    const migrated = migrateProgressGuides(work, 'vertical:v1', ['horizontal:h1', 'horizontal:h2', 'horizontal:h2'])
    expect(migrated.horizontalGuides).toEqual([
      expect.objectContaining({ id: 'v1', role: 'primary', position: 0.7, xStartRatio: 0.15, xEndRatio: 0.85 }),
      expect.objectContaining({ id: 'h1', role: 'reference', linkedCounterId: undefined }),
      expect.objectContaining({ id: 'h2', role: 'reference' }),
    ])
    expect(migrated.verticalGuides).toEqual([])
    expect(migrated.progressMigration).toBe('complete')
    expect(migrated.legacyProgressGuides).toEqual({ horizontalGuides: work.horizontalGuides, verticalGuides: work.verticalGuides })
  })

  it('prepares legacy baselines for direct interaction and preserves their source data', () => {
    const work = legacyWork()

    const prepared = prepareProgressGuidesForDirectInteraction(work)

    expect(prepared).toMatchObject({
      progressMigration: 'complete',
      horizontalGuides: [{ id: 'h1', role: 'primary', xStartRatio: 0.15, xEndRatio: 0.85 }],
      verticalGuides: [],
      legacyProgressGuides: { horizontalGuides: work.horizontalGuides, verticalGuides: work.verticalGuides },
    })
  })

  it('migrates explicitly complete records that still contain roleless legacy guides', () => {
    const work = { ...legacyWork(), progressMigration: 'complete' as const }

    expect(prepareProgressGuidesForDirectInteraction(work).horizontalGuides).toContainEqual(
      expect.objectContaining({ id: 'h1', role: 'primary' }),
    )
  })

  it('leaves a new page with no guides empty', () => {
    const work: PageWorkRecord = { documentId: 'doc', pageNumber: 1, horizontalPosition: 0.5, verticalPosition: 0.5, annotations: [], horizontalGuides: [], verticalGuides: [], progressMigration: 'complete' }

    expect(prepareProgressGuidesForDirectInteraction(work)).toBe(work)
  })

  it('rejects an unknown primary and clamps automatic row positions to the page', () => {
    expect(() => migrateProgressGuides(legacyWork(), 'missing', [])).toThrow('주 진행선')
    const work = migrateProgressGuides(legacyWork(), 'horizontal:h1', [])
    const guide = { ...work.horizontalGuides![0], rowSpacing: 0.08, rowSpacingStartRow: 4, rowSpacingDirection: 'down' as const }
    expect(guideRowPosition(guide, 5)).toBeCloseTo(0.48)
    expect(guideRowPosition(guide, 30)).toBe(1)
  })

  it('starts a new line when there are no legacy guides to migrate', () => {
    const work: PageWorkRecord = { documentId: 'doc', pageNumber: 1, horizontalPosition: 0.37, verticalPosition: 0.5, annotations: [], horizontalGuides: [], verticalGuides: [], progressMigration: 'pending' }
    const migrated = migrateProgressGuides(work, '', [])
    expect(migrated.horizontalGuides).toEqual([expect.objectContaining({ role: 'primary', position: 0.37, xStartRatio: 0, xEndRatio: 1, thickness: 12 })])
    expect(migrated.progressMigration).toBe('complete')
    expect(migrated.legacyProgressGuides).toEqual({ horizontalGuides: [], verticalGuides: [] })
  })

  it('creates new primary guides at full page width with lighter default opacity and enlarged thickness', () => {
    expect(createDefaultPrimaryProgressGuide(0.62)).toMatchObject({
      role: 'primary', position: 0.62, xStartRatio: 0, xEndRatio: 1,
      opacity: 0.4,
      thickness: DEFAULT_PROGRESS_LINE_THICKNESS,
    })
  })
})

describe('progress line zoom thickness', () => {
  it('keeps the eight-pixel gesture threshold for line dragging', () => {
    expect(progressGuideMoveExceededThreshold(10, 20, 17, 20)).toBe(false)
    expect(progressGuideMoveExceededThreshold(10, 20, 18, 20)).toBe(false)
    expect(progressGuideMoveExceededThreshold(10, 20, 18.01, 20)).toBe(true)
    expect(progressGuideMoveExceededThreshold(10, 20, 16, 26)).toBe(true)
  })

  it('keeps the displayed stroke width continuous from pinch preview through the final PDF raster', () => {
    const pageWidth = 600
    const initialCssWidth = 300
    const initialZoom = 1
    const nextZoom = 2
    const previewScale = nextZoom / initialZoom

    const previewSvgWidth = progressLineStrokeWidth(4, pageWidth, initialCssWidth, initialZoom)
    const previewCssWidth = previewSvgWidth * initialCssWidth / pageWidth * previewScale
    const finalCssWidth = 600
    const settledSvgWidth = progressLineStrokeWidth(4, pageWidth, finalCssWidth, nextZoom)
    const settledCssWidth = settledSvgWidth * finalCssWidth / pageWidth

    expect(previewCssWidth).toBeCloseTo(8)
    expect(settledCssWidth).toBeCloseTo(previewCssWidth)
  })
})

describe('progress line marker dragging', () => {
  it('preserves the pointer grab offset and clamps the marker to the line', () => {
    const start = 0.1
    const end = 0.9
    const currentMarker = 0.6
    const pointer = 0.65
    const grabOffset = pointer - (start + (end - start) * currentMarker)

    expect(progressMarkerProgressFromPointer(pointer, start, end, grabOffset)).toBeCloseTo(currentMarker)
    expect(progressMarkerProgressFromPointer(pointer + 0.08, start, end, grabOffset)).toBeCloseTo(0.7)
    expect(progressMarkerProgressFromPointer(-1, start, end, grabOffset)).toBe(0)
    expect(progressMarkerProgressFromPointer(2, start, end, grabOffset)).toBe(1)
  })
})
