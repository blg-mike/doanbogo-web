import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist'
import type { DocumentRecord, PageRecognitionRecord } from './types'
import { extractPdfPageLinks, type PdfQrLink } from './qr'
import { getPageRecognition, getPages, savePageRecognition } from './storage'
import { pdfPageRenderQueue } from './pdfPageRenderQueue'
import { viewerCanvasMemory } from './pdfRenderResources'
import { openPdf } from './pdf'
import { openPhotoDocument } from './photoDocument'

type RecognitionJob = {
  record: Pick<DocumentRecord, 'id' | 'pageCount' | 'pdf' | 'kind'>
  viewerPdf: PDFDocumentProxy | null
  cancelled: boolean
  restartPages: boolean
  hiddenPages: Set<number>
  currentPage?: number
  cancelCurrent?: () => void
}

type RecognitionListener = (documentId: string, pageNumber: number, result: PageRecognitionRecord) => void
type RecognitionResult = { id: number; links: PdfQrLink[]; error?: true }
type QrRaster = { pixels: ImageData; release: () => void }

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
const pausedRecords = new Map<string, RecognitionJob['record']>()
const reportPausedDocuments = new Set<string>()
const queue: RecognitionJob[] = []
const listeners = new Set<RecognitionListener>()
const pdfOperations = new Map<PDFDocumentProxy, Set<Promise<unknown>>>()
let active = false
let nextScanId = 0
const visibilityWaiters = new Map<string, Set<() => void>>()

function delay(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms))
}

function waitUntilVisible(job: RecognitionJob) {
  if (document.visibilityState === 'visible' || job.cancelled) return Promise.resolve()
  return new Promise<void>((resolve) => {
    const resume = () => {
      if (document.visibilityState !== 'visible' && !job.cancelled) return
      document.removeEventListener('visibilitychange', resume)
      visibilityWaiters.get(job.record.id)?.delete(resume)
      resolve()
    }
    const waiters = visibilityWaiters.get(job.record.id) ?? new Set<() => void>()
    waiters.add(resume)
    visibilityWaiters.set(job.record.id, waiters)
    document.addEventListener('visibilitychange', resume)
  })
}

function publish(job: RecognitionJob, pageNumber: number, result: PageRecognitionRecord) {
  listeners.forEach((listener) => listener(job.record.id, pageNumber, result))
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

function renderQrRecognition(page: PDFPageProxy, onCancelReady: (cancel: () => void) => void) {
  const renderKey = {}
  return new Promise<QrRaster | null>((resolve, reject) => {
    let renderTask: RenderTask | undefined
    let interrupted = false
    let reserved = false
    let keepReserved = false
    const memoryKey = {}
    const cancel = pdfPageRenderQueue.enqueue(renderKey, async () => {
      try {
        const base = page.getViewport({ scale: 1 })
        const maxPixels = Math.min(2_097_152, Math.floor(viewerCanvasMemory.availableBytes() / 8))
        if (maxPixels < 160_000) {
          resolve(null)
          return
        }
        const scale = Math.min(1400 / Math.max(base.width, base.height), Math.sqrt(maxPixels / (base.width * base.height)))
        const viewport = page.getViewport({ scale })
        const canvas = document.createElement('canvas')
        const width = Math.max(1, Math.ceil(viewport.width))
        const height = Math.max(1, Math.ceil(viewport.height))
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

async function runJob(job: RecognitionJob) {
  let owned: Awaited<ReturnType<typeof openPdf>> | null = null
  let worker: Worker | null = null
  try {
    await delay(1000)
    if (job.cancelled) return
    do {
      job.restartPages = false
      job.hiddenPages = new Set((await getPages(job.record.id)).filter((page) => page.hidden).map((page) => page.pageNumber))
      for (let pageNumber = 1; pageNumber <= job.record.pageCount && !job.cancelled; pageNumber++) {
        job.currentPage = undefined
        await waitUntilVisible(job)
        if (job.cancelled) break
        if (job.hiddenPages.has(pageNumber)) continue
        const cached = await getPageRecognition(job.record.id, pageNumber).catch(() => undefined)
        if (job.cancelled) break
        if (cached?.pdfLinksDone && cached.qrLinksDone) {
          publish(job, pageNumber, cached)
          continue
        }
        await delay(700)
        if (job.cancelled) break

        let pdf: PDFDocumentProxy
        if (job.viewerPdf) {
          if (owned) {
            const previous = owned
            await Promise.allSettled([...(pdfOperations.get(previous.document) ?? [])])
            await previous.dispose()
            if (owned === previous) owned = null
          }
          pdf = job.viewerPdf
        } else {
          const opened = owned ??= job.record.kind === 'photos'
            ? await openPhotoDocument(job.record.id)
            : job.record.pdf ? await openPdf(job.record.pdf) : (() => { throw new Error('PDF 자료를 찾을 수 없습니다.') })()
          if (job.viewerPdf) {
            await opened.dispose()
            if (owned === opened) owned = null
            pdf = job.viewerPdf
          } else pdf = opened.document
        }
        const usingViewerPdf = job.viewerPdf === pdf
        const page = await trackPdfOperation(pdf, () => pdf.getPage(pageNumber))
        if (job.cancelled) break
        if (usingViewerPdf && job.viewerPdf !== pdf) {
          pageNumber--
          continue
        }
        job.currentPage = pageNumber
        let pdfLinks = cached?.pdfLinks ?? []
        if (!cached?.pdfLinksDone) {
          try {
            const [annotations, content] = await trackPdfOperation(pdf, () => Promise.all([
              page.getAnnotations({ intent: 'display' }),
              page.getTextContent(),
            ]))
            if (job.cancelled) break
            if (usingViewerPdf && job.viewerPdf !== pdf) {
              pageNumber--
              continue
            }
            if (job.hiddenPages.has(pageNumber)) continue
            const textRuns = content.items.flatMap((item) => 'str' in item ? [item] : [])
            pdfLinks = extractPdfPageLinks(annotations, textRuns, page.getViewport({ scale: 1 }))
            await savePageRecognition(job.record.id, pageNumber, { pdfLinksDone: true, pdfLinks })
          } catch (error) {
            if (job.cancelled) break
            console.warn(`[PDF] Page ${pageNumber} link recognition failed and can resume when the document is reopened.`, error)
            continue
          }
        }
        if (usingViewerPdf && job.viewerPdf !== pdf) {
          pageNumber--
          continue
        }
        if (job.hiddenPages.has(pageNumber)) continue
        let qrLinks = cached?.qrLinks ?? []
        let qrLinksDone = cached?.qrLinksDone ?? false
        let qrRaster: QrRaster | null = null
        if (!qrLinksDone) {
          try {
            qrRaster = await renderQrRecognition(page, (cancel) => { job.cancelCurrent = cancel }).finally(() => { job.cancelCurrent = undefined })
          } catch (error) {
            if (error instanceof RecognitionYieldError) {
              pageNumber--
              await delay(500)
              continue
            }
            if (job.cancelled) break
            console.warn(`[PDF] Page ${pageNumber} QR image rendering failed and can resume when the document is reopened.`, error)
          }
        }
        if (job.cancelled) {
          qrRaster?.release()
          break
        }
        if (job.hiddenPages.has(pageNumber)) {
          qrRaster?.release()
          continue
        }
        if (!qrLinksDone && qrRaster) {
          try {
            worker ??= await createQrWorker()
            if (job.cancelled) {
              worker.terminate()
              worker = null
              break
            }
            if (job.hiddenPages.has(pageNumber)) continue
            qrLinks = await decodeQr(worker, qrRaster.pixels, (cancel) => { job.cancelCurrent = cancel }).finally(() => { job.cancelCurrent = undefined })
            if (job.cancelled) break
            if (job.hiddenPages.has(pageNumber)) continue
            qrLinksDone = true
            await savePageRecognition(job.record.id, pageNumber, { qrLinksDone: true, qrLinks, qrInputMaxDimension: Math.max(qrRaster.pixels.width, qrRaster.pixels.height) })
          } catch (error) {
            if (job.cancelled) break
            if (error instanceof RecognitionYieldError) {
              worker = null
              pageNumber--
              await delay(500)
              continue
            }
            console.warn(`[PDF] Page ${pageNumber} QR recognition failed and can resume when the document is reopened.`, error)
          } finally {
            qrRaster.release()
          }
        }
        publish(job, pageNumber, {
          documentId: job.record.id,
          pageNumber,
          version: 1,
          pdfLinksDone: true,
          pdfLinks,
          qrLinksDone,
          qrLinks,
          qrInputMaxDimension: cached?.qrInputMaxDimension ?? (qrRaster ? Math.max(qrRaster.pixels.width, qrRaster.pixels.height) : 0),
        })
      }
    } while (job.restartPages && !job.cancelled)
  } catch (error) {
    if (!job.cancelled) console.warn('[PDF] Background link analysis stopped and can resume when the document is reopened.', error)
  } finally {
    worker?.terminate()
    if (owned) await owned.dispose()
    if (jobs.get(job.record.id) === job) jobs.delete(job.record.id)
  }
}

function pump() {
  if (active) return
  const job = queue.shift()
  if (!job) return
  active = true
  void runJob(job).finally(() => {
    active = false
    pump()
  })
}

function stopJob(job: RecognitionJob) {
  job.cancelled = true
  job.cancelCurrent?.()
  visibilityWaiters.get(job.record.id)?.forEach((resume) => resume())
  visibilityWaiters.delete(job.record.id)
  if (jobs.get(job.record.id) === job) jobs.delete(job.record.id)
  const index = queue.indexOf(job)
  if (index >= 0) queue.splice(index, 1)
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    for (const job of [...jobs.values()]) {
      pausedRecords.set(job.record.id, job.record)
      stopJob(job)
    }
    return
  }
  for (const [documentId, record] of [...pausedRecords]) {
    if (reportPausedDocuments.has(documentId)) continue
    pausedRecords.delete(documentId)
    enqueuePdfRecognition(record)
  }
})

export function enqueuePdfRecognition(record: Pick<DocumentRecord, 'id' | 'pageCount' | 'pdf' | 'kind'>, viewerPdf: PDFDocumentProxy | null = null, restart = false) {
  const existing = jobs.get(record.id)
  if (reportPausedDocuments.has(record.id)) {
    pausedRecords.set(record.id, record)
    if (existing) stopJob(existing)
    return
  }
  if (document.visibilityState !== 'visible') {
    pausedRecords.set(record.id, record)
    if (existing) stopJob(existing)
    return
  }
  if (existing) {
    existing.record = record
    if (viewerPdf) existing.viewerPdf = viewerPdf
    if (restart) existing.restartPages = true
    return
  }
  const job: RecognitionJob = { record, viewerPdf, cancelled: false, restartPages: false, hiddenPages: new Set() }
  jobs.set(record.id, job)
  queue.push(job)
  pump()
}

export function pausePdfRecognitionForReport(record: Pick<DocumentRecord, 'id' | 'pageCount' | 'pdf' | 'kind'>) {
  reportPausedDocuments.add(record.id)
  pausedRecords.set(record.id, record)
  const job = jobs.get(record.id)
  if (job) stopJob(job)
}

export function resumePdfRecognitionFromReport(record: Pick<DocumentRecord, 'id' | 'pageCount' | 'pdf' | 'kind'>, viewerPdf: PDFDocumentProxy | null) {
  reportPausedDocuments.delete(record.id)
  if (document.visibilityState !== 'visible') return
  const savedRecord = pausedRecords.get(record.id) ?? record
  pausedRecords.delete(record.id)
  enqueuePdfRecognition(savedRecord, viewerPdf)
}

export function releasePdfRecognitionViewer(documentId: string, viewerPdf: PDFDocumentProxy) {
  const job = jobs.get(documentId)
  if (job?.viewerPdf === viewerPdf) job.viewerPdf = null
  return Promise.allSettled([...(pdfOperations.get(viewerPdf) ?? [])]).then(() => {})
}

export function updatePdfRecognitionPageVisibility(documentId: string, pageNumbers: number[], hidden: boolean) {
  const job = jobs.get(documentId)
  if (!job) return
  for (const pageNumber of pageNumbers) {
    if (hidden) job.hiddenPages.add(pageNumber)
    else job.hiddenPages.delete(pageNumber)
  }
  if (hidden && job.currentPage !== undefined && pageNumbers.includes(job.currentPage)) job.cancelCurrent?.()
  if (!hidden) job.restartPages = true
}

export function cancelPdfRecognition(documentId: string) {
  pausedRecords.delete(documentId)
  reportPausedDocuments.delete(documentId)
  const job = jobs.get(documentId)
  if (!job) return
  stopJob(job)
}

export function subscribePdfRecognition(listener: RecognitionListener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
