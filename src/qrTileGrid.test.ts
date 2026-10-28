import jsQR from 'jsqr'
import { describe, expect, it } from 'vitest'
import { getPdfQrTileBounds } from './qrTileGrid'

const qrModules = [
  '11111110100110011010101111111', '10000010111000110101101000001', '10111010001001110010101011101',
  '10111010111100001011001011101', '10111010001011000010101011101', '10000010011100100111101000001',
  '11111110101010101010101111111', '00000000111001100000100000000', '10110111010111101011101001011',
  '00100101101010011011101110001', '10110110110000110100000000110', '11001001011011110010101110001',
  '00001011110110001011000001100', '11110001010011000011101000111', '00001011010100100111110100111',
  '10110001000001010110110010010', '11011110111100000111110111010', '01101001100011000000100101110',
  '10110011000110000010100010100', '00001000011100011111010110100', '01001110010111010000111111100',
  '00000000111101110100100011111', '11111110101001001011101011010', '10000010100100001100100011011',
  '10111010001100110000111110100', '10111010110001101101000011010', '10111010101011011001000100101',
  '10000010001010001000101111010', '11111110111011111101101000010',
]

function makeChartPage(width: number, height: number, moduleSize: number) {
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4
      const gridLine = x % 40 === 0 || y % 40 === 0
      pixels[offset] = gridLine ? 220 : 255
      pixels[offset + 1] = gridLine ? 220 : 255
      pixels[offset + 2] = gridLine ? 220 : 255
      pixels[offset + 3] = 255
    }
  }

  const symbolSize = (qrModules.length + 8) * moduleSize
  const symbolLeft = width / 2 - symbolSize / 2
  const symbolTop = Math.round(height * 0.6925 - symbolSize / 2)
  for (let y = 0; y < symbolSize; y++) {
    for (let x = 0; x < symbolSize; x++) {
      const moduleX = Math.floor(x / moduleSize) - 4
      const moduleY = Math.floor(y / moduleSize) - 4
      const black = moduleX >= 0 && moduleY >= 0 && moduleX < qrModules.length && moduleY < qrModules.length && qrModules[moduleY][moduleX] === '1'
      const color = black ? 0 : 255
      const offset = ((symbolTop + y) * width + symbolLeft + x) * 4
      pixels[offset] = color
      pixels[offset + 1] = color
      pixels[offset + 2] = color
      pixels[offset + 3] = 255
    }
  }
  return { pixels, symbol: { left: symbolLeft, top: symbolTop, right: symbolLeft + symbolSize, bottom: symbolTop + symbolSize } }
}

function makeTiles(width: number, height: number, overlap: number) {
  const tileWidth = width / (2 - overlap)
  const tileHeight = height / (3 - overlap * 2)
  return Array.from({ length: 3 }, (_, row) => Array.from({ length: 2 }, (_, column) => {
    const left = Math.round(column * tileWidth * (1 - overlap))
    const top = Math.round(row * tileHeight * (1 - overlap))
    return {
      left,
      top,
      right: column === 1 ? width : Math.round(left + tileWidth),
      bottom: row === 2 ? height : Math.round(top + tileHeight),
    }
  })).flat()
}

function decodeTile(pixels: Uint8ClampedArray, width: number, tile: { left: number; top: number; right: number; bottom: number }) {
  const tileWidth = tile.right - tile.left
  const tileHeight = tile.bottom - tile.top
  const cropped = new Uint8ClampedArray(tileWidth * tileHeight * 4)
  for (let row = 0; row < tileHeight; row++) {
    const start = ((tile.top + row) * width + tile.left) * 4
    cropped.set(pixels.subarray(start, start + tileWidth * 4), row * tileWidth * 4)
  }
  return jsQR(cropped, tileWidth, tileHeight, { inversionAttempts: 'dontInvert' })?.data
}

describe('PDF QR tile overlap', () => {
  it('keeps a synthetic QR crossing the 2×3 seams intact while chart lines surround it', () => {
    const width = 1600
    const height = 2400
    const { pixels, symbol } = makeChartPage(width, height, 8)
    const oldTiles = makeTiles(width, height, 0.2)
    const currentTiles = getPdfQrTileBounds(width, height)

    expect(oldTiles.some((tile) => tile.left <= symbol.left && tile.top <= symbol.top && tile.right >= symbol.right && tile.bottom >= symbol.bottom)).toBe(false)
    expect(currentTiles.some((tile) => tile.left <= symbol.left && tile.top <= symbol.top && tile.right >= symbol.right && tile.bottom >= symbol.bottom)).toBe(true)
    expect(currentTiles.map((tile) => decodeTile(pixels, width, tile))).toContain('https://example.com/q')
  })
})
