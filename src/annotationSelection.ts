import type { AnnotationRecord, PageRotation } from './types'

export interface AnnotationRect {
  x: number
  y: number
  width: number
  height: number
}

export interface AnnotationPageSize {
  width: number
  height: number
}

export interface AnnotationDelta {
  x: number
  y: number
}

function rectRight(rect: AnnotationRect) {
  return rect.x + rect.width
}

function rectBottom(rect: AnnotationRect) {
  return rect.y + rect.height
}

function rectsOverlap(first: AnnotationRect, second: AnnotationRect) {
  return first.x <= rectRight(second) && rectRight(first) >= second.x &&
    first.y <= rectBottom(second) && rectBottom(first) >= second.y
}

function pointInRect(point: { x: number; y: number }, rect: AnnotationRect) {
  return point.x >= rect.x && point.x <= rectRight(rect) && point.y >= rect.y && point.y <= rectBottom(rect)
}

function pointToRectDistance(point: { x: number; y: number }, rect: AnnotationRect) {
  const dx = Math.max(rect.x - point.x, 0, point.x - rectRight(rect))
  const dy = Math.max(rect.y - point.y, 0, point.y - rectBottom(rect))
  return Math.hypot(dx, dy)
}

function pointToSegmentDistance(point: { x: number; y: number }, start: { x: number; y: number }, end: { x: number; y: number }) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared ? Math.min(1, Math.max(0, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)) : 0
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy))
}

function segmentsIntersect(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }, d: { x: number; y: number }) {
  const cross = (first: typeof a, second: typeof b, third: typeof c) => (second.x - first.x) * (third.y - first.y) - (second.y - first.y) * (third.x - first.x)
  const onSegment = (first: typeof a, second: typeof b, point: typeof c) =>
    point.x >= Math.min(first.x, second.x) && point.x <= Math.max(first.x, second.x) &&
    point.y >= Math.min(first.y, second.y) && point.y <= Math.max(first.y, second.y)
  const first = cross(a, b, c)
  const second = cross(a, b, d)
  const third = cross(c, d, a)
  const fourth = cross(c, d, b)
  if (((first > 0 && second < 0) || (first < 0 && second > 0)) && ((third > 0 && fourth < 0) || (third < 0 && fourth > 0))) return true
  return (first === 0 && onSegment(a, b, c)) || (second === 0 && onSegment(a, b, d)) ||
    (third === 0 && onSegment(c, d, a)) || (fourth === 0 && onSegment(c, d, b))
}

function segmentIntersectsRect(start: { x: number; y: number }, end: { x: number; y: number }, rect: AnnotationRect, radius: number) {
  if (pointInRect(start, rect) || pointInRect(end, rect)) return true
  const topLeft = { x: rect.x, y: rect.y }
  const topRight = { x: rectRight(rect), y: rect.y }
  const bottomLeft = { x: rect.x, y: rectBottom(rect) }
  const bottomRight = { x: rectRight(rect), y: rectBottom(rect) }
  if (segmentsIntersect(start, end, topLeft, topRight) || segmentsIntersect(start, end, topRight, bottomRight) ||
    segmentsIntersect(start, end, bottomRight, bottomLeft) || segmentsIntersect(start, end, bottomLeft, topLeft)) return true
  if (radius <= 0) return false
  const corners = [topLeft, topRight, bottomLeft, bottomRight]
  return Math.min(
    pointToRectDistance(start, rect),
    pointToRectDistance(end, rect),
    ...corners.map((corner) => pointToSegmentDistance(corner, start, end)),
  ) <= radius
}

export function annotationTextBox(annotation: AnnotationRecord, pageHeight: number): AnnotationRect | null {
  const point = annotation.points[0]
  if (annotation.type !== 'text' || !point || pageHeight <= 0) return null
  const legacy = annotation.boxWidth === undefined || annotation.boxHeight === undefined
  const width = Math.min(1, Math.max(0, annotation.boxWidth ?? 0.3))
  const height = Math.min(1, Math.max(0, annotation.boxHeight ?? 0.12))
  return {
    x: Math.min(1 - width, Math.max(0, point.x)),
    y: Math.min(1 - height, Math.max(0, point.y - (legacy ? annotation.style.fontSize / pageHeight : 0))),
    width,
    height,
  }
}

function annotationVisibleTextBounds(annotation: AnnotationRecord, pageSize: AnnotationPageSize, rotation: PageRotation): AnnotationRect | null {
  const box = annotationTextBox(annotation, pageSize.height)
  if (!box || (rotation !== 90 && rotation !== 270) || pageSize.width <= 0 || pageSize.height <= 0) return box
  const width = box.height * pageSize.height / pageSize.width
  const height = box.width * pageSize.width / pageSize.height
  return { x: box.x + (box.width - width) / 2, y: box.y + (box.height - height) / 2, width, height }
}

function annotationBounds(annotation: AnnotationRecord, pageSize: AnnotationPageSize, rotation: PageRotation): AnnotationRect | null {
  if (annotation.type === 'text') return annotationVisibleTextBounds(annotation, pageSize, rotation)
  if ((annotation.type !== 'pen' && annotation.type !== 'highlight') || !annotation.points.length || pageSize.width <= 0 || pageSize.height <= 0) return null
  const radiusX = Math.max(0, annotation.style.thickness) / (2 * pageSize.width)
  const radiusY = Math.max(0, annotation.style.thickness) / (2 * pageSize.height)
  const xs = annotation.points.map((point) => point.x)
  const ys = annotation.points.map((point) => point.y)
  const left = Math.max(0, Math.min(...xs) - radiusX)
  const top = Math.max(0, Math.min(...ys) - radiusY)
  const right = Math.min(1, Math.max(...xs) + radiusX)
  const bottom = Math.min(1, Math.max(...ys) + radiusY)
  return { x: left, y: top, width: right - left, height: bottom - top }
}

function annotationIntersects(annotation: AnnotationRecord, selection: AnnotationRect, pageSize: AnnotationPageSize, rotation: PageRotation) {
  if (annotation.type === 'text') {
    const box = annotationVisibleTextBounds(annotation, pageSize, rotation)
    return box !== null && rectsOverlap(box, selection)
  }
  if ((annotation.type !== 'pen' && annotation.type !== 'highlight') || !annotation.points.length || pageSize.width <= 0 || pageSize.height <= 0) return false
  const radius = Math.max(0, annotation.style.thickness) / 2
  const points = annotation.points.map((point) => ({ x: point.x * pageSize.width, y: point.y * pageSize.height }))
  const pixelRect = { x: selection.x * pageSize.width, y: selection.y * pageSize.height, width: selection.width * pageSize.width, height: selection.height * pageSize.height }
  if (points.length === 1) return pointToRectDistance(points[0], pixelRect) <= radius
  for (let index = 1; index < points.length; index++) {
    if (segmentIntersectsRect(points[index - 1], points[index], pixelRect, radius)) return true
  }
  return false
}

export function selectAnnotationsInRect(annotations: AnnotationRecord[], selection: AnnotationRect, pageSize: AnnotationPageSize, rotation: PageRotation = 0) {
  return annotations.filter((annotation) => annotationIntersects(annotation, selection, pageSize, rotation))
}

export function annotationSelectionBounds(annotations: AnnotationRecord[], pageSize: AnnotationPageSize, rotation: PageRotation = 0): AnnotationRect | null {
  const bounds = annotations.map((annotation) => annotationBounds(annotation, pageSize, rotation)).filter((rect): rect is AnnotationRect => rect !== null)
  if (!bounds.length) return null
  const left = Math.min(...bounds.map((rect) => rect.x))
  const top = Math.min(...bounds.map((rect) => rect.y))
  const right = Math.max(...bounds.map(rectRight))
  const bottom = Math.max(...bounds.map(rectBottom))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

export function clampAnnotationDelta(annotations: AnnotationRecord[], delta: AnnotationDelta, pageSize: AnnotationPageSize, rotation: PageRotation = 0): AnnotationDelta {
  const bounds = annotationSelectionBounds(annotations, pageSize, rotation)
  if (!bounds) return { x: 0, y: 0 }
  return {
    x: Math.min(1 - rectRight(bounds), Math.max(-bounds.x, delta.x)),
    y: Math.min(1 - rectBottom(bounds), Math.max(-bounds.y, delta.y)),
  }
}

export function translateAnnotations(annotations: AnnotationRecord[], selectedIds: ReadonlySet<string>, delta: AnnotationDelta, pageSize: AnnotationPageSize, rotation: PageRotation = 0): AnnotationRecord[] {
  const selected = annotations.filter((annotation) => selectedIds.has(annotation.id))
  const bounded = clampAnnotationDelta(selected, delta, pageSize, rotation)
  return annotations.map((annotation) => {
    if (!selectedIds.has(annotation.id)) return annotation
    if (annotation.type === 'text') {
      const box = annotationTextBox(annotation, pageSize.height)
      if (box) {
        const legacy = annotation.boxWidth === undefined || annotation.boxHeight === undefined
        const x = box.x + bounded.x
        const y = box.y + bounded.y
        return {
          ...annotation,
          points: annotation.points.map((point, index) => index === 0
            ? { x, y: y + (legacy ? annotation.style.fontSize / pageSize.height : 0) }
            : { x: point.x + bounded.x, y: point.y + bounded.y }),
        }
      }
    }
    return { ...annotation, points: annotation.points.map((point) => ({ x: point.x + bounded.x, y: point.y + bounded.y })) }
  })
}
