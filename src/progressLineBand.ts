const MIN_BAND_HEIGHT = 0.01
const MAX_BAND_HEIGHT = 0.3
const BAND_HEIGHT_STEP = 0.0075

export function stepFocusBandHeight(value: number, steps: number) {
  const next = Math.min(MAX_BAND_HEIGHT, Math.max(MIN_BAND_HEIGHT, value + steps * BAND_HEIGHT_STEP))
  return Math.round(next * 10000) / 10000
}

export function snapFocusBandHeight(value: number, origin: number) {
  if (value <= MIN_BAND_HEIGHT + BAND_HEIGHT_STEP / 2) return MIN_BAND_HEIGHT
  if (value >= MAX_BAND_HEIGHT - BAND_HEIGHT_STEP / 2) return MAX_BAND_HEIGHT
  return stepFocusBandHeight(origin, Math.round((value - origin) / BAND_HEIGHT_STEP))
}
