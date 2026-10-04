import { detectPdfQrLinksFromPixels } from './qrDecode'

interface ScanMessage {
  id: number
  width: number
  height: number
  pixels: ArrayBuffer
}

interface ScanResult {
  id: number
  links: ReturnType<typeof detectPdfQrLinksFromPixels>
  error?: true
}

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<ScanMessage>) => void) | null
  postMessage: (message: ScanResult) => void
}

workerScope.onmessage = ({ data }) => {
  try {
    const links = detectPdfQrLinksFromPixels(new Uint8ClampedArray(data.pixels), data.width, data.height)
    workerScope.postMessage({ id: data.id, links })
  } catch {
    workerScope.postMessage({ id: data.id, links: [], error: true })
  }
}
