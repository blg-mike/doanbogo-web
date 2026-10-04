import jsQR, { type QRCode } from 'jsqr'
import { describe, expect, it, vi } from 'vitest'
import { detectPdfQrLinksFromPixels } from './qrDecode'

vi.mock('jsqr', () => ({ default: vi.fn() }))

describe('QR pixel decoding', () => {
  it('finds multiple codes by masking each decoded region before rescanning', () => {
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

    try {
      expect(detectPdfQrLinksFromPixels(new Uint8ClampedArray(32 * 32 * 4), 32, 32)).toEqual([
        { x: 0.125, y: 0.125, width: 0.25, height: 0.25, href: 'https://example.com/one' },
        { x: 0.625, y: 0.125, width: 0.25, height: 0.25, href: 'https://example.com/two' },
      ])
      expect(decoder).toHaveBeenCalledTimes(3)
    } finally {
      decoder.mockReset()
    }
  })

  it('returns no links when pixel dimensions do not match the data', () => {
    const decoder = vi.mocked(jsQR)
    expect(detectPdfQrLinksFromPixels(new Uint8ClampedArray(4), 32, 32)).toEqual([])
    expect(decoder).not.toHaveBeenCalled()
  })
})
