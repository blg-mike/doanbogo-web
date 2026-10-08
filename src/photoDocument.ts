import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist'
import { getDocument, getPhotoPage } from './storage'

type PhotoViewport = {
  width: number
  height: number
  scale: number
  rotation: number
  transform: [number, number, number, number, number, number]
  viewBox: [number, number, number, number]
}

function viewportFor(width: number, height: number, scale: number): PhotoViewport {
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1
  return {
    width: width * safeScale,
    height: height * safeScale,
    scale: safeScale,
    rotation: 0,
    transform: [safeScale, 0, 0, -safeScale, 0, height * safeScale],
    viewBox: [0, 0, width, height],
  }
}

function imageFromBlob(blob: Blob) {
  if (typeof createImageBitmap === 'function') return createImageBitmap(blob)
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => { URL.revokeObjectURL(url); resolve(image) }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('사진을 표시하지 못했습니다.')) }
    image.src = url
  })
}

export async function openPhotoDocument(documentId: string) {
  const record = await getDocument(documentId)
  if (!record || record.kind !== 'photos') throw new Error('사진 폴더를 찾을 수 없습니다.')
  let closed = false
  const documentProxy = {
    numPages: record.pageCount,
    getPage: async (pageNumber: number) => {
      if (closed) throw new Error('사진 폴더가 닫혔습니다.')
      if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > record.pageCount) throw new Error('사진 페이지를 찾을 수 없습니다.')
      const photo = await getPhotoPage(documentId, pageNumber)
      if (!photo) throw new Error(pageNumber + '페이지 사진을 찾을 수 없습니다.')
      const pageProxy = {
        pageNumber,
        rotate: 0,
        width: photo.width,
        height: photo.height,
        view: [0, 0, photo.width, photo.height],
        viewBox: [0, 0, photo.width, photo.height],
        userUnit: 1,
        ref: null,
        objs: new Map<string, unknown>(),
        getViewport: ({ scale = 1 }: { scale?: number }) => viewportFor(photo.width, photo.height, scale),
        getAnnotations: async () => [],
        getTextContent: async () => ({ items: [], styles: {} }),
        cleanup: () => undefined,
        render: ({ canvas, canvasContext, viewport }: { canvas: HTMLCanvasElement; canvasContext: CanvasRenderingContext2D; viewport: PhotoViewport }) => {
          let cancelled = false
          const promise = (async () => {
            const image = await imageFromBlob(photo.blob)
            try {
              if (cancelled) return
              canvasContext.save()
              try {
                canvasContext.setTransform(1, 0, 0, 1, 0, 0)
                canvasContext.clearRect(0, 0, canvas.width, canvas.height)
                canvasContext.drawImage(image, 0, 0, viewport.width, viewport.height)
              } finally {
                canvasContext.restore()
              }
            } finally {
              if ('close' in image && typeof image.close === 'function') image.close()
            }
          })()
          return { promise, cancel: () => { cancelled = true } } as RenderTask
        },
      }
      return pageProxy as unknown as PDFPageProxy
    },
    cleanup: () => undefined,
    destroy: async () => { closed = true },
  }
  return {
    document: documentProxy as unknown as PDFDocumentProxy,
    dispose: async () => { closed = true },
  }
}
