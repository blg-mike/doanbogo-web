import type { PDFDocumentProxy } from 'pdfjs-dist'

export const MAX_PDF_CANVAS_PIXELS = 16_000_000
export const MAX_THUMBNAIL_CACHE_ENTRIES = 128
export const MAX_THUMBNAIL_CACHE_BYTES = 16 * 1024 * 1024

export function pdfRasterScale(width: number, height: number, cssScale: number, devicePixelRatio: number) {
  let scale = cssScale * Math.min(devicePixelRatio || 1, 2)
  if (Math.ceil(width * scale) * Math.ceil(height * scale) <= MAX_PDF_CANVAS_PIXELS) return scale

  scale *= Math.sqrt(MAX_PDF_CANVAS_PIXELS / (width * height * scale * scale))
  while (Math.ceil(width * scale) * Math.ceil(height * scale) > MAX_PDF_CANVAS_PIXELS) scale *= 0.999
  return scale
}

type CanvasResource = { width: number; height: number }

function releaseCanvas(canvas: CanvasResource) {
  canvas.width = 0
  canvas.height = 0
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

export function acquireThumbnailCache(pdf: PDFDocumentProxy) {
  let session = thumbnailSessions.get(pdf)
  if (!session) {
    session = { cache: new ThumbnailCanvasCache(), users: 0 }
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
