import type { PageRecord } from './types'

export function completePageList(documentId: string, pageCount: number, records: PageRecord[]) {
  const byNumber = new Map(records.map((record) => [record.pageNumber, record]))
  return Array.from({ length: pageCount }, (_, index) => {
    const pageNumber = index + 1
    return byNumber.get(pageNumber) ?? { documentId, pageNumber, hidden: false, bookmarked: false }
  })
}

export function togglePageSelection(selected: Set<number>, pageNumber: number, hiddenPages: Set<number>) {
  const selectedPage = selected.values().next().value
  if (selectedPage !== undefined && hiddenPages.has(selectedPage) !== hiddenPages.has(pageNumber)) return new Set([pageNumber])

  const next = new Set(selected)
  if (next.has(pageNumber)) next.delete(pageNumber)
  else next.add(pageNumber)
  return next
}

export function canHidePageSelection(pageCount: number, hiddenPages: Set<number>, selectedPages: Set<number>) {
  if (!selectedPages.size) return false
  const visibleCount = pageCount - hiddenPages.size
  const selectedVisibleCount = [...selectedPages].filter((pageNumber) => !hiddenPages.has(pageNumber)).length
  return visibleCount - selectedVisibleCount >= 1
}

export function nextVisiblePageAfterHide(pageNumber: number, pageCount: number, hiddenPages: Set<number>) {
  for (let candidate = pageNumber + 1; candidate <= pageCount; candidate++) {
    if (!hiddenPages.has(candidate)) return candidate
  }
  for (let candidate = pageNumber - 1; candidate >= 1; candidate--) {
    if (!hiddenPages.has(candidate)) return candidate
  }
  return null
}
