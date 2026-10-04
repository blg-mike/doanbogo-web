import { describe, expect, it } from 'vitest'
import { extractPdfPageLinks, isCurrentQrScanGeneration, safeQrHref } from './qr'

describe('PDF QR link targets', () => {
  it('rejects delayed scans from an older document generation', () => {
    expect(isCurrentQrScanGeneration(4, 4)).toBe(true)
    expect(isCurrentQrScanGeneration(4, 5)).toBe(false)
  })

  it('accepts HTTP and HTTPS destinations', () => {
    expect(safeQrHref('https://example.com/pattern')).toBe('https://example.com/pattern')
    expect(safeQrHref(' http://example.com ')).toBe('http://example.com/')
  })

  it('rejects non-web and malformed QR contents', () => {
    expect(safeQrHref('javascript:alert(1)')).toBeNull()
    expect(safeQrHref('mailto:maker@example.com')).toBeNull()
    expect(safeQrHref('not a url')).toBeNull()
  })

  it('extracts PDF link annotations and URLs split across adjacent text runs', () => {
    const links = extractPdfPageLinks(
      [{ subtype: 'Link', url: 'https://pattern.example/page', rect: [150, 150, 190, 180] }],
      [
        { str: 'https://example.', transform: [1, 0, 0, 10, 10, 50], width: 80, height: 10 },
        { str: 'com/pattern.', transform: [1, 0, 0, 10, 90, 50], width: 60, height: 10 },
        { str: 'javascript:alert(1)', transform: [1, 0, 0, 10, 10, 20], width: 100, height: 10 },
      ],
      { width: 200, height: 200, transform: [1, 0, 0, 1, 0, 0] },
    )

    expect(links).toHaveLength(2)
    expect(links[0]).toMatchObject({ href: 'https://pattern.example/page', x: 0.75, y: 0.75, width: 0.2, height: 0.15 })
    expect(links[1].href).toBe('https://example.com/pattern')
    expect(links[1].x).toBe(0.05)
    expect(links[1].width).toBeCloseTo(0.675)
  })

  it('maps link annotation bounds through the PDF viewport transform', () => {
    const [link] = extractPdfPageLinks(
      [{ subtype: 'Link', url: 'https://pattern.example/page', rect: [10, 20, 30, 40] }],
      [],
      { width: 200, height: 200, transform: [1, 0, 0, -1, 0, 200] },
    )

    expect(link).toMatchObject({ x: 0.05, y: 0.8, width: 0.1, height: 0.1 })
  })
})
