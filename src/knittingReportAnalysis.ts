import type { CounterSnapshot, PageWorkRecord, ReportModificationCandidate } from './types'

export interface ReportNoteInput {
  pageNumber: number
  id: string
  text: string
}

function normalized(value: string) {
  return value.toLocaleLowerCase().replace(/\s+/g, ' ').trim()
}

function noteCandidate(note: ReportNoteInput): Omit<ReportModificationCandidate, 'id' | 'status'> | null {
  const text = note.text.trim()
  if (!text || /\?|\b아마\b|듯|할까|할지|고민|계획|다음에|다음에는/.test(text)) return null
  const part = text.match(/목\s*고무단|몸판|소매|목|고무단|어깨|팔|밑단|무늬|마무리|코막음|바늘/)?.[0] ?? '수정'
  let original = ''
  let changed = ''

  const extraRows = text.match(/(몸판|소매|목|고무단|어깨|팔|밑단|무늬)?\s*(\d+)\s*단\s*(?:더\s*(?:뜨|뜸)|추가|늘려)/)
  const shortened = text.match(/(몸판|소매|목|고무단|어깨|팔|밑단)?\s*(\d+(?:\.\d+)?)\s*cm\s*(짧게|길게)/)
  const countChange = text.match(/(\d+)\s*(회|번|단)\s*.{0,16}?(\d+)\s*(?:회|번|단)?\s*(?:만|으로|로)?\s*(?:했|함|뜸|사용|진행)/)
  const needleChange = text.match(/(\d+(?:\.\d+)?)\s*mm\s*(?:인데|에서|대신|원래)\s*(\d+(?:\.\d+)?)\s*mm\s*(?:사용|로\s*(?:뜸|함))/)
  const directNeedle = text.match(/(목\s*고무단|고무단|몸판|소매|목)?\s*(?:은|는|을|에)?\s*(\d+(?:\.\d+)?)\s*(?:mm)?\s*(?:로|바늘(?:로)?(?:\s*사용)?)/)
  const sizeChange = text.match(/\b(XXS|XS|S|M|L|XL|XXL)\b\s*(?:말고|대신|에서)\s*\b(XXS|XS|S|M|L|XL|XXL)\b/i)
  const repeat = text.match(/(무늬|패턴)\s*(?:을|를)?\s*(한\s*번|1회|한\s*회)\s*더\s*반복/)
  const technique = text.match(/(코막음|마무리)\s*(?:은|는|을|에)?\s*([A-Za-z][A-Za-z -]{1,36})\s*(?:사용|로\s*(?:함|마무리))/i)

  if (extraRows) {
    original = ''
    changed = '+' + extraRows[2] + '단'
  } else if (shortened) {
    changed = (shortened[3] === '짧게' ? '-' : '+') + shortened[2] + 'cm'
  } else if (countChange) {
    original = countChange[1] + countChange[2]
    changed = countChange[3] + countChange[2]
  } else if (needleChange) {
    original = needleChange[1] + 'mm'
    changed = needleChange[2] + 'mm'
  } else if (directNeedle) {
    changed = directNeedle[2] + 'mm 사용'
  } else if (sizeChange) {
    original = sizeChange[1].toUpperCase()
    changed = sizeChange[2].toUpperCase()
  } else if (repeat) {
    changed = '+1회 반복'
  } else if (technique) {
    changed = technique[2].trim()
  } else return null

  const section = technique && part === '코막음' ? '마무리' : part
  const resultKey = [section, original, changed].map(normalized).join('|')
  const fingerprint = `note:${note.pageNumber}:${note.id}:${normalized(text)}:${resultKey}`
  return { section, original, changed, memo: '', source: 'note_extraction', evidence: text, fingerprint }
}

export function analyzeKnittingReportCandidates(args: {
  works: PageWorkRecord[]
  counters: CounterSnapshot[]
  projectComplete: boolean
  reportNotes?: { id: string; text: string }[]
}): ReportModificationCandidate[] {
  const notes = [
    ...args.works.flatMap((work) => work.annotations
      .filter((annotation) => annotation.type === 'text' && annotation.text?.trim())
      .map((annotation) => ({ pageNumber: work.pageNumber, id: annotation.id, text: annotation.text ?? '' }))),
    ...(args.reportNotes ?? []).map((note) => ({ pageNumber: 0, ...note })),
  ]
  const extracted: Omit<ReportModificationCandidate, 'id' | 'status'>[] = []

  for (const note of notes) {
    const candidate = noteCandidate(note)
    if (candidate) extracted.push(candidate)
  }

  if (args.projectComplete) {
    for (const counter of args.counters) {
      if (counter.kind !== 'task' || !counter.taskRecords?.some((record) => record.status === 'missed')) continue
      const done = counter.taskRecords.filter((record) => record.status === 'done').length
      const missed = counter.taskRecords.filter((record) => record.status === 'missed').length
      const section = counter.name || (counter.taskKind === 'decrease' ? '줄임' : '늘림')
      const original = `${counter.total ?? done + missed}회 계획`
      const changed = `${done}회 완료 · ${missed}회 생략`
      const evidence = `${counter.name}: ${original}, ${changed}`
      const fingerprint = `counter:${counter.id}:${original}:${changed}`
      extracted.push({ section, original, changed, memo: '', source: 'counter', evidence, fingerprint })
    }
  }

  const merged = new Map<string, Omit<ReportModificationCandidate, 'id' | 'status'>[]>()
  for (const candidate of extracted) {
    const resultKey = [candidate.section, candidate.original, candidate.changed].map(normalized).join('|')
    merged.set(resultKey, [...(merged.get(resultKey) ?? []), candidate])
  }
  return [...merged.values()].map((items) => {
    const sources = items.map((item) => item.fingerprint).sort()
    const first = items[0]
    return {
      ...first,
      source: items.some((item) => item.source === 'counter') ? 'counter' : 'note_extraction',
      evidence: [...new Set(items.map((item) => item.evidence))].join(' · '),
      fingerprint: sources.length === 1 ? sources[0] : `merged:${sources.join('::')}`,
      id: crypto.randomUUID(),
      status: 'suggested',
    }
  })
}

