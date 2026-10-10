import type { KnittingReport } from './types'
import { formatNumber, t, translateMessage } from './locales'

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
    sections.push(line(t('Needles'), report.needles.map((needle) => [needle.section, needle.size && needle.size + (needle.size.toLowerCase().includes('mm') ? '' : 'mm')].filter(Boolean).join(' ')).filter(Boolean).join(' / ')))
  }
  if (include.has('modifications')) sections.push(line(t('Modifications'), report.modifications.map((item) => `- ${[item.section, item.changed || item.memo].filter(Boolean).join(' ')}`).filter((item) => item !== '- ').join('\n')))
  if (include.has('oneLine')) sections.push(fields['review.nextChanges']?.trim() ?? '')
  if (include.has('gauge')) sections.push(line(t('Gauge'), [fields['gauge.afterStitches'] && `${formatNumericText(fields['gauge.afterStitches'])}${t('코')}`, fields['gauge.afterRows'] && `${formatNumericText(fields['gauge.afterRows'])}${t('단')}`].filter(Boolean).join(' × ')))
  if (include.has('measurements')) sections.push(line(t('Measurements'), report.measurements.map((row) => row.finished.trim() ? `${row.label}: ${formatNumericText(row.finished)}` : '').filter(Boolean).join('\n')))
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
  sections.push([...new Set(hashtags)].join(' '))
  return sections.filter((section) => section.trim()).join('\n\n')
}
