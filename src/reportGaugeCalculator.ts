import type { GaugeSide } from './reportFormatting'
import { getGaugeSamples, withGaugeSamples } from './reportFormatting'

export type GaugeCalculatorInput = {
  stitches: number
  rows: number
  widthCm: number
  heightCm: number
}

export type GaugeCalculatorResult = {
  stitchesPer10Cm: number
  rowsPer10Cm: number
}

export type GaugeCalculatorTarget = {
  sampleIndex: number | null
  side: GaugeSide
}

function roundGauge(value: number) {
  if (!Number.isFinite(value) || value > Number.MAX_VALUE / 100) return null
  return Number((Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2))
}

export function calculateGaugePer10Cm({ stitches, rows, widthCm, heightCm }: GaugeCalculatorInput): GaugeCalculatorResult | null {
  if (!Number.isInteger(stitches) || stitches <= 0 || !Number.isInteger(rows) || rows <= 0) return null
  if (!Number.isFinite(widthCm) || widthCm <= 0 || !Number.isFinite(heightCm) || heightCm <= 0) return null

  const stitchesPer10Cm = roundGauge(stitches * 10 / widthCm)
  const rowsPer10Cm = roundGauge(rows * 10 / heightCm)
  if (stitchesPer10Cm === null || rowsPer10Cm === null) return null
  return { stitchesPer10Cm, rowsPer10Cm }
}

export function applyGaugeResultToFields(fields: Record<string, string>, target: GaugeCalculatorTarget, result: GaugeCalculatorResult) {
  if (target.sampleIndex !== null) {
    const samples = getGaugeSamples(fields)
    const sample = samples[target.sampleIndex]
    if (!sample) return fields
    samples[target.sampleIndex] = {
      ...sample,
      [target.side]: {
        stitches: String(result.stitchesPer10Cm),
        rows: String(result.rowsPer10Cm),
        width: '10',
        height: '10',
      },
    }
    return withGaugeSamples(fields, samples)
  }

  const side = target.side
  return {
    ...fields,
    [`gauge.${side}Stitches`]: String(result.stitchesPer10Cm),
    [`gauge.${side}Rows`]: String(result.rowsPer10Cm),
    [`gauge.${side}Width`]: '10',
    [`gauge.${side}Height`]: '10',
    [`gauge.${side}Unit`]: 'cm',
  }
}
