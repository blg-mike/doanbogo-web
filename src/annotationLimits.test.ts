import { describe, expect, it } from 'vitest'
import { addedLimitedAnnotations, applyLimitedAnnotationAdditions, countLimitedAnnotations, exceededAnnotationLimit, isAnnotationLimitReached, PAGE_ANNOTATION_LIMITS } from './annotationLimits'
import { ANNOTATION_COLOR_PRESETS } from './designTokens'
import type { AnnotationRecord, PageWorkRecord, RegionHighlight } from './types'

function annotation(id: string, type: AnnotationRecord['type'], text?: string): AnnotationRecord {
  return { id, type, text, points: [], style: { color: '#292C33', thickness: 2, opacity: 1, fontSize: 18 } }
}

function region(id: string): RegionHighlight {
  return { id, x: 0, y: 0, width: 0.2, height: 0.2, color: '#F4C84B', opacity: 0.3 }
}

function work(annotations: AnnotationRecord[] = [], regionHighlights: RegionHighlight[] = []): PageWorkRecord {
  return { documentId: 'doc', pageNumber: 1, horizontalPosition: 0.5, verticalPosition: 0.5, annotations, regionHighlights }
}

describe('per-page annotation limits', () => {
  it('exposes the approved colors in the requested order', () => {
    expect(ANNOTATION_COLOR_PRESETS.map((preset) => preset.color)).toEqual([
      '#E5494D', '#F28C44', '#F4C84B', '#43A979', '#45BDB1',
      '#438EE9', '#9469D5', '#E77CAA', '#848A96', '#292C33',
    ])
  })

  it('applies separate pen and highlighter limits and excludes straight lines', () => {
    const pens = Array.from({ length: PAGE_ANNOTATION_LIMITS.pen }, (_, index) => annotation('pen-' + index, 'pen'))
    const highlights = Array.from({ length: PAGE_ANNOTATION_LIMITS.highlight }, (_, index) => annotation('highlight-' + index, 'highlight'))
    const lines = Array.from({ length: 20 }, (_, index) => annotation('line-' + index, 'line'))
    const current = work([...pens, ...highlights, ...lines])

    expect(countLimitedAnnotations(current, 'pen')).toBe(100)
    expect(countLimitedAnnotations(current, 'highlight')).toBe(100)
    expect(isAnnotationLimitReached(current, 'pen')).toBe(true)
    expect(isAnnotationLimitReached(current, 'highlight')).toBe(true)
    expect(isAnnotationLimitReached(work(lines), 'pen')).toBe(false)
  })

  it('counts only non-empty text and limits regions independently', () => {
    const current = work([
      ...Array.from({ length: PAGE_ANNOTATION_LIMITS.text }, (_, index) => annotation('text-' + index, 'text', 'note')),
      annotation('draft', 'text', ''),
    ], Array.from({ length: PAGE_ANNOTATION_LIMITS['region-highlight'] }, (_, index) => region('region-' + index)))

    expect(countLimitedAnnotations(current, 'text')).toBe(50)
    expect(countLimitedAnnotations(current, 'region-highlight')).toBe(10)
    expect(isAnnotationLimitReached(current, 'text')).toBe(true)
    expect(isAnnotationLimitReached(current, 'region-highlight')).toBe(true)
    expect(countLimitedAnnotations(work([annotation('draft', 'text', '  ')]), 'text')).toBe(0)
  })

  it('accepts the final available object and rejects the next one for every limited tool', () => {
    const kinds = ['pen', 'highlight', 'text', 'region-highlight'] as const
    for (const kind of kinds) {
      const limit = PAGE_ANNOTATION_LIMITS[kind]
      const annotations = kind === 'region-highlight'
        ? []
        : Array.from({ length: limit - 1 }, (_, index) => annotation(kind + '-' + index, kind, kind === 'text' ? 'note' : undefined))
      const regions = kind === 'region-highlight'
        ? Array.from({ length: limit - 1 }, (_, index) => region('region-' + index))
        : []
      const current = work(annotations, regions)
      const finalAnnotations = kind === 'region-highlight' ? annotations : [...annotations, annotation('final', kind, kind === 'text' ? 'note' : undefined)]
      const finalRegions = kind === 'region-highlight' ? [...regions, region('final')] : regions
      const atLimit = work(finalAnnotations, finalRegions)
      const atLimitAdditions = addedLimitedAnnotations(current, atLimit)
      expect(exceededAnnotationLimit(applyLimitedAnnotationAdditions(current, atLimitAdditions), atLimitAdditions.kinds)).toBeNull()

      const overAnnotations = kind === 'region-highlight' ? finalAnnotations : [...finalAnnotations, annotation('over-limit', kind, kind === 'text' ? 'note' : undefined)]
      const overRegions = kind === 'region-highlight' ? [...finalRegions, region('over-limit')] : finalRegions
      const overLimit = work(overAnnotations, overRegions)
      const overLimitAdditions = addedLimitedAnnotations(current, overLimit)
      expect(exceededAnnotationLimit(applyLimitedAnnotationAdditions(current, overLimitAdditions), overLimitAdditions.kinds)).toBe(kind)
    }
  })

  it('merges a creation against the latest page data without dropping existing objects', () => {
    const current = work([annotation('existing-pen', 'pen')], [region('existing-region')])
    const staleProposal = work([annotation('existing-pen', 'pen'), annotation('new-pen', 'pen')], [region('existing-region'), region('new-region')])
    const additions = addedLimitedAnnotations(current, staleProposal)
    const merged = applyLimitedAnnotationAdditions(current, additions)

    expect(merged.annotations.map((item) => item.id)).toEqual(['existing-pen', 'new-pen'])
    expect(merged.regionHighlights?.map((item) => item.id)).toEqual(['existing-region', 'new-region'])
  })

  it('keeps legacy over-limit data intact while signaling that more cannot be added', () => {
    const annotations = Array.from({ length: PAGE_ANNOTATION_LIMITS.pen + 3 }, (_, index) => annotation('legacy-' + index, 'pen'))
    const current = work(annotations)
    const proposal = work([...annotations, annotation('new', 'pen')])
    const additions = addedLimitedAnnotations(current, proposal)
    const merged = applyLimitedAnnotationAdditions(current, additions)

    expect(isAnnotationLimitReached(current, 'pen')).toBe(true)
    expect(countLimitedAnnotations(merged, 'pen')).toBe(104)
    expect(merged.annotations).toHaveLength(104)
  })
})
