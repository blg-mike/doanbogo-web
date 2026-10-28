import jsQR, { type QRCode } from 'jsqr'
import { describe, expect, it, vi } from 'vitest'
import { detectPdfQrLinksFromPixels } from './qrDecode'

vi.mock('jsqr', () => ({ default: vi.fn() }))

describe('QR pixel decoding', () => {
  const code = (data: string, x: number, y: number, size = 8): QRCode => ({
    data,
    binaryData: [],
    chunks: [],
    version: 1,
    location: {
      topLeftCorner: { x, y }, topRightCorner: { x: x + size, y },
      bottomLeftCorner: { x, y: y + size }, bottomRightCorner: { x: x + size, y: y + size },
      topLeftFinderPattern: { x, y }, topRightFinderPattern: { x: x + size, y },
      bottomLeftFinderPattern: { x, y: y + size },
    },
  })

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
      expect(decoder).toHaveBeenCalledTimes(9)
    } finally {
      decoder.mockReset()
    }
  })

  it('returns no links when pixel dimensions do not match the data', () => {
    const decoder = vi.mocked(jsQR)
    expect(detectPdfQrLinksFromPixels(new Uint8ClampedArray(4), 32, 32)).toEqual([])
    expect(decoder).not.toHaveBeenCalled()
  })

  it('finds a QR in overlapping tiles and removes the duplicate tile hit', () => {
    const decoder = vi.mocked(jsQR)
    decoder.mockReturnValueOnce(null)
    for (let tile = 0; tile < 4; tile++) decoder.mockReturnValueOnce(null)
    decoder.mockReturnValueOnce(code('https://example.com/tiled', 48, 8)).mockReturnValueOnce(null)
      .mockReturnValueOnce(code('https://example.com/tiled', 10, 8)).mockReturnValueOnce(null)

    try {
      expect(detectPdfQrLinksFromPixels(new Uint8ClampedArray(100 * 100 * 4), 100, 100)).toEqual([
        { x: 0.48, y: 0.63, width: 0.08, height: 0.08, href: 'https://example.com/tiled' },
      ])
    } finally {
      decoder.mockReset()
    }
  })

  it('keeps identical URLs at distinct tile positions', () => {
    const decoder = vi.mocked(jsQR)
    decoder.mockReturnValueOnce(null).mockReturnValueOnce(code('https://example.com/repeated', 5, 5)).mockReturnValueOnce(null)
      .mockReturnValueOnce(code('https://example.com/repeated', 30, 5)).mockReturnValueOnce(null)
    for (let tile = 0; tile < 8; tile++) decoder.mockReturnValueOnce(null)

    try {
      expect(detectPdfQrLinksFromPixels(new Uint8ClampedArray(100 * 100 * 4), 100, 100)).toEqual([
        { x: 0.05, y: 0.05, width: 0.08, height: 0.08, href: 'https://example.com/repeated' },
        { x: 0.68, y: 0.05, width: 0.08, height: 0.08, href: 'https://example.com/repeated' },
      ])
    } finally {
      decoder.mockReset()
    }
  })
})
