import { describe, expect, it } from 'vitest'
import type { PageRecord } from './types'
import { canHidePageSelection, compactPageThumbnails, completePageList, nextVisiblePageAfterHide, visiblePageRange } from './pageManagement'

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

  it('collapses each consecutive hidden-page run into one thumbnail item', () => {
    expect(compactPageThumbnails(5, new Set([2, 3, 4]))).toEqual([
      { type: 'page', pageNumber: 1 },
      { type: 'hidden-run', firstPage: 2, lastPage: 4 },
      { type: 'page', pageNumber: 5 },
    ])
    expect(compactPageThumbnails(6, new Set([1, 3, 4, 6]))).toEqual([
      { type: 'hidden-run', firstPage: 1, lastPage: 1 },
      { type: 'page', pageNumber: 2 },
      { type: 'hidden-run', firstPage: 3, lastPage: 4 },
      { type: 'page', pageNumber: 5 },
      { type: 'hidden-run', firstPage: 6, lastPage: 6 },
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
