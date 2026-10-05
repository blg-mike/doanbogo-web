import type { PdfQrLink } from './qr'

export function samePdfLinks(first: PdfQrLink[], second: PdfQrLink[]) {
  return first === second || first.length === second.length && first.every((link, index) => {
    const candidate = second[index]
    return link.x === candidate.x && link.y === candidate.y && link.width === candidate.width && link.height === candidate.height && link.href === candidate.href
  })
}

export function withRecentPdfLinks(current: Record<number, PdfQrLink[]>, pageNumber: number, links: PdfQrLink[], limit = 4) {
  if (current[pageNumber] && samePdfLinks(current[pageNumber], links)) return current
  const entries = Object.entries(current).filter(([page]) => Number(page) !== pageNumber)
  return { ...Object.fromEntries(entries.slice(-(limit - 1))), [pageNumber]: links }
}
