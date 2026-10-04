import { describe, expect, it } from 'vitest'
import type { PageRecord } from './types'
import { canHidePageSelection, completePageList, nextVisiblePageAfterHide, togglePageSelection } from './pageManagement'

describe('page management', () => {
  it('shows every PDF page and supplies the default state for pages without records', () => {
    const records: PageRecord[] = [{ documentId: 'doc', pageNumber: 2, hidden: true, bookmarked: true }]

    expect(completePageList('doc', 3, records)).toEqual([
      { documentId: 'doc', pageNumber: 1, hidden: false, bookmarked: false },
      records[0],
      { documentId: 'doc', pageNumber: 3, hidden: false, bookmarked: false },
    ])
  })

  it('toggles pages of the same visibility and starts a fresh selection across visibility states', () => {
    const hiddenPages = new Set([4])
    const selected = togglePageSelection(new Set([1]), 2, hiddenPages)

    expect(selected).toEqual(new Set([1, 2]))
    expect(togglePageSelection(selected, 1, hiddenPages)).toEqual(new Set([2]))
    expect(togglePageSelection(selected, 4, hiddenPages)).toEqual(new Set([4]))
  })

  it('prevents hiding all remaining visible pages', () => {
    expect(canHidePageSelection(3, new Set([2]), new Set([1, 3]))).toBe(false)
    expect(canHidePageSelection(3, new Set([2]), new Set([1]))).toBe(true)
    expect(canHidePageSelection(3, new Set([2]), new Set())).toBe(false)
  })

  it('moves a hidden viewer page to the next visible page, then falls back to the previous page', () => {
    expect(nextVisiblePageAfterHide(2, 5, new Set([2, 3]))).toBe(4)
    expect(nextVisiblePageAfterHide(4, 5, new Set([2, 3, 4, 5]))).toBe(1)
    expect(nextVisiblePageAfterHide(2, 2, new Set([1, 2]))).toBeNull()
  })
})
