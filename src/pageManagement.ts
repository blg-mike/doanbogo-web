import type { PageRecord, ThumbnailGroup } from './types'

export type PageThumbnailItem =
  | { type: 'page'; pageNumber: number }
  | { type: 'label-group'; groupId: string; name: string; pageNumbers: number[]; expanded: boolean; children: PageThumbnailItem[] }

export function createThumbnailGroupId(): string {
  return globalThis.crypto?.randomUUID?.() ?? 'thumbnail-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)
}

export function normalizeThumbnailGroups(groups: unknown, pageCount: number): ThumbnailGroup[] {
  if (!Array.isArray(groups)) return []
  const seenIds = new Set<string>()
  const assignedPages = new Set<number>()
  return groups.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object') return []
    const group = candidate as Partial<ThumbnailGroup>
    if (typeof group.id !== 'string' || !group.id || seenIds.has(group.id) || typeof group.name !== 'string' || group.name.length > 100 || !Array.isArray(group.pageNumbers)) return []
    seenIds.add(group.id)
    const pageNumbers = [...new Set(group.pageNumbers.filter((page): page is number => Number.isSafeInteger(page) && page > 0 && page <= pageCount && !assignedPages.has(page)))].sort((a, b) => a - b)
    pageNumbers.forEach((page) => assignedPages.add(page))
    return [{ id: group.id, name: group.name, pageNumbers }]
  })
}

export function movePagesToThumbnailGroup(groups: ThumbnailGroup[], pageNumbers: number[], targetGroupId: string): ThumbnailGroup[] {
  const selected = new Set(pageNumbers)
  return groups.map((group) => group.id === targetGroupId
    ? { ...group, pageNumbers: [...new Set([...group.pageNumbers.filter((page) => !selected.has(page)), ...selected])].sort((a, b) => a - b) }
    : { ...group, pageNumbers: group.pageNumbers.filter((page) => !selected.has(page)) })
}

export function removePagesFromThumbnailGroups(groups: ThumbnailGroup[], pageNumbers: number[]): ThumbnailGroup[] {
  const selected = new Set(pageNumbers)
  return groups.flatMap((group) => {
    const remainingPages = group.pageNumbers.filter((pageNumber) => !selected.has(pageNumber))
    return group.pageNumbers.length && !remainingPages.length ? [] : [{ ...group, pageNumbers: remainingPages }]
  })
}

export function reorderThumbnailGroups(groups: ThumbnailGroup[], groupId: string, direction: -1 | 1): ThumbnailGroup[] {
  const index = groups.findIndex((group) => group.id === groupId)
  const targetIndex = index + direction
  if (index < 0 || targetIndex < 0 || targetIndex >= groups.length) return groups
  const next = [...groups]
  ;[next[index], next[targetIndex]] = [next[targetIndex], next[index]]
  return next
}

export function thumbnailPagesForDrag(selectedPageNumbers: number[], sourcePageNumber: number): number[] {
  return selectedPageNumbers.includes(sourcePageNumber) ? [...selectedPageNumbers] : [sourcePageNumber]
}

export function normalizeVisiblePageRecord(page: PageRecord): PageRecord {
  const next = { ...page, hidden: false as const }
  delete (next as PageRecord & { hiddenGroupId?: string }).hiddenGroupId
  return next
}

export function compactPageThumbnails(pageCount: number, groups: ThumbnailGroup[] = [], expandedGroupId: string | null = null): PageThumbnailItem[] {
  const validGroups = normalizeThumbnailGroups(groups, pageCount)
  const orderedNonEmptyGroups = validGroups.filter((group) => group.pageNumbers.length > 0)
  const groupSlots = orderedNonEmptyGroups.map((group) => group.pageNumbers[0]).sort((a, b) => a - b)
  const groupByFirstPage = new Map(groupSlots.map((slot, index) => [slot, orderedNonEmptyGroups[index]]))
  const groupedPages = new Set(validGroups.flatMap((group) => group.pageNumbers))
  const items: PageThumbnailItem[] = []
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const group = groupByFirstPage.get(pageNumber)
    if (group) {
      const expanded = expandedGroupId === group.id
      items.push({ type: 'label-group', groupId: group.id, name: group.name, pageNumbers: group.pageNumbers, expanded, children: expanded ? group.pageNumbers.map((childPage) => ({ type: 'page' as const, pageNumber: childPage })) : [] })
      continue
    }
    if (groupedPages.has(pageNumber)) continue
    items.push({ type: 'page', pageNumber })
  }
  for (const group of validGroups.filter((item) => !item.pageNumbers.length)) items.push({ type: 'label-group', groupId: group.id, name: group.name, pageNumbers: [], expanded: expandedGroupId === group.id, children: [] })
  return items
}

export function completePageList(documentId: string, pageCount: number, records: PageRecord[]) {
  const byNumber = new Map(records.map((record) => [record.pageNumber, record]))
  return Array.from({ length: pageCount }, (_, index) => {
    const pageNumber = index + 1
    const record = byNumber.get(pageNumber) ?? { documentId, pageNumber, hidden: false as const, bookmarked: false }
    return normalizeVisiblePageRecord(record)
  })
}

export function visiblePageRange(visiblePages: number[], firstPage: number, lastPage: number) {
  const firstIndex = visiblePages.indexOf(firstPage)
  const lastIndex = visiblePages.indexOf(lastPage)
  if (firstIndex < 0 || lastIndex < 0) return []
  const direction = firstIndex <= lastIndex ? 1 : -1
  return Array.from({ length: Math.abs(lastIndex - firstIndex) + 1 }, (_, offset) => visiblePages[firstIndex + offset * direction])
}
