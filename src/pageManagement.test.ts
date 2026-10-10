import { describe, expect, it } from 'vitest'
import type { PageRecord } from './types'
import { compactPageThumbnails, completePageList, movePagesToThumbnailGroup, normalizeThumbnailGroups, removePagesFromThumbnailGroups, reorderThumbnailGroups, thumbnailPagesForDrag, visiblePageRange } from './pageManagement'

describe('page thumbnails', () => {
  it('shows every page and supplies the default state for missing records', () => {
    const legacyRecord = { documentId: 'doc', pageNumber: 2, hidden: true, hiddenGroupId: 'old-hide', bookmarked: true } as unknown as PageRecord

    expect(completePageList('doc', 3, [legacyRecord])).toEqual([
      { documentId: 'doc', pageNumber: 1, hidden: false, bookmarked: false },
      { documentId: 'doc', pageNumber: 2, hidden: false, bookmarked: true },
      { documentId: 'doc', pageNumber: 3, hidden: false, bookmarked: false },
    ])
  })

  it('places named groups at their first page and keeps every ungrouped page visible', () => {
    const groups = [
      { id: 'body', name: '몸판', pageNumbers: [4, 2, 2] },
      { id: 'sleeve', name: '소매', pageNumbers: [5] },
      { id: 'empty', name: '비어 있음', pageNumbers: [] },
    ]

    expect(compactPageThumbnails(5, groups)).toEqual([
      { type: 'page', pageNumber: 1 },
      { type: 'label-group', groupId: 'body', name: '몸판', pageNumbers: [2, 4], expanded: false, children: [] },
      { type: 'page', pageNumber: 3 },
      { type: 'label-group', groupId: 'sleeve', name: '소매', pageNumbers: [5], expanded: false, children: [] },
      { type: 'label-group', groupId: 'empty', name: '비어 있음', pageNumbers: [], expanded: false, children: [] },
    ])

    expect(compactPageThumbnails(5, groups, 'body')).toEqual([
      { type: 'page', pageNumber: 1 },
      { type: 'label-group', groupId: 'body', name: '몸판', pageNumbers: [2, 4], expanded: true, children: [{ type: 'page', pageNumber: 2 }, { type: 'page', pageNumber: 4 }] },
      { type: 'page', pageNumber: 3 },
      { type: 'label-group', groupId: 'sleeve', name: '소매', pageNumbers: [5], expanded: false, children: [] },
      { type: 'label-group', groupId: 'empty', name: '비어 있음', pageNumbers: [], expanded: false, children: [] },
    ])
  })

  it('preserves saved label-group order in the thumbnail rail', () => {
    const groups = [
      { id: 'body', name: '몸판', pageNumbers: [2, 4] },
      { id: 'sleeve', name: '소매', pageNumbers: [5] },
      { id: 'empty', name: '비어 있음', pageNumbers: [] },
    ]

    expect(compactPageThumbnails(5, [groups[1], groups[0], groups[2]])).toEqual([
      { type: 'page', pageNumber: 1 },
      { type: 'label-group', groupId: 'sleeve', name: '소매', pageNumbers: [5], expanded: false, children: [] },
      { type: 'page', pageNumber: 3 },
      { type: 'label-group', groupId: 'body', name: '몸판', pageNumbers: [2, 4], expanded: false, children: [] },
      { type: 'label-group', groupId: 'empty', name: '비어 있음', pageNumbers: [], expanded: false, children: [] },
    ])
  })

  it('moves selected pages between named groups without changing page records', () => {
    const groups = [
      { id: 'a', name: 'A', pageNumbers: [1, 3] },
      { id: 'b', name: 'B', pageNumbers: [2] },
    ]
    expect(movePagesToThumbnailGroup(groups, [2, 3], 'a')).toEqual([
      { id: 'a', name: 'A', pageNumbers: [1, 2, 3] },
      { id: 'b', name: 'B', pageNumbers: [] },
    ])
  })

  it('removes an emptied label group when its last page is ungrouped', () => {
    const groups = [
      { id: 'a', name: 'A', pageNumbers: [1] },
      { id: 'b', name: 'B', pageNumbers: [2, 3] },
      { id: 'empty', name: 'Empty', pageNumbers: [] },
    ]

    expect(removePagesFromThumbnailGroups(groups, [1, 2])).toEqual([
      { id: 'b', name: 'B', pageNumbers: [3] },
      { id: 'empty', name: 'Empty', pageNumbers: [] },
    ])
  })

  it('keeps multi-page drags intact and moves label order within its bounds', () => {
    const groups = [
      { id: 'a', name: 'A', pageNumbers: [1] },
      { id: 'b', name: 'B', pageNumbers: [2] },
      { id: 'c', name: 'C', pageNumbers: [3] },
    ]

    expect(thumbnailPagesForDrag([2, 3], 3)).toEqual([2, 3])
    expect(thumbnailPagesForDrag([2, 3], 1)).toEqual([1])
    expect(reorderThumbnailGroups(groups, 'b', -1).map((group) => group.id)).toEqual(['b', 'a', 'c'])
    expect(reorderThumbnailGroups(groups, 'a', -1)).toBe(groups)
    expect(reorderThumbnailGroups(groups, 'c', 1)).toBe(groups)
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

  it('returns an inclusive page range in either direction', () => {
    expect(visiblePageRange([1, 2, 3, 4, 5], 2, 5)).toEqual([2, 3, 4, 5])
    expect(visiblePageRange([1, 2, 3, 4, 5], 5, 2)).toEqual([5, 4, 3, 2])
    expect(visiblePageRange([1, 2, 3], 4, 2)).toEqual([])
  })
})
