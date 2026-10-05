import { isCurrentQrScanGeneration } from './qr'

export interface QrCaptureRequest {
  generation: number
  pageNumber: number
  source: HTMLCanvasElement
  getCurrentGeneration: () => number
  getScheduler: () => { enqueue: (request: {
    generation: number
    pageNumber: number
    capturePixels: () => { width: number; height: number; pixels: ArrayBuffer; inputMaxDimension: number } | null
  }) => unknown } | null
  createCanvas: () => HTMLCanvasElement
}

export type QrCaptureResult = 'stale' | 'skipped' | 'submitted'

export function captureQrPixels(source: HTMLCanvasElement, createCanvas: () => HTMLCanvasElement, isCurrent = () => true) {
  if (!source.width || !source.height || !isCurrent()) return null
  const canvas = createCanvas()
  try {
    const maxPixels = 2_097_152
    let scale = Math.min(1, 1400 / Math.max(source.width, source.height), Math.sqrt(maxPixels / (source.width * source.height)))
    let width = Math.max(1, Math.round(source.width * scale))
    let height = Math.max(1, Math.round(source.height * scale))
    while (width * height > maxPixels) {
      scale *= 0.999
      width = Math.max(1, Math.round(source.width * scale))
      height = Math.max(1, Math.round(source.height * scale))
    }
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true })
    if (!context) return null

    context.drawImage(source, 0, 0, width, height)
    if (!isCurrent()) return null
    const pixels = context.getImageData(0, 0, width, height).data
    if (!isCurrent()) return null
    return { width, height, pixels: pixels.buffer as ArrayBuffer, inputMaxDimension: Math.max(width, height) }
  } finally {
    canvas.width = 0
    canvas.height = 0
  }
}

export function captureAndEnqueueQrPixels({ generation, pageNumber, source, getCurrentGeneration, getScheduler, createCanvas }: QrCaptureRequest): QrCaptureResult {
  if (!isCurrentQrScanGeneration(generation, getCurrentGeneration())) return 'stale'
  const scheduler = getScheduler()
  if (!scheduler) return 'skipped'
  const scheduled = scheduler.enqueue({
    generation,
    pageNumber,
    capturePixels: () => captureQrPixels(source, createCanvas, () => isCurrentQrScanGeneration(generation, getCurrentGeneration())),
  })
  return scheduled === false ? 'skipped' : 'submitted'
}
