import { describe, expect, it } from 'vitest'
import type { AnnotationRecord } from './types'
import { annotationSelectionBounds, annotationTextBox, clampAnnotationDelta, selectAnnotationsInRect, translateAnnotations } from './annotationSelection'

const page = { width: 600, height: 800 }
const style = { color: '#123456', thickness: 4, opacity: 0.8, fontSize: 20 }

function ink(id: string, points: AnnotationRecord['points'], type: 'pen' | 'highlight' | 'line' = 'pen'): AnnotationRecord {
  return { id, type, points, style }
}

function text(id: string, x: number, y: number, width = 0.2, height = 0.1): AnnotationRecord {
  return { id, type: 'text', points: [{ x, y }], boxWidth: width, boxHeight: height, text: 'note', style }
}

describe('annotationSelection', () => {
  it('selects a stroke that partially crosses the rectangle', () => {
    const stroke = ink('cross', [{ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }])
    expect(selectAnnotationsInRect([stroke], { x: 0.45, y: 0.45, width: 0.1, height: 0.1 }, page)).toEqual([stroke])
  })

  it('accounts for the rendered stroke radius at the rectangle edge', () => {
    const stroke = ink('thick', [{ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }])
    const selection = { x: 0.5 + 1.5 / page.width, y: 0.5, width: 0.02, height: 0.02 }
    expect(selectAnnotationsInRect([stroke], selection, page)).toEqual([stroke])
  })

  it('checks the actual path rather than its bounding box', () => {
    const zigzag = ink('zigzag', [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }])
    expect(selectAnnotationsInRect([zigzag], { x: 0.2, y: 0.4, width: 0.2, height: 0.2 }, page)).toEqual([])
  })

  it('selects text when its box only partially overlaps and resolves legacy boxes', () => {
    const note = text('note', 0.4, 0.4)
    expect(selectAnnotationsInRect([note], { x: 0.59, y: 0.42, width: 0.02, height: 0.03 }, page)).toEqual([note])
    const legacy = { ...note, boxWidth: undefined, boxHeight: undefined, points: [{ x: 0.4, y: 0.5 }] }
    expect(annotationTextBox(legacy, page.height)).toEqual({ x: 0.4, y: 0.475, width: 0.3, height: 0.12 })
  })

  it('uses the visible text bounds for quarter-turn page rotation', () => {
    const note = text('rotated', 0.4, 0.4, 0.2, 0.1)
    const selection = { x: 0.55, y: 0.51, width: 0.01, height: 0.01 }
    expect(selectAnnotationsInRect([note], selection, page, 90)).toEqual([note])
    expect(selectAnnotationsInRect([note], selection, page, 270)).toEqual([note])
    expect(selectAnnotationsInRect([note], selection, page, 180)).toEqual([])
    expect(selectAnnotationsInRect([note], selection, page, 0)).toEqual([])
    expect(clampAnnotationDelta([note], { x: 0, y: 1 }, page, 90).y).toBeCloseTo(0.475)
  })

  it('moves legacy text by the same visible delta when its stored anchor is clamped at page edges', () => {
    const legacy: AnnotationRecord = { id: 'legacy', type: 'text', points: [{ x: 0.9, y: 1.2 }], text: 'legacy', style }
    const before = annotationTextBox(legacy, page.height)!
    const moved = translateAnnotations([legacy], new Set(['legacy']), { x: -0.1, y: -0.1 }, page)[0]
    const after = annotationTextBox(moved, page.height)!
    expect(after.x - before.x).toBeCloseTo(-0.1)
    expect(after.y - before.y).toBeCloseTo(-0.1)
    expect(moved.boxWidth).toBeUndefined()
    expect(moved.boxHeight).toBeUndefined()
  })

  it('excludes line annotations and preserves source order', () => {
    const first = ink('first', [{ x: 0.4, y: 0.4 }, { x: 0.6, y: 0.6 }], 'highlight')
    const excluded = ink('line', [{ x: 0.4, y: 0.4 }, { x: 0.6, y: 0.6 }], 'line')
    const last = text('last', 0.45, 0.45)
    expect(selectAnnotationsInRect([first, excluded, last], { x: 0.5, y: 0.5, width: 0, height: 0 }, page).map((annotation) => annotation.id)).toEqual(['first', 'last'])
  })

  it('computes the union frame including stroke width', () => {
    const first = ink('first', [{ x: 0.2, y: 0.3 }, { x: 0.4, y: 0.5 }])
    const second = text('second', 0.5, 0.6, 0.2, 0.15)
    expect(annotationSelectionBounds([first, second], page)).toEqual({
      x: 0.2 - 2 / page.width,
      y: 0.3 - 2 / page.height,
      width: 0.7 - (0.2 - 2 / page.width),
      height: 0.75 - (0.3 - 2 / page.height),
    })
  })

  it('clamps group movement and preserves annotation content and style', () => {
    const first = ink('first', [{ x: 0.05, y: 0.1 }, { x: 0.2, y: 0.2 }])
    const second = text('second', 0.3, 0.3)
    expect(clampAnnotationDelta([first, second], { x: -0.5, y: 0.9 }, page)).toEqual({ x: -(0.05 - 2 / page.width), y: 1 - 0.4 })
    const moved = translateAnnotations([first, second], new Set(['first', 'second']), { x: 0.1, y: -0.1 }, page)
    expect(moved[0]).toMatchObject({ id: first.id, type: first.type, style: first.style })
    expect(moved[0].points[0].x).toBeCloseTo(0.15)
    expect(moved[0].points[0].y).toBeCloseTo(0.0025)
    expect(moved[0].points[1].x).toBeCloseTo(0.3)
    expect(moved[0].points[1].y).toBeCloseTo(0.1025)
    expect(moved[1]).toMatchObject({ id: second.id, text: second.text, style: second.style, boxWidth: second.boxWidth, boxHeight: second.boxHeight })
    expect(moved[1].points[0].x).toBeCloseTo(0.4)
    expect(moved[1].points[0].y).toBeCloseTo(0.2025)
  })
})
