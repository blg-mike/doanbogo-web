import { describe, expect, it } from 'vitest'
import { createDefaultPrimaryProgressGuide, DEFAULT_PROGRESS_LINE_THICKNESS, ensurePrimaryProgressGuide, guideRowPosition, keepProgressLinePopoverOpenDuringZoom, migrateProgressGuides, prepareProgressGuidesForDirectInteraction, progressGuideCandidates, progressGuideMoveExceededThreshold, progressGuidePositionAfterNudge, progressLinePopoverPageAnchor, progressLinePopoverPlacement, progressLinePopoverScreenPoint, progressLineStrokeWidth, progressMarkerGeometry, progressMarkerOpacity, progressMarkerProgressFromPointer } from './progressLines'
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

describe('default progress line', () => {
  it('adds one centered primary guide only when the page has none', () => {
    const work: PageWorkRecord = { documentId: 'doc', pageNumber: 1, horizontalPosition: 0.37, verticalPosition: 0.5, annotations: [], horizontalGuides: [], verticalGuides: [], progressMigration: 'complete' }
    const initialized = ensurePrimaryProgressGuide(work)

    expect(initialized.horizontalGuides).toEqual([expect.objectContaining({ role: 'primary', position: 0.37 })])
    expect(ensurePrimaryProgressGuide(initialized)).toBe(initialized)
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

    const previewMarker = progressMarkerGeometry(100, previewSvgWidth)
    const settledMarker = progressMarkerGeometry(100, settledSvgWidth)
    expect(previewMarker.bottom - previewMarker.top).toBeCloseTo(settledMarker.bottom - settledMarker.top)
  })

  it('extends the marker four screen pixels past both sides of the guide at every thickness', () => {
    const strokes = [1, 12, 36]
    const markers = strokes.map((lineStroke) => progressMarkerGeometry(200, lineStroke))

    expect(markers.map(({ top }) => top)).toEqual([195.5, 190, 178])
    expect(markers.map(({ bottom }) => bottom)).toEqual([204.5, 210, 222])
  })

  it('keeps the marker extension screen-fixed through zoom preview scaling', () => {
    for (const [svgUnitsPerCssPixel, previewScale] of [[1, 1], [2, 1], [2, 0.5]]) {
      const marker = progressMarkerGeometry(200, 12, svgUnitsPerCssPixel / previewScale)
      expect((194 - marker.top) / svgUnitsPerCssPixel * previewScale).toBeCloseTo(4)
      expect((marker.bottom - 206) / svgUnitsPerCssPixel * previewScale).toBeCloseTo(4)
    }
  })

  it('renders the marker at twice the line opacity, capped at full opacity', () => {
    expect([0, 0.2, 0.4, 0.6, 1].map(progressMarkerOpacity)).toEqual([0, 0.4, 0.8, 1, 1])
    expect(progressMarkerOpacity(-0.2)).toBe(0)
  })
})

describe('progress line vertical movement', () => {
  it('moves one rendered line thickness and clamps at the page edges', () => {
    expect(progressGuidePositionAfterNudge(0.5, 12, 600, 'up')).toBeCloseTo(0.48)
    expect(progressGuidePositionAfterNudge(0.5, 12, 600, 'down')).toBeCloseTo(0.52)
    expect(progressGuidePositionAfterNudge(0.01, 12, 600, 'up')).toBe(0)
    expect(progressGuidePositionAfterNudge(0.99, 12, 600, 'down')).toBe(1)
  })
})

describe('progress line popover placement', () => {
  const bounds = { left: 0, top: 0, right: 800, bottom: 600 }
  const size = { width: 220, height: 160 }

  it('keeps the popup anchor attached to the selected line as it moves', () => {
    const first = progressLinePopoverPageAnchor(0.7, 0.02, 0.4)
    const moved = progressLinePopoverPageAnchor(0.7, 0.02, 0.6)
    expect(first.x).toBe(0.7)
    expect(first.y).toBeCloseTo(0.42)
    expect(moved.x).toBe(0.7)
    expect(moved.y).toBeCloseTo(0.62)
    expect(progressLinePopoverPageAnchor(-1, 0, 0)).toEqual({ x: 0, y: 0 })
    expect(progressLinePopoverScreenPoint({ x: 0.25, y: 0.5 }, 400, 600, { a: 2, b: 0, c: 0, d: 2, e: 20, f: 40 })).toEqual({ x: 220, y: 640 })
  })

  it('tries left, right, below, then above while avoiding the arrow controls', () => {
    const controls = { left: 378, top: 278, right: 422, bottom: 322 }
    expect(progressLinePopoverPlacement({ x: 400, y: 300 }, size, bounds, controls)).toEqual({ left: 290, top: 330, overlapsControls: false })

    const nearLeft = progressLinePopoverPlacement({ x: 100, y: 300 }, size, bounds, controls)
    expect(nearLeft).toEqual({ left: 108, top: 220, overlapsControls: false })

    const constrained = progressLinePopoverPlacement({ x: 12, y: 300 }, size, bounds, { left: 0, top: 270, right: 44, bottom: 330 })
    expect(constrained).toEqual({ left: 8, top: 338, overlapsControls: false })
  })

  it('keeps the popup open for zoom controls and touch gestures on the page', () => {
    expect(keepProgressLinePopoverOpenDuringZoom('mouse', true, false)).toBe(true)
    expect(keepProgressLinePopoverOpenDuringZoom('touch', false, true)).toBe(true)
    expect(keepProgressLinePopoverOpenDuringZoom('mouse', false, true)).toBe(false)
    expect(keepProgressLinePopoverOpenDuringZoom('touch', false, false)).toBe(false)
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
