import type { PDFDocumentProxy } from 'pdfjs-dist'

export const MAX_PDF_CANVAS_PIXELS = 16_000_000
export const MAX_THUMBNAIL_CACHE_ENTRIES = 128
export const MAX_THUMBNAIL_CACHE_BYTES = 8 * 1024 * 1024
export const MAX_TOUCH_THUMBNAIL_CACHE_ENTRIES = 8
export const MAX_TOUCH_THUMBNAIL_CACHE_BYTES = 512 * 1024
export const MAX_VIEWER_CANVAS_BYTES = 44 * 1024 * 1024
export const MAX_SINGLE_VIEW_PDF_PIXELS = 5_000_000
export const MAX_SPLIT_VIEW_PDF_PIXELS = 3_000_000
export const MAX_COLORWORK_CANVAS_PIXELS = 1_000_000

export interface ViewerResourcePolicy {
  tablet: boolean
  maxCanvasBytes: number
  singleViewPixels: number
  splitViewPixels: number
  colorworkPixels: number
  thumbnailCacheEntries: number
  thumbnailCacheBytes: number
  cachedPageWorks: number
}

const desktopPolicy: ViewerResourcePolicy = {
  tablet: false,
  maxCanvasBytes: MAX_VIEWER_CANVAS_BYTES,
  singleViewPixels: MAX_SINGLE_VIEW_PDF_PIXELS,
  splitViewPixels: MAX_SPLIT_VIEW_PDF_PIXELS,
  colorworkPixels: MAX_COLORWORK_CANVAS_PIXELS,
  thumbnailCacheEntries: MAX_THUMBNAIL_CACHE_ENTRIES,
  thumbnailCacheBytes: MAX_THUMBNAIL_CACHE_BYTES,
  cachedPageWorks: 8,
}

const tabletPolicy: ViewerResourcePolicy = {
  tablet: true,
  maxCanvasBytes: 24 * 1024 * 1024,
  singleViewPixels: 2_500_000,
  splitViewPixels: 1_500_000,
  colorworkPixels: 500_000,
  thumbnailCacheEntries: MAX_TOUCH_THUMBNAIL_CACHE_ENTRIES,
  thumbnailCacheBytes: MAX_TOUCH_THUMBNAIL_CACHE_BYTES,
  cachedPageWorks: 4,
}

export function getViewerResourcePolicy(hasCoarsePointer = typeof matchMedia !== 'undefined' && matchMedia('(any-pointer: coarse)').matches, maxTouchPoints = typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints): ViewerResourcePolicy {
  return hasCoarsePointer && maxTouchPoints >= 2 ? tabletPolicy : desktopPolicy
}

export function pdfRasterScale(width: number, height: number, cssScale: number, devicePixelRatio: number, maxPixels = MAX_PDF_CANVAS_PIXELS) {
  let scale = cssScale * Math.min(devicePixelRatio || 1, 2)
  if (Math.ceil(width * scale) * Math.ceil(height * scale) <= maxPixels) return scale

  scale *= Math.sqrt(maxPixels / (width * height * scale * scale))
  while (Math.ceil(width * scale) * Math.ceil(height * scale) > maxPixels) scale *= 0.999
  return scale
}

export class CanvasMemoryBudget {
  private readonly allocations = new Map<object, number>()
  private readonly maxBytes: number

  constructor(maxBytes = MAX_VIEWER_CANVAS_BYTES) {
    this.maxBytes = maxBytes
  }

  get usedBytes() {
    return this.totalBytes()
  }

  reserve(key: object, bytes: number) {
    const current = this.allocations.get(key) ?? 0
    if (this.totalBytes() - current + bytes > this.maxBytes) return false
    this.allocations.set(key, bytes)
    return true
  }

  availableBytes(key?: object) {
    return Math.max(0, this.maxBytes - this.totalBytes() + (key ? this.allocations.get(key) ?? 0 : 0))
  }

  release(key: object) {
    this.allocations.delete(key)
  }

  private totalBytes() {
    let total = 0
    for (const bytes of this.allocations.values()) total += bytes
    return total
  }
}

export const viewerCanvasMemory = new CanvasMemoryBudget(getViewerResourcePolicy().maxCanvasBytes)

type CanvasResource = { width: number; height: number }

function releaseCanvas(canvas: CanvasResource) {
  canvas.width = 0
  canvas.height = 0
}

export function releaseCanvasWhenSettled(canvas: CanvasResource, renderPromise: Promise<unknown>) {
  return renderPromise.then(() => releaseCanvas(canvas), () => releaseCanvas(canvas))
}

export class ThumbnailCanvasCache<TCanvas extends CanvasResource = HTMLCanvasElement> {
  private readonly entries = new Map<number, { canvas: TCanvas; bytes: number }>()
  private readonly excludedPages = new Set<number>()
  private bytes = 0
  private readonly maxEntries: number
  private readonly maxBytes: number

  constructor(maxEntries = MAX_THUMBNAIL_CACHE_ENTRIES, maxBytes = MAX_THUMBNAIL_CACHE_BYTES) {
    this.maxEntries = maxEntries
    this.maxBytes = maxBytes
  }

  get(pageNumber: number) {
    if (this.excludedPages.has(pageNumber)) return undefined
    const entry = this.entries.get(pageNumber)
    if (!entry) return undefined
    this.entries.delete(pageNumber)
    this.entries.set(pageNumber, entry)
    return entry.canvas
  }

  set(pageNumber: number, canvas: TCanvas) {
    this.delete(pageNumber)
    if (this.excludedPages.has(pageNumber)) {
      releaseCanvas(canvas)
      return
    }
    const bytes = canvas.width * canvas.height * 4
    if (!bytes || bytes > this.maxBytes) {
      releaseCanvas(canvas)
      return
    }
    this.entries.set(pageNumber, { canvas, bytes })
    this.bytes += bytes
    while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes) {
      const oldest = this.entries.keys().next().value
      if (oldest === undefined) break
      this.delete(oldest)
    }
  }

  clear() {
    for (const { canvas } of this.entries.values()) releaseCanvas(canvas)
    this.entries.clear()
    this.bytes = 0
  }

  excludePage(pageNumber: number, excluded: boolean) {
    if (excluded) {
      this.excludedPages.add(pageNumber)
      this.delete(pageNumber)
    } else {
      this.excludedPages.delete(pageNumber)
    }
  }

  private delete(pageNumber: number) {
    const entry = this.entries.get(pageNumber)
    if (!entry) return
    this.entries.delete(pageNumber)
    this.bytes -= entry.bytes
    releaseCanvas(entry.canvas)
  }
}

interface ThumbnailSession {
  cache: ThumbnailCanvasCache
  users: number
}

const thumbnailSessions = new WeakMap<PDFDocumentProxy, ThumbnailSession>()

export function setThumbnailPagesExcluded(pdf: PDFDocumentProxy, pageNumbers: number[], excluded: boolean) {
  const cache = thumbnailSessions.get(pdf)?.cache
  if (!cache) return
  for (const pageNumber of pageNumbers) cache.excludePage(pageNumber, excluded)
}

export function acquireThumbnailCache(pdf: PDFDocumentProxy, policy = getViewerResourcePolicy()) {
  let session = thumbnailSessions.get(pdf)
  if (!session) {
    session = { cache: new ThumbnailCanvasCache(policy.thumbnailCacheEntries, policy.thumbnailCacheBytes), users: 0 }
    thumbnailSessions.set(pdf, session)
  }
  session.users++
  let released = false
  return {
    cache: session.cache,
    release: () => {
      if (released) return
      released = true
      session!.users--
      if (session!.users === 0) {
        session!.cache.clear()
        thumbnailSessions.delete(pdf)
      }
    },
  }
}
