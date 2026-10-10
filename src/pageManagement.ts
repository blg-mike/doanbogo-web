import type { PageRecord } from './types'

export type PageThumbnailItem =
  | { type: 'page'; pageNumber: number }
  | { type: 'hidden-group'; groupId: string; firstPage: number; pageNumbers: number[]; expanded: boolean }

export function updatePageHiddenState(page: PageRecord, hidden: boolean, hiddenGroupId?: string): PageRecord {
  const next = { ...page, hidden }
  if (hiddenGroupId) next.hiddenGroupId = hiddenGroupId
  else delete next.hiddenGroupId
  return next
}

export function createHiddenPageGroupId(): string {
  return globalThis.crypto?.randomUUID?.() ?? 'hidden-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)
}

export function normalizeHiddenPageGroups(records: PageRecord[], createGroupId: () => string = createHiddenPageGroupId) {
  const nextRecords = records.map((record) => ({ ...record }))
  const ungroupedHiddenPages = nextRecords
    .filter((record) => record.hidden && !record.hiddenGroupId)
    .sort((a, b) => a.pageNumber - b.pageNumber)

  for (let index = 0; index < ungroupedHiddenPages.length;) {
    const first = ungroupedHiddenPages[index]
    const groupId = createGroupId()
    first.hiddenGroupId = groupId
    let previousPage = first.pageNumber
    index += 1
    while (index < ungroupedHiddenPages.length && ungroupedHiddenPages[index].pageNumber === previousPage + 1) {
      previousPage = ungroupedHiddenPages[index].pageNumber
      ungroupedHiddenPages[index].hiddenGroupId = groupId
      index += 1
    }
  }

  return nextRecords
}

export function compactPageThumbnails(pageCount: number, records: PageRecord[]): PageThumbnailItem[] {
  const normalizedRecords = normalizeHiddenPageGroups(records)
  const recordByPage = new Map(normalizedRecords.map((record) => [record.pageNumber, record]))
  const groups = new Map<string, PageRecord[]>()
  for (const record of normalizedRecords) {
    if (!record.hiddenGroupId || record.pageNumber < 1 || record.pageNumber > pageCount) continue
    const group = groups.get(record.hiddenGroupId) ?? []
    group.push(record)
    groups.set(record.hiddenGroupId, group)
  }

  const groupByFirstPage = new Map<number, PageThumbnailItem & { type: 'hidden-group' }>()
  const groupedPages = new Set<number>()
  for (const [groupId, groupRecords] of groups) {
    const ordered = groupRecords.sort((a, b) => a.pageNumber - b.pageNumber)
    const pageNumbers = ordered.map((record) => record.pageNumber)
    pageNumbers.forEach((pageNumber) => groupedPages.add(pageNumber))
    groupByFirstPage.set(pageNumbers[0], {
      type: 'hidden-group',
      groupId,
      firstPage: pageNumbers[0],
      pageNumbers,
      expanded: ordered.some((record) => !record.hidden),
    })
  }

  const items: PageThumbnailItem[] = []
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const group = groupByFirstPage.get(pageNumber)
    if (group) {
      items.push(group)
      continue
    }
    if (groupedPages.has(pageNumber)) continue
    const record = recordByPage.get(pageNumber)
    if (!record?.hidden) items.push({ type: 'page', pageNumber })
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
