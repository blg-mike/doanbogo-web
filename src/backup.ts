import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import type { AnnotationRecord, ChartDocument, ColorworkGrid, CounterTimeLap, DocumentRecord, HomeProject, KnittingReport, PageRecord, PageWorkRecord, PhotoPageRecord, PreferenceRecord, RegionHighlight, ReportTimelinePhoto, ViewerSnapshot } from './types'
import { normalizePageWork, readWorkspaceData, type WorkspaceData } from './storage'
import { createDefaultCounters, isCurrentCounterSnapshots, isLegacyCounterSnapshots, normalizeCounterSnapshots, normalizeCounterTimeLaps, MAX_COUNTER_HISTORY } from './smartCounter'

interface BackupDocument extends Omit<DocumentRecord, 'pdf' | 'cover'> {
  pdfPath: string | null
  coverPath: string | null
}

interface BackupPhotoPage extends Omit<PhotoPageRecord, 'blob'> {
  path: string
}

type BackupHomeProject = Omit<HomeProject, 'cover'>

interface BackupManifest {
  format: 'doanbogo'
  version: 14
  exportedAt: number
  documents: BackupDocument[]
  pages: PageRecord[]
  viewers: ViewerSnapshot[]
  preferences: PreferenceRecord[]
  pageWork: PageWorkRecord[]
  charts: ChartDocument[]
  knittingReports: KnittingReport[]
  photoPages: BackupPhotoPage[]
  homeProjects: BackupHomeProject[]
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isThumbnailGroups(value: unknown, pageCount: number) {
  if (!Array.isArray(value)) return false
  const ids = new Set<string>()
  const pages = new Set<number>()
  return value.every((group) => {
    if (!isObject(group) || typeof group.id !== 'string' || !group.id || group.id.length > 128 || ids.has(group.id) ||
      typeof group.name !== 'string' || group.name.length > 100 || !Array.isArray(group.pageNumbers)) return false
    ids.add(group.id)
    return group.pageNumbers.every((page) => {
      if (!Number.isSafeInteger(page) || (page as number) < 1 || (page as number) > pageCount || pages.has(page as number)) return false
      pages.add(page as number)
      return true
    })
  })
}

function isPaneRotations(value: unknown, pageCount: number) {
  return value === undefined || isObject(value) && Object.entries(value).every(([page, rotation]) => {
    const pageNumber = Number(page)
    return Number.isSafeInteger(pageNumber) && pageNumber >= 1 && pageNumber <= pageCount && [0, 90, 180, 270].includes(rotation as number)
  })
}

function isAnnotationStyle(value: unknown): value is AnnotationRecord['style'] {
  return isObject(value) && typeof value.color === 'string' && value.color.length <= 64 &&
    Number.isFinite(value.thickness) && (value.thickness as number) >= 1 && (value.thickness as number) <= 24 &&
    Number.isFinite(value.opacity) && (value.opacity as number) >= 0 && (value.opacity as number) <= 1 &&
    Number.isFinite(value.fontSize) && (value.fontSize as number) >= 10 && (value.fontSize as number) <= 48
}

function isProgressSettings(value: unknown) {
  if (!isObject(value)) return false
  return (['horizontal', 'vertical'] as const).every((axis) => {
    const line = value[axis]
    return isObject(line) && typeof line.visible === 'boolean' && typeof line.color === 'string' && line.color.length <= 64 &&
      Number.isFinite(line.thickness) && (line.thickness as number) >= 1 && (line.thickness as number) <= 12 &&
      Number.isFinite(line.opacity) && (line.opacity as number) >= 0 && (line.opacity as number) <= 1
  })
}

function isGuideArray(value: unknown) {
  return Array.isArray(value) && value.length <= 10 && value.every((guide) => isObject(guide) &&
    typeof guide.id === 'string' && guide.id.length > 0 && guide.id.length <= 64 &&
    Number.isFinite(guide.position) && (guide.position as number) >= 0 && (guide.position as number) <= 1 &&
    (guide.role === undefined || guide.role === 'primary' || guide.role === 'reference') &&
    (guide.xStartRatio === undefined || Number.isFinite(guide.xStartRatio) && (guide.xStartRatio as number) >= 0 && (guide.xStartRatio as number) < 1) &&
    (guide.xEndRatio === undefined || Number.isFinite(guide.xEndRatio) && (guide.xEndRatio as number) > 0 && (guide.xEndRatio as number) <= 1) &&
    (guide.xStartRatio === undefined || guide.xEndRatio === undefined || (guide.xStartRatio as number) < (guide.xEndRatio as number)) &&
    (guide.markerProgress === undefined || Number.isFinite(guide.markerProgress) && (guide.markerProgress as number) >= 0 && (guide.markerProgress as number) <= 1) &&
    (guide.opacity === undefined || Number.isFinite(guide.opacity) && (guide.opacity as number) >= 0.3 && (guide.opacity as number) <= 1) &&
    (guide.thickness === undefined || Number.isFinite(guide.thickness) && (guide.thickness as number) >= 1 && (guide.thickness as number) <= 36) &&
    (guide.rowSpacing === undefined || Number.isFinite(guide.rowSpacing) && (guide.rowSpacing as number) > 0 && (guide.rowSpacing as number) <= 1) &&
    (guide.rowSpacingStartRow === undefined || Number.isSafeInteger(guide.rowSpacingStartRow) && (guide.rowSpacingStartRow as number) >= 1 && (guide.rowSpacingStartRow as number) <= 9999) &&
    (guide.rowSpacingDirection === undefined || guide.rowSpacingDirection === 'up' || guide.rowSpacingDirection === 'down') &&
    (guide.counterRowOffset === undefined || Number.isSafeInteger(guide.counterRowOffset) && Math.abs(guide.counterRowOffset as number) <= 9999) &&
    (guide.positionOffset === undefined || Number.isFinite(guide.positionOffset) && Math.abs(guide.positionOffset as number) <= 1) &&
    (guide.rotationPositions === undefined || isObject(guide.rotationPositions) && Object.entries(guide.rotationPositions).every(([rotation, value]) => {
      if (!['0', '90', '180', '270'].includes(rotation) || !isObject(value)) return false
      return Number.isFinite(value.position) && Number(value.position) >= 0 && Number(value.position) <= 1 &&
        Number.isFinite(value.xStartRatio) && Number(value.xStartRatio) >= 0 && Number(value.xStartRatio) < 1 &&
        Number.isFinite(value.xEndRatio) && Number(value.xEndRatio) > 0 && Number(value.xEndRatio) <= 1 && Number(value.xStartRatio) < Number(value.xEndRatio) &&
        (value.rowSpacing === undefined || Number.isFinite(value.rowSpacing) && Number(value.rowSpacing) > 0 && Number(value.rowSpacing) <= 1) &&
        (value.rowSpacingStartRow === undefined || Number.isSafeInteger(value.rowSpacingStartRow) && Number(value.rowSpacingStartRow) >= 1 && Number(value.rowSpacingStartRow) <= 9999) &&
        (value.positionOffset === undefined || Number.isFinite(value.positionOffset) && Math.abs(Number(value.positionOffset)) <= 1) &&
        (value.rowSpacingDirection === undefined || value.rowSpacingDirection === 'up' || value.rowSpacingDirection === 'down')
    })) &&
    (guide.name === undefined || typeof guide.name === 'string' && guide.name.length <= 100) &&
    (guide.color === undefined || typeof guide.color === 'string' && /^#[\da-f]{6}$/i.test(guide.color)) &&
    (guide.linkedCounterId === undefined || typeof guide.linkedCounterId === 'string' && guide.linkedCounterId.length <= 100) &&
    (guide.chartRegion === undefined || isObject(guide.chartRegion) && Number.isFinite(guide.chartRegion.x) && Number(guide.chartRegion.x) >= 0 && Number(guide.chartRegion.x) <= 1 &&
      Number.isFinite(guide.chartRegion.y) && Number(guide.chartRegion.y) >= 0 && Number(guide.chartRegion.y) <= 1 && Number.isFinite(guide.chartRegion.width) && Number(guide.chartRegion.width) > 0 && Number(guide.chartRegion.width) <= 1 &&
      Number.isFinite(guide.chartRegion.height) && Number(guide.chartRegion.height) > 0 && Number(guide.chartRegion.height) <= 1 && Number(guide.chartRegion.x) + Number(guide.chartRegion.width) <= 1.000001 &&
      Number(guide.chartRegion.y) + Number(guide.chartRegion.height) <= 1.000001 && Number.isSafeInteger(guide.chartRegion.firstRow) && Number(guide.chartRegion.firstRow) >= 1 &&
      Number.isSafeInteger(guide.chartRegion.lastRow) && Number(guide.chartRegion.lastRow) >= Number(guide.chartRegion.firstRow) && Number(guide.chartRegion.lastRow) <= 9999 &&
      Number.isSafeInteger(guide.chartRegion.startCounterRow) && Number(guide.chartRegion.startCounterRow) >= 1 && typeof guide.chartRegion.repeat === 'boolean' &&
      ['top-to-bottom', 'bottom-to-top'].includes(String(guide.chartRegion.direction)) &&
      (guide.chartRegion.rowLayout === undefined || isObject(guide.chartRegion.rowLayout) && Number.isFinite(guide.chartRegion.rowLayout.top) && Number(guide.chartRegion.rowLayout.top) >= 0 && Number(guide.chartRegion.rowLayout.top) <= 1 && Number.isFinite(guide.chartRegion.rowLayout.height) && Number(guide.chartRegion.rowLayout.height) > 0 && Number(guide.chartRegion.rowLayout.height) <= 1 && Number(guide.chartRegion.rowLayout.top) + Number(guide.chartRegion.rowLayout.height) <= 1.000001) &&
      (guide.chartRegion.rowPositions === undefined || Array.isArray(guide.chartRegion.rowPositions) && guide.chartRegion.rowPositions.length === Number(guide.chartRegion.lastRow) - Number(guide.chartRegion.firstRow) + 1 && guide.chartRegion.rowPositions.every((position) => Number.isFinite(position) && Number(position) >= 0 && Number(position) <= 1))) &&
    (guide.focus === undefined || isObject(guide.focus) && typeof guide.focus.enabled === 'boolean' && ['low', 'medium', 'high'].includes(String(guide.focus.strength)) &&
      [0, 1, 2].includes(guide.focus.range as number) && ['page', 'region'].includes(String(guide.focus.scope)) && Number.isFinite(guide.focus.rowSpacing) && Number(guide.focus.rowSpacing) > 0 && Number(guide.focus.rowSpacing) <= 1 &&
      (guide.focus.dimOpacity === undefined || Number.isFinite(guide.focus.dimOpacity) && Number(guide.focus.dimOpacity) >= 0 && Number(guide.focus.dimOpacity) <= 0.8) &&
      (guide.focus.bandHeightRatio === undefined || Number.isFinite(guide.focus.bandHeightRatio) && Number(guide.focus.bandHeightRatio) >= 0.01 && Number(guide.focus.bandHeightRatio) <= 0.3)))
}

function isCounterHistory(value: unknown) {
  return Array.isArray(value) && value.length <= MAX_COUNTER_HISTORY && value.every((entry) => isObject(entry) && typeof entry.id === 'string' && entry.id.length <= 100 &&
    typeof entry.label === 'string' && entry.label.length <= 200 && Number.isFinite(entry.savedAt) && Number.isSafeInteger(entry.actualRow) && Number(entry.actualRow) >= 0 &&
    (entry.baseCounterId === undefined || typeof entry.baseCounterId === 'string' && entry.baseCounterId.length <= 100) &&
    (entry.timeLapId === undefined || typeof entry.timeLapId === 'string' && entry.timeLapId.length <= 100) &&
    isCurrentCounterSnapshots(entry.counters) && Array.isArray(entry.guides) && entry.guides.length <= 1000 && entry.guides.every((item) => isObject(item) && Number.isSafeInteger(item.pageNumber) &&
      Number(item.pageNumber) >= 1 && isGuideArray(item.horizontalGuides) && isGuideArray(item.verticalGuides)))
}

function isCounterTimeLaps(value: unknown): value is CounterTimeLap[] {
  if (!Array.isArray(value)) return false
  const ids = new Set<string>()
  return value.every((entry) => isObject(entry) && typeof entry.id === 'string' && entry.id.length > 0 && entry.id.length <= 100 && !ids.has(entry.id) &&
    typeof entry.counterId === 'string' && entry.counterId.length > 0 && entry.counterId.length <= 100 &&
    typeof entry.sessionId === 'string' && entry.sessionId.length > 0 && entry.sessionId.length <= 100 &&
    typeof entry.historyEntryId === 'string' && entry.historyEntryId.length > 0 && entry.historyEntryId.length <= 100 &&
    Number.isSafeInteger(entry.elapsedMs) && (entry.elapsedMs as number) >= 0 && Number.isSafeInteger(entry.durationMs) && (entry.durationMs as number) >= 0 &&
    (entry.durationMs as number) <= (entry.elapsedMs as number) && (entry.rowDelta === -1 || entry.rowDelta === 1) &&
    Number.isSafeInteger(entry.recordedAt) && (entry.recordedAt as number) >= 0 && Boolean(ids.add(entry.id)))
}

function isLegacyRectangleArray(value: unknown) {
  return Array.isArray(value) && value.length <= 50 && value.every((rectangle) => isObject(rectangle) &&
    typeof rectangle.id === 'string' && rectangle.id.length > 0 && rectangle.id.length <= 64 &&
    Number.isFinite(rectangle.x) && (rectangle.x as number) >= 0 && (rectangle.x as number) <= 1 &&
    Number.isFinite(rectangle.y) && (rectangle.y as number) >= 0 && (rectangle.y as number) <= 1 &&
    Number.isFinite(rectangle.width) && (rectangle.width as number) > 0 && (rectangle.width as number) <= 1 &&
    Number.isFinite(rectangle.height) && (rectangle.height as number) > 0 && (rectangle.height as number) <= 1 &&
    (rectangle.x as number) + (rectangle.width as number) <= 1.000001 &&
    (rectangle.y as number) + (rectangle.height as number) <= 1.000001 &&
    typeof rectangle.color === 'string' && /^#[\da-f]{6}$/i.test(rectangle.color) &&
    Number.isFinite(rectangle.opacity) && (rectangle.opacity as number) >= 0 && (rectangle.opacity as number) <= 1)
}

function isRegionHighlightArray(value: unknown) {
  if (!Array.isArray(value) || value.length > 1000) return false
  const ids = new Set<string>()
  return value.every((region) => {
    if (!isObject(region) || typeof region.id !== 'string' || !region.id.length || region.id.length > 64 || ids.has(region.id) ||
      !Number.isFinite(region.x) || (region.x as number) < 0 || (region.x as number) > 1 ||
      !Number.isFinite(region.y) || (region.y as number) < 0 || (region.y as number) > 1 ||
      !Number.isFinite(region.width) || (region.width as number) <= 0 || (region.width as number) > 1 ||
      !Number.isFinite(region.height) || (region.height as number) <= 0 || (region.height as number) > 1 ||
      (region.x as number) + (region.width as number) > 1.000001 ||
      (region.y as number) + (region.height as number) > 1.000001 ||
      typeof region.color !== 'string' || !/^#[\da-f]{6}$/i.test(region.color) ||
      !Number.isFinite(region.opacity) || (region.opacity as number) < 0.1 || (region.opacity as number) > 1) return false
    ids.add(region.id)
    return true
  })
}

function isColorworkGrid(value: unknown): value is ColorworkGrid {
  if (!isObject(value) || !Number.isFinite(value.chartWidthCm) || (value.chartWidthCm as number) < 1 || (value.chartWidthCm as number) > 200 ||
    !Number.isFinite(value.chartHeightCm) || (value.chartHeightCm as number) < 1 || (value.chartHeightCm as number) > 200 ||
    !Number.isSafeInteger(value.gaugeStitches) || (value.gaugeStitches as number) < 1 || (value.gaugeStitches as number) > 200 ||
    !Number.isSafeInteger(value.gaugeRows) || (value.gaugeRows as number) < 1 || (value.gaugeRows as number) > 200 ||
    !Number.isSafeInteger(value.columns) || (value.columns as number) < 1 || (value.columns as number) > 200 ||
    !Number.isSafeInteger(value.rows) || (value.rows as number) < 1 || (value.rows as number) > 200 ||
    !Number.isFinite(value.x) || (value.x as number) < 0 || (value.x as number) > 1 ||
    !Number.isFinite(value.y) || (value.y as number) < 0 || (value.y as number) > 1 ||
    !Number.isFinite(value.displayWidth) || (value.displayWidth as number) <= 0 || (value.displayWidth as number) > 1 ||
    !Number.isFinite(value.displayHeight) || (value.displayHeight as number) <= 0 || (value.displayHeight as number) > 1 ||
    (value.x as number) + (value.displayWidth as number) > 1.000001 || (value.y as number) + (value.displayHeight as number) > 1.000001 ||
    typeof value.visible !== 'boolean' || !Array.isArray(value.cells) || value.cells.length !== (value.columns as number) * (value.rows as number)) return false
  if ((value.columns as number) !== Math.max(1, Math.round((value.chartWidthCm as number) * (value.gaugeStitches as number) / 10)) ||
    (value.rows as number) !== Math.max(1, Math.round((value.chartHeightCm as number) * (value.gaugeRows as number) / 10))) return false
  return value.cells.every((cell) => cell === null || isObject(cell) && typeof cell.color === 'string' && /^#[\da-f]{6}$/i.test(cell.color) &&
    Number.isFinite(cell.opacity) && (cell.opacity as number) >= 0 && (cell.opacity as number) <= 1)
}

function isAnnotationSettings(value: unknown) {
  if (!isObject(value)) return false
  return (['pen', 'line', 'highlight', 'text'] as const).every((tool) => isAnnotationStyle(value[tool]))
}

function archiveBytes(value: Uint8Array) {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer
}

function isReportPhoto(value: unknown) {
  return typeof value === 'string' && value.length <= 8_000_000 && (value === '' || /^data:image\/(jpeg|png|webp);base64,/.test(value))
}

function isReportRows(value: unknown, fields: string[]) {
  return Array.isArray(value) && value.length <= 500 && value.every((row) => isObject(row) && typeof row.id === 'string' &&
    fields.every((field) => typeof row[field] === 'string' && (row[field] as string).length <= 20_000))
}

function isKnittingReport(value: unknown, documentIds: Set<string>): value is KnittingReport {
  if (!isObject(value) || typeof value.documentId !== 'string' || !documentIds.has(value.documentId) ||
    (value.id !== undefined && (typeof value.id !== 'string' || !value.id || value.id.length > 500)) ||
    typeof value.title !== 'string' || value.title.length > 500 || !Number.isFinite(value.createdAt) || !Number.isFinite(value.updatedAt) ||
    !isObject(value.fields) || Object.keys(value.fields).length > 500 || Object.values(value.fields).some((field) => typeof field !== 'string' || field.length > 20_000) ||
    !isReportPhoto(value.representativePhoto) ||
    !isReportRows(value.yarns, ['brand', 'product', 'photo', 'colorName', 'colorNumber', 'lot', 'fiber', 'country', 'weightClass', 'recommendedNeedle', 'skeinWeight', 'skeinLength', 'retailer', 'purchaseLink', 'price', 'quantity', 'usedSkeins', 'usedWeight', 'leftover']) ||
    !isReportRows(value.needles, ['section', 'type', 'size', 'cableLength', 'memo']) ||
    !isReportRows(value.accessories, ['photo', 'type', 'size', 'quantity', 'detail']) ||
    !isReportRows(value.measurements, ['label', 'pattern', 'finished']) ||
    !isReportRows(value.modifications, ['section', 'original', 'changed', 'memo']) ||
        (value.status !== undefined && value.status !== 'draft' && value.status !== 'complete') ||
    (value.completedAt !== undefined && value.completedAt !== null && !Number.isFinite(value.completedAt)) ||
    !Array.isArray(value.finishedPhotos) || value.finishedPhotos.length > 500 ||
    !value.finishedPhotos.every((photo) => isObject(photo) && typeof photo.id === 'string' && typeof photo.label === 'string' && photo.label.length <= 500 && isReportPhoto(photo.dataUrl)) ||
    (value.analysisCandidates !== undefined && (!Array.isArray(value.analysisCandidates) || value.analysisCandidates.length > 500 ||
      !value.analysisCandidates.every((candidate) => isObject(candidate) && typeof candidate.id === 'string' && typeof candidate.section === 'string' && typeof candidate.original === 'string' && typeof candidate.changed === 'string' && typeof candidate.memo === 'string' && typeof candidate.evidence === 'string' && typeof candidate.fingerprint === 'string' && (candidate.source === 'note_extraction' || candidate.source === 'counter') && (candidate.status === 'suggested' || candidate.status === 'confirmed' || candidate.status === 'dismissed')))) ||
    (value.workPhotos !== undefined && (!Array.isArray(value.workPhotos) || value.workPhotos.length > 500 ||
      !value.workPhotos.every((photo) => isObject(photo) && typeof photo.id === 'string' && typeof photo.label === 'string' && photo.label.length <= 500 &&
        isReportPhoto(photo.dataUrl) && Number.isFinite(photo.uploadedAt) && typeof photo.activityDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(photo.activityDate))))) return false
  const yarns = value.yarns as unknown[]
  const accessories = value.accessories as unknown[]
  const measurements = value.measurements as unknown[]
  return yarns.every((row) => isObject(row) && isReportPhoto(row.photo) && (row.usedMeters === undefined || typeof row.usedMeters === 'string') && (row.memo === undefined || typeof row.memo === 'string')) &&
    accessories.every((row) => isObject(row) && isReportPhoto(row.photo)) && measurements.every((row) => isObject(row) && (row.unit === undefined || row.unit === 'cm' || row.unit === 'inch'))
}

function normalizeKnittingReport(value: KnittingReport): KnittingReport {
  const legacy = value as KnittingReport & { id?: string; workPhotos?: ReportTimelinePhoto[] }
  return { ...legacy, id: legacy.id || legacy.documentId, workPhotos: legacy.workPhotos ?? [], status: legacy.status ?? 'draft', completedAt: legacy.completedAt ?? null }
}

function isChart(entry: unknown): entry is ChartDocument {
  if (!isObject(entry) || typeof entry.id !== 'string' || !entry.id || typeof entry.title !== 'string' || !entry.title ||
    (entry.craft !== 'knitting' && entry.craft !== 'crochet') || !Number.isFinite(entry.createdAt) || !Number.isFinite(entry.updatedAt) ||
    !(entry.lastOpenedAt === null || (typeof entry.lastOpenedAt === 'number' && Number.isFinite(entry.lastOpenedAt))) ||
    (entry.unit !== 'in' && entry.unit !== 'cm') || !Number.isSafeInteger(entry.width) || (entry.width as number) < 1 || (entry.width as number) > 200 ||
    !Number.isSafeInteger(entry.height) || (entry.height as number) < 1 || (entry.height as number) > 200 ||
    !Number.isFinite(entry.gaugeStitches) || (entry.gaugeStitches as number) <= 0 || !Number.isFinite(entry.gaugeRows) ||
    (entry.gaugeRows as number) <= 0 || !Array.isArray(entry.palette) || entry.palette.length > 128 ||
    !entry.palette.every((color) => typeof color === 'string' && /^#[\da-f]{6}$/i.test(color)) ||
    !Array.isArray(entry.cells) || !Array.isArray(entry.objects) || !Array.isArray(entry.layers) || entry.layers.length > 50) return false
  if (!entry.layers.every((layer) => isObject(layer) && typeof layer.id === 'string' && typeof layer.name === 'string' &&
    typeof layer.visible === 'boolean' && typeof layer.locked === 'boolean')) return false
  const layerIds = new Set(entry.layers.map((layer) => (layer as Record<string, unknown>).id))
  if (!entry.objects.every((object) => isObject(object) && typeof object.id === 'string' &&
    ['chain', 'slip', 'single', 'half-double', 'double', 'treble'].includes(String(object.symbol)) &&
    Number.isFinite(object.x) && Number.isFinite(object.y) && Number.isFinite(object.scale) && (object.scale as number) >= 0.25 && (object.scale as number) <= 4 &&
    Number.isFinite(object.rotation) && typeof object.color === 'string' && /^#[\da-f]{6}$/i.test(object.color) &&
    typeof object.layerId === 'string' && layerIds.has(object.layerId))) return false
  if (entry.craft === 'knitting') return entry.cells.length === (entry.width as number) * (entry.height as number) &&
    entry.cells.every((cell) => cell === null || (typeof cell === 'string' && /^#[\da-f]{6}$/i.test(cell))) && entry.objects.length === 0
  return entry.cells.length === 0 && entry.layers.length > 0
}

export async function createWorkspaceBackup() {
  const data = await readWorkspaceData()
  const files: Record<string, Uint8Array> = {}
  const documents: BackupDocument[] = []
  const photoPages: BackupPhotoPage[] = []

  for (const [index, document] of data.documents.entries()) {
    const number = String(index).padStart(6, '0')
    const photoFolder = document.kind === 'photos'
    const pdfPath = photoFolder ? null : 'documents/' + number + '.pdf'
    const coverPath = document.cover ? 'covers/' + number + '.jpg' : null
    if (pdfPath && document.pdf) files[pdfPath] = new Uint8Array(await document.pdf.arrayBuffer())
    if (document.cover && coverPath) files[coverPath] = new Uint8Array(await document.cover.arrayBuffer())
    const { pdf: _pdf, cover: _cover, ...metadata } = document
    documents.push({ ...metadata, pdfPath, coverPath })
    if (photoFolder) {
      for (const photo of (data.photoPages ?? []).filter((item) => item.documentId === document.id).sort((a, b) => a.pageNumber - b.pageNumber)) {
        const path = 'photos/' + number + '/' + String(photo.pageNumber).padStart(6, '0') + '.jpg'
        files[path] = new Uint8Array(await photo.blob.arrayBuffer())
        const { blob: _blob, ...photoMetadata } = photo
        photoPages.push({ ...photoMetadata, path })
      }
    }
  }

  const manifest: BackupManifest = {
    format: 'doanbogo',
    version: 14,
    exportedAt: Date.now(),
    documents,
    pages: data.pages,
    viewers: data.viewers,
    preferences: data.preferences,
    pageWork: data.pageWork,
    charts: data.charts,
    knittingReports: data.knittingReports,
    photoPages,
    homeProjects: (data.homeProjects ?? []).map(({ cover: _cover, ...project }) => project),
  }
  files['manifest.json'] = strToU8(JSON.stringify(manifest))
  const zipped = zipSync(files, { level: 0 })
  return new Blob([archiveBytes(zipped)], { type: 'application/x-doanbogo' })
}

export async function readWorkspaceBackup(file: File): Promise<WorkspaceData> {
  if (file.size === 0) throw new Error('작업 파일이 비어 있습니다.')
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(new Uint8Array(await file.arrayBuffer()))
  } catch {
    throw new Error('작업 파일을 열 수 없습니다. 도안보고에서 내보낸 .doanbogo 파일인지 확인해 주세요.')
  }

  if (!Object.hasOwn(files, 'manifest.json')) throw new Error('작업 파일에 안내 정보가 없습니다.')
  let manifest: unknown
  try {
    manifest = JSON.parse(strFromU8(files['manifest.json'])) as unknown
  } catch {
    throw new Error('작업 파일의 안내 정보가 손상됐습니다.')
  }
  if (!isObject(manifest) || manifest.format !== 'doanbogo' || ![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].includes(manifest.version as number) ||
    !Array.isArray(manifest.documents) || !Array.isArray(manifest.pages) ||
    !Array.isArray(manifest.viewers) || !Array.isArray(manifest.preferences) ||
    ((manifest.version as number) >= 2 && !Array.isArray(manifest.pageWork)) ||
    ((manifest.version as number) >= 4 && !Array.isArray(manifest.charts)) ||
    ((manifest.version as number) >= 6 && !Array.isArray(manifest.knittingReports)) ||
    ((manifest.version as number) >= 13 && !Array.isArray(manifest.photoPages))) {
    throw new Error('지원하지 않는 작업 파일 형식입니다.')
  }

  const ids = new Set<string>()
  const documents: DocumentRecord[] = manifest.documents.map((entry, index) => {
    if (!isObject(entry)) throw new Error('작업 파일에 올바르지 않은 도안 정보가 있습니다.')
    const { id, fileName, size, pageCount, createdAt, lastOpenedAt, tags, pdfPath, coverPath, totalWorkTimeMs } = entry
    const photoFolder = (manifest.version as number) >= 13 && entry.kind === 'photos'
    if (typeof id !== 'string' || !id || ids.has(id) || typeof fileName !== 'string' || !fileName ||
      !Number.isSafeInteger(size) || (size as number) < 0 || !Number.isSafeInteger(pageCount) || (pageCount as number) < 1 ||
      typeof createdAt !== 'number' || !Number.isFinite(createdAt) ||
      !(lastOpenedAt === null || (typeof lastOpenedAt === 'number' && Number.isFinite(lastOpenedAt))) || !isStringArray(tags) ||
      (totalWorkTimeMs !== undefined && (!Number.isSafeInteger(totalWorkTimeMs) || (totalWorkTimeMs as number) < 0)) ||
      (entry.kind !== undefined && entry.kind !== 'pdf' && entry.kind !== 'photos')) {
      throw new Error('작업 파일에 올바르지 않은 도안 정보가 있습니다.')
    }
    ids.add(id)

    const expectedNumber = String(index).padStart(6, '0')
    const expectedPdfPath = 'documents/' + expectedNumber + '.pdf'
    const expectedCoverPath = 'covers/' + expectedNumber + '.jpg'
    if (!(coverPath === null || coverPath === expectedCoverPath)) throw new Error('작업 파일에 올바르지 않은 표지 이미지 경로가 있습니다.')
    let pdfBlob: Blob | null = null
    if (photoFolder) {
      if (pdfPath !== null) throw new Error('사진 폴더에 PDF 경로가 포함되어 있습니다.')
    } else {
      if (pdfPath !== expectedPdfPath || !Object.hasOwn(files, expectedPdfPath)) throw new Error('작업 파일에서 PDF 자료를 찾을 수 없습니다.')
      const pdf = files[expectedPdfPath]
      if (pdf.byteLength !== size) throw new Error('작업 파일의 PDF 크기가 안내 정보와 다릅니다.')
      pdfBlob = new Blob([archiveBytes(pdf)], { type: 'application/pdf' })
    }

    let cover: Blob | null = null
    if (coverPath !== null) {
      if (!Object.hasOwn(files, expectedCoverPath)) throw new Error('작업 파일에서 표지 이미지를 찾을 수 없습니다.')
      cover = new Blob([archiveBytes(files[expectedCoverPath])], { type: 'image/jpeg' })
    }
    return {
      id,
      kind: photoFolder ? 'photos' : 'pdf',
      fileName,
      size: size as number,
      pageCount: pageCount as number,
      createdAt,
      lastOpenedAt,
      tags,
      totalWorkTimeMs: typeof totalWorkTimeMs === 'number' ? totalWorkTimeMs : 0,
      pdf: pdfBlob,
      cover,
    }
  })

  const photoPages: PhotoPageRecord[] = []
  if ((manifest.version as number) >= 13) {
    const documentIndexes = new Map(documents.map((document, index) => [document.id, index]))
    const photoKeys = new Set<string>()
    photoPages.push(...(manifest.photoPages as unknown[]).map((entry): PhotoPageRecord => {
      if (!isObject(entry) || typeof entry.documentId !== 'string' || !ids.has(entry.documentId) ||
        !Number.isSafeInteger(entry.pageNumber) || (entry.pageNumber as number) < 1 || !Number.isFinite(entry.width) ||
        !Number.isSafeInteger(entry.width) || (entry.width as number) < 1 || (entry.width as number) > 2560 ||
        !Number.isSafeInteger(entry.height) || (entry.height as number) < 1 || (entry.height as number) > 2560 ||
        (entry.width as number) * (entry.height as number) > 6_000_000 || !Number.isFinite(entry.addedAt) ||
        typeof entry.sourceName !== 'string' || entry.sourceName.length > 500) {
        throw new Error('작업 파일에 올바르지 않은 사진 페이지 정보가 있습니다.')
      }
      const documentIndex = documentIndexes.get(entry.documentId)!
      const photoFolder = documents[documentIndex]
      const expectedPath = 'photos/' + String(documentIndex).padStart(6, '0') + '/' + String(entry.pageNumber).padStart(6, '0') + '.jpg'
      const key = entry.documentId + '\u0000' + entry.pageNumber
      if (photoFolder.kind !== 'photos' || (entry.pageNumber as number) > photoFolder.pageCount || photoKeys.has(key) || entry.path !== expectedPath || !Object.hasOwn(files, expectedPath)) {
        throw new Error('작업 파일에서 사진 페이지를 찾을 수 없습니다.')
      }
      const bytes = files[expectedPath]
      if (!bytes.byteLength) throw new Error('작업 파일의 사진 자료가 비어 있습니다.')
      photoKeys.add(key)
      return {
        documentId: entry.documentId,
        pageNumber: entry.pageNumber as number,
        width: entry.width as number,
        height: entry.height as number,
        addedAt: entry.addedAt as number,
        sourceName: entry.sourceName,
        blob: new Blob([archiveBytes(bytes)], { type: 'image/jpeg' }),
      }
    }))
    for (const photoFolder of documents.filter((document) => document.kind === 'photos')) {
      const pages = photoPages.filter((photo) => photo.documentId === photoFolder.id).sort((a, b) => a.pageNumber - b.pageNumber)
      if (pages.length !== photoFolder.pageCount || pages.some((photo, index) => photo.pageNumber !== index + 1) || pages.reduce((sum, photo) => sum + photo.blob.size, 0) !== photoFolder.size) {
        throw new Error('작업 파일의 사진 수 또는 용량이 안내 정보와 다릅니다.')
      }
    }
    if (documents.some((document) => document.kind !== 'photos' && photoPages.some((photo) => photo.documentId === document.id))) {
      throw new Error('PDF 도안에 사진 페이지가 연결되어 있습니다.')
    }
  }

  const pageCounts = new Map(documents.map((document) => [document.id, document.pageCount]))
  const pages = manifest.pages.map((entry): PageRecord => {
    if (!isObject(entry) || typeof entry.documentId !== 'string' || !pageCounts.has(entry.documentId) ||
      !Number.isSafeInteger(entry.pageNumber) || (entry.pageNumber as number) < 1 || (entry.pageNumber as number) > pageCounts.get(entry.documentId)! ||
      typeof entry.hidden !== 'boolean' || typeof entry.bookmarked !== 'boolean' ||
      (entry.hiddenGroupId !== undefined && (typeof entry.hiddenGroupId !== 'string' || !entry.hiddenGroupId))) {
      throw new Error('작업 파일에 올바르지 않은 페이지 정보가 있습니다.')
    }
    return entry as unknown as PageRecord
  })

  const viewers = manifest.viewers.map((entry): ViewerSnapshot => {
    if (!isObject(entry) || typeof entry.documentId !== 'string' || !pageCounts.has(entry.documentId) ||
      typeof entry.split !== 'boolean' || (entry.splitInitialized !== undefined && typeof entry.splitInitialized !== 'boolean') ||
      (entry.activePane !== 'primary' && entry.activePane !== 'secondary') ||
      !isObject(entry.primary) || !isObject(entry.secondary) ||
      !Number.isFinite(entry.primary.page) || !Number.isFinite(entry.primary.zoom) ||
      !Number.isFinite(entry.primary.centerX) || !Number.isFinite(entry.primary.centerY) ||
      !Number.isFinite(entry.secondary.page) || !Number.isFinite(entry.secondary.zoom) ||
      !Number.isFinite(entry.secondary.centerX) || !Number.isFinite(entry.secondary.centerY) ||
      !isPaneRotations(entry.primary.rotations, pageCounts.get(entry.documentId)!) ||
      !isPaneRotations(entry.secondary.rotations, pageCounts.get(entry.documentId)!) ||
      ((manifest.version as number) === 9 && !isLegacyCounterSnapshots(entry.counters)) ||
      ((manifest.version as number) >= 10 && (!isCurrentCounterSnapshots(entry.counters) || entry.counterHistory !== undefined && !isCounterHistory(entry.counterHistory))) ||
      ((manifest.version as number) >= 10 && (entry.counterSoundEnabled !== undefined && typeof entry.counterSoundEnabled !== 'boolean' || entry.counterPreviewEnabled !== undefined && typeof entry.counterPreviewEnabled !== 'boolean' || entry.counterPanelCollapsed !== undefined && typeof entry.counterPanelCollapsed !== 'boolean' || entry.counterGuideAutoPanId !== undefined && entry.counterGuideAutoPanId !== null && typeof entry.counterGuideAutoPanId !== 'string' || entry.collapsedCounterKinds !== undefined && (!isObject(entry.collapsedCounterKinds) || Object.values(entry.collapsedCounterKinds).some((value) => typeof value !== 'boolean')))) ||
      ((manifest.version as number) >= 12 && (entry.counterMainId !== undefined && typeof entry.counterMainId !== 'string' || entry.counterVibrationEnabled !== undefined && typeof entry.counterVibrationEnabled !== 'boolean' || entry.counterAlertAcknowledged !== undefined && typeof entry.counterAlertAcknowledged !== 'string' || typeof entry.counterAlertAcknowledged === 'string' && entry.counterAlertAcknowledged.length > 500)) ||
      (entry.counterTimeLaps !== undefined && !isCounterTimeLaps(entry.counterTimeLaps)) ||
      (entry.thumbnailGroups !== undefined && !isThumbnailGroups(entry.thumbnailGroups, pageCounts.get(entry.documentId)!)) ||
      !Number.isFinite(entry.wideRatio) || !Number.isFinite(entry.tallRatio) || !Number.isFinite(entry.updatedAt) ||
      (entry.progressSettings !== undefined && !isProgressSettings(entry.progressSettings)) ||
      (entry.annotationSettings !== undefined && !isAnnotationSettings(entry.annotationSettings))) {
      throw new Error('작업 파일에 올바르지 않은 뷰어 정보가 있습니다.')
    }
    const viewer = { ...entry }
    delete viewer.techniqueSlots
    if ((manifest.version as number) < 9) viewer.counters = createDefaultCounters()
    else if ((manifest.version as number) < 10) viewer.counters = normalizeCounterSnapshots(viewer.counters)
    viewer.counterHistory = Array.isArray(viewer.counterHistory) ? viewer.counterHistory.slice(-MAX_COUNTER_HISTORY) : []
    viewer.counterTimeLaps = normalizeCounterTimeLaps(viewer.counterTimeLaps)
    return viewer as unknown as ViewerSnapshot
  })

  const preferences = manifest.preferences.map((entry): PreferenceRecord => {
    if (!isObject(entry) || typeof entry.key !== 'string' || typeof entry.value !== 'string') {
      throw new Error('작업 파일에 올바르지 않은 설정 정보가 있습니다.')
    }
    return entry as unknown as PreferenceRecord
  })

  const pageWorkEntries: unknown[] = Array.isArray(manifest.pageWork) ? manifest.pageWork : []
  const pageWork = pageWorkEntries.map((entry): PageWorkRecord => {
    if (!isObject(entry) || typeof entry.documentId !== 'string' || !pageCounts.has(entry.documentId) ||
      !Number.isSafeInteger(entry.pageNumber) || (entry.pageNumber as number) < 1 || (entry.pageNumber as number) > pageCounts.get(entry.documentId)! ||
      !Number.isFinite(entry.horizontalPosition) || (entry.horizontalPosition as number) < 0 || (entry.horizontalPosition as number) > 1 ||
      !Number.isFinite(entry.verticalPosition) || (entry.verticalPosition as number) < 0 || (entry.verticalPosition as number) > 1 ||
      (entry.rotation !== undefined && ![0, 90, 180, 270].includes(entry.rotation as number)) ||
      (entry.horizontalGuides !== undefined && !isGuideArray(entry.horizontalGuides)) ||
      (entry.verticalGuides !== undefined && !isGuideArray(entry.verticalGuides)) ||
      (entry.progressMigration !== undefined && !['pending', 'complete'].includes(String(entry.progressMigration))) ||
      (entry.legacyProgressGuides !== undefined && (!isObject(entry.legacyProgressGuides) || !isGuideArray(entry.legacyProgressGuides.horizontalGuides) || !isGuideArray(entry.legacyProgressGuides.verticalGuides))) ||
      ((manifest.version as number) >= 5 && (manifest.version as number) <= 6 && !isLegacyRectangleArray(entry.rectangles)) ||
      ((entry.rectangles !== undefined) && (manifest.version as number) <= 6 && !isLegacyRectangleArray(entry.rectangles)) ||
      (entry.regionHighlights !== undefined && !isRegionHighlightArray(entry.regionHighlights)) ||
      (entry.colorworkGrid !== undefined && !isColorworkGrid(entry.colorworkGrid)) ||
      !Array.isArray(entry.annotations)) {
      throw new Error('작업 파일에 올바르지 않은 진행선·필기 정보가 있습니다.')
    }
    const annotations = entry.annotations.map((annotation): AnnotationRecord => {
      if (!isObject(annotation) || typeof annotation.id !== 'string' ||
        !['pen', 'line', 'highlight', 'text'].includes(String(annotation.type)) || !Array.isArray(annotation.points) ||
        !isAnnotationStyle(annotation.style) || annotation.points.length < 1 ||
        (annotation.type === 'line' && annotation.points.length < 2) ||
        (annotation.type === 'text' && (typeof annotation.text !== 'string' || annotation.text.length > 500 || annotation.points.length !== 1)) ||
        (annotation.boxWidth !== undefined && (!Number.isFinite(annotation.boxWidth) || (annotation.boxWidth as number) < 0.08 || (annotation.boxWidth as number) > 0.9)) ||
        (annotation.boxHeight !== undefined && (!Number.isFinite(annotation.boxHeight) || (annotation.boxHeight as number) < 0.04 || (annotation.boxHeight as number) > 0.8)) ||
        ((annotation.boxWidth === undefined) !== (annotation.boxHeight === undefined))) {
        throw new Error('작업 파일에 올바르지 않은 필기 정보가 있습니다.')
      }
      const points = annotation.points.map((point) => {
        if (!isObject(point) || !Number.isFinite(point.x) || (point.x as number) < 0 || (point.x as number) > 1 ||
          !Number.isFinite(point.y) || (point.y as number) < 0 || (point.y as number) > 1) {
          throw new Error('작업 파일에 올바르지 않은 필기 위치가 있습니다.')
        }
        return { x: point.x as number, y: point.y as number }
      })
      return { ...annotation, points } as unknown as AnnotationRecord
    })
    const regionHighlights = entry.regionHighlights as RegionHighlight[] | undefined
    return normalizePageWork({ ...entry, annotations, regionHighlights } as unknown as PageWorkRecord)
  })

  const charts: ChartDocument[] = (Array.isArray(manifest.charts) ? manifest.charts : []).map((entry) => {
    if (!isChart(entry)) throw new Error('작업 파일에 올바르지 않은 차트 정보가 있습니다.')
    return entry
  })
  const chartIds = new Set<string>()
  for (const chart of charts) {
    if (chartIds.has(chart.id)) throw new Error('작업 파일에 중복된 차트 정보가 있습니다.')
    chartIds.add(chart.id)
  }

  const knittingReports: KnittingReport[] = (Array.isArray(manifest.knittingReports) ? manifest.knittingReports : []).map((entry) => {
    if (!isKnittingReport(entry, ids)) throw new Error('작업 파일에 올바르지 않은 뜨개보고서 정보가 있습니다.')
    return normalizeKnittingReport(entry)
  })
  const reportIds = new Set<string>()
  for (const report of knittingReports) {
    if (reportIds.has(report.id)) throw new Error('작업 파일에 중복된 뜨개보고서가 있습니다.')
    reportIds.add(report.id)
  }

  const documentById = new Map(documents.map((item) => [item.id, item]))
  const chartById = new Map(charts.map((item) => [item.id, item]))
  const storedProjects = (Array.isArray(manifest.homeProjects) ? manifest.homeProjects : []).map((entry): HomeProject => {
    if (!isObject(entry) || (entry.kind !== 'document' && entry.kind !== 'chart') || typeof entry.entityId !== 'string' ||
      entry.key !== entry.kind + ':' + entry.entityId || typeof entry.title !== 'string' ||
      !['active', 'paused', 'completed'].includes(String(entry.status)) ||
      !(entry.archivedAt === null || typeof entry.archivedAt === 'number' && Number.isFinite(entry.archivedAt)) ||
      !(entry.deletedAt === null || typeof entry.deletedAt === 'number' && Number.isFinite(entry.deletedAt)) ||
      !(entry.lastWorkedAt === null || typeof entry.lastWorkedAt === 'number' && Number.isFinite(entry.lastWorkedAt)) ||
      !Number.isFinite(entry.createdAt) || !isStringArray(entry.tags) ||
      (entry.totalWorkTimeMs !== undefined && (!Number.isSafeInteger(entry.totalWorkTimeMs) || (entry.totalWorkTimeMs as number) < 0)) ||
      (entry.kind === 'document' && !documentById.has(entry.entityId)) || (entry.kind === 'chart' && !chartById.has(entry.entityId))) {
      throw new Error('작업 파일에 올바르지 않은 프로젝트 상태가 있습니다.')
    }
    const document = entry.kind === 'document' ? documentById.get(entry.entityId) : undefined
    return { ...entry, cover: document?.cover ?? null } as unknown as HomeProject
  })
  const projectByKey = new Map(storedProjects.map((project) => [project.key, project]))
  const homeProjects = [
    ...documents.map((item): HomeProject => {
      const saved = projectByKey.get('document:' + item.id)
      return saved ? { ...saved, fileName: item.fileName, documentKind: item.kind ?? 'pdf', pageCount: item.pageCount, cover: item.cover, totalWorkTimeMs: item.totalWorkTimeMs ?? saved.totalWorkTimeMs ?? 0 } :
        { key: 'document:' + item.id, entityId: item.id, kind: 'document', title: item.fileName.replace(/\.pdf$/i, ''), fileName: item.fileName, documentKind: item.kind ?? 'pdf', pageCount: item.pageCount, cover: item.cover, tags: item.tags, status: 'active', archivedAt: null, deletedAt: null, lastWorkedAt: item.lastOpenedAt, createdAt: item.createdAt, totalWorkTimeMs: item.totalWorkTimeMs ?? 0 }
    }),
    ...charts.map((item): HomeProject => {
      const saved = projectByKey.get('chart:' + item.id)
      return saved ? { ...saved, chartCraft: item.craft } :
        { key: 'chart:' + item.id, entityId: item.id, kind: 'chart', title: item.title, chartCraft: item.craft, cover: null, tags: [], status: 'active', archivedAt: null, deletedAt: null, lastWorkedAt: item.lastOpenedAt, createdAt: item.createdAt }
    }),
  ]
  return { documents, pages, viewers, preferences, pageWork, charts, knittingReports, photoPages, homeProjects }
}
