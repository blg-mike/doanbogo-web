import type { PdfQrLink } from './qr'

export const MAX_QUEUED_QR_SCANS = 1

export interface QrScanRequest {
  generation: number
  pageNumber: number
  inputMaxDimension?: number
}

export interface QrPixelCapture {
  width: number
  height: number
  pixels: ArrayBuffer
  inputMaxDimension: number
}

export interface QrScanSubmission extends QrScanRequest {
  capturePixels: () => QrPixelCapture | null
}

interface QueuedScan extends QrScanSubmission {
  id: number
  order: number
}

interface QrWorkerResult {
  id: number
  links: PdfQrLink[]
  error?: true
}

export interface QrWorkerPort {
  onmessage: ((event: MessageEvent<QrWorkerResult>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  onmessageerror: ((event: MessageEvent) => void) | null
  postMessage: (message: { id: number; width: number; height: number; pixels: ArrayBuffer }, transfer: Transferable[]) => void
  terminate: () => void
}

export class QrScanScheduler {
  private worker: QrWorkerPort | null = null
  private active: QueuedScan | null = null
  private readonly queue: QueuedScan[] = []
  private activePage = 1
  private nextId = 0
  private nextOrder = 0
  private disposed = false
  private failed = false
  private readonly createWorker: () => QrWorkerPort
  private readonly onResult: (request: QrScanRequest, links: PdfQrLink[]) => void
  private readonly onDrop: (request: QrScanRequest) => void
  private readonly maxQueued: number

  constructor(
    createWorker: () => QrWorkerPort,
    onResult: (request: QrScanRequest, links: PdfQrLink[]) => void,
    onDrop: (request: QrScanRequest) => void,
    maxQueued = MAX_QUEUED_QR_SCANS,
  ) {
    this.createWorker = createWorker
    this.onResult = onResult
    this.onDrop = onDrop
    this.maxQueued = Math.max(0, maxQueued)
  }

  setActivePage(pageNumber: number) {
    this.activePage = pageNumber
    this.sortQueue()
    this.pump()
  }

  enqueue(request: QrScanSubmission) {
    if (this.disposed) {
      this.onDrop(request)
      return false
    }
    if (this.failed) {
      this.onDrop(request)
      return false
    }
    if (this.contains(request.generation, request.pageNumber)) return false

    const item: QueuedScan = { ...request, id: ++this.nextId, order: this.nextOrder++ }
    if (this.maxQueued === 0) {
      this.onDrop(request)
      return false
    }
    if (this.queue.length >= this.maxQueued) {
      const worst = this.queue.reduce((candidate, current) => {
        const priority = this.priority(current) - this.priority(candidate)
        return priority > 0 || (priority === 0 && current.order < candidate.order) ? current : candidate
      })
      if (this.priority(item) > this.priority(worst)) {
        this.onDrop(request)
        return false
      }
      this.queue.splice(this.queue.indexOf(worst), 1)
      this.onDrop(worst)
    }
    this.queue.push(item)
    this.sortQueue()
    this.pump()
    return true
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    const pending = [...(this.active ? [this.active] : []), ...this.queue]
    this.queue.length = 0
    this.active = null
    this.worker?.terminate()
    this.worker = null
    pending.forEach((request) => this.onDrop(request))
  }

  private contains(generation: number, pageNumber: number) {
    return (this.active?.generation === generation && this.active.pageNumber === pageNumber) ||
      this.queue.some((request) => request.generation === generation && request.pageNumber === pageNumber)
  }

  private compare(first: QueuedScan, second: QueuedScan) {
    return this.priority(first) - this.priority(second) || first.order - second.order
  }

  private priority(request: QueuedScan) {
    return request.pageNumber === this.activePage ? 0 : 1
  }

  private sortQueue() {
    this.queue.sort((first, second) => this.compare(first, second))
  }

  private ensureWorker() {
    if (this.worker) return this.worker
    const worker = this.createWorker()
    worker.onmessage = ({ data }) => {
      const completed = this.active
      if (!completed || data.id !== completed.id) return
      this.active = null
      if (data.error) this.onDrop(completed)
      else this.onResult(completed, data.links)
      this.pump()
    }
    worker.onerror = (event) => {
      event.preventDefault()
      this.fail(new Error(event.message || 'QR Worker failed'))
    }
    worker.onmessageerror = () => this.fail(new Error('QR Worker message could not be read'))
    this.worker = worker
    return worker
  }

  private pump() {
    if (this.disposed || this.failed || this.active || !this.queue.length) return
    const request = this.queue.shift()!
    this.active = request
    try {
      const capture = request.capturePixels()
      if (!capture) {
        this.active = null
        this.onDrop(request)
        this.pump()
        return
      }
      request.inputMaxDimension = capture.inputMaxDimension
      this.ensureWorker().postMessage({
        id: request.id,
        width: capture.width,
        height: capture.height,
        pixels: capture.pixels,
      }, [capture.pixels])
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)))
    }
  }

  private fail(error: Error) {
    if (this.failed || this.disposed) return
    this.failed = true
    console.warn('[QR] Background scanning stopped; PDF text links remain available.', error)
    const pending = [...(this.active ? [this.active] : []), ...this.queue]
    this.queue.length = 0
    this.active = null
    this.worker?.terminate()
    this.worker = null
    pending.forEach((request) => this.onDrop(request))
  }
}
