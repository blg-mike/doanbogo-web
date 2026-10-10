import { makeRasterPdf } from './charts'
import { formatDate, formatNumber, t, translateMessage } from './locales'
import type { LocaleKey } from './locales'
import type { KnittingReport, ReportAccessory, ReportMeasurement, ReportModification, ReportNeedle, ReportYarn } from './types'
import { formatWorkTime } from './workTime'

const PAGE_WIDTH = 1240
const PAGE_HEIGHT = 1754
const LEFT = 78
const RIGHT = PAGE_WIDTH - 78
const BOTTOM = PAGE_HEIGHT - 102

type Page = { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D; y: number }

function cleanFileName(value: string) {
  return value.trim().replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || t('뜨개보고서')
}

const translatedChoiceFields = new Set(['project.craft', 'project.status', 'finished.washed', 'review.difficulty', 'review.fit', 'review.satisfaction', 'review.yarnSatisfaction', 'review.patternSatisfaction', 'review.makeAgain'])
const numericReportFields = new Set(['usedSkeins', 'usedWeight', 'usedMeters', 'price', 'quantity', 'skeinWeight', 'skeinLength', 'gauge.patternStitches', 'gauge.patternRows', 'gauge.beforeStitches', 'gauge.beforeRows', 'gauge.afterStitches', 'gauge.afterRows'])

function formatNumericText(value?: string) {
  if (!value || !/^[+-]?\d+(?:[.,]\d+)?$/.test(value.trim())) return value ?? ''
  return formatNumber(Number(value.trim().replace(',', '.')))
}

function reportFieldValue(field: string, value?: string) {
  if (!value) return ''
  if (translatedChoiceFields.has(field)) return translateMessage(value)
  if (field === 'pattern.features') return value.split(',').map((item) => translateMessage(item.trim())).join(', ')
  if (numericReportFields.has(field)) return formatNumericText(value)
  return value
}

function formatActivityDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return match ? formatDate(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : value
}

function wrapText(context: CanvasRenderingContext2D, value: string, maxWidth: number) {
  const lines: string[] = []
  for (const paragraph of value.split('\n')) {
    if (!paragraph) { lines.push(''); continue }
    let line = ''
    for (const character of paragraph) {
      const candidate = line + character
      if (line && context.measureText(candidate).width > maxWidth) {
        lines.push(line)
        line = character
      } else line = candidate
    }
    if (line) lines.push(line)
  }
  return lines
}

async function loadPhoto(dataUrl: string) {
  if (!dataUrl) return null
  const image = new Image()
  image.src = dataUrl
  try { await image.decode(); return image }
  catch { return null }
}

function drawImageContain(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight)
  const drawWidth = image.naturalWidth * scale
  const drawHeight = image.naturalHeight * scale
  context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight)
}

export async function exportKnittingReportPdf(report: KnittingReport, totalWorkTimeMs = 0) {
  const pages: Page[] = []
  const title = report.fields['project.name']?.trim() || report.title || t('뜨개 프로젝트')
  const values = report.fields
  let page = {} as Page

  function makePage(first = false) {
    const canvas = document.createElement('canvas')
    canvas.width = PAGE_WIDTH
    canvas.height = PAGE_HEIGHT
    const context = canvas.getContext('2d')
    if (!context) throw new Error('PDF 페이지를 만들 수 없습니다.')
    context.fillStyle = '#fffdfa'
    context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT)
    context.fillStyle = '#8b8294'
    context.font = '600 20px "Noto Sans KR", "Noto Sans JP", "Yu Gothic", "Meiryo", Arial, sans-serif'
    context.fillText(t('도안보고  ·  뜨개보고서'), LEFT, 58)
    context.strokeStyle = '#e8e2e6'
    context.lineWidth = 2
    context.beginPath(); context.moveTo(LEFT, 78); context.lineTo(RIGHT, 78); context.stroke()
    page = { canvas, context, y: first ? 126 : 124 }
    pages.push(page)
    if (first) {
      context.fillStyle = '#34283b'
      context.font = '700 52px "Noto Sans KR", "Noto Sans JP", "Yu Gothic", "Meiryo", Arial, sans-serif'
      context.fillText(t('뜨개보고서'), LEFT, 145)
      context.fillStyle = '#958796'
      context.font = 'italic 24px Georgia, serif'
      context.fillText('Knitting Report', LEFT + 300, 142)
      context.fillStyle = '#4d4652'
      context.font = '700 34px "Noto Sans KR", sans-serif'
      context.fillText(title, LEFT, 202, 790)
      context.fillStyle = '#817887'
      context.font = '20px "Noto Sans KR", "Noto Sans JP", "Yu Gothic", "Meiryo", Arial, sans-serif'
      context.fillText(t('작성일  ') + formatDate(report.createdAt), RIGHT - 235, 202)
      page.y = 244
    } else {
      context.fillStyle = '#4d4652'
      context.font = '600 24px "Noto Sans KR", sans-serif'
      context.fillText(title, LEFT, 125, 850)
      page.y = 148
    }
    return page
  }

  makePage(true)

  function ensure(height: number) {
    if (page.y + height > BOTTOM) makePage()
  }

  function drawSection(number: string, name: LocaleKey) {
    ensure(74)
    page.context.fillStyle = '#f5e8ec'
    page.context.beginPath(); page.context.roundRect(LEFT, page.y, RIGHT - LEFT, 56, 13); page.context.fill()
    page.context.fillStyle = '#514454'
    page.context.font = '700 23px "Noto Sans KR", sans-serif'
    page.context.fillText(number, LEFT + 18, page.y + 37)
    page.context.font = '700 27px "Noto Sans KR", sans-serif'
    page.context.fillText(t(name), LEFT + 82, page.y + 37)
    page.y += 76
  }

  function drawPair(label: string, value?: string, indent = 0) {
    if (!value?.trim()) return
    page.context.font = '20px "Noto Sans KR", sans-serif'
    const lines = wrapText(page.context, value.trim(), RIGHT - LEFT - 316)
    for (let index = 0; index < lines.length; index++) {
      ensure(38)
      const currentY = page.y
      if (index === 0) {
        page.context.fillStyle = '#817887'
        page.context.font = '18px "Noto Sans KR", sans-serif'
        page.context.fillText(label, LEFT + indent, currentY + 25, 285)
      }
      page.context.fillStyle = '#322d38'
      page.context.font = '20px "Noto Sans KR", sans-serif'
      page.context.fillText(lines[index], LEFT + indent + 300, currentY + 25, RIGHT - LEFT - indent - 320)
      page.y += 36
    }
    page.context.strokeStyle = '#eee9eb'
    page.context.lineWidth = 1
    page.context.beginPath(); page.context.moveTo(LEFT + indent, page.y); page.context.lineTo(RIGHT, page.y); page.context.stroke()
    page.y += 5
  }

  function drawTableHeader(labels: string[]) {
    ensure(45)
    const widths = [260, 350, 350, RIGHT - LEFT - 960]
    page.context.fillStyle = '#f1ece9'
    page.context.fillRect(LEFT, page.y, RIGHT - LEFT, 42)
    let x = LEFT + 14
    labels.forEach((label, index) => {
      page.context.fillStyle = '#5f5660'
      page.context.font = '600 16px "Noto Sans KR", sans-serif'
      page.context.fillText(label, x, page.y + 27, widths[index] - 18)
      x += widths[index]
    })
    page.y += 42
  }

  function drawMeasurementRows(rows: ReportMeasurement[]) {
    drawTableHeader([t('항목'), t('도안'), t('완성'), ''])
    const widths = [260, 350, 350, RIGHT - LEFT - 960]
    for (const row of rows) {
      const formatMeasure = (value: string) => {
        const text = value.trim()
        if (!text || /(?:cm|inch|in)\s*$/i.test(text)) return text
        const numeric = /^[+-]?\d+(?:[.,]\d+)?$/.test(text) ? formatNumericText(text) : text
        return `${numeric} ${row.unit === 'inch' ? t('inch') : row.unit ?? 'cm'}`
      }
      const entries = [row.label, formatMeasure(row.pattern), formatMeasure(row.finished), '']
      const height = Math.max(46, ...entries.map((value, index) => {
        page.context.font = '18px "Noto Sans KR", sans-serif'
        return wrapText(page.context, value || '—', widths[index] - 24).length * 25 + 18
      }))
      if (page.y + height > BOTTOM) {
        makePage()
        drawTableHeader([t('항목'), t('도안'), t('완성'), ''])
      }
      let x = LEFT + 14
      entries.forEach((value, index) => {
        page.context.fillStyle = '#3e3742'
        page.context.font = '18px "Noto Sans KR", sans-serif'
        const lines = wrapText(page.context, value || '—', widths[index] - 24)
        lines.forEach((line, rowIndex) => page.context.fillText(line, x, page.y + 26 + rowIndex * 24, widths[index] - 24))
        x += widths[index]
      })
      page.context.strokeStyle = '#eae5e6'; page.context.strokeRect(LEFT, page.y, RIGHT - LEFT, height)
      page.y += height
    }
    page.y += 18
  }

  async function drawCard(titleText: string, photoData: string, entries: [string, string][]) {
    const filled = entries.filter((entry) => entry[1]?.trim())
    if (!filled.length && !photoData) return
    const image = await loadPhoto(photoData)
    ensure(image ? 210 : 58)
    page.context.fillStyle = '#39313f'
    page.context.font = '700 22px "Noto Sans KR", sans-serif'
    page.context.fillText(titleText, LEFT, page.y + 30)
    page.y += 43
    if (image) {
      page.context.fillStyle = '#f6f3f1'; page.context.beginPath(); page.context.roundRect(LEFT, page.y, 150, 150, 10); page.context.fill()
      drawImageContain(page.context, image, LEFT + 3, page.y + 3, 144, 144)
      page.y += 164
    }
    for (const [label, value] of filled) drawPair(t(label as LocaleKey), value)
    page.y += 14
  }

  function nonEmpty(entries: [string, string][]) { return entries.some(([, value]) => Boolean(value?.trim())) }

  const projectPairs: [string, string][] = [
    ['뜨개 종류', reportFieldValue('project.craft', values['project.craft'])], ['상태', reportFieldValue('project.status', values['project.status'])], ['CO (시작일)', values['project.co']],
    ['FO (완성일)', values['project.fo']], ['누적 작업시간', formatWorkTime(totalWorkTimeMs)], ['작업시간 메모', values['project.workTime']], ['만든 대상', values['project.recipient']], ['메모', values['project.memo']],
  ]
  if (nonEmpty(projectPairs) || report.representativePhoto || title) {
    drawSection('01', '프로젝트 정보')
    await drawCard(title, report.representativePhoto, projectPairs)
  }

  const patternPairs: [string, string][] = [
    ['도안명', values['pattern.name']], ['원작자 · 디자이너', values['pattern.designer']], ['도안 출처', values['pattern.source']],
    ['도안 구매처', values['pattern.seller']], ['도안 링크', values['pattern.link']], ['사용 언어', values['pattern.language']],
    ['원본 사이즈', values['pattern.originalSizes']], ['선택 사이즈', values['pattern.selectedSize']], ['디자인 특징', reportFieldValue('pattern.features', values['pattern.features'])], ['도안 메모', values['pattern.memo']],
  ]
  if (nonEmpty(patternPairs) || report.measurements.some((row) => row.pattern.trim())) {
    drawSection('02', '도안 정보')
    await drawCard(values['pattern.name'] || t('도안 정보'), '', patternPairs.filter(([label]) => label !== '도안명'))
    if (report.measurements.some((row) => row.pattern.trim())) drawMeasurementRows(report.measurements.filter((row) => row.label.trim() || row.pattern.trim()))
  }

  const yarnFields: [keyof ReportYarn, string][] = [
    ['brand', '브랜드'], ['product', '제품명'], ['colorName', '색상명'], ['colorNumber', '색상번호'], ['lot', 'Lot No.'], ['fiber', '성분'], ['country', '제조국'],
    ['weightClass', '두께'], ['recommendedNeedle', '권장 바늘'], ['skeinWeight', '한 타래 중량'], ['skeinLength', '한 타래 길이'], ['retailer', '구매처'],
    ['purchaseLink', '구매 링크'], ['price', '구매 가격'], ['quantity', '구매 수량'], ['usedSkeins', '사용 타래 수'], ['usedWeight', '사용 중량'], ['usedMeters', '사용 길이'], ['memo', '실 메모'], ['leftover', '남은 실'],
  ]
  const printableYarns = report.yarns.filter((yarn) => yarnFields.some(([key]) => String(yarn[key] ?? '').trim()) || yarn.photo)
  if (printableYarns.length) {
    drawSection('03', '사용한 실')
    for (const [index, yarn] of printableYarns.entries()) await drawCard(yarn.product || yarn.brand || t('실') + ' ' + formatNumber(index + 1), yarn.photo, yarnFields.map(([key, label]) => [label, reportFieldValue(key, String(yarn[key] ?? '')) ?? ''] as [string, string]))
  }

  const needleFields: [keyof ReportNeedle, string][] = [['section', '구간'], ['type', '바늘 종류'], ['size', '사이즈'], ['cableLength', '케이블 길이'], ['memo', '메모']]
  const printableNeedles = report.needles.filter((row) => needleFields.some(([key]) => row[key].trim()))
  const accessoryFields: [keyof ReportAccessory, string][] = [['type', '종류'], ['size', '크기'], ['quantity', '수량'], ['detail', '상세']]
  const printableAccessories = report.accessories.filter((row) => row.photo || accessoryFields.some(([key]) => row[key].trim()))
  if (printableNeedles.length || printableAccessories.length) {
    drawSection('04', '바늘 · 부자재')
    for (const [index, row] of printableNeedles.entries()) await drawCard(row.section || t('바늘') + ' ' + (index + 1), '', needleFields.map(([key, label]) => [label, row[key]]))
    for (const [index, row] of printableAccessories.entries()) await drawCard(row.type || t('부자재') + ' ' + (index + 1), row.photo, accessoryFields.map(([key, label]) => [label, row[key]]))
  }

  const gaugePairs: [string, string][] = [
    ['측정 기준', values['gauge.unit']], ['도안 게이지', [values['gauge.patternStitches'] && formatNumericText(values['gauge.patternStitches']) + t('코'), values['gauge.patternRows'] && formatNumericText(values['gauge.patternRows']) + t('단')].filter(Boolean).join(' × ')],
    ['세탁 전 게이지', [values['gauge.beforeStitches'] && formatNumericText(values['gauge.beforeStitches']) + t('코'), values['gauge.beforeRows'] && formatNumericText(values['gauge.beforeRows']) + t('단')].filter(Boolean).join(' × ')],
    ['세탁 후 게이지', [values['gauge.afterStitches'] && formatNumericText(values['gauge.afterStitches']) + t('코'), values['gauge.afterRows'] && formatNumericText(values['gauge.afterRows']) + t('단')].filter(Boolean).join(' × ')],
    ['손땀', values['gauge.tension'] ? t((['많이 널손', '널손', '보통', '쫀손', '많이 쫀손'][Number(values['gauge.tension']) - 1] ?? '보통') as LocaleKey) : ''], ['메모', values['gauge.memo']],
  ]
  if (nonEmpty(gaugePairs)) {
    drawSection('05', '게이지 · 손땀')
    await drawCard(t('게이지'), '', gaugePairs)
  }

  const completedMeasures = report.measurements.filter((row) => row.finished.trim())
  const modificationFields: [keyof ReportModification, string][] = [['section', '구간'], ['original', '원본(도안)'], ['changed', '변경 내용'], ['memo', '메모']]
  const printableMods = report.modifications.filter((row) => modificationFields.some(([key]) => row[key].trim()))
  if (completedMeasures.length || printableMods.length) {
    drawSection('06', '사이즈 · 변형')
    if (completedMeasures.length) drawMeasurementRows(completedMeasures)
    for (const [index, row] of printableMods.entries()) await drawCard(row.section || t('변형') + ' ' + (index + 1), '', modificationFields.map(([key, label]) => [label, row[key]]))
  }

  const processPhotos = report.workPhotos.slice().sort((left, right) => left.activityDate.localeCompare(right.activityDate) || left.uploadedAt - right.uploadedAt)
  if (processPhotos.length) {
    drawSection('07', '작업 과정 기록')
    for (let index = 0; index < processPhotos.length; index += 2) {
      ensure(350)
      const row = processPhotos.slice(index, index + 2)
      for (const [column, photo] of row.entries()) {
        const image = await loadPhoto(photo.dataUrl)
        const x = LEFT + column * 540
        page.context.fillStyle = '#fff'
        page.context.beginPath(); page.context.roundRect(x, page.y, 520, 310, 12); page.context.fill()
        page.context.strokeStyle = '#e8e2e6'; page.context.stroke()
        if (image) drawImageContain(page.context, image, x + 12, page.y + 12, 496, 254)
        page.context.fillStyle = '#554a58'; page.context.font = '18px "Noto Sans KR", sans-serif'
          page.context.fillText(`${formatActivityDate(photo.activityDate)} · ${photo.label || t('작업 기록')}`, x + 15, page.y + 292, 490)
      }
      page.y += 330
    }
  }

  const washPairs: [string, string][] = [
    ['세탁 여부', reportFieldValue('finished.washed', values['finished.washed'])], ['세탁 방법', values['finished.washingMethod']], ['블로킹 방법', values['finished.blockingMethod']],
    ['세탁 전 크기', values['finished.beforeSize']], ['세탁 후 크기', values['finished.afterSize']], ['세탁·블로킹 변화', values['finished.washMemo']],
    ['난이도', reportFieldValue('review.difficulty', values['review.difficulty'])], ['핏', reportFieldValue('review.fit', values['review.fit'])], ['전체 만족도', reportFieldValue('review.satisfaction', values['review.satisfaction'])],
    ['실 메모', values['private.yarnMemo']],
    ['실 만족도', reportFieldValue('review.yarnSatisfaction', values['review.yarnSatisfaction'])], ['도안 만족도', reportFieldValue('review.patternSatisfaction', values['review.patternSatisfaction'])], ['다시 뜰 의향', reportFieldValue('review.makeAgain', values['review.makeAgain'])],
    ['문제와 해결', values['review.problems']], ['다음에 바꾸고 싶은 점', values['review.nextChanges']], ['완성 메모', values['review.memo']],
  ]
  const printablePhotos = report.finishedPhotos.filter((photo) => photo.dataUrl)
  if (printablePhotos.length || nonEmpty(washPairs)) {
    drawSection('08', '완성 기록')
    if (printablePhotos.length) {
      for (let index = 0; index < printablePhotos.length; index += 2) {
        ensure(350)
        const row = printablePhotos.slice(index, index + 2)
        for (const [column, photo] of row.entries()) {
          const image = await loadPhoto(photo.dataUrl)
          const x = LEFT + column * 540
          page.context.fillStyle = '#fff'
          page.context.beginPath(); page.context.roundRect(x, page.y, 520, 310, 12); page.context.fill()
          page.context.strokeStyle = '#e8e2e6'; page.context.stroke()
          if (image) drawImageContain(page.context, image, x + 12, page.y + 12, 496, 254)
          page.context.fillStyle = '#554a58'; page.context.font = '18px "Noto Sans KR", sans-serif'
          page.context.fillText(photo.label || t('완성 사진'), x + 15, page.y + 292, 490)
        }
        page.y += 330
      }
    }
    if (nonEmpty(washPairs)) await drawCard(t('세탁 · 착용 후기'), '', washPairs)
  }

  if (pages.length === 1 && page.y < 450) {
    page.context.fillStyle = '#8a818d'; page.context.font = '20px "Noto Sans KR", sans-serif'
    page.context.fillText(t('작성한 보고서 내용이 없습니다.'), LEFT, page.y + 18)
  }

  const rasterPages = pages.map(({ canvas, context }, index) => {
    context.fillStyle = '#8b8294'; context.font = '16px "Noto Sans KR", sans-serif'
    context.textAlign = 'right'
    context.fillText(title, RIGHT, PAGE_HEIGHT - 53)
    context.fillText(`${formatNumber(index + 1)} / ${formatNumber(pages.length)}`, RIGHT, PAGE_HEIGHT - 28)
    context.textAlign = 'left'
    const data = canvas.toDataURL('image/jpeg', 0.92)
    const jpeg = Uint8Array.from(atob(data.slice(data.indexOf(',') + 1)), (character) => character.charCodeAt(0))
    return { jpeg, width: canvas.width, height: canvas.height }
  })
  const blob = makeRasterPdf(rasterPages)
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = cleanFileName(title) + '_' + t('뜨개보고서') + '.pdf'
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
