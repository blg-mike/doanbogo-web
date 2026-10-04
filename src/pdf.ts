import * as pdfjs from 'pdfjs-dist'
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker&inline'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

if (!import.meta.env.VITE_PORTABLE) pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

let portableFallbackLogged = false

async function loadPortableFallback(data: Uint8Array, reason: unknown) {
  if (!portableFallbackLogged) {
    portableFallbackLogged = true
    console.warn('[PDF] Embedded Worker initialization failed; falling back to main-thread PDF processing.', reason)
  }

  const workerModule = await import('pdfjs-dist/build/pdf.worker.min.mjs')
  ;(globalThis as typeof globalThis & { pdfjsWorker?: typeof workerModule }).pdfjsWorker = workerModule
  return pdfjs.getDocument({ data: data.slice() })
}

async function loadPortableDocument(data: Uint8Array) {
  let worker: Worker
  try {
    worker = new PdfWorker()
  } catch (error) {
    const fallbackTask = await loadPortableFallback(data, error)
    return { promise: fallbackTask.promise, dispose: () => fallbackTask.destroy() }
  }

  let task: pdfjs.PDFDocumentLoadingTask
  let fallbackTask: pdfjs.PDFDocumentLoadingTask | undefined
  let workerFailed = false
  let workerError: Error | undefined
  let rejectWorkerFailure: (reason: Error) => void = () => {}
  const workerFailure = new Promise<never>((_, reject) => {
    rejectWorkerFailure = reject
  })
  const onWorkerError = (event: ErrorEvent) => {
    workerFailed = true
    workerError = new Error(`PDF Worker 실행에 실패했습니다: ${event.message || '알 수 없는 오류'}`)
    rejectWorkerFailure(workerError)
  }
  const onWorkerMessageError = () => {
    workerFailed = true
    workerError = new Error('PDF Worker와 통신하지 못했습니다.')
    rejectWorkerFailure(workerError)
  }
  worker.addEventListener('error', onWorkerError, { once: true })
  worker.addEventListener('messageerror', onWorkerMessageError, { once: true })
  const removeWorkerListeners = () => {
    worker.removeEventListener('error', onWorkerError)
    worker.removeEventListener('messageerror', onWorkerMessageError)
  }

  const previousWorkerPort = pdfjs.GlobalWorkerOptions.workerPort
  try {
    pdfjs.GlobalWorkerOptions.workerPort = worker
    task = pdfjs.getDocument({ data: data.slice() })
  } catch (error) {
    removeWorkerListeners()
    worker.terminate()
    throw error
  } finally {
    pdfjs.GlobalWorkerOptions.workerPort = previousWorkerPort
  }

  const promise = Promise.race([task.promise, workerFailure]).catch(async (error) => {
    removeWorkerListeners()
    if (!workerFailed) throw error
    worker.terminate()
    void task.destroy().catch(() => {})
    fallbackTask = await loadPortableFallback(data, workerError ?? error)
    return fallbackTask.promise
  }).then((document) => {
    removeWorkerListeners()
    return document
  })

  return {
    promise,
    dispose: async () => {
      try {
        if (fallbackTask) await fallbackTask.destroy()
        else if (!workerFailed) await task.destroy()
      } finally {
        worker.terminate()
      }
    },
  }
}

async function loadDocument(blob: Blob) {
  if (import.meta.env.VITE_PORTABLE) {
    const data = new Uint8Array(await blob.arrayBuffer())
    return loadPortableDocument(data)
  }

  const url = URL.createObjectURL(blob)
  const task = pdfjs.getDocument({ url })
  return {
    promise: task.promise,
    dispose: async () => {
      try {
        await task.destroy()
      } finally {
        URL.revokeObjectURL(url)
      }
    },
  }
}

export async function inspectPdf(file: File) {
  const loaded = await loadDocument(file)
  try {
    const pdf = await loaded.promise
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
    await loaded.dispose()
  }
}

export async function openPdf(blob: Blob) {
  const loaded = await loadDocument(blob)
  try {
    const document = await loaded.promise
    return {
      document,
      dispose: loaded.dispose,
    }
  } catch (error) {
    await loaded.dispose()
    throw error
  }
}

export function pdfErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/password|encrypted/i.test(message)) return '암호가 설정된 PDF입니다. 암호 없는 파일로 다시 시도해 주세요.'
  if (/worker/i.test(message)) return 'PDF Worker를 시작하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.'
  return 'PDF를 읽지 못했습니다. 파일 접근 권한과 PDF 상태를 확인해 주세요.'
}
