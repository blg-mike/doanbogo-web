import type { PageWorkRecord, ProgressGuide } from './types'

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
    : { id: crypto.randomUUID(), position: work.horizontalPosition ?? 0.5, role: 'primary', xStartRatio: 0.15, xEndRatio: 0.85 }

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
  if (guide.rowSpacing === undefined || guide.rowSpacingStartRow === undefined || !guide.rowSpacingDirection) return guide.position
  const distance = (row - guide.rowSpacingStartRow) * guide.rowSpacing * (guide.rowSpacingDirection === 'down' ? 1 : -1)
  return Math.min(1, Math.max(0, guide.position + distance))
}
