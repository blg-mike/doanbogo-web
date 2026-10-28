import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist'
import type { DocumentRecord, PageRecognitionRecord } from './types'
import { extractPdfPageLinks, type PdfQrLink } from './qr'
import { getPageRecognition, savePageRecognition } from './storage'
import { pdfPageRenderQueue } from './pdfPageRenderQueue'
import { viewerCanvasMemory } from './pdfRenderResources'
import { openPdf } from './pdf'
import { openPhotoDocument } from './photoDocument'
import { PDF_RECOGNITION_VERSION } from './pdfRecognitionVersion'
import { getPdfQrTileBounds, PDF_QR_TILE_AREA_FRACTION, type PdfQrTile } from './qrTileGrid'

type RecognitionJob = {
  key: string
  record: Pick<DocumentRecord, 'id' | 'pageCount' | 'pdf' | 'kind'>
  pageNumber: number
  viewerPdf: PDFDocumentProxy | null
  cancelled: boolean
  yielded: boolean
  force: boolean
  cancelCurrent?: () => void
}

export type PdfRecognitionEvent = { kind: 'result'; result: PageRecognitionRecord } | { kind: 'error' }
type RecognitionListener = (documentId: string, pageNumber: number, event: PdfRecognitionEvent) => void
type RecognitionResult = { id: number; links: PdfQrLink[]; error?: true }
type QrRaster = { pixels: ImageData; originX: number; originY: number; fullWidth: number; fullHeight: number; release: () => void }

async function createQrWorker() {
  const { default: InlineQrWorker } = await import('./qrDecode.worker?worker&inline')
  return new InlineQrWorker()
}

class RecognitionYieldError extends Error {
  constructor() {
    super('Background PDF recognition yielded to the viewer.')
    this.name = 'RecognitionYieldError'
  }
}

const jobs = new Map<string, RecognitionJob>()
const reportPausedDocuments = new Set<string>()
const queue: RecognitionJob[] = []
const listeners = new Set<RecognitionListener>()
const pdfOperations = new Map<PDFDocumentProxy, Set<Promise<unknown>>>()
let active = false
let nextScanId = 0

function publish(job: RecognitionJob, event: PdfRecognitionEvent) {
  if (job.cancelled || jobs.get(job.key) !== job) return
  listeners.forEach((listener) => listener(job.record.id, job.pageNumber, event))
}

function resultFor(job: RecognitionJob, pdfLinksDone: boolean, pdfLinks: PdfQrLink[], qrLinksDone: boolean, qrLinks: PdfQrLink[], qrInputMaxDimension: number): PageRecognitionRecord {
  return { documentId: job.record.id, pageNumber: job.pageNumber, version: PDF_RECOGNITION_VERSION, pdfLinksDone, pdfLinks, qrLinksDone, qrLinks, qrInputMaxDimension }
}

async function saveResult(job: RecognitionJob, result: PageRecognitionRecord) {
  try {
    await savePageRecognition(job.record.id, job.pageNumber, {
      pdfLinksDone: result.pdfLinksDone,
      pdfLinks: result.pdfLinks,
      qrLinksDone: result.qrLinksDone,
      qrLinks: result.qrLinks,
      qrInputMaxDimension: result.qrInputMaxDimension,
    })
  } catch (error) {
    console.warn(`[PDF] Page ${job.pageNumber} recognition could not be saved.`, error)
    publish(job, { kind: 'error' })
  }
}

function trackPdfOperation<T>(pdf: PDFDocumentProxy, operation: () => Promise<T>) {
  const task = operation()
  const operations = pdfOperations.get(pdf) ?? new Set<Promise<unknown>>()
  operations.add(task)
  pdfOperations.set(pdf, operations)
  void task.finally(() => {
    operations.delete(task)
    if (!operations.size) pdfOperations.delete(pdf)
  }).catch(() => {})
  return task
}

function decodeQr(worker: Worker, image: ImageData, onCancelReady: (cancel: () => void) => void): Promise<PdfQrLink[]> {
  const id = ++nextScanId
  return new Promise((resolve, reject) => {
    const handleMessage = ({ data }: MessageEvent<RecognitionResult>) => {
      if (data.id !== id) return
      cleanup()
      if (data.error) reject(new Error('QR 분석에 실패했습니다.'))
      else resolve(data.links)
    }
    const handleError = (event: ErrorEvent) => {
      cleanup()
      reject(new Error(event.message || 'QR 분석 Worker가 중단됐습니다.'))
    }
    const cleanup = () => {
      worker.removeEventListener('message', handleMessage)
      worker.removeEventListener('error', handleError)
    }
    onCancelReady(() => {
      cleanup()
      worker.terminate()
      reject(new RecognitionYieldError())
    })
    worker.addEventListener('message', handleMessage)
    worker.addEventListener('error', handleError, { once: true })
    const pixels = image.data.buffer as ArrayBuffer
    try {
      worker.postMessage({ id, width: image.width, height: image.height, pixels }, [pixels])
    } catch (error) {
      cleanup()
      reject(error)
    }
  })
}

function renderQrRaster(page: PDFPageProxy, scale: number, tile: PdfQrTile, fullWidth: number, fullHeight: number, onCancelReady: (cancel: () => void) => void) {
  const renderKey = {}
  return new Promise<QrRaster | null>((resolve, reject) => {
    let renderTask: RenderTask | undefined
    let interrupted = false
    let reserved = false
    let keepReserved = false
    const memoryKey = {}
    const cancel = pdfPageRenderQueue.enqueue(renderKey, async () => {
      try {
        const width = Math.max(1, tile.right - tile.left)
        const height = Math.max(1, tile.bottom - tile.top)
        const maxPixels = Math.floor(viewerCanvasMemory.availableBytes() / 8)
        if (width * height > maxPixels) {
          resolve(null)
          return
        }
        const viewport = page.getViewport({ scale, offsetX: -tile.left, offsetY: -tile.top })
        const canvas = document.createElement('canvas')
        const bytes = width * height * 8
        if (!viewerCanvasMemory.reserve(memoryKey, bytes)) {
          resolve(null)
          return
        }
        reserved = true
        try {
          canvas.width = width
          canvas.height = height
          const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true })
          if (!context) throw new Error('QR 분석 캔버스를 만들 수 없습니다.')
          context.fillStyle = '#fff'
          context.fillRect(0, 0, width, height)
          renderTask = page.render({ canvas, canvasContext: context, viewport })
          let timedOut = false
          const timeoutId = window.setTimeout(() => {
            timedOut = true
            renderTask?.cancel()
          }, 20000)
          try {
            await renderTask.promise
          } finally {
            window.clearTimeout(timeoutId)
          }
          if (timedOut) throw new Error('QR 분석 페이지 렌더가 20초 동안 끝나지 않았습니다.')
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
          keepReserved = true
          resolve({
            pixels,
            originX: tile.left,
            originY: tile.top,
            fullWidth,
            fullHeight,
            release: () => {
              if (!reserved) return
              reserved = false
              viewerCanvasMemory.release(memoryKey)
            },
          })
        } finally {
          renderTask = undefined
          canvas.width = 0
          canvas.height = 0
          if (reserved && !keepReserved) {
            reserved = false
            viewerCanvasMemory.release(memoryKey)
          }
        }
      } catch (error) {
        if (reserved && !keepReserved) {
          reserved = false
          viewerCanvasMemory.release(memoryKey)
        }
        reject(interrupted ? new RecognitionYieldError() : error)
      }
    }, () => {
      interrupted = true
      if (renderTask) renderTask.cancel()
      else reject(new RecognitionYieldError())
    }, -1)
    onCancelReady(cancel)
  })
}

function mapQrRasterLinks(links: PdfQrLink[], raster: QrRaster) {
  return links.map((link) => ({
    ...link,
    x: (raster.originX + link.x * raster.pixels.width) / raster.fullWidth,
    y: (raster.originY + link.y * raster.pixels.height) / raster.fullHeight,
    width: link.width * raster.pixels.width / raster.fullWidth,
    height: link.height * raster.pixels.height / raster.fullHeight,
  }))
}

function addUniqueQrLink(links: PdfQrLink[], link: PdfQrLink) {
  const duplicate = links.some((candidate) => {
    if (candidate.href !== link.href) return false
    const overlapWidth = Math.max(0, Math.min(candidate.x + candidate.width, link.x + link.width) - Math.max(candidate.x, link.x))
    const overlapHeight = Math.max(0, Math.min(candidate.y + candidate.height, link.y + link.height) - Math.max(candidate.y, link.y))
    const intersection = overlapWidth * overlapHeight
    return intersection / Math.max(Number.EPSILON, Math.min(candidate.width * candidate.height, link.width * link.height)) >= 0.5
  })
  if (!duplicate) links.push(link)
}

function qrRenderScale(page: PDFPageProxy, maxDimension: number, maxPixels: number, tileFraction = 1) {
  const base = page.getViewport({ scale: 1 })
  return Math.min(maxDimension / Math.max(base.width, base.height), Math.sqrt(maxPixels * 0.99 / (base.width * base.height * tileFraction)))
}

async function runJob(job: RecognitionJob) {
  let owned: Awaited<ReturnType<typeof openPdf>> | null = null
  let worker: Worker | null = null
  try {
    if (job.cancelled) return
    let cached: PageRecognitionRecord | undefined
    try {
      cached = await getPageRecognition(job.record.id, job.pageNumber)
    } catch (error) {
      publish(job, { kind: 'error' })
      console.warn(`[PDF] Page ${job.pageNumber} recognition cache could not be read.`, error)
      return
    }
    if (job.cancelled) return
    if (cached?.version !== 1 && cached?.version !== PDF_RECOGNITION_VERSION) cached = undefined
    if (!job.force && cached?.version === PDF_RECOGNITION_VERSION && cached.pdfLinksDone && cached.qrLinksDone) {
      publish(job, { kind: 'result', result: cached })
      return
    }

    let pdf: PDFDocumentProxy
    if (job.viewerPdf) pdf = job.viewerPdf
    else {
      owned = job.record.kind === 'photos'
        ? await openPhotoDocument(job.record.id)
        : job.record.pdf ? await openPdf(job.record.pdf) : (() => { throw new Error('PDF 자료를 찾을 수 없습니다.') })()
      pdf = owned.document
    }
    const page = await trackPdfOperation(pdf, () => pdf.getPage(job.pageNumber))
    if (job.cancelled) return

    const currentCache = !job.force && cached?.version === PDF_RECOGNITION_VERSION ? cached : undefined
    let pdfLinksDone = currentCache?.pdfLinksDone ?? false
    let pdfLinks = cached?.pdfLinks ?? []
    let qrLinksDone = currentCache?.qrLinksDone ?? false
    let qrLinks = cached?.qrLinks ?? []
    let qrInputMaxDimension = currentCache?.qrInputMaxDimension ?? 0
    if (!pdfLinksDone) {
      try {
        const [annotations, content] = await trackPdfOperation(pdf, () => Promise.all([
          page.getAnnotations({ intent: 'display' }),
          page.getTextContent(),
        ]))
        if (job.cancelled) return
        const textRuns = content.items.flatMap((item) => 'str' in item ? [item] : [])
        pdfLinks = extractPdfPageLinks(annotations, textRuns, page.getViewport({ scale: 1 }))
        pdfLinksDone = true
        const partial = resultFor(job, pdfLinksDone, pdfLinks, qrLinksDone, qrLinks, qrInputMaxDimension)
        publish(job, { kind: 'result', result: partial })
        await saveResult(job, partial)
      } catch (error) {
        if (job.cancelled) return
        console.warn(`[PDF] Page ${job.pageNumber} link recognition failed and can be retried.`, error)
        publish(job, { kind: 'error' })
      }
    }

    if (!qrLinksDone && !job.cancelled) {
      let qrRaster: QrRaster | null = null
      try {
        const lowResPixels = Math.min(2_097_152, Math.floor(viewerCanvasMemory.availableBytes() / 8))
        if (lowResPixels < 160_000) throw new Error('QR analysis memory is temporarily unavailable.')
        const lowResScale = qrRenderScale(page, 1400, lowResPixels)
        const lowResWidth = Math.max(1, Math.ceil(page.getViewport({ scale: lowResScale }).width))
        const lowResHeight = Math.max(1, Math.ceil(page.getViewport({ scale: lowResScale }).height))
        qrRaster = await renderQrRaster(page, lowResScale, { left: 0, top: 0, right: lowResWidth, bottom: lowResHeight }, lowResWidth, lowResHeight, (cancel) => { job.cancelCurrent = cancel }).finally(() => { job.cancelCurrent = undefined })
        if (job.cancelled) return
        if (!qrRaster) throw new Error('QR analysis memory is temporarily unavailable.')
        worker = await createQrWorker()
        if (job.cancelled) return
        qrLinks = mapQrRasterLinks(await decodeQr(worker, qrRaster.pixels, (cancel) => { job.cancelCurrent = cancel }).finally(() => { job.cancelCurrent = undefined }), qrRaster)
        qrInputMaxDimension = Math.max(qrRaster.pixels.width, qrRaster.pixels.height)
        qrRaster.release()
        qrRaster = null
        if (!qrLinks.length && !job.cancelled) {
          const highResPixels = Math.floor(viewerCanvasMemory.availableBytes() / 8)
          if (highResPixels < 160_000) throw new Error('QR analysis memory is temporarily unavailable.')
          const highResScale = qrRenderScale(page, 2800, highResPixels, PDF_QR_TILE_AREA_FRACTION)
          const highResWidth = Math.max(1, Math.ceil(page.getViewport({ scale: highResScale }).width))
          const highResHeight = Math.max(1, Math.ceil(page.getViewport({ scale: highResScale }).height))
          for (const tile of getPdfQrTileBounds(highResWidth, highResHeight)) {
            qrRaster = await renderQrRaster(page, highResScale, tile, highResWidth, highResHeight, (cancel) => { job.cancelCurrent = cancel }).finally(() => { job.cancelCurrent = undefined })
            if (job.cancelled) return
            if (!qrRaster) throw new Error('QR analysis memory is temporarily unavailable.')
            const tileLinks = mapQrRasterLinks(await decodeQr(worker, qrRaster.pixels, (cancel) => { job.cancelCurrent = cancel }).finally(() => { job.cancelCurrent = undefined }), qrRaster)
            for (const link of tileLinks) addUniqueQrLink(qrLinks, link)
            qrInputMaxDimension = Math.max(qrInputMaxDimension, Math.max(qrRaster.pixels.width, qrRaster.pixels.height))
            qrRaster.release()
            qrRaster = null
          }
        }
        if (job.cancelled) return
        qrLinksDone = true
        const result = resultFor(job, pdfLinksDone, pdfLinks, qrLinksDone, qrLinks, qrInputMaxDimension)
        publish(job, { kind: 'result', result })
        await saveResult(job, result)
      } catch (error) {
        if (error instanceof RecognitionYieldError && !job.cancelled) {
          job.yielded = true
          return
        }
        if (!job.cancelled) {
          const partial = resultFor(job, pdfLinksDone, pdfLinks, qrLinksDone, qrLinks, qrInputMaxDimension)
          publish(job, { kind: 'result', result: partial })
          publish(job, { kind: 'error' })
          console.warn(`[PDF] Page ${job.pageNumber} QR recognition failed and can be retried.`, error)
        }
      } finally {
        qrRaster?.release()
      }
    }
  } catch (error) {
    if (!job.cancelled) {
      publish(job, { kind: 'error' })
      console.warn(`[PDF] Page ${job.pageNumber} link analysis stopped and can be retried.`, error)
    }
  } finally {
    worker?.terminate()
    if (owned) await owned.dispose()
    if (!job.yielded && jobs.get(job.key) === job) jobs.delete(job.key)
  }
}

function pump() {
  if (active) return
  const job = queue.shift()
  if (!job) return
  active = true
  void runJob(job).finally(() => {
    if (job.yielded && !job.cancelled && jobs.get(job.key) === job) {
      job.yielded = false
      queue.push(job)
    }
    active = false
    pump()
  })
}

function stopJob(job: RecognitionJob) {
  job.cancelled = true
  job.cancelCurrent?.()
  if (jobs.get(job.key) === job) jobs.delete(job.key)
  const index = queue.indexOf(job)
  if (index >= 0) queue.splice(index, 1)
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') for (const job of [...jobs.values()]) stopJob(job)
})

export function requestPdfPageRecognition(record: Pick<DocumentRecord, 'id' | 'pageCount' | 'pdf' | 'kind'>, pageNumber: number, viewerPdf: PDFDocumentProxy, activePage = false, force = false) {
  if (pageNumber < 1 || pageNumber > record.pageCount || reportPausedDocuments.has(record.id) || document.visibilityState !== 'visible') return false
  const key = record.id + ':' + pageNumber
  let existing = jobs.get(key)
  if (existing && force) {
    stopJob(existing)
    existing = undefined
  }
  if (existing) {
    existing.record = record
    existing.viewerPdf = viewerPdf
    if (activePage) {
      const index = queue.indexOf(existing)
      if (index > 0) queue.unshift(...queue.splice(index, 1))
    }
    return true
  }
  const job: RecognitionJob = { key, record, pageNumber, viewerPdf, cancelled: false, yielded: false, force }
  jobs.set(key, job)
  if (activePage) queue.unshift(job)
  else queue.push(job)
  pump()
  return true
}

export function cancelPdfPageRecognition(documentId: string, pageNumber: number) {
  const job = jobs.get(documentId + ':' + pageNumber)
  if (job) stopJob(job)
}

export function cancelPdfRecognitionPages(documentId: string) {
  for (const job of [...jobs.values()]) if (job.record.id === documentId) stopJob(job)
}

export function cancelPdfRecognitionExceptPages(documentId: string, visiblePages: number[]) {
  const visible = new Set(visiblePages)
  for (const job of [...jobs.values()]) if (job.record.id === documentId && !visible.has(job.pageNumber)) cancelPdfPageRecognition(documentId, job.pageNumber)
}

export function pausePdfRecognitionForReport(record: Pick<DocumentRecord, 'id' | 'pageCount' | 'pdf' | 'kind'>) {
  reportPausedDocuments.add(record.id)
  cancelPdfRecognitionPages(record.id)
}

export function resumePdfRecognitionFromReport(record: Pick<DocumentRecord, 'id' | 'pageCount' | 'pdf' | 'kind'>) {
  reportPausedDocuments.delete(record.id)
}

export function releasePdfRecognitionViewer(documentId: string, viewerPdf: PDFDocumentProxy) {
  for (const job of [...jobs.values()]) if (job.record.id === documentId && job.viewerPdf === viewerPdf) stopJob(job)
  return Promise.allSettled([...(pdfOperations.get(viewerPdf) ?? [])]).then(() => {})
}

export function cancelPdfRecognition(documentId: string) {
  reportPausedDocuments.delete(documentId)
  cancelPdfRecognitionPages(documentId)
}

export function subscribePdfRecognition(listener: RecognitionListener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
