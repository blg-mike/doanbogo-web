import type { PhotoPageRecord } from './types'

export const MAX_PHOTO_EDGE = 2560
export const MAX_PHOTO_PIXELS = 6_000_000
const PHOTO_HEADER_BYTES = 2 * 1024 * 1024

export type PreparedPhotoPage = Omit<PhotoPageRecord, 'documentId' | 'pageNumber'> & { thumbnail: Blob }
export type PhotoPreparationErrorCode = 'empty' | 'unsupported' | 'unreadable' | 'decode' | 'convert'

export class PhotoPreparationError extends Error {
  readonly code: PhotoPreparationErrorCode
  readonly diagnostic?: unknown

  constructor(code: PhotoPreparationErrorCode, message: string, diagnostic?: unknown) {
    super(message)
    this.name = 'PhotoPreparationError'
    this.code = code
    this.diagnostic = diagnostic
  }
}

type PhotoFormat = { name: 'jpeg' | 'png' | 'webp' | 'gif' | 'bmp' | 'avif' | 'svg'; mimeType: string }
type PhotoDimensions = { width: number; height: number }

const formats: PhotoFormat[] = [
  { name: 'jpeg', mimeType: 'image/jpeg' },
  { name: 'png', mimeType: 'image/png' },
  { name: 'webp', mimeType: 'image/webp' },
  { name: 'gif', mimeType: 'image/gif' },
  { name: 'bmp', mimeType: 'image/bmp' },
  { name: 'avif', mimeType: 'image/avif' },
  { name: 'svg', mimeType: 'image/svg+xml' },
]

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.subarray(start, start + length))
}

function hasBytes(bytes: Uint8Array, start: number, values: number[]) {
  return values.every((value, index) => bytes[start + index] === value)
}

function detectPhotoFormat(bytes: Uint8Array): PhotoFormat | null {
  if (hasBytes(bytes, 0, [0xff, 0xd8, 0xff])) return formats[0]
  if (hasBytes(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return formats[1]
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return formats[2]
  if (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a') return formats[3]
  if (ascii(bytes, 0, 2) === 'BM') return formats[4]
  if (ascii(bytes, 4, 4) === 'ftyp' && ['avif', 'avis'].includes(ascii(bytes, 8, 4))) return formats[5]
  const text = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 64 * 1024))).replace(/^\uFEFF/, '').trimStart()
  if (/^(?:<\?xml[\s\S]*?\?>\s*)?(?:<!doctype[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg(?:\s|>)/i.test(text)) return formats[6]
  return null
}

function jpegOrientation(bytes: Uint8Array) {
  let position = 2
  while (position + 4 < bytes.length && bytes[position] === 0xff) {
    while (bytes[position] === 0xff) position += 1
    const marker = bytes[position++]
    if (marker === 0xd9 || marker === 0xda) break
    if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue
    const length = (bytes[position] << 8) | bytes[position + 1]
    const start = position + 2
    if (length < 2 || start + length - 2 > bytes.length) break
    if (marker === 0xe1 && ascii(bytes, start, 6) === 'Exif\0\0') {
      const tiff = start + 6
      if (tiff + 8 > bytes.length) break
      const byteOrder = ascii(bytes, tiff, 2)
      const littleEndian = byteOrder === 'II'
      if (!littleEndian && byteOrder !== 'MM') break
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      if (view.getUint16(tiff + 2, littleEndian) !== 42) break
      const directory = tiff + view.getUint32(tiff + 4, littleEndian)
      if (directory + 2 > bytes.length) break
      const count = view.getUint16(directory, littleEndian)
      for (let index = 0; index < count; index += 1) {
        const entry = directory + 2 + index * 12
        if (entry + 12 > bytes.length) break
        if (view.getUint16(entry, littleEndian) === 0x0112 && view.getUint16(entry + 2, littleEndian) === 3 && view.getUint32(entry + 4, littleEndian) === 1) {
          const value = view.getUint16(entry + 8, littleEndian)
          return value >= 1 && value <= 8 ? value : 1
        }
      }
      break
    }
    position = start + length - 2
  }
  return 1
}

function photoDimensions(format: PhotoFormat, bytes: Uint8Array): PhotoDimensions | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (format.name === 'png' && bytes.length >= 24) {
    return { width: view.getUint32(16), height: view.getUint32(20) }
  }
  if (format.name === 'avif') {
    for (let position = 4; position + 16 <= bytes.length; position += 1) {
      if (ascii(bytes, position, 4) !== 'ispe') continue
      return { width: view.getUint32(position + 8), height: view.getUint32(position + 12) }
    }
  }
  if (format.name === 'jpeg') {
    let position = 2
    let dimensions: PhotoDimensions | undefined
    while (position + 4 < bytes.length && bytes[position] === 0xff) {
      while (bytes[position] === 0xff) position += 1
      const marker = bytes[position++]
      if (marker === 0xd9 || marker === 0xda) break
      if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue
      const length = (bytes[position] << 8) | bytes[position + 1]
      const start = position + 2
      if (length < 2 || start + length - 2 > bytes.length) break
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 7) {
        dimensions = { height: (bytes[start + 1] << 8) | bytes[start + 2], width: (bytes[start + 3] << 8) | bytes[start + 4] }
        break
      }
      position = start + length - 2
    }
    if (dimensions) {
      const orientation = jpegOrientation(bytes)
      return orientation >= 5 ? { width: dimensions.height, height: dimensions.width } : dimensions
    }
  }
  if (format.name === 'gif' && bytes.length >= 10) {
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) }
  }
  if (format.name === 'bmp' && bytes.length >= 26) {
    return { width: Math.abs(view.getInt32(18, true)), height: Math.abs(view.getInt32(22, true)) }
  }
  if (format.name === 'webp' && bytes.length >= 30) {
    const chunk = ascii(bytes, 12, 4)
    if (chunk === 'VP8X') return { width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16) }
    if (chunk === 'VP8 ' && hasBytes(bytes, 23, [0x9d, 0x01, 0x2a])) return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff }
    if (chunk === 'VP8L' && bytes[20] === 0x2f) {
      const width = 1 + bytes[21] + ((bytes[22] & 0x3f) << 8)
      const height = 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10)
      return { width, height }
    }
  }
  return undefined
}

async function readPhotoHeader(file: File) {
  const header = file.slice(0, Math.min(file.size, PHOTO_HEADER_BYTES))
  try {
    if (typeof header.arrayBuffer === 'function') return new Uint8Array(await header.arrayBuffer())
    return await new Promise<Uint8Array>((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(reader.error)
      reader.onload = () => reader.result instanceof ArrayBuffer ? resolve(new Uint8Array(reader.result)) : reject(new Error('No image data'))
      reader.readAsArrayBuffer(header)
    })
  } catch (error) {
    throw new PhotoPreparationError('unreadable', 'The selected photo could not be read.', error)
  }
}

export function photoOutputSize(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) throw new Error('사진 크기를 읽지 못했습니다.')
  const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(width, height), Math.sqrt(MAX_PHOTO_PIXELS / (width * height)))
  let outputWidth = Math.max(1, Math.round(width * scale))
  let outputHeight = Math.max(1, Math.round(height * scale))
  if (outputWidth * outputHeight > MAX_PHOTO_PIXELS) {
    if (outputWidth >= outputHeight) outputHeight = Math.max(1, Math.floor(MAX_PHOTO_PIXELS / outputWidth))
    else outputWidth = Math.max(1, Math.floor(MAX_PHOTO_PIXELS / outputHeight))
  }
  return { width: outputWidth, height: outputHeight }
}

export function sortPhotoFiles(files: File[]) {
  return [...files].sort((left, right) => {
    const leftPath = (left as File & { webkitRelativePath?: string }).webkitRelativePath || left.name
    const rightPath = (right as File & { webkitRelativePath?: string }).webkitRelativePath || right.name
    return leftPath.localeCompare(rightPath, undefined, { numeric: true, sensitivity: 'base' })
  })
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Canvas encoding returned no data.')), 'image/jpeg', quality)
  })
}

export async function preparePhotoFile(file: File): Promise<PreparedPhotoPage> {
  if (file.size === 0) throw new PhotoPreparationError('empty', 'The selected file is empty.')

  const header = await readPhotoHeader(file)
  const format = detectPhotoFormat(header)
  if (!format) {
    const declaredType = file.type.toLowerCase().split(';')[0]
    if (declaredType === 'image/jpeg' || declaredType === 'image/png' || declaredType === 'image/webp' || declaredType === 'image/gif' || declaredType === 'image/bmp') {
      throw new PhotoPreparationError('decode', 'The file header does not match a readable image.')
    }
    throw new PhotoPreparationError('unsupported', 'Use a JPG, PNG, or WebP image.')
  }

  const sourceBlob = file.slice(0, file.size, format.mimeType)
  const detectedDimensions = photoDimensions(format, header)
  const dimensions = detectedDimensions && detectedDimensions.width > 0 && detectedDimensions.height > 0 ? detectedDimensions : undefined
  const target = dimensions ? photoOutputSize(dimensions.width, dimensions.height) : undefined
  const resizeOptions = target && dimensions && (target.width < dimensions.width || target.height < dimensions.height)
    ? { resizeWidth: target.width, resizeHeight: target.height, resizeQuality: 'high' as const, imageOrientation: 'from-image' as const }
    : undefined
  let bitmap: ImageBitmap | undefined
  let image: HTMLImageElement | undefined
  let objectUrl: string | undefined
  let canvas: HTMLCanvasElement | undefined

  try {
    if (typeof createImageBitmap === 'function') {
      try {
        bitmap = resizeOptions
          ? await createImageBitmap(sourceBlob, resizeOptions)
          : await createImageBitmap(sourceBlob)
        if (!bitmap.width || !bitmap.height) {
          bitmap.close()
          bitmap = undefined
        }
      } catch {
        bitmap = undefined
      }
    }

    if (!bitmap) {
      try {
        objectUrl = URL.createObjectURL(sourceBlob)
        image = await loadImageUrl(objectUrl)
      } catch (error) {
        throw new PhotoPreparationError('decode', 'The source image cannot be decoded.', error)
      }
    }

    const source = bitmap ?? image!
    const sourceWidth = bitmap?.width ?? image?.naturalWidth ?? image?.width ?? 0
    const sourceHeight = bitmap?.height ?? image?.naturalHeight ?? image?.height ?? 0
    if (!sourceWidth || !sourceHeight) throw new PhotoPreparationError('decode', 'The decoded image has no dimensions.')
    const size = photoOutputSize(sourceWidth, sourceHeight)
    canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('Could not create a photo canvas.')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, size.width, size.height)
    context.drawImage(source, 0, 0, size.width, size.height)

    const thumbnailScale = Math.min(1, 320 / Math.max(size.width, size.height))
    const cover = document.createElement('canvas')
    cover.width = Math.max(1, Math.round(size.width * thumbnailScale))
    cover.height = Math.max(1, Math.round(size.height * thumbnailScale))
    try {
      const coverContext = cover.getContext('2d', { alpha: false })
      if (!coverContext) throw new Error('Could not create a photo cover.')
      coverContext.fillStyle = '#fff'
      coverContext.fillRect(0, 0, cover.width, cover.height)
      coverContext.drawImage(canvas, 0, 0, cover.width, cover.height)
      const [blob, thumbnail] = await Promise.all([canvasBlob(canvas, 0.9), canvasBlob(cover, 0.72)])
      return { blob, thumbnail, width: size.width, height: size.height, addedAt: Date.now(), sourceName: file.name }
    } finally {
      cover.width = 0
      cover.height = 0
    }
  } catch (error) {
    if (error instanceof PhotoPreparationError) throw error
    throw new PhotoPreparationError('convert', 'The photo could not be converted to JPEG.', error)
  } finally {
    bitmap?.close()
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    if (canvas) {
      canvas.width = 0
      canvas.height = 0
    }
  }
}

function loadImageUrl(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = (error) => reject(error)
    image.src = url
  })
}
