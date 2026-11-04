import type { KnittingReport } from './types'
import { formatNumber, t, translateMessage } from './locales'
import { formatNeedleSize, getGaugeMeasurement, getGaugePer10Cm, getGaugeSamplePer10Cm, getGaugeSamples } from './reportFormatting'

export type InstagramCaptionField = 'pattern' | 'size' | 'yarn' | 'usage' | 'needles' | 'modifications' | 'oneLine' | 'gauge' | 'measurements' | 'fit' | 'yarnMemo'

export const recommendedCaptionFields: InstagramCaptionField[] = ['pattern', 'size', 'yarn', 'usage', 'needles', 'modifications', 'oneLine']
export const optionalCaptionFields: InstagramCaptionField[] = ['gauge', 'measurements', 'fit', 'yarnMemo']

function line(label: string, value?: string) {
  const text = value?.trim()
  return text ? `${label}\n${text}` : ''
}

function formatNumericText(value?: string) {
  if (!value || !/^[+-]?\d+(?:[.,]\d+)?$/.test(value.trim())) return value ?? ''
  return formatNumber(Number(value.trim().replace(',', '.')))
}

function modificationCaption(item: KnittingReport['modifications'][number]) {
  const details = [item.memo, item.changed].map((value) => value.trim()).filter(Boolean)
  const content = [item.section, ...(details.length ? details : [item.original])].map((value) => value.trim()).filter(Boolean)
  const uniqueContent = [...new Set(content)]
  return uniqueContent.length ? `- ${uniqueContent.join(' ')}` : ''
}

export function buildInstagramCaption(report: KnittingReport, selected: InstagramCaptionField[] = recommendedCaptionFields) {
  const fields = report.fields
  const include = new Set(selected)
  const title = fields['project.name']?.trim() || report.title
  const sections: string[] = [title]

  if (include.has('pattern')) {
    sections.push([
      line(t('도안'), fields['pattern.name']),
      line(t('디자이너'), fields['pattern.designer']),
    ].filter(Boolean).join('\n'))
  }
  if (include.has('size')) sections.push(line('Size', fields['pattern.selectedSize'] || fields['pattern.originalSizes']))
  if (include.has('yarn')) {
    sections.push(report.yarns.map((yarn) => line(t('Yarn'), [yarn.brand, yarn.product, yarn.colorName, yarn.colorNumber].filter(Boolean).join(' '))).filter(Boolean).join('\n'))
  }
  if (include.has('usage')) {
    sections.push(report.yarns.map((yarn) => {
      const amount = [yarn.usedSkeins && `${formatNumericText(yarn.usedSkeins)}${t('볼')}`, yarn.usedWeight && `${formatNumericText(yarn.usedWeight)}g`, yarn.usedMeters && `${formatNumericText(yarn.usedMeters)}m`].filter(Boolean).join(' · ')
      return amount ? `${t('사용량')}\n${amount}` : ''
    }).filter(Boolean).join('\n'))
  }
  if (include.has('needles')) {
    sections.push(line(t('Needles'), report.needles.map((needle) => [needle.section, needle.type, needle.brand, formatNeedleSize(needle)].filter(Boolean).join(' ')).filter(Boolean).join(' / ')))
  }
  if (include.has('modifications')) sections.push(line(t('Modifications'), report.modifications.map(modificationCaption).filter(Boolean).join('\n')))
  if (include.has('oneLine')) sections.push(fields['review.nextChanges']?.trim() ?? '')
  if (include.has('gauge')) {
    const sideText = (side: 'before' | 'after') => {
      const gauge = getGaugeMeasurement(fields, side)
      const counts = [gauge.stitches && `${formatNumericText(gauge.stitches)}${t('코')}`, gauge.rows && `${formatNumericText(gauge.rows)}${t('단')}`].filter(Boolean).join(' · ')
      const size = gauge.width || gauge.height ? `${formatNumericText(gauge.width) || '—'} × ${formatNumericText(gauge.height) || '—'} ${gauge.unit === 'inch' ? t('inch') : 'cm'}` : ''
      return [counts, size].filter(Boolean).join(' / ')
    }
    const formatGaugeCount = (value: number | null, unit: '코' | '단') => `${value === null ? '—' : formatNumber(value)}${t(unit)}`
    const summaryText = (side: 'before' | 'after') => {
      const gauge = getGaugePer10Cm(fields, side)
      return `${formatGaugeCount(gauge.stitches, '코')} · ${formatGaugeCount(gauge.rows, '단')} (10 × 10 cm)`
    }
    const additionalGaugeText = getGaugeSamples(fields).flatMap((sample, index) => (['before', 'after'] as const).flatMap((side) => {
      const measurement = sample[side]
      const counts = [measurement.stitches && `${formatNumericText(measurement.stitches)}${t('코')}`, measurement.rows && `${formatNumericText(measurement.rows)}${t('단')}`].filter(Boolean).join(' · ')
      const size = measurement.width || measurement.height ? `${formatNumericText(measurement.width) || '—'} × ${formatNumericText(measurement.height) || '—'} cm` : ''
      const value = [counts, size].filter(Boolean).join(' / ')
      const gaugeName = sample.pattern.trim() || t('게이지 {number}', { number: formatNumber(index + 2) })
      const sideName = t(side === 'before' ? '세탁 전' : '세탁 후')
      const summary = getGaugeSamplePer10Cm(sample, side)
      const result = `${formatGaugeCount(summary.stitches, '코')} · ${formatGaugeCount(summary.rows, '단')} (10 × 10 cm)`
      return [`${gaugeName} · ${sideName} · ${t('게이지 결과')}: ${result}`, value ? `${gaugeName} · ${sideName}: ${value}` : '']
    }))
    sections.push(line(t('Gauge'), [
      fields['gauge.pattern']?.trim() && `${t('무늬')}: ${fields['gauge.pattern'].trim()}`,
      `${t('세탁 전')} · 10 × 10 cm: ${summaryText('before')}`,
      `${t('세탁 후')} · 10 × 10 cm: ${summaryText('after')}`,
      sideText('before') && `${t('세탁 전')}: ${sideText('before')}`,
      sideText('after') && `${t('세탁 후')}: ${sideText('after')}`,
      ...additionalGaugeText,
    ].filter(Boolean).join('\n')))
  }
  if (include.has('measurements')) sections.push(line(t('Measurements'), report.measurements.map((row) => {
    const value = row.finished.trim()
    if (!value) return ''
    if (/(?:cm|inch|in)\s*$/i.test(value)) return `${row.label}: ${value}`
    const unit = row.unit === 'inch' ? t('inch') : 'cm'
    return `${row.label}: ${formatNumericText(value)} ${unit}`
  }).filter(Boolean).join('\n')))
  if (include.has('fit')) sections.push(line(t('Fit'), translateMessage(fields['review.fit'] ?? '')))
  if (include.has('yarnMemo')) {
    const notes = [fields['private.yarnMemo'], ...report.yarns.map((yarn) => yarn.memo)].filter((value): value is string => Boolean(value?.trim()))
    sections.push(line(t('Yarn note'), notes.join('\n')))
  }

  const hashtags = (include.has('pattern') ? [fields['pattern.name'], fields['pattern.designer']] : [])
    .map((value) => value?.replace(/[^\p{L}\p{N}_]/gu, ''))
    .filter((value): value is string => Boolean(value))
    .map((value) => '#' + value)
  hashtags.push('#' + t('뜨개기록'))
  hashtags.push('#니트피크', '#knitpeek')
  sections.push([...new Set(hashtags)].join(' '))
  return sections.filter((section) => section.trim()).join('\n\n')
}
