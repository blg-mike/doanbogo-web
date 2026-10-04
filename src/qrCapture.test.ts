import { describe, expect, it, vi } from 'vitest'
import { captureAndEnqueueQrPixels } from './qrCapture'

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
    const enqueue = vi.fn()
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

  it('captures pixels and submits them for the current generation', () => {
    const pixels = new Uint8ClampedArray([1, 2, 3, 4])
    const { canvas, context } = createCanvasMock(pixels)
    const enqueue = vi.fn()

    const result = captureAndEnqueueQrPixels({
      generation: 4,
      pageNumber: 7,
      source: { width: 2, height: 2 } as HTMLCanvasElement,
      getCurrentGeneration: () => 4,
      getScheduler: () => ({ enqueue }),
      createCanvas: () => canvas,
    })

    expect(result).toBe('submitted')
    expect(context.drawImage).toHaveBeenCalledOnce()
    expect(context.getImageData).toHaveBeenCalledOnce()
    expect(enqueue).toHaveBeenCalledOnce()
    expect(enqueue).toHaveBeenCalledWith({
      generation: 4,
      pageNumber: 7,
      width: 2,
      height: 2,
      pixels: pixels.buffer,
    })
    expect(canvas.width).toBe(0)
    expect(canvas.height).toBe(0)
  })
})
