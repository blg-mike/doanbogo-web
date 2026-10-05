import type { KnittingReport } from './types'

function line(label: string, value?: string) {
  const text = value?.trim()
  return text ? `${label}: ${text}` : ''
}

export function buildInstagramCaption(report: KnittingReport) {
  const fields = report.fields
  const title = fields['project.name']?.trim() || report.title
  const parts = [
    title,
    [
      line('도안', fields['pattern.name']),
      line('디자이너', fields['pattern.designer']),
      line('뜨개', fields['project.craft']),
      line('작업 기간', [fields['project.co'], fields['project.fo']].filter(Boolean).join(' ~ ')),
    ].filter(Boolean).join('\n'),
    report.yarns.map((yarn) => line('사용 실', [yarn.brand, yarn.product, yarn.colorName, yarn.colorNumber].filter(Boolean).join(' · '))).filter(Boolean).join('\n'),
    report.modifications.map((item) => line(item.section || '변형', item.changed || item.memo)).filter(Boolean).join('\n'),
    report.workPhotos
      .slice()
      .sort((left, right) => left.activityDate.localeCompare(right.activityDate) || left.uploadedAt - right.uploadedAt)
      .map((photo) => `🧶 ${photo.activityDate}${photo.label.trim() ? ` · ${photo.label.trim()}` : ''}`)
      .join('\n'),
    fields['review.memo']?.trim(),
    fields['review.nextChanges']?.trim() ? `다음에는 ${fields['review.nextChanges'].trim()} 도전해보기` : '',
    '#뜨개기록 #뜨개완성',
  ].filter(Boolean)
  return parts.join('\n\n')
}
