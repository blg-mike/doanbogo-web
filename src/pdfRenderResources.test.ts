import { describe, expect, it } from 'vitest'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { acquireThumbnailCache, MAX_PDF_CANVAS_PIXELS, ThumbnailCanvasCache, pdfRasterScale } from './pdfRenderResources'

describe('PDF render resource limits', () => {
  it('keeps the effective pixel ratio at or below two for ordinary pages', () => {
    expect(pdfRasterScale(800, 1000, 1, 3)).toBe(2)
  })

  it('reduces only raster scale to fit the page canvas pixel budget', () => {
    const scale = pdfRasterScale(6000, 9000, 1.5, 2)
    expect(scale).toBeLessThan(3)
    expect(Math.ceil(6000 * scale) * Math.ceil(9000 * scale)).toBeLessThanOrEqual(MAX_PDF_CANVAS_PIXELS)
  })

  it('evicts least recently used canvases and releases their pixels', () => {
    const cache = new ThumbnailCanvasCache<{ width: number; height: number }>(2, 100_000)
    const first = { width: 10, height: 10 }
    const second = { width: 20, height: 10 }
    const third = { width: 10, height: 20 }
    cache.set(1, first)
    cache.set(2, second)
    expect(cache.get(1)).toBe(first)
    cache.set(3, third)

    expect(cache.get(1)).toBe(first)
    expect(cache.get(2)).toBeUndefined()
    expect(second.width).toBe(0)
    expect(first.width).toBe(10)
    cache.clear()
    expect(third.width).toBe(0)
  })

  it('evicts by byte budget even when the entry count is below the cap', () => {
    const cache = new ThumbnailCanvasCache<{ width: number; height: number }>(8, 1_000)
    const first = { width: 20, height: 10 }
    const second = { width: 20, height: 10 }
    cache.set(1, first)
    cache.set(2, second)

    expect(first.width).toBe(0)
    expect(cache.get(1)).toBeUndefined()
    expect(cache.get(2)).toBe(second)
  })

  it('releases and excludes hidden page thumbnails until the page is restored', () => {
    const cache = new ThumbnailCanvasCache<{ width: number; height: number }>()
    const hiddenCanvas = { width: 20, height: 10 }
    cache.set(8, hiddenCanvas)

    cache.excludePage(8, true)
    expect(hiddenCanvas.width).toBe(0)
    expect(cache.get(8)).toBeUndefined()

    const lateCanvas = { width: 20, height: 10 }
    cache.set(8, lateCanvas)
    expect(lateCanvas.width).toBe(0)

    cache.excludePage(8, false)
    const restoredCanvas = { width: 20, height: 10 }
    cache.set(8, restoredCanvas)
    expect(cache.get(8)).toBe(restoredCanvas)
  })

  it('releases a document cache only after its last thumbnail is disposed', () => {
    const pdf = {} as PDFDocumentProxy
    const first = acquireThumbnailCache(pdf)
    const second = acquireThumbnailCache(pdf)
    const canvas = { width: 10, height: 10 }
    first.cache.set(1, canvas as HTMLCanvasElement)

    first.release()
    expect(canvas.width).toBe(10)
    second.release()
    expect(canvas.width).toBe(0)
    const third = acquireThumbnailCache(pdf)
    expect(third.cache).not.toBe(first.cache)
    third.release()
  })
})
