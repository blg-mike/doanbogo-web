import { detectChartRows } from './chartRowDetection'

interface ChartRowsRequest {
  id: number
  width: number
  height: number
  pixels: ArrayBuffer
}

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<ChartRowsRequest>) => void) | null
  postMessage: (message: { id: number; rows: ReturnType<typeof detectChartRows>; error?: true }) => void
}

workerScope.onmessage = ({ data }) => {
  try {
    const rows = detectChartRows(new Uint8ClampedArray(data.pixels), data.width, data.height)
    workerScope.postMessage({ id: data.id, rows })
  } catch {
    workerScope.postMessage({ id: data.id, rows: [], error: true })
  }
}
