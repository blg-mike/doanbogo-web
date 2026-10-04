import jsQR, { type QRCode } from 'jsqr'
import { describe, expect, it, vi } from 'vitest'
import { safeQrHref } from './qr'

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
})
