import jsQR from 'jsqr'
import { safeQrHref, type PdfQrLink } from './qr'
import { getPdfQrTileBounds } from './qrTileGrid'

const QR_SCAN_ATTEMPTS = 10

function overlaps(first: PdfQrLink, second: PdfQrLink) {
  const intersection = Math.max(0, Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x)) *
    Math.max(0, Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y))
  return intersection / Math.max(Number.EPSILON, Math.min(first.width * first.height, second.width * second.height)) >= 0.5
}

function addUniqueLink(links: PdfQrLink[], link: PdfQrLink) {
  if (!links.some((candidate) => candidate.href === link.href && overlaps(candidate, link))) links.push(link)
}

function decodeRegion(data: Uint8ClampedArray, width: number, height: number, originX: number, originY: number, fullWidth: number, fullHeight: number) {
  const links: PdfQrLink[] = []

  for (let attempt = 0; attempt < QR_SCAN_ATTEMPTS; attempt++) {
    const result = jsQR(data, width, height, { inversionAttempts: 'attemptBoth' })
    if (!result) break
    const points = [result.location.topLeftCorner, result.location.topRightCorner, result.location.bottomLeftCorner, result.location.bottomRightCorner]
    const left = Math.max(0, Math.min(...points.map((point) => point.x)))
    const top = Math.max(0, Math.min(...points.map((point) => point.y)))
    const right = Math.min(width, Math.max(...points.map((point) => point.x)))
    const bottom = Math.min(height, Math.max(...points.map((point) => point.y)))
    if (right <= left || bottom <= top) break
    const href = safeQrHref(result.data)
    if (href) links.push({
      x: (originX + left) / fullWidth,
      y: (originY + top) / fullHeight,
      width: (right - left) / fullWidth,
      height: (bottom - top) / fullHeight,
      href,
    })

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

function cropPixels(data: Uint8ClampedArray, width: number, left: number, top: number, right: number, bottom: number) {
  const cropWidth = right - left
  const cropHeight = bottom - top
  const crop = new Uint8ClampedArray(cropWidth * cropHeight * 4)
  for (let row = 0; row < cropHeight; row++) {
    const sourceStart = ((top + row) * width + left) * 4
    crop.set(data.subarray(sourceStart, sourceStart + cropWidth * 4), row * cropWidth * 4)
  }
  return { data: crop, width: cropWidth, height: cropHeight }
}

export function detectPdfQrLinksFromPixels(data: Uint8ClampedArray, width: number, height: number): PdfQrLink[] {
  if (!width || !height || data.length < width * height * 4) return []
  const links = decodeRegion(data.slice(0, width * height * 4), width, height, 0, 0, width, height)

  for (const tile of getPdfQrTileBounds(width, height)) {
    const crop = cropPixels(data, width, tile.left, tile.top, tile.right, tile.bottom)
    for (const link of decodeRegion(crop.data, crop.width, crop.height, tile.left, tile.top, width, height)) addUniqueLink(links, link)
  }
  return links
}
