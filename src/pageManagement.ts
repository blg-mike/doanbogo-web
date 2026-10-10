import type { PageRecord, ThumbnailGroup } from './types'

export type PageThumbnailItem =
  | { type: 'page'; pageNumber: number }
  | { type: 'hidden-group'; groupId: string; firstPage: number; pageNumbers: number[]; expanded: boolean }
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

export function compactPageThumbnails(pageCount: number, records: PageRecord[], groups: ThumbnailGroup[] = [], expandedGroupId: string | null = null): PageThumbnailItem[] {
  const normalizedRecords = normalizeHiddenPageGroups(records)
  const recordByPage = new Map(normalizedRecords.map((record) => [record.pageNumber, record]))

  const membership = new Map<number, ThumbnailGroup>()
  const validGroups = normalizeThumbnailGroups(groups, pageCount)
  for (const group of validGroups) group.pageNumbers.forEach((page) => { if (!membership.has(page)) membership.set(page, group) })

  function buildPageItems(pageNumbers: number[]): PageThumbnailItem[] {
    const items: PageThumbnailItem[] = []
    const emittedHiddenGroups = new Set<string>()
    for (const pageNumber of [...new Set(pageNumbers)].sort((a, b) => a - b)) {
      const record = recordByPage.get(pageNumber)
      if (record?.hiddenGroupId) {
        const groupId = record.hiddenGroupId
        if (emittedHiddenGroups.has(groupId)) continue
        emittedHiddenGroups.add(groupId)
        const memberPages = pageNumbers.filter((page) => recordByPage.get(page)?.hiddenGroupId === groupId).sort((a, b) => a - b)
        const expanded = memberPages.some((page) => !recordByPage.get(page)?.hidden)
        items.push({ type: 'hidden-group', groupId, firstPage: memberPages[0] ?? pageNumber, pageNumbers: memberPages, expanded })
      } else if (!record?.hidden) {
        items.push({ type: 'page', pageNumber })
      }
    }
    return items
  }

  const items: PageThumbnailItem[] = []
  const groupByFirstPage = new Map<number, ThumbnailGroup>()
  for (const group of validGroups) {
    const firstPage = group.pageNumbers[0]
    if (firstPage !== undefined) groupByFirstPage.set(firstPage, group)
  }
  const groupedPages = new Set(validGroups.flatMap((group) => group.pageNumbers))
  const rootPages = Array.from({ length: pageCount }, (_, index) => index + 1).filter((pageNumber) => !groupedPages.has(pageNumber))
  const rootHiddenGroupByFirst = new Map<number, PageThumbnailItem & { type: 'hidden-group' }>()
  const rootHiddenMembers = new Set<number>()
  for (const pageNumber of rootPages) {
    const record = recordByPage.get(pageNumber)
    if (!record?.hiddenGroupId) continue
    const groupId = record.hiddenGroupId
    if (rootHiddenMembers.has(pageNumber)) continue
    const members = rootPages.filter((page) => recordByPage.get(page)?.hiddenGroupId === groupId).sort((a, b) => a - b)
    members.forEach((page) => rootHiddenMembers.add(page))
    rootHiddenGroupByFirst.set(members[0] ?? pageNumber, {
      type: 'hidden-group', groupId, firstPage: members[0] ?? pageNumber, pageNumbers: members, expanded: members.some((page) => !recordByPage.get(page)?.hidden),
    })
  }
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const group = groupByFirstPage.get(pageNumber)
    if (group) {
      const expanded = expandedGroupId === group.id
      items.push({ type: 'label-group', groupId: group.id, name: group.name, pageNumbers: group.pageNumbers, expanded, children: expanded ? buildPageItems(group.pageNumbers) : [] })
      continue
    }
    if (groupedPages.has(pageNumber)) continue
    const hiddenGroup = rootHiddenGroupByFirst.get(pageNumber)
    if (hiddenGroup) {
      items.push(hiddenGroup)
      continue
    }
    if (rootHiddenMembers.has(pageNumber)) continue
    const record = recordByPage.get(pageNumber)
    if (!record?.hidden) items.push({ type: 'page', pageNumber })
  }
  for (const group of validGroups.filter((item) => !item.pageNumbers.length)) items.push({ type: 'label-group', groupId: group.id, name: group.name, pageNumbers: [], expanded: expandedGroupId === group.id, children: [] })
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
