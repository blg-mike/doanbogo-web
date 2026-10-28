export type PdfQrTile = { left: number; top: number; right: number; bottom: number }

export const PDF_QR_TILE_COLUMNS = 2
export const PDF_QR_TILE_ROWS = 3
export const PDF_QR_TILE_OVERLAP = 0.4
export const PDF_QR_TILE_AREA_FRACTION = 1 / (
  (PDF_QR_TILE_COLUMNS - PDF_QR_TILE_OVERLAP * (PDF_QR_TILE_COLUMNS - 1)) *
  (PDF_QR_TILE_ROWS - PDF_QR_TILE_OVERLAP * (PDF_QR_TILE_ROWS - 1))
)

export function getPdfQrTileBounds(width: number, height: number): PdfQrTile[] {
  const tileWidth = width / (PDF_QR_TILE_COLUMNS - PDF_QR_TILE_OVERLAP * (PDF_QR_TILE_COLUMNS - 1))
  const tileHeight = height / (PDF_QR_TILE_ROWS - PDF_QR_TILE_OVERLAP * (PDF_QR_TILE_ROWS - 1))
  const tiles: PdfQrTile[] = []

  for (let row = 0; row < PDF_QR_TILE_ROWS; row++) {
    const top = Math.round(row * tileHeight * (1 - PDF_QR_TILE_OVERLAP))
    for (let column = 0; column < PDF_QR_TILE_COLUMNS; column++) {
      const left = Math.round(column * tileWidth * (1 - PDF_QR_TILE_OVERLAP))
      tiles.push({
        left,
        top,
        right: column === PDF_QR_TILE_COLUMNS - 1 ? width : Math.min(width, Math.round(left + tileWidth)),
        bottom: row === PDF_QR_TILE_ROWS - 1 ? height : Math.min(height, Math.round(top + tileHeight)),
      })
    }
  }
  return tiles
}
