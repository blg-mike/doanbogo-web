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

export function isCurrentQrScanGeneration(capturedGeneration: number, currentGeneration: number) {
  return capturedGeneration === currentGeneration
}

export function safeQrHref(value: string) {
  try {
    const trimmed = value.trim()
    const url = new URL(/^www\./i.test(trimmed) ? `https://${trimmed}` : trimmed)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

function trimUrlSentencePunctuation(value: string) {
  let result = value
  let previous = ''
  while (result && result !== previous) {
    previous = result
    result = result.replace(/[.,;!?]+$/, '')
    const openingParentheses = (result.match(/\(/g) ?? []).length
    const closingParentheses = (result.match(/\)/g) ?? []).length
    if (result.endsWith(')') && closingParentheses > openingParentheses) result = result.slice(0, -1)
  }
  return result
}

export function shouldOpenLinkAfterGesture(startX: number, startY: number, endX: number, endY: number, pinched = false) {
  return !pinched && Math.hypot(endX - startX, endY - startY) <= 8
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

  type TextRun = { str: string; x: number; y: number; width: number; height: number }
  type TextSpan = { start: number; end: number; run: TextRun }
  const lines: { y: number; height: number; runs: TextRun[] }[] = []
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

  const textLines = lines.map((line) => {
    line.runs.sort((first, second) => first.x - second.x)
    let text = ''
    const spans: TextSpan[] = []
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

    return { ...line, text, spans }
  })

  const textLinks: PdfQrLink[] = []
  const readingLines = [...textLines].sort((first, second) => second.y - first.y)
  for (let lineIndex = 0; lineIndex < readingLines.length; lineIndex++) {
    const line = readingLines[lineIndex]
    for (const match of line.text.matchAll(/(?:https?:\/\/|www\.)[^\s<>"']+/gi)) {
      let raw = trimUrlSentencePunctuation(match[0] ?? '')
      const start = match.index ?? -1
      if (start < 0 || !raw) continue
      const ranges: { line: typeof line; start: number; end: number }[] = [{ line, start, end: start + raw.length }]
      const nextLine = readingLines[lineIndex + 1]
      const isAtLineEnd = /^[),.;!?\s]*$/.test(line.text.slice(start + raw.length))
      const nextPrefixMatch = nextLine?.text.match(/^([A-Za-z0-9/%?#&=+_.~-]+)(?:\s|$)/)
      const nextPrefix = nextPrefixMatch?.[1]
      if (nextLine && isAtLineEnd && nextPrefix && !/^(?:https?:\/\/|www\.)/i.test(nextPrefix)) {
        const gap = line.y - nextLine.y
        const startRun = line.spans.find((span) => start >= span.start && start < span.end)?.run
        const firstRight = line.spans.flatMap((span) => {
          const overlapStart = Math.max(start, span.start)
          const overlapEnd = Math.min(start + raw.length, span.end)
          if (overlapEnd <= overlapStart) return []
          const charCount = Math.max(1, span.end - span.start)
          return [span.run.x + span.run.width * (overlapEnd - span.start) / charCount]
        }).at(-1) ?? 0
        const nextStart = nextLine.runs[0]?.x ?? Infinity
        const nearPageEdge = firstRight >= viewport.width * 0.78
        const hasExplicitContinuation = /[/?#&=]$/.test(raw) && /^[A-Za-z]/.test(nextPrefix)
        const urlLikeContinuation = /[0-9/%?#&=+_.~-]/.test(nextPrefix) || hasExplicitContinuation
        const linesAreAdjacent = gap > 0 && gap <= Math.max(line.height, nextLine.height) * 1.8
        const linesAreAligned = startRun !== undefined && Math.abs(nextStart - startRun.x) <= Math.max(line.height * 1.5, 6)
        if (nearPageEdge && urlLikeContinuation && linesAreAdjacent && linesAreAligned) {
          raw += nextPrefix
          ranges.push({ line: nextLine, start: 0, end: nextPrefix.length })
        }
      }
      const href = safeQrHref(raw)
      if (!href) continue
      const bounds = ranges.flatMap(({ line: sourceLine, start: rangeStart, end: rangeEnd }) => sourceLine.spans.flatMap((span) => {
        const overlapStart = Math.max(rangeStart, span.start)
        const overlapEnd = Math.min(rangeEnd, span.end)
        if (overlapEnd <= overlapStart) return []
        const run = span.run
        const charCount = Math.max(1, span.end - span.start)
        const left = run.x + run.width * (overlapStart - span.start) / charCount
        const right = run.x + run.width * (overlapEnd - span.start) / charCount
        return [[Math.min(left, right), run.y - run.height * 0.2, Math.max(left, right), run.y + run.height * 0.8]]
      }))
      if (!bounds.length) continue
      const pdfRect = [Math.min(...bounds.map((rect) => rect[0])), Math.min(...bounds.map((rect) => rect[1])), Math.max(...bounds.map((rect) => rect[2])), Math.max(...bounds.map((rect) => rect[3]))]
      const region = normalizeRect(pdfRect, viewport)
      if (!region || annotationLinks.some((annotationLink) => overlaps(region, annotationLink))) continue
      if (!textLinks.some((link) => link.href === href && overlaps(link, region))) textLinks.push({ ...region, href })
    }
  }
  return [...annotationLinks, ...textLinks]
}
