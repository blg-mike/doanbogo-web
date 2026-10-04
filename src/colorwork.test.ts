import { describe, expect, it } from 'vitest'
import { createColorworkGrid, defaultColorworkSettings, getColorworkDimensions, resizeColorworkGrid, resizeColorworkGridDisplay } from './colorwork'

describe('colorwork chart grid', () => {
  it('calculates stitch and row counts from chart size and 10 cm gauge', () => {
    expect(getColorworkDimensions(defaultColorworkSettings)).toMatchObject({ columns: 18, rows: 24 })
    expect(getColorworkDimensions({ chartWidthCm: 5, chartHeightCm: 7, gaugeStitches: 18, gaugeRows: 24 }))
      .toMatchObject({ columns: 9, rows: 17 })
  })

  it('rounds each axis to the nearest whole stitch or row', () => {
    expect(getColorworkDimensions({ chartWidthCm: 1, chartHeightCm: 1, gaugeStitches: 15, gaugeRows: 25 }))
      .toMatchObject({ columns: 2, rows: 3 })
  })

  it('rejects invalid settings and grids above 200 cells per axis', () => {
    expect(() => getColorworkDimensions({ ...defaultColorworkSettings, gaugeStitches: 0 })).toThrow()
    expect(() => getColorworkDimensions({ chartWidthCm: 200, chartHeightCm: 10, gaugeStitches: 200, gaugeRows: 24 })).toThrow(/200칸/)
  })

  it('preserves cell colors at the same row and column when resizing', () => {
    const grid = createColorworkGrid({ chartWidthCm: 1, chartHeightCm: 1, gaugeStitches: 20, gaugeRows: 20 })
    grid.cells[1] = { color: '#ff0000', opacity: 0.8 }
    grid.cells[2] = { color: '#00ff00', opacity: 0.5 }

    const resized = resizeColorworkGrid(grid, { chartWidthCm: 2, chartHeightCm: 1, gaugeStitches: 20, gaugeRows: 20 })

    expect(resized.grid.cells).toEqual([
      null, { color: '#ff0000', opacity: 0.8 }, null, null,
      { color: '#00ff00', opacity: 0.5 }, null, null, null,
    ])
    expect(resized.droppedCells).toBe(0)
  })

  it('counts colored cells that would be lost when reducing the grid', () => {
    const grid = createColorworkGrid({ chartWidthCm: 2, chartHeightCm: 2, gaugeStitches: 10, gaugeRows: 10 })
    grid.cells[0] = { color: '#ff0000', opacity: 1 }
    grid.cells[3] = { color: '#0000ff', opacity: 0.4 }

    const resized = resizeColorworkGrid(grid, { chartWidthCm: 1, chartHeightCm: 1, gaugeStitches: 10, gaugeRows: 10 })

    expect(resized.grid.cells).toEqual([{ color: '#ff0000', opacity: 1 }])
    expect(resized.droppedCells).toBe(1)
  })

  it('resizes the overlay from pixel drag deltas while preserving its aspect ratio', () => {
    const grid = createColorworkGrid(defaultColorworkSettings)
    const resized = resizeColorworkGridDisplay(grid, { width: 600, height: 800 }, { x: 80, y: 80 })

    expect(resized.displayWidth).toBeGreaterThan(grid.displayWidth)
    expect(resized.displayHeight).toBeGreaterThan(grid.displayHeight)
    expect(resized.displayWidth * 600 / (resized.displayHeight * 800)).toBeCloseTo(
      grid.displayWidth * 600 / (grid.displayHeight * 800),
    )
  })
})
