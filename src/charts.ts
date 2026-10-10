import type { ChartDocument, CrochetSymbolId } from './types'
import { formatNumber, t } from './locales'

export const defaultPalette = ['#e34b4b', '#f3b21a', '#79bb45', '#288ed4', '#694bc6', '#df72b2', '#9c694c', '#ffffff']

export const crochetSymbols: { id: CrochetSymbolId; name: string; short: string }[] = [
  { id: 'chain', name: '사슬뜨기', short: 'ch' },
  { id: 'slip', name: '빼뜨기', short: 'sl' },
  { id: 'single', name: '짧은뜨기', short: 'sc' },
  { id: 'half-double', name: '긴뜨기', short: 'hdc' },
  { id: 'double', name: '한길긴뜨기', short: 'dc' },
  { id: 'treble', name: '두길긴뜨기', short: 'tr' },
]

export function createKnittingChart(width: number, height: number, unit: 'in' | 'cm', gaugeStitches: number, gaugeRows: number): ChartDocument {
  const now = Date.now()
  return {
    id: crypto.randomUUID(), title: t('제목 없음'), craft: 'knitting', createdAt: now, updatedAt: now, lastOpenedAt: null,
    unit, width, height, gaugeStitches, gaugeRows, palette: [...defaultPalette],
    cells: Array.from({ length: width * height }, () => null), objects: [], layers: [],
  }
}

export function createCrochetChart(): ChartDocument {
  const now = Date.now()
  return {
    id: crypto.randomUUID(), title: t('제목 없음'), craft: 'crochet', createdAt: now, updatedAt: now, lastOpenedAt: null,
    unit: 'in', width: 20, height: 20, gaugeStitches: 18, gaugeRows: 24, palette: [...defaultPalette],
    cells: [], objects: [], layers: [{ id: crypto.randomUUID(), name: t('레이어 {count}', { count: formatNumber(1) }), visible: true, locked: false }],
  }
}

function symbolSvg(symbol: CrochetSymbolId) {
  if (symbol === 'chain') return '<ellipse cx="20" cy="29" rx="8" ry="13" fill="white" />'
  if (symbol === 'slip') return '<circle cx="20" cy="28" r="5" fill="currentColor" />'
  if (symbol === 'single') return '<path d="M11 20L29 38M29 20L11 38" />'
  if (symbol === 'half-double') return '<path d="M8 44H32M20 12V44M9 20H31" />'
  if (symbol === 'double') return '<path d="M8 44H32M20 12V44M9 20H31M16 29L23 26" />'
  return '<path d="M8 44H32M20 12V44M9 20H31M16 28L23 25M16 36L23 33" />'
}

function svgHeader(width: number, height: number, content: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#fff"/>${content}</svg>`
}

export function chartSvg(chart: ChartDocument) {
  if (chart.craft === 'knitting') {
    const size = Math.max(18, Math.min(36, 2500 / Math.max(chart.width, chart.height)))
    const pad = 28
    const gridWidth = chart.width * size
    const gridHeight = chart.height * size
    const cells = chart.cells.map((color, index) => {
      if (!color) return ''
      const x = index % chart.width
      const y = Math.floor(index / chart.width)
      return `<rect x="${pad + x * size}" y="${pad + y * size}" width="${size}" height="${size}" fill="${color}"/>`
    }).join('')
    const vertical = Array.from({ length: chart.width + 1 }, (_, i) => `<path d="M${pad + i * size} ${pad}V${pad + gridHeight}"/>`).join('')
    const horizontal = Array.from({ length: chart.height + 1 }, (_, i) => `<path d="M${pad} ${pad + i * size}H${pad + gridWidth}"/>`).join('')
    const colNums = Array.from({ length: chart.width }, (_, col) => `<text x="${pad + (col + .5) * size}" y="${pad - 8}" text-anchor="middle">${chart.width - col}</text>`).join('')
    const rowNums = Array.from({ length: chart.height }, (_, row) => `<text x="${pad - 7}" y="${pad + (row + .65) * size}" text-anchor="end">${chart.height - row}</text>`).join('')
    const labels = `<g fill="#667085" font-family="sans-serif" font-size="10">${colNums}${rowNums}</g>`
    const grid = `<g>${cells}<g fill="none" stroke="#c8cdd4" stroke-width=".7">${vertical}${horizontal}</g></g>`
    const usedColors = chart.palette.filter((color) => chart.cells.includes(color))
    const legendColumns = Math.max(1, Math.floor(gridWidth / 58))
    const legendRows = Math.ceil(usedColors.length / legendColumns)
    const legend = usedColors.map((color, index) => {
      const col = index % legendColumns
      const row = Math.floor(index / legendColumns)
      const x = pad + col * 58
      const y = pad + gridHeight + 10 + row * 15
      return `<rect x="${x}" y="${y}" width="10" height="10" rx="2" fill="${color}" stroke="#abb3bf" stroke-width=".5"/><text x="${x + 14}" y="${y + 8}" fill="#667085" font-family="sans-serif" font-size="9">${color.toUpperCase()}</text>`
    }).join('')
    const outputWidth = Math.max(gridWidth + pad * 2, Math.min(700, legendColumns * 58 + pad * 2))
    const outputHeight = pad + gridHeight + (legendRows ? 10 + legendRows * 15 : 0) + pad
    return svgHeader(outputWidth, outputHeight, grid + labels + legend)
  }

  const layers = new Map(chart.layers.map((layer, index) => [layer.id, { index, visible: layer.visible }]))
  const visibleObjects = chart.objects.filter((item) => layers.get(item.layerId)?.visible)
  const objects = visibleObjects.sort((a, b) => (layers.get(b.layerId)?.index ?? 0) - (layers.get(a.layerId)?.index ?? 0)).map((item) =>
    `<g transform="translate(${item.x} ${item.y}) rotate(${item.rotation}) scale(${item.scale})" color="${item.color}" fill="none" stroke="${item.color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><g transform="translate(-20 -25)">${symbolSvg(item.symbol)}</g></g>`,
  ).join('')
  const labels: Record<CrochetSymbolId, string> = { chain: 'CH  Chain', slip: 'SL  Slip stitch', single: 'X  Single crochet', 'half-double': 'T  Half double crochet', double: 'T/  Double crochet', treble: 'T//  Treble crochet' }
  const used = crochetSymbols.filter((item) => visibleObjects.some((object) => object.symbol === item.id))
  const legend = used.map((item, index) => `<text x="${18 + index * 160}" y="${824}" fill="#45546a" font-family="sans-serif" font-size="12">${labels[item.id]}</text>`).join('')
  return svgHeader(1000, used.length ? 840 : 800, objects + legend)
}

export async function exportChart(chart: ChartDocument, format: 'png' | 'pdf') {
  const svg = chartSvg(chart)
  const match = svg.match(/width="([\d.]+)" height="([\d.]+)"/)
  const sourceWidth = Number(match?.[1] ?? 1000)
  const sourceHeight = Number(match?.[2] ?? 800)
  const scale = Math.min(1, 2800 / sourceWidth, 2800 / sourceHeight)
  const width = Math.max(1, Math.round(sourceWidth * scale))
  const height = Math.max(1, Math.round(sourceHeight * scale))
  const image = new Image()
  image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('차트 이미지를 만들지 못했습니다.'))
  })
  const canvas = window.document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('이미지 내보내기를 시작하지 못했습니다.')
  context.fillStyle = '#fff'
  context.fillRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)

  let blob: Blob
  if (format === 'png') {
    blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PNG 파일을 만들지 못했습니다.')), 'image/png'))
  } else {
    const jpegUrl = canvas.toDataURL('image/jpeg', .94)
    const jpeg = Uint8Array.from(atob(jpegUrl.slice(jpegUrl.indexOf(',') + 1)), (char) => char.charCodeAt(0))
    blob = makeImagePdf(jpeg, width, height)
  }
  const url = URL.createObjectURL(blob)
  const anchor = window.document.createElement('a')
  anchor.href = url
  anchor.download = sanitizeFileName(chart.title) + '.' + format
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function sanitizeFileName(value: string) {
  const name = value.trim().replace(/[\\/:*?"<>|]/g, '_').slice(0, 80)
  return name || '차트'
}

function makeImagePdf(jpeg: Uint8Array, width: number, height: number) {
  return makeRasterPdf([{ jpeg, width, height }])
}

export function makeRasterPdf(pages: { jpeg: Uint8Array; width: number; height: number }[]) {
  const pageWidth = 595
  const pageHeight = 842
  const encoder = new TextEncoder()
  const parts: Uint8Array[] = []
  const offsets: number[] = [0]
  let length = 0
  const append = (part: Uint8Array) => { parts.push(part); length += part.length }
  const ascii = (value: string) => encoder.encode(value)
  append(ascii('%PDF-1.4\n'))
  const objects: (string | Uint8Array)[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [' + pages.map((_, index) => (3 + index * 3) + ' 0 R').join(' ') + '] /Count ' + pages.length + ' >>',
  ]
  pages.forEach((page, index) => {
    const pageId = 3 + index * 3
    const imageId = pageId + 1
    const contentId = pageId + 2
    const fit = Math.min(pageWidth / page.width, pageHeight / page.height)
    const drawWidth = page.width * fit
    const drawHeight = page.height * fit
    const x = (pageWidth - drawWidth) / 2
    const y = (pageHeight - drawHeight) / 2
    const commands = encoder.encode(`q\n${drawWidth.toFixed(3)} 0 0 ${drawHeight.toFixed(3)} ${x.toFixed(3)} ${y.toFixed(3)} cm\n/Im${index} Do\nQ\n`)
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im${index} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`)
    objects.push(new Uint8Array())
    objects.push(`<< /Length ${commands.length} >>\nstream\n${new TextDecoder().decode(commands)}endstream`)
  })
  for (let index = 0; index < objects.length; index++) {
    const objectId = index + 1
    offsets.push(length)
    append(ascii(`${objectId} 0 obj\n`))
    if (objectId >= 4 && (objectId - 4) % 3 === 0) {
      const pageIndex = (objectId - 4) / 3
      const page = pages[pageIndex]
      append(ascii(`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`))
      append(page.jpeg)
      append(ascii('\nendstream'))
    } else {
      const object = objects[index]
      append(typeof object === 'string' ? ascii(object) : object)
    }
    append(ascii('\nendobj\n'))
  }
  const xref = length
  append(ascii(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`))
  for (const offset of offsets.slice(1)) append(ascii(`${String(offset).padStart(10, '0')} 00000 n \n`))
  append(ascii(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`))
  const blobParts = parts.map((part) => part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength) as ArrayBuffer)
  return new Blob(blobParts, { type: 'application/pdf' })
}
