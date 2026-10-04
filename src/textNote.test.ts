import { describe, expect, it } from 'vitest'
import { textNoteBoxAt } from './textNote'

describe('text note placement', () => {
  it('uses the existing default note dimensions', () => {
    expect(textNoteBoxAt({ x: 0.4, y: 0.5 })).toEqual({ x: 0.4, y: 0.5, width: 0.3, height: 0.12 })
  })

  it('keeps the full preview box inside the PDF at each edge', () => {
    expect(textNoteBoxAt({ x: 1, y: 1 })).toEqual({ x: 0.7, y: 0.88, width: 0.3, height: 0.12 })
    expect(textNoteBoxAt({ x: -0.2, y: -0.3 })).toEqual({ x: 0, y: 0, width: 0.3, height: 0.12 })
  })
})
