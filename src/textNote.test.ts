import { describe, expect, it } from 'vitest'
import { textNoteBoxAt, textNoteCounterRotation, textNoteGestureExceededThreshold } from './textNote'

describe('text note placement', () => {
  it('uses the existing default note dimensions', () => {
    expect(textNoteBoxAt({ x: 0.4, y: 0.5 })).toEqual({ x: 0.4, y: 0.5, width: 0.3, height: 0.12 })
  })

  it('keeps the full preview box inside the PDF at each edge', () => {
    expect(textNoteBoxAt({ x: 1, y: 1 })).toEqual({ x: 0.7, y: 0.88, width: 0.3, height: 0.12 })
    expect(textNoteBoxAt({ x: -0.2, y: -0.3 })).toEqual({ x: 0, y: 0, width: 0.3, height: 0.12 })
  })
})

describe('text note rotation', () => {
  it.each([
    [0, 0],
    [90, 270],
    [180, 180],
    [270, 90],
  ])('counter-rotates a note by %i degrees', (pageRotation, noteRotation) => {
    expect(textNoteCounterRotation(pageRotation)).toBe(noteRotation)
  })
})

describe('text note tap and drag intent', () => {
  it('keeps a tap below the movement threshold so it can open the editor', () => {
    expect(textNoteGestureExceededThreshold({ x: 100, y: 100 }, { x: 105, y: 104 })).toBe(false)
  })

  it('starts a move when the pointer passes the movement threshold', () => {
    expect(textNoteGestureExceededThreshold({ x: 100, y: 100 }, { x: 108, y: 100 })).toBe(true)
  })
})
