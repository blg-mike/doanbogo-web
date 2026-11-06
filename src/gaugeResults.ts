import type { GaugePer10Cm } from './reportFormatting'

export type PickUpRatio = { stitches: number; rows: number; approximate: boolean }

function gcd(a: number, b: number): number {
  while (b !== 0) [a, b] = [b, a % b]
  return Math.abs(a)
}

export function pickUpRatio(stitches: number | null, rows: number | null): PickUpRatio | null {
  if (stitches === null || rows === null || !Number.isFinite(stitches) || !Number.isFinite(rows) || stitches <= 0 || rows <= 0) return null
  const scaledStitches = Math.round(stitches * 100)
  const scaledRows = Math.round(rows * 100)
  const divisor = gcd(scaledStitches, scaledRows)
  const exact = { stitches: scaledStitches / divisor, rows: scaledRows / divisor }
  if (exact.rows <= 12) return { ...exact, approximate: false }
  let best = { stitches: Math.max(1, Math.round(stitches / rows)), rows: 1, error: Infinity }
  for (let denominator = 1; denominator <= 12; denominator++) {
    const numerator = Math.max(1, Math.round(stitches / rows * denominator))
    const error = Math.abs(numerator / denominator - stitches / rows)
    if (error < best.error) best = { stitches: numerator, rows: denominator, error }
  }
  return { stitches: best.stitches, rows: best.rows, approximate: best.error > 1e-8 }
}

export function stitchRowRatio(gauge: GaugePer10Cm): number | null {
  return gauge.stitches !== null && gauge.rows !== null && gauge.stitches > 0 ? gauge.rows / gauge.stitches : null
}

export function gaugeResult(gauge: GaugePer10Cm) {
  return { pickUp: pickUpRatio(gauge.stitches, gauge.rows), stitchRow: stitchRowRatio(gauge) }
}

export function gaugeWashChanges(before: GaugePer10Cm, after: GaugePer10Cm) {
  return { width: washChange(before.stitches, after.stitches), height: washChange(before.rows, after.rows) }
}

export function washChange(before: number | null, after: number | null): number | null {
  if (before === null || after === null || before <= 0 || after <= 0) return null
  return Math.round(((before / after - 1) * 100 + Number.EPSILON) * 10) / 10
}
