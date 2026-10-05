import { describe, expect, it } from 'vitest'
import { samePdfLinks, withRecentPdfLinks } from './pdfRecognitionState'

const link = { x: 0.1, y: 0.2, width: 0.3, height: 0.1, href: 'https://example.com/' }

describe('PDF recognition view state', () => {
  it('reuses the current page map when cached links have the same coordinates', () => {
    const current = { 2: [link] }
    expect(samePdfLinks(current[2], [{ ...link }])).toBe(true)
    expect(withRecentPdfLinks(current, 2, [{ ...link }])).toBe(current)
  })

  it('updates only changed pages and keeps the four most recent page results', () => {
    const current = { 1: [], 2: [], 3: [], 4: [] }
    const next = withRecentPdfLinks(current, 5, [link])
    expect(next).not.toBe(current)
    expect(Object.keys(next)).toEqual(['2', '3', '4', '5'])
    expect(next[5]).toEqual([link])
  })
})
