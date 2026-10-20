import type { ReportNeedle } from './types'

export type GaugeSide = 'before' | 'after'

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

export function formatNeedleSize(needle: Pick<ReportNeedle, 'size' | 'sizeUnit'>) {
  const size = needle.size.trim()
  if (!size || !needle.sizeUnit) return needle.size
  if (needle.sizeUnit === 'mm') return /mm\s*$/i.test(size) ? size : `${size} mm`
  const notation = needle.sizeUnit.toUpperCase()
  return new RegExp(`^${notation}\\s`, 'i').test(size) ? size : `${notation} ${size}`
}
