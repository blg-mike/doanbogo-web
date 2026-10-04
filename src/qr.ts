import jsQR from 'jsqr'

export interface PdfQrLink {
  x: number
  y: number
  width: number
  height: number
  href: string
}

export function safeQrHref(value: string) {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

export function detectPdfQrLinks(source: HTMLCanvasElement): PdfQrLink[] {
  if (!source.width || !source.height) return []
  const scale = Math.min(1, 1400 / Math.max(source.width, source.height))
  const width = Math.max(1, Math.round(source.width * scale))
  const height = Math.max(1, Math.round(source.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return []
  context.drawImage(source, 0, 0, width, height)
  const image = context.getImageData(0, 0, width, height)
  const links: PdfQrLink[] = []

  for (let attempt = 0; attempt < 10; attempt++) {
    const result = jsQR(image.data, width, height, { inversionAttempts: 'attemptBoth' })
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
        image.data[offset] = 255
        image.data[offset + 1] = 255
        image.data[offset + 2] = 255
        image.data[offset + 3] = 255
      }
    }
  }
  return links
}
