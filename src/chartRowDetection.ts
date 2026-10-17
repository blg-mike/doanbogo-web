export interface DetectedChartRow {
  x: number
  y: number
  width: number
  height: number
}

// shortcut: supports axis-aligned grids with vertical cell support, request manual correction for tilted or sparse charts.

function isDark(pixels: Uint8ClampedArray, offset: number) {
  return pixels[offset] * 0.299 + pixels[offset + 1] * 0.587 + pixels[offset + 2] * 0.114 < 175
}

function mergeNearby(values: number[], gap: number) {
  const merged: number[] = []
  for (const value of values) {
    if (!merged.length || value - merged[merged.length - 1] > gap) merged.push(value)
    else merged[merged.length - 1] = Math.round((merged[merged.length - 1] + value) / 2)
  }
  return merged
}

export function detectChartRows(pixels: Uint8ClampedArray, width: number, height: number): DetectedChartRow[] {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 24 || height < 16 || pixels.length < width * height * 4) return []
  const horizontalThreshold = Math.max(6, Math.floor(width * 0.15))
  const horizontalCounts = new Uint32Array(height)
  for (let y = 0; y < height; y += 1) {
    const offset = y * width * 4
    for (let x = 0; x < width; x += 1) if (isDark(pixels, offset + x * 4)) horizontalCounts[y] += 1
  }

  const rawLines: number[] = []
  let bandStart = -1
  for (let y = 0; y <= height; y += 1) {
    const qualifies = y < height && horizontalCounts[y] >= horizontalThreshold
    if (qualifies && bandStart < 0) bandStart = y
    if (!qualifies && bandStart >= 0) {
      const bandEnd = y - 1
      let strongest = bandStart
      for (let row = bandStart + 1; row <= bandEnd; row += 1) {
        if (horizontalCounts[row] > horizontalCounts[strongest]) strongest = row
      }
      rawLines.push(Math.round((bandStart + bandEnd) / 2) || strongest)
      bandStart = -1
    }
  }

  const lines = mergeNearby(rawLines, Math.max(2, Math.round(height * 0.003))).filter((y) => {
    let crossings = 0
    const probe = Math.max(3, Math.round(height * 0.01))
    for (let x = 1; x < width - 1; x += 1) {
      let support = 0
      for (let delta = 1; delta <= probe; delta += 1) {
        const before = y - delta
        const after = y + delta
        if (before >= 0 && isDark(pixels, (before * width + x) * 4)) support += 1
        if (after < height && isDark(pixels, (after * width + x) * 4)) support += 1
      }
      if (support >= 2) crossings += 1
    }
    return crossings >= 3
  })

  const rows: DetectedChartRow[] = []
  for (let index = 0; index + 1 < lines.length; index += 1) {
    const top = lines[index]
    const bottom = lines[index + 1]
    const intervalHeight = bottom - top
    if (intervalHeight < Math.max(4, height * 0.004)) continue
    const interiorTop = Math.min(bottom - 1, top + 1)
    const interiorBottom = Math.max(interiorTop + 1, bottom - 1)
    const interiorHeight = interiorBottom - interiorTop
    const threshold = Math.max(2, Math.ceil(interiorHeight * 0.55))
    let left = -1
    let right = -1
    for (let x = 0; x < width; x += 1) {
      let support = 0
      for (let y = interiorTop; y < interiorBottom; y += 1) {
        if (isDark(pixels, (y * width + x) * 4)) support += 1
      }
      if (support >= threshold) {
        if (left < 0) left = x
        right = x
      }
    }
    if (left < 0 || right - left < width * 0.08) continue
    rows.push({
      x: left / width,
      y: top / height,
      width: (right - left) / width,
      height: intervalHeight / height,
    })
  }
  return rows
}
