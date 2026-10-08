import type { AnnotationRecord, AnnotationStyle, PageRotation, PageWorkRecord } from './types'

export type InkTool = 'pen' | 'line' | 'highlight'
export type InkPoint = { x: number; y: number }
export interface InkCryptoApi {
  randomUUID?: () => string
  getRandomValues?: (array: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>
}

export interface ActiveInkStroke {
  id: string
  pointerId: number
  documentId: string
  pageNumber: number
  rotation: PageRotation
  tool: InkTool
  style: AnnotationStyle
  before: PageWorkRecord
  pageWidth: number
  pageHeight: number
  points: InkPoint[]
}

export function appendInkPoint(points: InkPoint[], point: InkPoint, pageWidth: number, pageHeight: number): InkPoint[] {
  const last = points.at(-1)
  if (!last) return [point]
  if (Math.hypot((point.x - last.x) * pageWidth, (point.y - last.y) * pageHeight) < 1.5) return points
  return [...points, point]
}

export function createInkAnnotation(stroke: ActiveInkStroke, finalPoint?: InkPoint, pageWidth = 1, pageHeight = 1): AnnotationRecord {
  const points = finalPoint
    ? appendInkPoint(stroke.points, finalPoint, pageWidth, pageHeight)
    : stroke.points
  return {
    id: stroke.id,
    type: stroke.tool,
    points: stroke.tool === 'line' ? [points[0], points.at(-1)!] : points,
    style: stroke.style,
  }
}

export function createInkId(cryptoApi: InkCryptoApi | undefined = globalThis.crypto): string {
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID()
  if (cryptoApi?.getRandomValues) {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0'))
    return hex.slice(0, 4).join('') + '-' + hex.slice(4, 6).join('') + '-' + hex.slice(6, 8).join('') + '-' + hex.slice(8, 10).join('') + '-' + hex.slice(10).join('')
  }
  return 'ink-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)
}
