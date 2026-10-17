import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDocument, getPhotoPage } from './storage'
import { openPhotoDocument } from './photoDocument'

vi.mock('./storage', () => ({ getDocument: vi.fn(), getPhotoPage: vi.fn() }))

describe('photo page detail rendering', () => {
  afterEach(() => vi.unstubAllGlobals())

  beforeEach(() => {
    vi.mocked(getDocument).mockResolvedValue({ kind: 'photos', pageCount: 1 } as never)
    vi.mocked(getPhotoPage).mockResolvedValue({ width: 1000, height: 500, blob: new Blob(), documentId: 'photo', pageNumber: 1, addedAt: 0, sourceName: 'photo.jpg' })
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 1000, height: 500, close: vi.fn() }))
  })

  it('draws only the source rectangle covered by the high-resolution canvas', async () => {
    const photoDocument = await openPhotoDocument('photo')
    const page = await photoDocument.document.getPage(1)
    const drawImage = vi.fn()
    const context = {
      save: vi.fn(), restore: vi.fn(), setTransform: vi.fn(), clearRect: vi.fn(), drawImage,
    } as unknown as CanvasRenderingContext2D
    const canvas = { width: 200, height: 100 } as HTMLCanvasElement
    const render = page.render({
      canvas,
      canvasContext: context,
      viewport: page.getViewport({ scale: 2 }),
      transform: [1, 0, 0, 1, -400, -200],
    })
    await render.promise

    expect(drawImage).toHaveBeenCalledWith(expect.objectContaining({ width: 1000, height: 500 }), 200, 100, 100, 50, 0, 0, 200, 100)
  })
})
