import jsQR, { type QRCode } from 'jsqr'
import { describe, expect, it, vi } from 'vitest'
import { extractPdfPageLinks, safeQrHref } from './qr'

vi.mock('jsqr', () => ({ default: vi.fn() }))

describe('PDF QR link targets', () => {
  it('accepts HTTP and HTTPS destinations', () => {
    expect(safeQrHref('https://example.com/pattern')).toBe('https://example.com/pattern')
    expect(safeQrHref(' http://example.com ')).toBe('http://example.com/')
  })

  it('rejects non-web and malformed QR contents', () => {
    expect(safeQrHref('javascript:alert(1)')).toBeNull()
    expect(safeQrHref('mailto:maker@example.com')).toBeNull()
    expect(safeQrHref('not a url')).toBeNull()
  })

  it('finds multiple codes by masking each decoded region before rescanning', async () => {
    const code = (data: string, x: number): QRCode => ({
      data,
      binaryData: [],
      chunks: [],
      version: 1,
      location: {
        topLeftCorner: { x, y: 4 }, topRightCorner: { x: x + 8, y: 4 },
        bottomLeftCorner: { x, y: 12 }, bottomRightCorner: { x: x + 8, y: 12 },
        topLeftFinderPattern: { x, y: 4 }, topRightFinderPattern: { x: x + 8, y: 4 },
        bottomLeftFinderPattern: { x, y: 12 },
      },
    })
    const decoder = vi.mocked(jsQR)
    decoder.mockReturnValueOnce(code('https://example.com/one', 4))
      .mockReturnValueOnce(code('https://example.com/two', 20))
      .mockReturnValueOnce(null)
    const imageData = new Uint8ClampedArray(32 * 32 * 4)
    const context = { drawImage: vi.fn(), getImageData: vi.fn(() => ({ data: imageData })) }
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) })
    const { detectPdfQrLinks } = await import('./qr')

    try {
      expect(detectPdfQrLinks({ width: 32, height: 32 } as HTMLCanvasElement)).toEqual([
        { x: 0.125, y: 0.125, width: 0.25, height: 0.25, href: 'https://example.com/one' },
        { x: 0.625, y: 0.125, width: 0.25, height: 0.25, href: 'https://example.com/two' },
      ])
      expect(decoder).toHaveBeenCalledTimes(3)
    } finally {
      vi.unstubAllGlobals()
      decoder.mockReset()
    }
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
