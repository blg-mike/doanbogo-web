import type { ReportNeedle } from './types'

export type GaugeSide = 'before' | 'after'

export type GaugeSampleMeasurement = {
  stitches: string
  rows: string
  width: string
  height: string
}

export type GaugeSample = Record<GaugeSide, GaugeSampleMeasurement>

const gaugeSampleSides: GaugeSide[] = ['before', 'after']
const gaugeSampleValues: (keyof GaugeSampleMeasurement)[] = ['stitches', 'rows', 'width', 'height']

export function getGaugeMeasurement(fields: Record<string, string>, side: GaugeSide) {
  const legacyInches = fields['gauge.unit'] === '4in'
  const savedUnit = fields[`gauge.${side}Unit`]
  return {
    stitches: fields[`gauge.${side}Stitches`] ?? '',
    rows: fields[`gauge.${side}Rows`] ?? '',
    width: fields[`gauge.${side}Width`] ?? (legacyInches ? '4' : '10'),
    height: fields[`gauge.${side}Height`] ?? (legacyInches ? '4' : '10'),
    unit: savedUnit === 'cm' || savedUnit === 'inch' ? savedUnit : legacyInches ? 'inch' : 'cm',
  }
}

export function getGaugeSamples(fields: Record<string, string>): GaugeSample[] {
  const serialized = fields['gauge.samples']
  if (!serialized) return []
  try {
    const parsed: unknown = JSON.parse(serialized)
    if (!Array.isArray(parsed)) return []
    return parsed.slice(0, 50).filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null).map((entry) => {
      const sample = {} as GaugeSample
      for (const side of gaugeSampleSides) {
        const values = entry[side]
        const measurement = typeof values === 'object' && values !== null ? values as Record<string, unknown> : {}
        sample[side] = Object.fromEntries(gaugeSampleValues.map((key) => [key, typeof measurement[key] === 'string' ? measurement[key] : ''])) as GaugeSampleMeasurement
      }
      return sample
    })
  } catch {
    return []
  }
}

export function createGaugeSample(): GaugeSample {
  const emptyMeasurement = () => ({ stitches: '', rows: '', width: '', height: '' })
  return { before: emptyMeasurement(), after: emptyMeasurement() }
}

export function withGaugeSamples(fields: Record<string, string>, samples: GaugeSample[]) {
  return { ...fields, 'gauge.samples': JSON.stringify(samples) }
}

export function getGaugePer10Cm(fields: Record<string, string>, side: GaugeSide) {
  const gauge = getGaugeMeasurement(fields, side)
  const stitches = Number(gauge.stitches)
  const rows = Number(gauge.rows)
  const width = Number(gauge.width) * (gauge.unit === 'inch' ? 2.54 : 1)
  const height = Number(gauge.height) * (gauge.unit === 'inch' ? 2.54 : 1)
  const round = (value: number) => Number((Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2))
  return {
    stitches: Number.isFinite(stitches) && stitches > 0 && Number.isFinite(width) && width > 0 ? round(stitches * 10 / width) : 0,
    rows: Number.isFinite(rows) && rows > 0 && Number.isFinite(height) && height > 0 ? round(rows * 10 / height) : 0,
  }
}

export function formatNeedleSize(needle: Pick<ReportNeedle, 'size' | 'sizeUnit'>) {
  const size = needle.size.trim()
  if (!size || !needle.sizeUnit) return needle.size
  if (needle.sizeUnit === 'mm') return /mm\s*$/i.test(size) ? size : `${size} mm`
  const notation = needle.sizeUnit.toUpperCase()
  return new RegExp(`^${notation}\\s`, 'i').test(size) ? size : `${notation} ${size}`
}
