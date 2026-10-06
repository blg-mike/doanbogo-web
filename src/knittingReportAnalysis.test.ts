import { describe, expect, it } from 'vitest'
import { analyzeKnittingReportCandidates } from './knittingReportAnalysis'
import type { CounterSnapshot, PageWorkRecord } from './types'

function workWithNotes(texts: string[]): PageWorkRecord {
  return {
    documentId: 'document-1', pageNumber: 1, horizontalPosition: 0.5, verticalPosition: 0.5,
    annotations: texts.map((text, index) => ({ id: 'note-' + index, type: 'text', text, points: [], style: { color: '#000000', thickness: 1, opacity: 1, fontSize: 12 } })),
  }
}

const taskCounter: CounterSnapshot = {
  id: 'sleeve-decrease', kind: 'task', name: '소매 감소', color: '#df8545', pinned: false, value: 1,
  taskKind: 'decrease', total: 2, taskRecords: [{ row: 4, status: 'done' }, { row: 10, status: 'missed' }],
}

describe('knitting report modification candidates', () => {
  it('extracts explicit row, length, and count changes while ignoring uncertain notes', () => {
    const candidates = analyzeKnittingReportCandidates({
      works: [workWithNotes(['몸판 12단 더 뜸', '소매 2cm 짧게', '8번 줄이라는데 7번만 함', '목 고무단은 3.5로', '코막음은 Italian bind-off 사용', '소매 7번만 줄일까?', '오늘 잘 떠짐'])],
      counters: [], projectComplete: false,
    })

    expect(candidates.map(({ section, original, changed }) => ({ section, original, changed }))).toEqual([
      { section: '몸판', original: '', changed: '+12단' },
      { section: '소매', original: '', changed: '-2cm' },
      { section: '수정', original: '8번', changed: '7번' },
      { section: '목 고무단', original: '', changed: '3.5mm 사용' },
      { section: '마무리', original: '', changed: 'Italian bind-off' },
    ])
  })

  it('uses missed counter records only after the project is marked complete', () => {
    const input = { works: [] as PageWorkRecord[], counters: [taskCounter], projectComplete: false }
    expect(analyzeKnittingReportCandidates(input)).toHaveLength(0)
    expect(analyzeKnittingReportCandidates({ ...input, projectComplete: true })).toMatchObject([
      { source: 'counter', section: '소매 감소', original: '2회 계획', changed: '1회 완료 · 1회 생략' },
    ])
  })

  it('includes explicit changes written in report notes', () => {
    const candidates = analyzeKnittingReportCandidates({
      works: [], counters: [], projectComplete: false,
      reportNotes: [{ id: 'project.memo', text: '소매 2cm 짧게 수정함' }],
    })
    expect(candidates).toMatchObject([{ section: '소매', changed: '-2cm', evidence: '소매 2cm 짧게 수정함' }])
  })

  it('merges duplicate changes while retaining their evidence', () => {
    const candidates = analyzeKnittingReportCandidates({
      works: [workWithNotes(['몸판 12단 더 뜸', '몸판 12단 더 뜸'])], counters: [], projectComplete: false,
    })
    expect(candidates).toHaveLength(1)
    expect(candidates[0].evidence).toBe('몸판 12단 더 뜸')
  })
})
