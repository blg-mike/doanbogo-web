import { describe, expect, it } from 'vitest'
import { detectChartRows } from './chartRowDetection'

function chartPixels(width: number, height: number) {
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let offset = 0; offset < pixels.length; offset += 4) pixels.set([255, 255, 255, 255], offset)
  return pixels
}

function drawLine(pixels: Uint8ClampedArray, width: number, x1: number, y1: number, x2: number, y2: number) {
  if (y1 === y2) {
    for (let x = x1; x <= x2; x += 1) pixels.set([0, 0, 0, 255], (y1 * width + x) * 4)
    return
  }
  for (let y = y1; y <= y2; y += 1) pixels.set([0, 0, 0, 255], (y * width + x1) * 4)
}

describe('chart row detection', () => {
  it('detects each stepped row width separately and ignores a dimension line', () => {
    const width = 160
    const height = 100
    const pixels = chartPixels(width, height)
    const rows = [
      { x: 18, right: 78 },
      { x: 44, right: 142 },
      { x: 18, right: 78 },
      { x: 44, right: 142 },
    ]
    const boundaries = [10, 30, 50, 70, 90]
    boundaries.forEach((y, index) => {
      const row = rows[Math.min(index, rows.length - 1)]
      drawLine(pixels, width, row.x, y, row.right, y)
    })
    rows.forEach((row, index) => {
      for (let x = row.x; x <= row.right; x += 10) drawLine(pixels, width, x, boundaries[index], x, boundaries[index + 1])
      drawLine(pixels, width, row.right, boundaries[index], row.right, boundaries[index + 1])
    })
    // A dimension line has only two vertical end supports, unlike a chart boundary.
    drawLine(pixels, width, 20, 5, 140, 5)
    drawLine(pixels, width, 20, 1, 20, 9)
    drawLine(pixels, width, 140, 1, 140, 9)

    const detected = detectChartRows(pixels, width, height)

    expect(detected).toHaveLength(4)
    expect(detected.map(({ x, width: rowWidth }) => [Math.round(x * width), Math.round(rowWidth * width)])).toEqual([
      [18, 60], [44, 98], [18, 60], [44, 98],
    ])
  })

  it('returns no rows for invalid or undersized image data', () => {
    expect(detectChartRows(new Uint8ClampedArray(0), 0, 0)).toEqual([])
    expect(detectChartRows(new Uint8ClampedArray(24 * 16 * 4 - 1), 24, 16)).toEqual([])
  })
})
