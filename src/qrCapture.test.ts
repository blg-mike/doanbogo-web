import { describe, expect, it, vi } from 'vitest'
import { captureAndEnqueueQrPixels, captureQrPixels } from './qrCapture'

function createCanvasMock(data: Uint8ClampedArray) {
  const context = {
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({ data })),
  }
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
  }
  return { canvas: canvas as unknown as HTMLCanvasElement, context }
}

describe('delayed QR pixel capture', () => {
  it('does no canvas, pixel, or queue work for a stale document generation', () => {
    const { canvas, context } = createCanvasMock(new Uint8ClampedArray([1, 2, 3, 4]))
    const createCanvas = vi.fn(() => canvas)
    const enqueue = vi.fn((request: { generation: number; pageNumber: number; capturePixels: () => unknown }) => Boolean(request))
    const getScheduler = vi.fn(() => ({ enqueue }))
    const source = { width: 2, height: 2 } as HTMLCanvasElement

    const result = captureAndEnqueueQrPixels({
      generation: 4,
      pageNumber: 7,
      source,
      getCurrentGeneration: () => 5,
      getScheduler,
      createCanvas,
    })

    expect(result).toBe('stale')
    expect(createCanvas).not.toHaveBeenCalled()
    expect(canvas.getContext).not.toHaveBeenCalled()
    expect(context.drawImage).not.toHaveBeenCalled()
    expect(context.getImageData).not.toHaveBeenCalled()
    expect(getScheduler).not.toHaveBeenCalled()
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('defers pixel allocation until the queued scan is ready', () => {
    const pixels = new Uint8ClampedArray([1, 2, 3, 4])
    const { canvas, context } = createCanvasMock(pixels)
    const enqueue = vi.fn((request: { generation: number; pageNumber: number; capturePixels: () => unknown }) => Boolean(request))

    const result = captureAndEnqueueQrPixels({
      generation: 4,
      pageNumber: 7,
      source: { width: 2, height: 2 } as HTMLCanvasElement,
      getCurrentGeneration: () => 4,
      getScheduler: () => ({ enqueue }),
      createCanvas: () => canvas,
    })

    expect(result).toBe('submitted')
    expect(context.drawImage).not.toHaveBeenCalled()
    expect(context.getImageData).not.toHaveBeenCalled()
    expect(enqueue).toHaveBeenCalledOnce()
    const queued = enqueue.mock.calls[0][0] as { generation: number; pageNumber: number; capturePixels: () => unknown }
    expect(queued.generation).toBe(4)
    expect(queued.pageNumber).toBe(7)
    expect(queued.capturePixels()).toEqual({ width: 2, height: 2, pixels: pixels.buffer, inputMaxDimension: 2 })
    expect(context.drawImage).toHaveBeenCalledOnce()
    expect(context.getImageData).toHaveBeenCalledOnce()
    expect(canvas.width).toBe(0)
    expect(canvas.height).toBe(0)
  })

  it('bounds QR pixel buffers to about eight MiB and 1400 pixels on the long edge', () => {
    const pixels = new Uint8ClampedArray(1)
    const { canvas } = createCanvasMock(pixels)
    const capture = captureQrPixels({ width: 4000, height: 3000 } as HTMLCanvasElement, () => canvas)

    expect(capture).not.toBeNull()
    expect(Math.max(capture!.width, capture!.height)).toBeLessThanOrEqual(1400)
    expect(capture!.width * capture!.height * 4).toBeLessThanOrEqual(8 * 1024 * 1024)
  })

  it('rejects capture if its page has been replaced while queued', () => {
    const { canvas, context } = createCanvasMock(new Uint8ClampedArray([1, 2, 3, 4]))
    const capture = captureQrPixels({ width: 2, height: 2 } as HTMLCanvasElement, () => canvas, () => false)

    expect(capture).toBeNull()
    expect(context.drawImage).not.toHaveBeenCalled()
    expect(canvas.width).toBe(0)
    expect(canvas.height).toBe(0)
  })
})
