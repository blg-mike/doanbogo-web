import InlineChartRowsWorker from './chartRows.worker?worker&inline'
import type { DetectedChartRow } from './chartRowDetection'

let nextRequestId = 0

export function runChartRowsWorker(image: ImageData) {
  const worker = new InlineChartRowsWorker()
  const id = ++nextRequestId
  let settled = false
  let rejectResult: (error: Error) => void = () => undefined
  const promise = new Promise<DetectedChartRow[]>((resolve, reject) => {
    rejectResult = reject
    worker.addEventListener('message', (event: MessageEvent<{ id: number; rows: DetectedChartRow[]; error?: true }>) => {
      if (settled || event.data.id !== id) return
      settled = true
      worker.terminate()
      if (event.data.error) reject(new Error('차트 행을 분석하지 못했습니다.'))
      else resolve(event.data.rows)
    })
    worker.addEventListener('error', (event) => {
      if (settled) return
      settled = true
      worker.terminate()
      reject(new Error(event.message || '차트 분석 Worker를 시작하지 못했습니다.'))
    }, { once: true })
  })
  const pixels = image.data.buffer as ArrayBuffer
  worker.postMessage({ id, width: image.width, height: image.height, pixels }, [pixels])
  return {
    promise,
    cancel() {
      if (settled) return
      settled = true
      worker.terminate()
      rejectResult(new DOMException('Chart recognition cancelled.', 'AbortError'))
    },
  }
}
