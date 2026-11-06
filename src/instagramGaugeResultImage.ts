import { formatNumber, t } from './locales'
import { getGaugePer10Cm, getGaugeSamplePer10Cm, getGaugeSamples } from './reportFormatting'
import { gaugeResult, gaugeWashChanges } from './gaugeResults'

const WIDTH = 1080
const HEIGHT = 1350
const MARGIN = 58
const CONTENT_WIDTH = WIDTH - MARGIN * 2
const CARD_HEIGHT = 268
const CARD_GAP = 14
const CARDS_PER_PAGE = 4

function makeGaugeRows(gauge: ReturnType<typeof getGaugePer10Cm>) {
  const result = gaugeResult(gauge)
  const pickUp = result.pickUp ? t('{rows}단당 {stitches}코', { rows: formatNumber(result.pickUp.rows), stitches: formatNumber(result.pickUp.stitches) }) : '—'
  return [
    [t('10cm당 코 수'), gauge.stitches === null ? '—' : `${formatNumber(gauge.stitches)} ${t('코')}`],
    [t('10cm당 단 수'), gauge.rows === null ? '—' : `${formatNumber(gauge.rows)} ${t('단')}`],
    [t('코 줍기 비율'), result.pickUp?.approximate ? t('약 {value}', { value: pickUp }) : pickUp],
    [t('코·단 비율'), result.stitchRow === null ? '—' : `1 : ${formatNumber(result.stitchRow, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
  ] as const
}

export async function createInstagramGaugeResultImages(title: string, fields: Record<string, string>) {
  const samples = getGaugeSamples(fields)
  const gauges = [{
    name: fields['gauge.pattern']?.trim() || t('기본 게이지'),
    before: getGaugePer10Cm(fields, 'before'),
    after: getGaugePer10Cm(fields, 'after'),
  }, ...samples.map((sample, index) => ({
    name: sample.pattern.trim() || t('게이지 {number}', { number: formatNumber(index + 2) }),
    before: getGaugeSamplePer10Cm(sample, 'before'),
    after: getGaugeSamplePer10Cm(sample, 'after'),
  }))]
  const pages: Blob[] = []
  for (let start = 0; start < gauges.length; start += CARDS_PER_PAGE) {
    const canvas = document.createElement('canvas')
    canvas.width = WIDTH
    canvas.height = HEIGHT
    const context = canvas.getContext('2d')
    if (!context) throw new Error(t('합성 이미지를 만들 수 없습니다.'))
    context.fillStyle = '#f7f4f0'
    context.fillRect(0, 0, WIDTH, HEIGHT)
    context.fillStyle = '#827986'
    context.font = '600 20px sans-serif'
    context.fillText(t('게이지 결과'), MARGIN, 56)
    context.fillStyle = '#342b38'
    context.font = '700 40px sans-serif'
    context.fillText(title || t('뜨개 기록'), MARGIN, 112, CONTENT_WIDTH)
    context.fillStyle = '#827986'
    context.font = '18px sans-serif'
    context.fillText(`${formatNumber(Math.floor(start / CARDS_PER_PAGE) + 1)} / ${formatNumber(Math.ceil(gauges.length / CARDS_PER_PAGE))}`, WIDTH - MARGIN - 70, 56)

    gauges.slice(start, start + CARDS_PER_PAGE).forEach((gauge, index) => {
      const x = MARGIN
      const y = 142 + index * (CARD_HEIGHT + CARD_GAP)
      const sideGap = 12
      const sideWidth = (CONTENT_WIDTH - sideGap) / 2
      context.fillStyle = '#fff'
      context.beginPath(); context.roundRect(x, y, CONTENT_WIDTH, CARD_HEIGHT, 16); context.fill()
      context.strokeStyle = '#e2e8f0'; context.lineWidth = 2; context.stroke()
      context.fillStyle = '#342b38'; context.font = '700 22px sans-serif'
      context.fillText(gauge.name, x + 18, y + 33, CONTENT_WIDTH - 36)
      for (const [sideIndex, [label, data]] of ([[t('세탁 전'), gauge.before], [t('세탁 후'), gauge.after]] as const).entries()) {
        const sideX = x + sideIndex * (sideWidth + sideGap)
        const sideY = y + 48
        context.fillStyle = sideIndex === 0 ? '#f1f3f5' : '#e8f6f0'
        context.beginPath(); context.roundRect(sideX, sideY, sideWidth, 154, 11); context.fill()
        context.fillStyle = sideIndex === 0 ? '#56616f' : '#007750'; context.font = '700 18px sans-serif'
        context.fillText(label, sideX + 12, sideY + 25)
        makeGaugeRows(data).forEach(([metricLabel, value], rowIndex) => {
          const rowY = sideY + 48 + rowIndex * 25
          context.strokeStyle = '#e2e8f0'; context.lineWidth = 1
          context.beginPath(); context.moveTo(sideX + 12, rowY - 5); context.lineTo(sideX + sideWidth - 12, rowY - 5); context.stroke()
          context.fillStyle = '#56616f'; context.font = '14px sans-serif'
          context.fillText(metricLabel, sideX + 12, rowY + 12, sideWidth * 0.56)
          context.fillStyle = '#00865d'; context.font = '700 16px sans-serif'
          context.textAlign = 'right'
          context.fillText(value, sideX + sideWidth - 12, rowY + 12, sideWidth * 0.4)
          context.textAlign = 'left'
        })
      }
      const changes = gaugeWashChanges(gauge.before, gauge.after)
      const changeParts: string[] = []
      if (changes.width !== null) changeParts.push(`${t('가로')} ${formatNumber(Math.abs(changes.width), { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% ${t(changes.width < 0 ? '수축' : changes.width > 0 ? '늘어남' : '변화 없음')}`)
      if (changes.height !== null) changeParts.push(`${t('세로')} ${formatNumber(Math.abs(changes.height), { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% ${t(changes.height < 0 ? '수축' : changes.height > 0 ? '늘어남' : '변화 없음')}`)
      if (changeParts.length) {
        context.fillStyle = '#e8f6f0'
        context.beginPath(); context.roundRect(x, y + 208, CONTENT_WIDTH, 50, 8); context.fill()
        context.fillStyle = '#007750'; context.font = '600 14px sans-serif'
        context.fillText(`${t('세탁 후 변화')}  ${changeParts.join('  ·  ')}`, x + 12, y + 227, CONTENT_WIDTH - 24)
        context.fillStyle = '#56616f'; context.font = '11px sans-serif'
        context.fillText(t('수축률은 게이지 변화 기준의 환산값입니다.'), x + 12, y + 246, CONTENT_WIDTH - 24)
      }
    })
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error(t('합성 이미지를 저장하지 못했습니다.'))), 'image/jpeg', 0.92))
    pages.push(blob)
  }
  return pages
}
