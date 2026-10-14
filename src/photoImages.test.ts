import { afterEach, describe, expect, it, vi } from 'vitest'
import { PhotoPreparationError, photoOutputSize, preparePhotoFile, sortPhotoFiles } from './photoImages'

function jpegFile(width: number, height: number, type = 'image/jpeg') {
  const bytes = new Uint8Array([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08,
    height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03,
    0x01, 0x11, 0, 0x02, 0x11, 0, 0x03, 0x11, 0, 0xff, 0xd9,
  ])
  return new File([bytes], 'pattern.jpg', { type })
}

function orientedJpegFile(width: number, height: number, orientation: number) {
  const bytes = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe1, 0x00, 0x22,
    0x45, 0x78, 0x69, 0x66, 0, 0, 0x49, 0x49, 0x2a, 0, 0x08, 0, 0, 0,
    0x01, 0, 0x12, 0x01, 0x03, 0, 0x01, 0, 0, 0, orientation, 0, 0, 0, 0, 0, 0, 0,
    0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03,
    0x01, 0x11, 0, 0x02, 0x11, 0, 0x03, 0x11, 0, 0xff, 0xd9,
  ])
  return new File([bytes], 'rotated.jpg', { type: 'image/jpeg' })
}

function pngFile(width: number, height: number) {
  const bytes = new Uint8Array(24)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  new DataView(bytes.buffer).setUint32(16, width)
  new DataView(bytes.buffer).setUint32(20, height)
  return new File([bytes], 'photo.png', { type: '' })
}

function webpFile(width: number, height: number) {
  const bytes = new Uint8Array(30)
  bytes.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58])
  const set24 = (offset: number, value: number) => { bytes[offset] = value & 0xff; bytes[offset + 1] = value >> 8 & 0xff; bytes[offset + 2] = value >> 16 & 0xff }
  set24(24, width - 1)
  set24(27, height - 1)
  return new File([bytes], 'photo.webp', { type: '' })
}

function installCanvas({ failEncoding = false } = {}) {
  const context = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() }
  const canvases: Array<{ width: number; height: number; getContext: () => typeof context; toBlob: (callback: (blob: Blob | null) => void) => void }> = []
  vi.stubGlobal('document', {
    createElement: () => {
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => context,
        toBlob: (callback: (blob: Blob | null) => void) => callback(failEncoding ? null : new Blob(['jpeg'], { type: 'image/jpeg' })),
      }
      canvases.push(canvas)
      return canvas
    },
  })
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:photo'), revokeObjectURL: vi.fn() })
  return { canvases, context }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('photo image preparation', () => {
  it('limits imported image dimensions without enlarging small pages', () => {
    expect(photoOutputSize(6000, 4000)).toEqual({ width: 2560, height: 1707 })
    expect(photoOutputSize(5000, 1000)).toEqual({ width: 2560, height: 512 })
    expect(photoOutputSize(800, 1200)).toEqual({ width: 800, height: 1200 })
  })

  it('sorts folder images naturally by relative path', () => {
    const files = [
      Object.assign(new File(['3'], 'page10.jpg'), { webkitRelativePath: 'pattern/page10.jpg' }),
      Object.assign(new File(['1'], 'page2.jpg'), { webkitRelativePath: 'pattern/page2.jpg' }),
      Object.assign(new File(['2'], 'page1.jpg'), { webkitRelativePath: 'pattern/page1.jpg' }),
    ]
    expect(sortPhotoFiles(files).map((file) => file.name)).toEqual(['page1.jpg', 'page2.jpg', 'page10.jpg'])
  })

  it('uses the detected file format when the MIME type disagrees and asks the decoder to resize large images', async () => {
    installCanvas()
    const bitmap = { width: 2560, height: 1707, close: vi.fn() }
    const decode = vi.fn().mockResolvedValue(bitmap)
    vi.stubGlobal('createImageBitmap', decode)

    const prepared = await preparePhotoFile(jpegFile(6000, 4000, 'image/png'))

    expect(decode.mock.calls[0][0].type).toBe('image/jpeg')
    expect(decode.mock.calls[0][1]).toMatchObject({ resizeWidth: 2560, resizeHeight: 1707 })
    expect(prepared.width).toBe(2560)
    expect(prepared.height).toBe(1707)
    expect(bitmap.close).toHaveBeenCalledOnce()
  })

  it('uses the JPEG header to resize EXIF-rotated photos in displayed orientation', async () => {
    installCanvas()
    const decode = vi.fn().mockResolvedValue({ width: 1707, height: 2560, close: vi.fn() })
    vi.stubGlobal('createImageBitmap', decode)

    const prepared = await preparePhotoFile(orientedJpegFile(6000, 4000, 6))

    expect(decode.mock.calls[0][1]).toMatchObject({ resizeWidth: 1707, resizeHeight: 2560, imageOrientation: 'from-image' })
    expect(prepared.width).toBe(1707)
    expect(prepared.height).toBe(2560)
  })

  it('accepts a PNG signature when the picker provides no MIME type', async () => {
    installCanvas()
    const decode = vi.fn().mockResolvedValue({ width: 640, height: 480, close: vi.fn() })
    vi.stubGlobal('createImageBitmap', decode)

    await preparePhotoFile(pngFile(640, 480))

    expect(decode.mock.calls[0][0].type).toBe('image/png')
  })

  it('accepts a WebP signature when the picker provides no MIME type', async () => {
    installCanvas()
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 640, height: 480, close: vi.fn() }))

    const prepared = await preparePhotoFile(webpFile(640, 480))

    expect(prepared.width).toBe(640)
    expect(prepared.height).toBe(480)
  })

  it('falls back to an image load when bitmap decoding fails, even if decode() rejects', async () => {
    installCanvas()
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('bitmap decode failed')))
    const decodeMock = vi.fn()
    class LoadableImage {
      naturalWidth = 1200
      naturalHeight = 800
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) { this.onload?.() }
      decode = decodeMock
    }
    vi.stubGlobal('Image', LoadableImage)

    const prepared = await preparePhotoFile(jpegFile(1200, 800))

    expect(prepared.width).toBe(1200)
    expect(prepared.height).toBe(800)
    expect(decodeMock).not.toHaveBeenCalled()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:photo')
  })

  it('does not retry a failed large-image resize with a full-size bitmap', async () => {
    installCanvas()
    const decode = vi.fn().mockRejectedValue(new Error('resize failed'))
    vi.stubGlobal('createImageBitmap', decode)
    class LoadableImage {
      naturalWidth = 6000
      naturalHeight = 4000
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) { this.onload?.() }
    }
    vi.stubGlobal('Image', LoadableImage)

    const prepared = await preparePhotoFile(jpegFile(6000, 4000))

    expect(decode).toHaveBeenCalledOnce()
    expect(decode.mock.calls[0][1]).toMatchObject({ resizeWidth: 2560, resizeHeight: 1707 })
    expect(prepared.width).toBe(2560)
    expect(prepared.height).toBe(1707)
  })

  it('returns distinct empty, unsupported, decode, and conversion errors', async () => {
    await expect(preparePhotoFile(new File([], 'empty.jpg', { type: 'image/jpeg' }))).rejects.toMatchObject({ code: 'empty' })
    await expect(preparePhotoFile(new File(['not-heic'], 'phone.jpg', { type: 'image/heic' }))).rejects.toMatchObject({ code: 'unsupported' })

    installCanvas()
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('decode')))
    vi.stubGlobal('Image', class {
      set src(_value: string) { this.onerror?.() }
      onerror: (() => void) | null = null
    })
    await expect(preparePhotoFile(jpegFile(200, 100))).rejects.toMatchObject({ code: 'decode' })
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:photo')

    installCanvas({ failEncoding: true })
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 200, height: 100, close: vi.fn() }))
    await expect(preparePhotoFile(jpegFile(200, 100))).rejects.toMatchObject({ code: 'convert' })
  })

  it('classifies local file read failures before trying to decode the image', async () => {
    const file = jpegFile(200, 100)
    Object.defineProperty(file, 'slice', { value: () => ({ arrayBuffer: () => Promise.reject(new Error('file access denied')) }) })

    await expect(preparePhotoFile(file)).rejects.toMatchObject({ code: 'unreadable' })
  })

  it('identifies typed photo preparation errors without exposing decoder messages as user text', () => {
    const error = new PhotoPreparationError('decode', 'The source image cannot be decoded.')
    expect(error.code).toBe('decode')
    expect(error.message).toBe('The source image cannot be decoded.')
  })
})
