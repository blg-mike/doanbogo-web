import { describe, expect, it } from 'vitest'
import { inverseRotatePoint, rotatedPageSize } from './pageGeometry'

describe('rotated PDF page coordinates', () => {
  it('maps pointer positions back to original page coordinates at each rotation', () => {
    expect(inverseRotatePoint({ x: 0.2, y: 0.7 }, 0)).toEqual({ x: 0.2, y: 0.7 })
    expect(inverseRotatePoint({ x: 0.2, y: 0.7 }, 90)).toEqual({ x: 0.7, y: 0.8 })
    expect(inverseRotatePoint({ x: 0.2, y: 0.7 }, 180)).toMatchObject({ x: 0.8, y: expect.closeTo(0.3) })
    expect(inverseRotatePoint({ x: 0.2, y: 0.7 }, 270)).toMatchObject({ x: expect.closeTo(0.3), y: 0.2 })
  })

  it('swaps the page fit dimensions for quarter turns', () => {
    expect(rotatedPageSize({ width: 800, height: 1000 }, 90)).toEqual({ width: 1000, height: 800 })
    expect(rotatedPageSize({ width: 800, height: 1000 }, 180)).toEqual({ width: 800, height: 1000 })
  })
})
