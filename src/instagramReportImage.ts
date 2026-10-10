import appIconUrl from './assets/yy-app-icon.png'
import { formatDate, formatNumber, t } from './locales'

export interface InstagramReportImageItem {
  id: string
  dataUrl: string
  label: string
  activityDate?: string
  final?: boolean
}

const WIDTH = 1080
const HEIGHT = 1350
const MARGIN = 58
const DARK = '#342b38'
const MUTED = '#827986'

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(t('이미지를 열 수 없습니다.')))
    image.src = src
  })
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath()
  context.roundRect(x, y, width, height, radius)
}

function drawCover(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number, radius: number) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight)
  const drawWidth = image.naturalWidth * scale
  const drawHeight = image.naturalHeight * scale
  context.save()
  roundedRect(context, x, y, width, height, radius)
  context.clip()
  context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight)
  context.restore()
}

export async function createInstagramReportImage(title: string, items: InstagramReportImageItem[]) {
  if (!items.length) throw new Error(t('합성할 사진을 선택해 주세요.'))
  if (items.length > 9) throw new Error(t('사진은 한 장에 최대 9개까지 담을 수 있습니다.'))
  const images = await Promise.all(items.map(async (item) => ({ item, image: await loadImage(item.dataUrl) })))
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const context = canvas.getContext('2d')
  if (!context) throw new Error(t('합성 이미지를 만들 수 없습니다.'))

  context.fillStyle = '#f7f4f0'
  context.fillRect(0, 0, WIDTH, HEIGHT)
  context.fillStyle = '#b39aa8'
  context.font = '600 20px sans-serif'
  context.fillText(t('뜨개 기록'), MARGIN, 57)
  context.fillStyle = DARK
  context.font = '700 43px sans-serif'
  context.fillText(title || t('뜨개 기록'), MARGIN, 116, WIDTH - MARGIN * 2)
  context.fillStyle = MUTED
  context.font = '22px sans-serif'
  context.fillText(t('한 코씩 완성해 가는 시간'), MARGIN, 156)

  const finalItem = images.find(({ item }) => item.final)
  const progress = images.filter(({ item }) => !item.final)
  const gap = 18
  const cardWidth = (WIDTH - MARGIN * 2 - gap * 2) / 3
  const cardHeight = 207
  const imageHeight = 138
  const top = 180
  progress.forEach(({ item, image }, index) => {
    const row = Math.floor(index / 3)
    const column = index % 3
    const x = MARGIN + column * (cardWidth + gap)
    const y = top + row * (cardHeight + gap)
    context.fillStyle = '#fff'
    roundedRect(context, x, y, cardWidth, cardHeight, 16)
    context.fill()
    drawCover(context, image, x + 8, y + 8, cardWidth - 16, imageHeight, 11)
    context.fillStyle = '#a48091'
    context.font = '600 17px sans-serif'
    context.fillText(item.activityDate ? formatActivityDate(item.activityDate) : t('작업 과정'), x + 15, y + 166, cardWidth - 30)
    context.fillStyle = DARK
    context.font = '500 19px sans-serif'
    context.fillText(item.label || t('진행 {count}', { count: formatNumber(index + 1) }), x + 15, y + 192, cardWidth - 30)
  })

  let finalY = top + (progress.length ? Math.ceil(progress.length / 3) * (cardHeight + gap) : 0)
  if (finalItem) {
    const finalHeight = Math.min(HEIGHT - MARGIN - finalY - 76, 310)
    if (finalHeight < 150) throw new Error(t('사진이 너무 많아 한 장에 배치할 수 없습니다. 사진을 줄여 주세요.'))
    context.fillStyle = '#fff'
    roundedRect(context, MARGIN, finalY, WIDTH - MARGIN * 2, finalHeight, 18)
    context.fill()
    drawCover(context, finalItem.image, MARGIN + 9, finalY + 9, WIDTH - MARGIN * 2 - 18, finalHeight - 58, 12)
    context.fillStyle = DARK
    context.font = '700 20px sans-serif'
    context.fillText(finalItem.item.label || t('완성'), MARGIN + 18, finalY + finalHeight - 18)
  }

  const icon = await loadImage(appIconUrl)
  context.save()
  context.globalAlpha = 0.27
  context.drawImage(icon, WIDTH - MARGIN - 50, HEIGHT - MARGIN - 50, 50, 50)
  context.restore()
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error(t('합성 이미지를 저장하지 못했습니다.'))), 'image/jpeg', 0.92))
}

function formatActivityDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return match ? formatDate(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : value
}
