import { describe, expect, it } from 'vitest'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { acquireThumbnailCache, CanvasMemoryBudget, getViewerResourcePolicy, MAX_PDF_CANVAS_PIXELS, MAX_SINGLE_VIEW_PDF_PIXELS, MAX_SPLIT_VIEW_PDF_PIXELS, MAX_THUMBNAIL_CACHE_BYTES, ThumbnailCanvasCache, pdfRasterScale } from './pdfRenderResources'

describe('PDF render resource limits', () => {
  it('uses lower limits only for Android browsers with a coarse pointer', () => {
    const tabletPolicy = getViewerResourcePolicy('Mozilla/5.0 Android', true)
    expect(tabletPolicy).toMatchObject({
      tablet: true,
      maxCanvasBytes: 24 * 1024 * 1024,
      singleViewPixels: 2_500_000,
      splitViewPixels: 1_500_000,
      colorworkPixels: 500_000,
      thumbnailCacheEntries: 32,
      thumbnailCacheBytes: 2 * 1024 * 1024,
      cachedPageWorks: 4,
    })
    expect(getViewerResourcePolicy('Mozilla/5.0 Windows', true).tablet).toBe(false)
    expect(getViewerResourcePolicy('Mozilla/5.0 Android', false).tablet).toBe(false)
    const tabletBudget = new CanvasMemoryBudget(tabletPolicy.maxCanvasBytes)
    expect(tabletBudget.reserve({}, tabletPolicy.maxCanvasBytes)).toBe(true)
    expect(tabletBudget.reserve({}, 1)).toBe(false)
  })

  it('keeps the effective pixel ratio at or below two for ordinary pages', () => {
    expect(pdfRasterScale(800, 1000, 1, 3)).toBe(2)
  })

  it('reduces only raster scale to fit the page canvas pixel budget', () => {
    const scale = pdfRasterScale(6000, 9000, 1.5, 2)
    expect(scale).toBeLessThan(3)
    expect(Math.ceil(6000 * scale) * Math.ceil(9000 * scale)).toBeLessThanOrEqual(MAX_PDF_CANVAS_PIXELS)
  })

  it('applies lower canvas limits for single and split viewer panes', () => {
    const single = pdfRasterScale(2400, 3600, 2, 2, MAX_SINGLE_VIEW_PDF_PIXELS)
    const split = pdfRasterScale(2400, 3600, 2, 2, MAX_SPLIT_VIEW_PDF_PIXELS)
    expect(Math.ceil(2400 * single) * Math.ceil(3600 * single)).toBeLessThanOrEqual(MAX_SINGLE_VIEW_PDF_PIXELS)
    expect(Math.ceil(2400 * split) * Math.ceil(3600 * split)).toBeLessThanOrEqual(MAX_SPLIT_VIEW_PDF_PIXELS)
    expect(MAX_THUMBNAIL_CACHE_BYTES).toBe(8 * 1024 * 1024)
  })

  it('accounts for existing display canvases before reserving a staging canvas', () => {
    const budget = new CanvasMemoryBudget(100)
    const firstPane = {}
    const staging = {}
    expect(budget.reserve(firstPane, 60)).toBe(true)
    expect(budget.usedBytes).toBe(60)
    expect(budget.availableBytes(staging)).toBe(40)
    expect(budget.reserve(staging, 50)).toBe(false)
    expect(budget.reserve(staging, 40)).toBe(true)
    budget.release(firstPane)
    expect(budget.usedBytes).toBe(40)
    expect(budget.availableBytes()).toBe(60)
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

  it('applies the Android thumbnail count and byte caps', () => {
    const pdf = {} as PDFDocumentProxy
    const session = acquireThumbnailCache(pdf, getViewerResourcePolicy('Android', true))
    const canvases = Array.from({ length: 33 }, () => ({ width: 4, height: 4 }))
    canvases.forEach((canvas, index) => session.cache.set(index + 1, canvas as HTMLCanvasElement))
    expect(session.cache.get(1)).toBeUndefined()
    expect(canvases[0].width).toBe(0)

    const maxCanvas = { width: 1024, height: 512 }
    const overBudget = { width: 1, height: 1 }
    session.cache.set(50, maxCanvas as HTMLCanvasElement)
    session.cache.set(51, overBudget as HTMLCanvasElement)
    expect(session.cache.get(50)).toBeUndefined()
    expect(maxCanvas.width).toBe(0)
    expect(session.cache.get(51)).toBe(overBudget)
    session.release()
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
