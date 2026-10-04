import type { ColorworkGrid, ColorworkSettings } from './types'

export const defaultColorworkSettings: ColorworkSettings = {
  chartWidthCm: 10,
  chartHeightCm: 10,
  gaugeStitches: 18,
  gaugeRows: 24,
}

export function getColorworkDimensions(settings: ColorworkSettings) {
  const { chartWidthCm, chartHeightCm, gaugeStitches, gaugeRows } = settings
  if (![chartWidthCm, chartHeightCm, gaugeStitches, gaugeRows].every(Number.isFinite) ||
    chartWidthCm < 1 || chartWidthCm > 200 || chartHeightCm < 1 || chartHeightCm > 200 ||
    !Number.isInteger(gaugeStitches) || gaugeStitches < 1 || gaugeStitches > 200 ||
    !Number.isInteger(gaugeRows) || gaugeRows < 1 || gaugeRows > 200) {
    throw new Error('차트 크기는 1~200cm, 게이지는 1~200 사이의 정수로 입력해 주세요.')
  }
  const columns = Math.max(1, Math.round(chartWidthCm * gaugeStitches / 10))
  const rows = Math.max(1, Math.round(chartHeightCm * gaugeRows / 10))
  if (columns > 200 || rows > 200) throw new Error('계산된 격자는 가로와 세로 각각 200칸 이하여야 합니다.')
  return {
    columns,
    rows,
    actualWidthCm: columns * 10 / gaugeStitches,
    actualHeightCm: rows * 10 / gaugeRows,
  }
}

export function createColorworkGrid(settings: ColorworkSettings): ColorworkGrid {
  const { columns, rows } = getColorworkDimensions(settings)
  return {
    ...settings,
    columns,
    rows,
    x: 0,
    y: 0,
    displayWidth: 0.6,
    displayHeight: 0.6,
    visible: true,
    cells: Array.from({ length: columns * rows }, () => null),
  }
}

export function resizeColorworkGrid(grid: ColorworkGrid, settings: ColorworkSettings) {
  const { columns, rows } = getColorworkDimensions(settings)
  const cells = Array.from({ length: columns * rows }, () => null as ColorworkGrid['cells'][number])
  let droppedCells = 0
  for (let row = 0; row < grid.rows; row++) {
    for (let column = 0; column < grid.columns; column++) {
      const cell = grid.cells[row * grid.columns + column] ?? null
      if (row < rows && column < columns) cells[row * columns + column] = cell
      else if (cell) droppedCells++
    }
  }
  return { grid: { ...grid, ...settings, columns, rows, cells }, droppedCells }
}

export function resizeColorworkGridDisplay(grid: ColorworkGrid, pageSize: { width: number; height: number }, delta: { x: number; y: number }) {
  const width = grid.displayWidth * pageSize.width
  const height = grid.displayHeight * pageSize.height
  const scaleDelta = (delta.x * width + delta.y * height) / (width * width + height * height)
  const minimumScale = Math.max(Math.min(120, pageSize.width) / width, Math.min(100, pageSize.height) / height)
  const maximumScale = Math.min((1 - grid.x) * pageSize.width / width, (1 - grid.y) * pageSize.height / height)
  const scale = Math.min(maximumScale, Math.max(Math.min(minimumScale, maximumScale), 1 + scaleDelta))
  return { ...grid, displayWidth: grid.displayWidth * scale, displayHeight: grid.displayHeight * scale }
}
