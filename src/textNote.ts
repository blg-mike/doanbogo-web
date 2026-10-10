export interface TextNoteBox {
  x: number
  y: number
  width: number
  height: number
}

export function textNoteCounterRotation(rotation: number): number {
  return (360 - rotation % 360) % 360
}

export function textNoteGestureExceededThreshold(start: { x: number; y: number }, current: { x: number; y: number }, threshold = 8): boolean {
  const dx = current.x - start.x
  const dy = current.y - start.y
  return dx * dx + dy * dy >= threshold * threshold
}

export function textNoteBoxAt(point: { x: number; y: number }): TextNoteBox {
  const width = 0.3
  const height = 0.12
  return {
    x: Math.max(0, Math.min(point.x, 1 - width)),
    y: Math.max(0, Math.min(point.y, 1 - height)),
    width,
    height,
  }
}
