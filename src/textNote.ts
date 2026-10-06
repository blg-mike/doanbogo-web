export interface TextNoteBox {
  x: number
  y: number
  width: number
  height: number
}

export function textNoteCounterRotation(rotation: number): number {
  return (360 - rotation % 360) % 360
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
