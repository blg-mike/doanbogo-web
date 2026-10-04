import { isCurrentQrScanGeneration } from './qr'

export interface QrCaptureRequest {
  generation: number
  pageNumber: number
  source: HTMLCanvasElement
  getCurrentGeneration: () => number
  getScheduler: () => { enqueue: (request: {
    generation: number
    pageNumber: number
    width: number
    height: number
    pixels: ArrayBuffer
  }) => unknown } | null
  createCanvas: () => HTMLCanvasElement
}

export type QrCaptureResult = 'stale' | 'skipped' | 'submitted'

export function captureAndEnqueueQrPixels({ generation, pageNumber, source, getCurrentGeneration, getScheduler, createCanvas }: QrCaptureRequest): QrCaptureResult {
  if (!isCurrentQrScanGeneration(generation, getCurrentGeneration())) return 'stale'

  const canvas = createCanvas()
  try {
    const scale = Math.min(1, 1400 / Math.max(source.width, source.height))
    canvas.width = Math.max(1, Math.round(source.width * scale))
    canvas.height = Math.max(1, Math.round(source.height * scale))
    const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true })
    if (!context) return 'skipped'

    context.drawImage(source, 0, 0, canvas.width, canvas.height)
    if (!isCurrentQrScanGeneration(generation, getCurrentGeneration())) return 'stale'

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
    if (!isCurrentQrScanGeneration(generation, getCurrentGeneration())) return 'stale'

    const scheduler = getScheduler()
    if (!scheduler) return 'skipped'
    scheduler.enqueue({
      generation,
      pageNumber,
      width: canvas.width,
      height: canvas.height,
      pixels: pixels.buffer as ArrayBuffer,
    })
    return 'submitted'
  } finally {
    canvas.width = 0
    canvas.height = 0
  }
}
