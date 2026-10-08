import { describe, expect, it } from 'vitest'
import { appendInkPoint, createInkAnnotation, createInkId, type ActiveInkStroke, type InkCryptoApi } from './inkStroke'
import type { PageWorkRecord } from './types'

const style = { color: '#222222', thickness: 3, opacity: 0.7, fontSize: 18 }
const before: PageWorkRecord = {
  documentId: 'doc-1', pageNumber: 4, horizontalPosition: 0.5, verticalPosition: 0.5, annotations: [],
}
const stroke: ActiveInkStroke = {
  id: 'stroke', pointerId: 7, documentId: before.documentId, pageNumber: before.pageNumber, rotation: 0,
  tool: 'pen', style, before, pageWidth: 600, pageHeight: 800, points: [{ x: 0.1, y: 0.2 }, { x: 0.2, y: 0.3 }],
}

describe('ink stroke lifecycle', () => {
  it('commits the final pointer position even when no render update ran first', () => {
    const annotation = createInkAnnotation(stroke, { x: 0.3, y: 0.4 }, 600, 800)
    expect(annotation.points).toEqual([...stroke.points, { x: 0.3, y: 0.4 }])
  })

  it('keeps the line endpoints and style captured when the stroke started', () => {
    const annotation = createInkAnnotation({ ...stroke, tool: 'line' }, { x: 0.3, y: 0.4 }, 600, 800)
    expect(annotation).toMatchObject({ type: 'line', points: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }], style })
  })

  it('does not add a cancel event position to the accepted stroke', () => {
    expect(createInkAnnotation(stroke).points).toEqual(stroke.points)
  })

  it('ignores duplicate positions but keeps distinct fast pointer updates', () => {
    const points = appendInkPoint(stroke.points, { x: 0.2, y: 0.3 }, 600, 800)
    expect(points).toBe(stroke.points)
    expect(appendInkPoint(points, { x: 0.205, y: 0.3 }, 600, 800)).toHaveLength(3)
  })
})

describe('ink identifier compatibility', () => {
  it('uses randomUUID when available', () => {
    expect(createInkId({ getRandomValues: (bytes) => bytes, randomUUID: () => 'native-id' })).toBe('native-id')
  })

  it('creates a UUID v4 when randomUUID is unavailable', () => {
    const cryptoApi: InkCryptoApi = {
      getRandomValues: (bytes: Uint8Array<ArrayBuffer>) => {
        bytes.set(Array.from({ length: 16 }, (_, index) => index))
        return bytes
      },
    }
    expect(createInkId(cryptoApi)).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f')
  })
})
