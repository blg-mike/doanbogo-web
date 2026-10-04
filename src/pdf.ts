import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

if (!import.meta.env.VITE_PORTABLE) pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

let portableWorkerReady: Promise<void> | undefined

async function loadDocument(blob: Blob) {
  if (import.meta.env.VITE_PORTABLE) {
    portableWorkerReady ??= import('pdfjs-dist/build/pdf.worker.min.mjs').then((worker) => {
      ;(globalThis as typeof globalThis & { pdfjsWorker?: typeof worker }).pdfjsWorker = worker
    })
    await portableWorkerReady
    return { task: pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }), dispose: async () => {} }
  }

  const url = URL.createObjectURL(blob)
  return { task: pdfjs.getDocument({ url }), dispose: async () => URL.revokeObjectURL(url) }
}

export async function inspectPdf(file: File) {
  const loaded = await loadDocument(file)
  const task = loaded.task
  try {
    const pdf = await task.promise
    const firstPage = await pdf.getPage(1)
    const viewport = firstPage.getViewport({ scale: 0.42 })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('이 브라우저에서 PDF 미리보기를 만들 수 없습니다.')
    await firstPage.render({ canvas, canvasContext: context, viewport }).promise
    const cover = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.78))
    return { pageCount: pdf.numPages, cover }
  } finally {
    await task.destroy()
    await loaded.dispose()
  }
}

export async function openPdf(blob: Blob) {
  const loaded = await loadDocument(blob)
  const task = loaded.task
  try {
    const document = await task.promise
    return {
      document,
      dispose: async () => {
        await task.destroy()
        await loaded.dispose()
      },
    }
  } catch (error) {
    await loaded.dispose()
    throw error
  }
}

export function pdfErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/password|encrypted/i.test(message)) return '암호가 설정된 PDF입니다. 암호 없는 파일로 다시 시도해 주세요.'
  if (/worker/i.test(message)) return 'PDF 처리 모듈을 불러오지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.'
  return 'PDF를 읽지 못했습니다. 파일 접근 권한과 PDF 상태를 확인해 주세요.'
}
