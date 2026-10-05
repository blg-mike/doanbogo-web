import type { PageRecord } from './types'

export type PageThumbnailItem =
  | { type: 'page'; pageNumber: number }
  | { type: 'hidden-run'; firstPage: number; lastPage: number }

export function compactPageThumbnails(pageCount: number, hiddenPages: Set<number>): PageThumbnailItem[] {
  const items: PageThumbnailItem[] = []
  let pageNumber = 1
  while (pageNumber <= pageCount) {
    if (!hiddenPages.has(pageNumber)) {
      items.push({ type: 'page', pageNumber })
      pageNumber += 1
      continue
    }

    const firstPage = pageNumber
    while (pageNumber <= pageCount && hiddenPages.has(pageNumber)) pageNumber += 1
    items.push({ type: 'hidden-run', firstPage, lastPage: pageNumber - 1 })
  }
  return items
}

export function completePageList(documentId: string, pageCount: number, records: PageRecord[]) {
  const byNumber = new Map(records.map((record) => [record.pageNumber, record]))
  return Array.from({ length: pageCount }, (_, index) => {
    const pageNumber = index + 1
    return byNumber.get(pageNumber) ?? { documentId, pageNumber, hidden: false, bookmarked: false }
  })
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

export function visiblePageRange(visiblePages: number[], firstPage: number, lastPage: number) {
  const firstIndex = visiblePages.indexOf(firstPage)
  const lastIndex = visiblePages.indexOf(lastPage)
  if (firstIndex < 0 || lastIndex < 0) return []
  const direction = firstIndex <= lastIndex ? 1 : -1
  return Array.from({ length: Math.abs(lastIndex - firstIndex) + 1 }, (_, offset) => visiblePages[firstIndex + offset * direction])
}
