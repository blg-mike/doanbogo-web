import jsQR from 'jsqr'

export interface PdfQrLink {
  x: number
  y: number
  width: number
  height: number
  href: string
}

export interface PdfExternalLinkAnnotation {
  subtype?: string
  url?: string
  unsafeUrl?: string
  rect?: number[]
}

export interface PdfTextRun {
  str?: string
  transform?: number[]
  width?: number
  height?: number
  hasEOL?: boolean
}

export interface PdfLinkViewport {
  width: number
  height: number
  transform: number[]
}

export function safeQrHref(value: string) {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

function normalizeRect(rect: number[], viewport: PdfLinkViewport): PdfQrLink | null {
  const [a, b, c, d, e, f] = viewport.transform
  const points = [[rect[0], rect[1]], [rect[0], rect[3]], [rect[2], rect[1]], [rect[2], rect[3]]]
    .map(([x, y]) => [a * x + c * y + e, b * x + d * y + f])
  const left = Math.max(0, Math.min(...points.map((point) => point[0])))
  const top = Math.max(0, Math.min(...points.map((point) => point[1])))
  const right = Math.min(viewport.width, Math.max(...points.map((point) => point[0])))
  const bottom = Math.min(viewport.height, Math.max(...points.map((point) => point[1])))
  if (right <= left || bottom <= top) return null
  return { x: left / viewport.width, y: top / viewport.height, width: (right - left) / viewport.width, height: (bottom - top) / viewport.height, href: '' }
}

function overlaps(first: PdfQrLink, second: PdfQrLink) {
  return first.x < second.x + second.width && first.x + first.width > second.x &&
    first.y < second.y + second.height && first.y + first.height > second.y
}

export function extractPdfPageLinks(annotations: PdfExternalLinkAnnotation[], textRuns: PdfTextRun[], viewport: PdfLinkViewport): PdfQrLink[] {
  const annotationLinks = annotations.flatMap((annotation) => {
    const href = annotation.subtype === 'Link' ? safeQrHref(annotation.url ?? annotation.unsafeUrl ?? '') : null
    const rect = annotation.rect
    if (!href || !rect || rect.length !== 4) return []
    const region = normalizeRect(rect, viewport)
    return region ? [{ ...region, href }] : []
  })

  const lines: { y: number; height: number; runs: { str: string; x: number; y: number; width: number; height: number }[] }[] = []
  for (const item of textRuns) {
    if (!item.str || !item.transform || item.transform.length < 6 || !Number.isFinite(item.width)) continue
    const height = Math.max(1, item.height ?? Math.hypot(item.transform[2], item.transform[3]))
    const run = { str: item.str, x: item.transform[4], y: item.transform[5], width: Math.max(0, item.width ?? 0), height }
    let line = lines.find((candidate) => Math.abs(candidate.y - run.y) <= Math.max(candidate.height, run.height) * 0.55)
    if (!line) {
      line = { y: run.y, height: run.height, runs: [] }
      lines.push(line)
    }
    line.runs.push(run)
    line.y = (line.y * (line.runs.length - 1) + run.y) / line.runs.length
    line.height = Math.max(line.height, run.height)
  }

  const textLinks: PdfQrLink[] = []
  for (const line of lines) {
    line.runs.sort((first, second) => first.x - second.x)
    let text = ''
    const spans: { start: number; end: number; run: typeof line.runs[number] }[] = []
    let previousRight: number | null = null
    let previousText = ''
    for (const run of line.runs) {
      const gap = previousRight === null ? 0 : run.x - previousRight
      const needsSpace = previousRight !== null && gap > Math.max(2, Math.min(run.height, line.height) * 0.45) && !previousText.endsWith(' ') && !run.str.startsWith(' ')
      if (needsSpace) text += ' '
      const start = text.length
      text += run.str
      spans.push({ start, end: text.length, run })
      previousRight = Math.max(previousRight ?? -Infinity, run.x + run.width)
      previousText = run.str
    }

    for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
      const raw = (match[0] ?? '').replace(/[),.;!?]+$/, '')
      const href = safeQrHref(raw)
      const start = match.index ?? -1
      if (!href || start < 0 || !raw) continue
      const end = start + raw.length
      const bounds = spans.flatMap((span) => {
        const overlapStart = Math.max(start, span.start)
        const overlapEnd = Math.min(end, span.end)
        if (overlapEnd <= overlapStart) return []
        const run = span.run
        const charCount = Math.max(1, span.end - span.start)
        const left = run.x + run.width * (overlapStart - span.start) / charCount
        const right = run.x + run.width * (overlapEnd - span.start) / charCount
        return [[Math.min(left, right), run.y - run.height * 0.2, Math.max(left, right), run.y + run.height * 0.8]]
      })
      if (!bounds.length) continue
      const pdfRect = [Math.min(...bounds.map((rect) => rect[0])), Math.min(...bounds.map((rect) => rect[1])), Math.max(...bounds.map((rect) => rect[2])), Math.max(...bounds.map((rect) => rect[3]))]
      const region = normalizeRect(pdfRect, viewport)
      if (!region || annotationLinks.some((annotationLink) => overlaps(region, annotationLink))) continue
      if (!textLinks.some((link) => link.href === href && overlaps(link, region))) textLinks.push({ ...region, href })
    }
  }
  return [...annotationLinks, ...textLinks]
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
