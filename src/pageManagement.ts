import type { PageRecord, ThumbnailGroup, ThumbnailRailOrderItem } from './types'

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

export function createThumbnailGroupFromPages(
  groups: ThumbnailGroup[],
  order: unknown,
  pageNumbers: number[],
  newGroup: ThumbnailGroup,
  pageCount: number,
): { groups: ThumbnailGroup[]; railOrder: ThumbnailRailOrderItem[] } {
  const validGroups = normalizeThumbnailGroups(groups, pageCount)
  const selectedPages = [...new Set(pageNumbers.filter((page) => Number.isSafeInteger(page) && page > 0 && page <= pageCount))].sort((a, b) => a - b)
  const currentOrder = normalizeThumbnailRailOrder(order, pageCount, validGroups)
  if (!selectedPages.length) return { groups: validGroups, railOrder: currentOrder }

  const selected = new Set(selectedPages)
  const groupByPage = new Map(validGroups.flatMap((group) => group.pageNumbers.map((page) => [page, group.id] as const)))
  const sourceIndex = Math.min(...selectedPages.map((page) => {
    const groupId = groupByPage.get(page)
    return currentOrder.findIndex((item) => groupId
      ? item.type === 'group' && item.groupId === groupId
      : item.type === 'page' && item.pageNumber === page)
  }).filter((index) => index >= 0))
  const nextGroups = [
    ...validGroups.flatMap((group) => {
      const remainingPages = group.pageNumbers.filter((page) => !selected.has(page))
      return group.pageNumbers.length && !remainingPages.length ? [] : [{ ...group, pageNumbers: remainingPages }]
    }),
    { ...newGroup, pageNumbers: selectedPages },
  ]
  const nextGroupIds = new Set(nextGroups.map((group) => group.id))
  const remains = (item: ThumbnailRailOrderItem) => item.type === 'page'
    ? !selected.has(item.pageNumber)
    : nextGroupIds.has(item.groupId)
  const railOrder = currentOrder.filter(remains)
  const insertionIndex = currentOrder.slice(0, sourceIndex).filter(remains).length
  railOrder.splice(insertionIndex, 0, { type: 'group', groupId: newGroup.id })
  return { groups: nextGroups, railOrder: normalizeThumbnailRailOrder(railOrder, pageCount, nextGroups) }
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

export function thumbnailRailOrderKey(item: ThumbnailRailOrderItem): string {
  return item.type === 'page' ? 'page:' + item.pageNumber : 'group:' + item.groupId
}

function legacyThumbnailRailOrder(pageCount: number, groups: ThumbnailGroup[]): ThumbnailRailOrderItem[] {
  const validGroups = normalizeThumbnailGroups(groups, pageCount)
  const orderedNonEmptyGroups = validGroups.filter((group) => group.pageNumbers.length > 0)
  const groupSlots = orderedNonEmptyGroups.map((group) => group.pageNumbers[0]).sort((a, b) => a - b)
  const groupByFirstPage = new Map(groupSlots.map((slot, index) => [slot, orderedNonEmptyGroups[index]]))
  const groupedPages = new Set(validGroups.flatMap((group) => group.pageNumbers))
  const order: ThumbnailRailOrderItem[] = []
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const group = groupByFirstPage.get(pageNumber)
    if (group) {
      order.push({ type: 'group', groupId: group.id })
      continue
    }
    if (!groupedPages.has(pageNumber)) order.push({ type: 'page', pageNumber })
  }
  for (const group of validGroups.filter((item) => !item.pageNumbers.length)) order.push({ type: 'group', groupId: group.id })
  return order
}

export function normalizeThumbnailRailOrder(order: unknown, pageCount: number, groups: ThumbnailGroup[]): ThumbnailRailOrderItem[] {
  const validGroups = normalizeThumbnailGroups(groups, pageCount)
  const groupIds = new Set(validGroups.map((group) => group.id))
  const groupedPages = new Set(validGroups.flatMap((group) => group.pageNumbers))
  const normalized: ThumbnailRailOrderItem[] = []
  const seen = new Set<string>()
  if (Array.isArray(order)) {
    for (const candidate of order) {
      if (!candidate || typeof candidate !== 'object') continue
      const item = candidate as Partial<ThumbnailRailOrderItem>
      let normalizedItem: ThumbnailRailOrderItem | undefined
      if (item.type === 'page' && Number.isSafeInteger(item.pageNumber) && item.pageNumber! > 0 && item.pageNumber! <= pageCount && !groupedPages.has(item.pageNumber!)) {
        normalizedItem = { type: 'page', pageNumber: item.pageNumber! }
      } else if (item.type === 'group' && typeof item.groupId === 'string' && groupIds.has(item.groupId)) {
        normalizedItem = { type: 'group', groupId: item.groupId }
      }
      if (!normalizedItem) continue
      const key = thumbnailRailOrderKey(normalizedItem)
      if (seen.has(key)) continue
      seen.add(key)
      normalized.push(normalizedItem)
    }
  }
  for (const item of legacyThumbnailRailOrder(pageCount, validGroups)) {
    const key = thumbnailRailOrderKey(item)
    if (seen.has(key)) continue
    seen.add(key)
    normalized.push(item)
  }
  return normalized
}

export function reconcileThumbnailRailOrder(
  order: unknown,
  previousGroups: ThumbnailGroup[],
  nextGroups: ThumbnailGroup[],
  pageCount: number,
): ThumbnailRailOrderItem[] {
  const previousOrder = normalizeThumbnailRailOrder(order, pageCount, previousGroups)
  const validNextGroups = normalizeThumbnailGroups(nextGroups, pageCount)
  const nextGroupIds = new Set(validNextGroups.map((group) => group.id))
  const nextGroupedPages = new Set(validNextGroups.flatMap((group) => group.pageNumbers))
  const nextOrder = previousOrder.filter((item) => item.type === 'group'
    ? nextGroupIds.has(item.groupId)
    : !nextGroupedPages.has(item.pageNumber))
  const present = new Set(nextOrder.map(thumbnailRailOrderKey))

  for (const pageNumber of Array.from({ length: pageCount }, (_, index) => index + 1)) {
    const item: ThumbnailRailOrderItem = { type: 'page', pageNumber }
    const key = thumbnailRailOrderKey(item)
    if (nextGroupedPages.has(pageNumber) || present.has(key)) continue
    const beforeIndex = nextOrder.findIndex((candidate) => candidate.type === 'page' && candidate.pageNumber > pageNumber)
    if (beforeIndex >= 0) nextOrder.splice(beforeIndex, 0, item)
    else {
      let lastPageIndex = -1
      nextOrder.forEach((candidate, index) => { if (candidate.type === 'page') lastPageIndex = index })
      nextOrder.splice(lastPageIndex + 1, 0, item)
    }
    present.add(key)
  }

  for (const group of validNextGroups) {
    const item: ThumbnailRailOrderItem = { type: 'group', groupId: group.id }
    const key = thumbnailRailOrderKey(item)
    if (present.has(key)) continue
    nextOrder.push(item)
    present.add(key)
  }
  return nextOrder
}

export function moveThumbnailRailItem(
  order: ThumbnailRailOrderItem[],
  sourceKey: string,
  targetKey: string,
  position: 'before' | 'after',
): ThumbnailRailOrderItem[] {
  if (sourceKey === targetKey) return order
  const sourceIndex = order.findIndex((item) => thumbnailRailOrderKey(item) === sourceKey)
  const targetIndex = order.findIndex((item) => thumbnailRailOrderKey(item) === targetKey)
  if (sourceIndex < 0 || targetIndex < 0) return order
  const next = [...order]
  const [source] = next.splice(sourceIndex, 1)
  const adjustedTargetIndex = next.findIndex((item) => thumbnailRailOrderKey(item) === targetKey)
  next.splice(adjustedTargetIndex + (position === 'after' ? 1 : 0), 0, source)
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

export function compactPageThumbnails(pageCount: number, groups: ThumbnailGroup[] = [], expandedGroupId: string | null = null, railOrder?: ThumbnailRailOrderItem[]): PageThumbnailItem[] {
  const validGroups = normalizeThumbnailGroups(groups, pageCount)
  const groupsById = new Map(validGroups.map((group) => [group.id, group]))
  const order = normalizeThumbnailRailOrder(railOrder, pageCount, validGroups)
  return order.flatMap<PageThumbnailItem>((item) => {
    if (item.type === 'page') return [{ type: 'page' as const, pageNumber: item.pageNumber }]
    const group = groupsById.get(item.groupId)
    if (!group) return []
    const expanded = expandedGroupId === group.id
    return [{ type: 'label-group' as const, groupId: group.id, name: group.name, pageNumbers: group.pageNumbers, expanded, children: expanded ? group.pageNumbers.map((childPage) => ({ type: 'page' as const, pageNumber: childPage })) : [] }]
  })
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
