import type { AnnotationRecord, PageWorkRecord, RegionHighlight } from './types'

export type LimitedAnnotationKind = 'pen' | 'highlight' | 'text' | 'region-highlight'

export const PAGE_ANNOTATION_LIMITS: Record<LimitedAnnotationKind, number> = {
  pen: 100,
  highlight: 100,
  text: 50,
  'region-highlight': 10,
}

export function countLimitedAnnotations(work: Pick<PageWorkRecord, 'annotations' | 'regionHighlights'>, kind: LimitedAnnotationKind) {
  if (kind === 'region-highlight') return work.regionHighlights?.length ?? 0
  return work.annotations.filter((annotation) => annotation.type === kind && (kind !== 'text' || Boolean(annotation.text?.trim()))).length
}

export function isAnnotationLimitReached(work: Pick<PageWorkRecord, 'annotations' | 'regionHighlights'>, kind: LimitedAnnotationKind) {
  return countLimitedAnnotations(work, kind) >= PAGE_ANNOTATION_LIMITS[kind]
}

export function exceededAnnotationLimit(work: Pick<PageWorkRecord, 'annotations' | 'regionHighlights'>, kinds: Iterable<LimitedAnnotationKind>) {
  for (const kind of kinds) {
    if (countLimitedAnnotations(work, kind) > PAGE_ANNOTATION_LIMITS[kind]) return kind
  }
  return null
}

export function addedLimitedAnnotations(current: Pick<PageWorkRecord, 'annotations' | 'regionHighlights'>, proposed: Pick<PageWorkRecord, 'annotations' | 'regionHighlights'>) {
  const currentById = new Map(current.annotations.map((annotation) => [annotation.id, annotation]))
  const addedAnnotations: AnnotationRecord[] = []
  const updatedTextAnnotations: AnnotationRecord[] = []
  const kinds = new Set<LimitedAnnotationKind>()

  for (const annotation of proposed.annotations) {
    const previous = currentById.get(annotation.id)
    if (!previous) {
      if (annotation.type === 'pen' || annotation.type === 'highlight' || annotation.type === 'text') {
        addedAnnotations.push(annotation)
        if (annotation.type !== 'text' || annotation.text?.trim()) kinds.add(annotation.type)
      }
    } else if (annotation.type === 'text' && previous.type === 'text' && previous.text !== annotation.text) {
      updatedTextAnnotations.push(annotation)
      if (!previous.text?.trim() && annotation.text?.trim()) kinds.add('text')
    }
  }

  const currentRegions = new Set((current.regionHighlights ?? []).map((region) => region.id))
  const addedRegions = (proposed.regionHighlights ?? []).filter((region) => !currentRegions.has(region.id))
  if (addedRegions.length) kinds.add('region-highlight')

  return { addedAnnotations, updatedTextAnnotations, addedRegions, kinds }
}

export function applyLimitedAnnotationAdditions<T extends Pick<PageWorkRecord, 'annotations' | 'regionHighlights'>>(current: T, added: ReturnType<typeof addedLimitedAnnotations>) {
  const updatedTextById = new Map(added.updatedTextAnnotations.map((annotation) => [annotation.id, annotation]))
  const annotationIds = new Set(current.annotations.map((annotation) => annotation.id))
  const annotations = current.annotations.map((annotation) => updatedTextById.get(annotation.id) ?? annotation)
  for (const annotation of added.addedAnnotations) {
    if (!annotationIds.has(annotation.id)) annotations.push(annotation)
  }
  const regionIds = new Set((current.regionHighlights ?? []).map((region) => region.id))
  const regionHighlights = [...(current.regionHighlights ?? []), ...added.addedRegions.filter((region: RegionHighlight) => !regionIds.has(region.id))]
  return { ...current, annotations, regionHighlights }
}
