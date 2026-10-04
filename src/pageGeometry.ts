import type { PageRotation } from './types'

export function inverseRotatePoint(point: { x: number; y: number }, rotation: PageRotation) {
  if (rotation === 90) return { x: point.y, y: 1 - point.x }
  if (rotation === 180) return { x: 1 - point.x, y: 1 - point.y }
  if (rotation === 270) return { x: 1 - point.y, y: point.x }
  return point
}

export function rotatedPageSize(size: { width: number; height: number }, rotation: PageRotation) {
  return rotation === 90 || rotation === 270
    ? { width: size.height, height: size.width }
    : size
}
