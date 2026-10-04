import jsQR from 'jsqr'
import { safeQrHref, type PdfQrLink } from './qr'

export function detectPdfQrLinksFromPixels(data: Uint8ClampedArray, width: number, height: number): PdfQrLink[] {
  if (!width || !height || data.length < width * height * 4) return []
  const links: PdfQrLink[] = []

  for (let attempt = 0; attempt < 10; attempt++) {
    const result = jsQR(data, width, height, { inversionAttempts: 'attemptBoth' })
    if (!result) break
    const points = [result.location.topLeftCorner, result.location.topRightCorner, result.location.bottomLeftCorner, result.location.bottomRightCorner]
    const left = Math.max(0, Math.min(...points.map((point) => point.x)))
    const top = Math.max(0, Math.min(...points.map((point) => point.y)))
    const right = Math.min(width, Math.max(...points.map((point) => point.x)))
    const bottom = Math.min(height, Math.max(...points.map((point) => point.y)))
    if (right <= left || bottom <= top) break
    const href = safeQrHref(result.data)
    if (href) links.push({ x: left / width, y: top / height, width: (right - left) / width, height: (bottom - top) / height, href })

    const margin = Math.max(4, Math.round(Math.min(right - left, bottom - top) * 0.08))
    const maskLeft = Math.max(0, Math.floor(left - margin))
    const maskTop = Math.max(0, Math.floor(top - margin))
    const maskRight = Math.min(width, Math.ceil(right + margin))
    const maskBottom = Math.min(height, Math.ceil(bottom + margin))
    for (let y = maskTop; y < maskBottom; y++) {
      for (let x = maskLeft; x < maskRight; x++) {
        const offset = (y * width + x) * 4
        data[offset] = 255
        data[offset + 1] = 255
        data[offset + 2] = 255
        data[offset + 3] = 255
      }
    }
  }
  return links
}
