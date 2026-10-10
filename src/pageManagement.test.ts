import { describe, expect, it } from 'vitest'
import type { PageRecord } from './types'
import { canHidePageSelection, compactPageThumbnails, completePageList, movePagesToThumbnailGroup, nextVisiblePageAfterHide, normalizeHiddenPageGroups, normalizeThumbnailGroups, updatePageHiddenState, visiblePageRange } from './pageManagement'

describe('page visibility and thumbnails', () => {
  it('shows every PDF page and supplies the default state for pages without records', () => {
    const records: PageRecord[] = [{ documentId: 'doc', pageNumber: 2, hidden: true, bookmarked: true }]

    expect(completePageList('doc', 3, records)).toEqual([
      { documentId: 'doc', pageNumber: 1, hidden: false, bookmarked: false },
      records[0],
      { documentId: 'doc', pageNumber: 3, hidden: false, bookmarked: false },
    ])
  })

  it('prevents hiding all remaining visible pages', () => {
    expect(canHidePageSelection(3, new Set([2]), new Set([1, 3]))).toBe(false)
    expect(canHidePageSelection(3, new Set([2]), new Set([1]))).toBe(true)
    expect(canHidePageSelection(3, new Set([2]), new Set())).toBe(false)
  })

  it('keeps adjacent hide operations as separate groups', () => {
    const records: PageRecord[] = [
      { documentId: 'doc', pageNumber: 2, hidden: true, hiddenGroupId: 'first', bookmarked: false },
      { documentId: 'doc', pageNumber: 3, hidden: true, hiddenGroupId: 'first', bookmarked: false },
      { documentId: 'doc', pageNumber: 4, hidden: true, hiddenGroupId: 'second', bookmarked: false },
      { documentId: 'doc', pageNumber: 5, hidden: true, hiddenGroupId: 'second', bookmarked: false },
    ]

    expect(compactPageThumbnails(6, records)).toEqual([
      { type: 'page', pageNumber: 1 },
      { type: 'hidden-group', groupId: 'first', firstPage: 2, pageNumbers: [2, 3], expanded: false },
      { type: 'hidden-group', groupId: 'second', firstPage: 4, pageNumbers: [4, 5], expanded: false },
      { type: 'page', pageNumber: 6 },
    ])
  })

  it('shows non-contiguous pages from one hide operation in a single group at its first page', () => {
    const records: PageRecord[] = [2, 5, 8].map((pageNumber) => ({
      documentId: 'doc', pageNumber, hidden: true, hiddenGroupId: 'batch', bookmarked: false,
    }))

    expect(compactPageThumbnails(8, records)).toEqual([
      { type: 'page', pageNumber: 1 },
      { type: 'hidden-group', groupId: 'batch', firstPage: 2, pageNumbers: [2, 5, 8], expanded: false },
      { type: 'page', pageNumber: 3 },
      { type: 'page', pageNumber: 4 },
      { type: 'page', pageNumber: 6 },
      { type: 'page', pageNumber: 7 },
    ])
  })

  it('keeps named thumbnail groups independent and expands their pages in page order', () => {
    const records: PageRecord[] = [1, 2, 3, 4, 5].map((pageNumber) => ({
      documentId: 'doc', pageNumber, hidden: pageNumber === 3, hiddenGroupId: pageNumber === 3 ? 'hide-3' : undefined, bookmarked: false,
    }))
    const groups = [
      { id: 'body', name: '몸판', pageNumbers: [4, 2, 2] },
      { id: 'sleeve', name: '소매', pageNumbers: [5] },
      { id: 'empty', name: '비어 있음', pageNumbers: [] },
    ]

    expect(compactPageThumbnails(5, records, groups)).toEqual([
      { type: 'page', pageNumber: 1 },
      { type: 'label-group', groupId: 'body', name: '몸판', pageNumbers: [2, 4], expanded: false, children: [] },
      { type: 'hidden-group', groupId: 'hide-3', firstPage: 3, pageNumbers: [3], expanded: false },
      { type: 'label-group', groupId: 'sleeve', name: '소매', pageNumbers: [5], expanded: false, children: [] },
      { type: 'label-group', groupId: 'empty', name: '비어 있음', pageNumbers: [], expanded: false, children: [] },
    ])

    expect(compactPageThumbnails(5, records, groups, 'body')).toEqual([
      { type: 'page', pageNumber: 1 },
      { type: 'label-group', groupId: 'body', name: '몸판', pageNumbers: [2, 4], expanded: true, children: [{ type: 'page', pageNumber: 2 }, { type: 'page', pageNumber: 4 }] },
      { type: 'hidden-group', groupId: 'hide-3', firstPage: 3, pageNumbers: [3], expanded: false },
      { type: 'label-group', groupId: 'sleeve', name: '소매', pageNumbers: [5], expanded: false, children: [] },
      { type: 'label-group', groupId: 'empty', name: '비어 있음', pageNumbers: [], expanded: false, children: [] },
    ])
  })

  it('moves selected pages between named groups without changing page records', () => {
    const groups = [
      { id: 'a', name: 'A', pageNumbers: [1, 3] },
      { id: 'b', name: 'B', pageNumbers: [2] },
    ]
    const moved = movePagesToThumbnailGroup(groups, [2, 3], 'a')
    expect(moved).toEqual([
      { id: 'a', name: 'A', pageNumbers: [1, 2, 3] },
      { id: 'b', name: 'B', pageNumbers: [] },
    ])
  })

  it('normalizes duplicate group membership and rejects invalid page numbers', () => {
    expect(normalizeThumbnailGroups([
      { id: 'a', name: 'A', pageNumbers: [2, 1, 2, 9] },
      { id: 'b', name: 'B', pageNumbers: [1, 3] },
      { id: 'a', name: 'Duplicate ID', pageNumbers: [4] },
    ], 4)).toEqual([
      { id: 'a', name: 'A', pageNumbers: [1, 2] },
      { id: 'b', name: 'B', pageNumbers: [3] },
    ])
  })

  it('keeps the group visible and expanded after restoring its pages', () => {
    const records: PageRecord[] = [2, 5, 8].map((pageNumber) => ({
      documentId: 'doc', pageNumber, hidden: false, hiddenGroupId: 'batch', bookmarked: false,
    }))

    expect(compactPageThumbnails(8, records)).toEqual([
      { type: 'page', pageNumber: 1 },
      { type: 'hidden-group', groupId: 'batch', firstPage: 2, pageNumbers: [2, 5, 8], expanded: true },
      { type: 'page', pageNumber: 3 },
      { type: 'page', pageNumber: 4 },
      { type: 'page', pageNumber: 6 },
      { type: 'page', pageNumber: 7 },
    ])
  })

  it('adds pages to a group and removes membership when moved outside', () => {
    const page = { documentId: 'doc', pageNumber: 3, hidden: false, bookmarked: false }
    const grouped = updatePageHiddenState(page, true, 'group-a')
    expect(grouped).toMatchObject({ hidden: true, hiddenGroupId: 'group-a' })

    const restored = updatePageHiddenState(grouped, false, 'group-a')
    expect(restored).toMatchObject({ hidden: false, hiddenGroupId: 'group-a' })

    const outside = updatePageHiddenState(restored, false)
    expect(outside).toMatchObject({ hidden: false })
    expect(outside).not.toHaveProperty('hiddenGroupId')
  })

  it('assigns separate legacy groups to contiguous hidden ranges', () => {
    const records: PageRecord[] = [2, 3, 5, 7, 8].map((pageNumber) => ({
      documentId: 'doc', pageNumber, hidden: true, bookmarked: false,
    }))
    let nextId = 0

    expect(normalizeHiddenPageGroups(records, () => 'legacy-' + ++nextId).map((page) => [page.pageNumber, page.hiddenGroupId])).toEqual([
      [2, 'legacy-1'], [3, 'legacy-1'], [5, 'legacy-2'], [7, 'legacy-3'], [8, 'legacy-3'],
    ])
  })

  it('moves a hidden viewer page to the next visible page, then falls back to the previous page', () => {
    expect(nextVisiblePageAfterHide(2, 5, new Set([2, 3]))).toBe(4)
    expect(nextVisiblePageAfterHide(4, 5, new Set([2, 3, 4, 5]))).toBe(1)
    expect(nextVisiblePageAfterHide(2, 2, new Set([1, 2]))).toBeNull()
  })

  it('returns an inclusive range in visible-page order', () => {
    expect(visiblePageRange([1, 3, 4, 6], 3, 6)).toEqual([3, 4, 6])
    expect(visiblePageRange([1, 3, 4, 6], 6, 3)).toEqual([6, 4, 3])
    expect(visiblePageRange([1, 3, 4, 6], 2, 6)).toEqual([])
  })
})
