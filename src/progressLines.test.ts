import { describe, expect, it } from 'vitest'
import { createDefaultPrimaryProgressGuide, DEFAULT_PROGRESS_LINE_THICKNESS, guideRowPosition, migrateProgressGuides, prepareProgressGuidesForDirectInteraction, progressGuideCandidates } from './progressLines'
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

  it('creates new primary guides at full page width with the enlarged default thickness', () => {
    expect(createDefaultPrimaryProgressGuide(0.62)).toMatchObject({
      role: 'primary', position: 0.62, xStartRatio: 0, xEndRatio: 1,
      thickness: DEFAULT_PROGRESS_LINE_THICKNESS,
    })
  })
})
