import type { PhotoPageRecord } from './types'

export const MAX_PHOTO_EDGE = 2560
export const MAX_PHOTO_PIXELS = 6_000_000
export type PreparedPhotoPage = Omit<PhotoPageRecord, 'documentId' | 'pageNumber'> & { thumbnail: Blob }

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
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('사진을 압축하지 못했습니다.')), 'image/jpeg', quality)
  })
}

export async function preparePhotoFile(file: File): Promise<PreparedPhotoPage> {
  if (!file.type.startsWith('image/')) throw new Error('이미지 파일이 아닙니다.')
  let bitmap: ImageBitmap | undefined
  let image: HTMLImageElement | undefined
  let objectUrl: string | undefined
  try {
    if (typeof createImageBitmap === 'function') {
      try { bitmap = await createImageBitmap(file) } catch { /* Try the browser image decoder below. */ }
    }
    if (!bitmap) {
      objectUrl = URL.createObjectURL(file)
      image = new Image()
      image.src = objectUrl
      await image.decode()
    }
    const source = bitmap ?? image!
    const size = photoOutputSize(source.width, source.height)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('사진 편집 공간을 만들 수 없습니다.')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, size.width, size.height)
    context.drawImage(source, 0, 0, size.width, size.height)
    try {
      const [blob, thumbnail] = await Promise.all([
        canvasBlob(canvas, 0.9),
        (async () => {
          const scale = Math.min(1, 320 / Math.max(size.width, size.height))
          const cover = document.createElement('canvas')
          cover.width = Math.max(1, Math.round(size.width * scale))
          cover.height = Math.max(1, Math.round(size.height * scale))
          try {
            const coverContext = cover.getContext('2d', { alpha: false })
            if (!coverContext) throw new Error('사진 표지를 만들지 못했습니다.')
            coverContext.fillStyle = '#fff'
            coverContext.fillRect(0, 0, cover.width, cover.height)
            coverContext.drawImage(canvas, 0, 0, cover.width, cover.height)
            return await canvasBlob(cover, 0.72)
          } finally {
            cover.width = 0
            cover.height = 0
          }
        })(),
      ])
      return { blob, thumbnail, width: size.width, height: size.height, addedAt: Date.now(), sourceName: file.name }
    } finally {
      canvas.width = 0
      canvas.height = 0
    }
  } finally {
    bitmap?.close()
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
}
