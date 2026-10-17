import { getLocaleMessageVariants, type LocaleKey } from './locales'
import type { ReportMeasurement } from './types'

export const measurementPresetKeys = ['가슴둘레', '총장', '어깨너비', '암홀', '팔길이', '목깊이'] as const satisfies readonly LocaleKey[]
export type MeasurementPresetKey = typeof measurementPresetKeys[number]
export type MeasurementEntryDraft = { label: string; finished: string; unit: 'cm' | 'inch' }
export const defaultSelectedMeasurementKeys = ['가슴둘레', '총장'] as const satisfies readonly MeasurementPresetKey[]

function presetLabels(key: MeasurementPresetKey) {
  const aliases: Partial<Record<MeasurementPresetKey, readonly LocaleKey[]>> = { '총장': ['총장', '기장'], '팔길이': ['팔길이', '소매길이'] }
  return new Set([key, ...(aliases[key] ?? [])].flatMap(getLocaleMessageVariants).map((label) => label.trim()))
}

export function findMeasurementPresetRow(measurements: ReportMeasurement[], key: MeasurementPresetKey) {
  const labels = presetLabels(key)
  return measurements.find((row) => labels.has(row.label.trim()))
}

export function isMeasurementPresetAdded(measurements: ReportMeasurement[], key: MeasurementPresetKey) {
  return Boolean(findMeasurementPresetRow(measurements, key))
}

export function createDefaultMeasurements(label: (key: MeasurementPresetKey) => string) {
  return defaultSelectedMeasurementKeys.map((key) => ({ id: crypto.randomUUID(), label: label(key), pattern: '', finished: '', unit: 'cm' as const }))
}

export function applyMeasurementSelection(existing: ReportMeasurement[], presets: MeasurementEntryDraft[], custom: MeasurementEntryDraft[]) {
  const selected = new Map<MeasurementPresetKey, MeasurementEntryDraft>()
  for (const entry of presets) {
    const key = measurementPresetKeys.find((candidate) => presetLabels(candidate).has(entry.label.trim()))
    if (key) selected.set(key, entry)
  }
  const presetRows = new Map<MeasurementPresetKey, ReportMeasurement | undefined>(measurementPresetKeys.map((key) => [key, findMeasurementPresetRow(existing, key)]))
  const retained = existing.flatMap((row) => {
    const key = measurementPresetKeys.find((candidate) => presetLabels(candidate).has(row.label.trim()))
    if (!key) return [row]
    const entry = selected.get(key)
    if (!entry) return []
    return row.id === presetRows.get(key)?.id ? [{ ...row, finished: entry.finished, unit: entry.unit }] : [row]
  })
  const additions = [...presets.filter((entry) => !measurementPresetKeys.some((key) => presetLabels(key).has(entry.label.trim()) && isMeasurementPresetAdded(existing, key))), ...custom].map((entry) => ({
    id: crypto.randomUUID(),
    label: entry.label.trim(),
    pattern: '',
    finished: entry.finished,
    unit: entry.unit,
  }))
  return [...retained, ...additions]
}
