import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { ChartDocument, CounterHistoryEntry, DocumentRecord, HomeProject, KnittingReport, PageRecognitionRecord, PageRecord, PageWorkRecord, PhotoPageRecord, PaneSnapshot, PreferenceRecord, ProgressGuide, SortMode, ViewerSnapshot } from './types'
import { MAX_COUNTER_HISTORY, normalizeCounterSnapshots } from './smartCounter'

interface DoanBogoDB extends DBSchema {
  documents: {
    key: string
    value: DocumentRecord
    indexes: { 'by-created': number; 'by-opened': number }
  }
  pages: {
    key: [string, number]
    value: PageRecord
    indexes: { 'by-document': string }
  }
  viewers: { key: string; value: ViewerSnapshot }
  preferences: { key: string; value: PreferenceRecord }
  pageWork: { key: [string, number]; value: PageWorkRecord; indexes: { 'by-document': string } }
  charts: { key: string; value: ChartDocument; indexes: { 'by-updated': number } }
  knittingReports: { key: string; value: KnittingReport }
  knittingReportEntries: { key: string; value: KnittingReport; indexes: { 'by-document': string } }
  pageRecognition: { key: [string, number]; value: PageRecognitionRecord; indexes: { 'by-document': string } }
  photoPages: { key: [string, number]; value: PhotoPageRecord; indexes: { 'by-document': string } }
  homeProjects: { key: string; value: HomeProject; indexes: { 'by-last-worked': number } }
  homeReports: { key: string; value: KnittingReportSummary; indexes: { 'by-document': string; 'by-updated': number } }
}

export type StorageMode = 'checking' | 'persistent' | 'temporary'

export interface WorkspaceData {
  documents: DocumentRecord[]
  pages: PageRecord[]
  viewers: ViewerSnapshot[]
  preferences: PreferenceRecord[]
  pageWork: PageWorkRecord[]
  charts: ChartDocument[]
  knittingReports: KnittingReport[]
  photoPages?: PhotoPageRecord[]
  homeProjects?: HomeProject[]
}

type Database = IDBPDatabase<DoanBogoDB>

let databasePromise: Promise<Database | null> | undefined
let storageMode: StorageMode = 'checking'
const modeListeners = new Set<(mode: StorageMode) => void>()
const temporary = {
  documents: new Map<string, DocumentRecord>(),
  pages: new Map<string, PageRecord>(),
  viewers: new Map<string, ViewerSnapshot>(),
  preferences: new Map<string, PreferenceRecord>(),
  pageWork: new Map<string, PageWorkRecord>(),
  charts: new Map<string, ChartDocument>(),
  knittingReports: new Map<string, KnittingReport>(),
  pageRecognition: new Map<string, PageRecognitionRecord>(),
  photoPages: new Map<string, PhotoPageRecord>(),
  homeProjects: new Map<string, HomeProject>(),
  homeReports: new Map<string, KnittingReportSummary>(),
}

const pageKey = (id: string, page: number) => id + '\u0000' + page

function stripLegacyTechniqueSlots(viewer: ViewerSnapshot): ViewerSnapshot {
  const cleaned = { ...viewer } as ViewerSnapshot & { techniqueSlots?: unknown }
  delete cleaned.techniqueSlots
  const counterHistory = Array.isArray(cleaned.counterHistory) ? cleaned.counterHistory.slice(-MAX_COUNTER_HISTORY).filter((item): item is CounterHistoryEntry =>
    Boolean(item && typeof item === 'object' && Array.isArray(item.counters) && Array.isArray(item.guides))) : []
  return { ...cleaned, counters: normalizeCounterSnapshots(cleaned.counters), counterHistory }
}

export function normalizePageWork(work: PageWorkRecord): PageWorkRecord {
  const normalized = { ...work } as PageWorkRecord & { rectangles?: unknown }
  delete normalized.rectangles
  const hasNewProgress = [...(work.horizontalGuides ?? []), ...(work.verticalGuides ?? [])].some((guide) => guide.role === 'primary' || guide.role === 'reference')
  const hasLegacyProgress = work.progressMigration === undefined && !hasNewProgress && (
    work.horizontalGuides !== undefined || work.verticalGuides !== undefined ||
    work.horizontalPosition !== undefined || work.verticalPosition !== undefined
  )
  return {
    ...normalized,
    rotation: [0, 90, 180, 270].includes(work.rotation ?? 0) ? (work.rotation ?? 0) : 0,
    horizontalGuides: work.horizontalGuides ?? [{ id: 'legacy-horizontal', position: work.horizontalPosition ?? 0.5 } satisfies ProgressGuide],
    verticalGuides: work.verticalGuides ?? [{ id: 'legacy-vertical', position: work.verticalPosition ?? 0.5 } satisfies ProgressGuide],
    progressMigration: work.progressMigration ?? (hasLegacyProgress ? 'pending' : 'complete'),
  }
}

function setStorageMode(mode: StorageMode) {
  if (storageMode === mode) return
  storageMode = mode
  modeListeners.forEach((listener) => listener(mode))
}

export function subscribeStorageMode(listener: (mode: StorageMode) => void) {
  modeListeners.add(listener)
  return () => modeListeners.delete(listener)
}

async function database(): Promise<Database | null> {
  databasePromise ??= (async () => {
    if (!globalThis.indexedDB) {
      setStorageMode('temporary')
      return null
    }
    let openedDatabase: Database | null = null
    try {
      let abandoned = false
      let timeoutId = 0
      const opening = openDB<DoanBogoDB>('doanbogo-web', 10, {
        async upgrade(db, oldVersion, _newVersion, transaction) {
          if (oldVersion < 1) {
            const documents = db.createObjectStore('documents', { keyPath: 'id' })
            documents.createIndex('by-created', 'createdAt')
            documents.createIndex('by-opened', 'lastOpenedAt')
            const pages = db.createObjectStore('pages', { keyPath: ['documentId', 'pageNumber'] })
            pages.createIndex('by-document', 'documentId')
            db.createObjectStore('viewers', { keyPath: 'documentId' })
            db.createObjectStore('preferences', { keyPath: 'key' })
          }
          if (oldVersion < 2) {
            const pageWork = db.createObjectStore('pageWork', { keyPath: ['documentId', 'pageNumber'] })
            pageWork.createIndex('by-document', 'documentId')
          }
          if (oldVersion < 3) {
            const charts = db.createObjectStore('charts', { keyPath: 'id' })
            charts.createIndex('by-updated', 'updatedAt')
          }
          if (oldVersion < 4) db.createObjectStore('knittingReports', { keyPath: 'documentId' })
          if (oldVersion < 5) {
            let cursor = await transaction.objectStore('viewers').openCursor()
            while (cursor) {
              if ('techniqueSlots' in cursor.value) {
                await cursor.update(stripLegacyTechniqueSlots(cursor.value))
              }
              cursor = await cursor.continue()
            }
          }
          if (oldVersion < 6) {
            const reports = db.createObjectStore('knittingReportEntries', { keyPath: 'id' })
            reports.createIndex('by-document', 'documentId')
            if (oldVersion >= 4) {
              let cursor = await transaction.objectStore('knittingReports').openCursor()
              while (cursor) {
                const legacy = cursor.value as unknown as KnittingReport
                await reports.put({ ...legacy, id: legacy.documentId, workPhotos: [] })
                cursor = await cursor.continue()
              }
            }
          }
          if (oldVersion < 7) {
            const recognition = db.createObjectStore('pageRecognition', { keyPath: ['documentId', 'pageNumber'] })
            recognition.createIndex('by-document', 'documentId')
          }
          if (oldVersion < 8 && db.objectStoreNames.contains('viewers')) {
            let cursor = await transaction.objectStore('viewers').openCursor()
            while (cursor) {
              const viewer = stripLegacyTechniqueSlots(cursor.value)
              await cursor.update(viewer)
              cursor = await cursor.continue()
            }
          }
          if (oldVersion < 9) {
            const photoPages = db.createObjectStore('photoPages', { keyPath: ['documentId', 'pageNumber'] })
            photoPages.createIndex('by-document', 'documentId')
          }
          if (oldVersion < 10) {
            const projects = db.createObjectStore('homeProjects', { keyPath: 'key' })
            projects.createIndex('by-last-worked', 'lastWorkedAt')
            const projectKey = (kind: HomeProject['kind'], id: string) => kind + ':' + id
            let documentCursor = await transaction.objectStore('documents').openCursor()
            while (documentCursor) {
              const item = documentCursor.value as DocumentRecord
              const project: HomeProject = {
                key: projectKey('document', item.id), entityId: item.id, kind: 'document',
                title: item.fileName.replace(/\.pdf$/i, ''), fileName: item.fileName, documentKind: item.kind ?? 'pdf',
                pageCount: item.pageCount, cover: item.cover, tags: item.tags ?? [], status: 'active',
                archivedAt: null, deletedAt: null, lastWorkedAt: item.lastOpenedAt ?? null, createdAt: item.createdAt,
              }
              await projects.put(project)
              documentCursor = await documentCursor.continue()
            }
            let chartCursor = await transaction.objectStore('charts').openCursor()
            while (chartCursor) {
              const item = chartCursor.value as ChartDocument
              await projects.put({
                key: projectKey('chart', item.id), entityId: item.id, kind: 'chart', title: item.title,
                chartCraft: item.craft, cover: null, tags: [], status: 'active', archivedAt: null,
                deletedAt: null, lastWorkedAt: item.lastOpenedAt ?? null, createdAt: item.createdAt,
              })
              chartCursor = await chartCursor.continue()
            }
            const reports = db.createObjectStore('homeReports', { keyPath: 'id' })
            reports.createIndex('by-document', 'documentId')
            reports.createIndex('by-updated', 'updatedAt')
            if (db.objectStoreNames.contains('knittingReportEntries')) {
              let reportCursor = await transaction.objectStore('knittingReportEntries').openCursor()
              while (reportCursor) {
                const report = reportCursor.value as KnittingReport
                await reports.put({ id: report.id, documentId: report.documentId, title: report.title, createdAt: report.createdAt, updatedAt: report.updatedAt, status: report.status ?? 'draft', completedAt: report.completedAt ?? null })
                reportCursor = await reportCursor.continue()
              }
            }
          }
        },
      }).then((db) => {
        if (abandoned) {
          db.close()
          return null
        }
        return db
      })
      const timedOut = new Promise<null>((resolve) => {
        timeoutId = globalThis.setTimeout(() => {
          abandoned = true
          resolve(null)
        }, 1500)
      })
      let db: Database | null
      try {
        db = await Promise.race([opening, timedOut])
      } finally {
        globalThis.clearTimeout(timeoutId)
      }
      if (!db) {
        setStorageMode('temporary')
        return null
      }
      openedDatabase = db
      try {
        await db.put('preferences', { key: '__doanbogo_storage_probe__', value: 'ok' })
        const probe = await db.get('preferences', '__doanbogo_storage_probe__')
        if (probe?.value !== 'ok') throw new Error('IndexedDB 읽기 확인 실패')
        await db.delete('preferences', '__doanbogo_storage_probe__')
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'QuotaExceededError')) throw error
      }
      setStorageMode('persistent')
      return db
    } catch {
      openedDatabase?.close()
      setStorageMode('temporary')
      return null
    }
  })()
  return databasePromise
}

async function loadIntoTemporary(db: Database) {
  try {
    const [documents, pages, viewers, preferences, pageWork, charts, knittingReports, photoPages, homeProjects, homeReports] = await Promise.all([
      db.getAll('documents'), db.getAll('pages'), db.getAll('viewers'), db.getAll('preferences'), db.getAll('pageWork'), db.getAll('charts'), db.getAll('knittingReportEntries'), db.getAll('photoPages'), db.getAll('homeProjects'), db.getAll('homeReports'),
    ])
    documents.forEach((item) => temporary.documents.set(item.id, item))
    pages.forEach((item) => temporary.pages.set(pageKey(item.documentId, item.pageNumber), item))
    viewers.forEach((item) => temporary.viewers.set(item.documentId, stripLegacyTechniqueSlots(item)))
    preferences.forEach((item) => temporary.preferences.set(item.key, item))
    pageWork.forEach((item) => temporary.pageWork.set(pageKey(item.documentId, item.pageNumber), item))
    charts.forEach((item) => temporary.charts.set(item.id, item))
    knittingReports.forEach((item) => temporary.knittingReports.set(item.id, item))
    photoPages.forEach((item) => temporary.photoPages.set(pageKey(item.documentId, item.pageNumber), item))
    homeProjects.forEach((item) => temporary.homeProjects.set(item.key, item))
    homeReports.forEach((item) => temporary.homeReports.set(item.id, item))
  } catch {
    // Keep the app usable in memory even when the browser refuses further reads.
  }
  db.close()
  databasePromise = Promise.resolve(null)
  setStorageMode('temporary')
}

async function access<T>(operation: (db: Database) => Promise<T>, fallback: () => T | Promise<T>): Promise<T> {
  const db = await database()
  if (!db) return fallback()
  try {
    return await operation(db)
  } catch (error) {
    if (!(error instanceof DOMException && ['SecurityError', 'InvalidStateError', 'UnknownError'].includes(error.name))) throw error
    await loadIntoTemporary(db)
    return fallback()
  }
}

export async function getStorageMode() {
  await database()
  return storageMode
}

export async function addDocument(record: DocumentRecord) {
  const project = documentProject(record)
  await access(async (db) => {
    const tx = db.transaction(['documents', 'homeProjects'], 'readwrite')
    await tx.objectStore('documents').add(record)
    await tx.objectStore('homeProjects').put(project)
    await tx.done
  }, () => { temporary.documents.set(record.id, record); temporary.homeProjects.set(project.key, project) })
}

function documentProject(record: DocumentRecord): HomeProject {
  return { key: 'document:' + record.id, entityId: record.id, kind: 'document', title: record.fileName.replace(/\.pdf$/i, ''), fileName: record.fileName, documentKind: record.kind ?? 'pdf', pageCount: record.pageCount, cover: record.cover, tags: record.tags ?? [], status: 'active', archivedAt: null, deletedAt: null, lastWorkedAt: record.lastOpenedAt ?? null, createdAt: record.createdAt }
}

function chartProject(record: ChartDocument): HomeProject {
  return { key: 'chart:' + record.id, entityId: record.id, kind: 'chart', title: record.title, chartCraft: record.craft, cover: null, tags: [], status: 'active', archivedAt: null, deletedAt: null, lastWorkedAt: record.lastOpenedAt ?? null, createdAt: record.createdAt }
}

export async function listHomeProjects() {
  return access((db) => db.getAll('homeProjects'), () => [...temporary.homeProjects.values()])
}

export async function getHomeProject(kind: HomeProject['kind'], entityId: string) {
  const key = kind + ':' + entityId
  return access((db) => db.get('homeProjects', key), () => temporary.homeProjects.get(key))
}

export async function saveHomeProject(project: HomeProject) {
  await access(async (db) => { await db.put('homeProjects', project) }, () => { temporary.homeProjects.set(project.key, project) })
  return project
}

export async function listHomeReports() {
  return access((db) => db.getAll('homeReports'), () => [...temporary.homeReports.values()])
}

export async function markProjectWorked(kind: HomeProject['kind'], entityId: string, at = Date.now()) {
  const project = await getHomeProject(kind, entityId)
  if (project) await saveHomeProject({ ...project, lastWorkedAt: at })
}

export type NewPhotoPage = Omit<PhotoPageRecord, 'documentId' | 'pageNumber'> & { thumbnail?: Blob }

export async function createPhotoFolder(fileName: string, photos: NewPhotoPage[], cover: Blob | null = photos[0]?.thumbnail ?? null) {
  if (!photos.length) throw new Error('사진을 한 장 이상 선택하세요.')
  const id = crypto.randomUUID()
  const record: DocumentRecord = {
    id,
    kind: 'photos',
    fileName: fileName.trim() || '사진 도안',
    size: photos.reduce((total, photo) => total + photo.blob.size, 0),
    pageCount: photos.length,
    createdAt: Date.now(),
    lastOpenedAt: null,
    tags: [],
    pdf: null,
    cover,
  }
  const photoPages = photos.map(({ thumbnail: _thumbnail, ...photo }, index) => ({ ...photo, documentId: id, pageNumber: index + 1 }))
  await access(async (db) => {
    const tx = db.transaction(['documents', 'photoPages', 'homeProjects'], 'readwrite')
    await tx.objectStore('documents').add(record)
    await tx.objectStore('homeProjects').put(documentProject(record))
    for (const photo of photoPages) await tx.objectStore('photoPages').add(photo)
    await tx.done
  }, () => {
    temporary.documents.set(id, record)
    const project = documentProject(record)
    temporary.homeProjects.set(project.key, project)
    photoPages.forEach((photo) => temporary.photoPages.set(pageKey(id, photo.pageNumber), photo))
  })
  return record
}

export async function appendPhotoPages(id: string, photos: NewPhotoPage[]) {
  if (!photos.length) return
  await access(async (db) => {
    const tx = db.transaction(['documents', 'photoPages', 'homeProjects'], 'readwrite')
    const record = await tx.objectStore('documents').get(id)
    if (!record || record.kind !== 'photos') throw new Error('사진 폴더를 찾을 수 없습니다.')
    const start = record.pageCount
    for (const [index, photo] of photos.entries()) {
      const { thumbnail: _thumbnail, ...photoPage } = photo
      await tx.objectStore('photoPages').put({ ...photoPage, documentId: id, pageNumber: start + index + 1 })
    }
    record.pageCount += photos.length
    record.size += photos.reduce((total, photo) => total + photo.blob.size, 0)
    await tx.objectStore('documents').put(record)
    const project = await tx.objectStore('homeProjects').get('document:' + id)
    if (project) await tx.objectStore('homeProjects').put({ ...project, pageCount: record.pageCount })
    await tx.done
  }, () => {
    const record = temporary.documents.get(id)
    if (!record || record.kind !== 'photos') throw new Error('사진 폴더를 찾을 수 없습니다.')
    const start = record.pageCount
    photos.forEach(({ thumbnail: _thumbnail, ...photo }, index) => temporary.photoPages.set(pageKey(id, start + index + 1), { ...photo, documentId: id, pageNumber: start + index + 1 }))
    temporary.documents.set(id, { ...record, pageCount: start + photos.length, size: record.size + photos.reduce((total, photo) => total + photo.blob.size, 0) })
    const project = temporary.homeProjects.get('document:' + id)
    if (project) temporary.homeProjects.set(project.key, { ...project, pageCount: start + photos.length })
  })
}

export async function getPhotoPage(id: string, pageNumber: number) {
  return access((db) => db.get('photoPages', [id, pageNumber]), () => temporary.photoPages.get(pageKey(id, pageNumber)))
}

export async function getPhotoPages(id: string) {
  return access((db) => db.getAllFromIndex('photoPages', 'by-document', id), () => [...temporary.photoPages.values()].filter((photo) => photo.documentId === id))
}

export async function getDocument(id: string) {
  return access((db) => db.get('documents', id), () => temporary.documents.get(id))
}

export async function listDocuments(sort: SortMode = 'recent', query = '') {
  const documents = await access((db) => db.getAll('documents'), () => [...temporary.documents.values()])
  const needle = query.trim().toLocaleLowerCase()
  const filtered = needle
    ? documents.filter((item) => item.fileName.toLocaleLowerCase().includes(needle) || item.tags.some((tag) => tag.toLocaleLowerCase().includes(needle)))
    : documents
  return filtered.sort((a, b) => {
    if (sort === 'name') return a.fileName.localeCompare(b.fileName, 'ko')
    if (sort === 'upload') return b.createdAt - a.createdAt
    return (b.lastOpenedAt ?? b.createdAt) - (a.lastOpenedAt ?? a.createdAt)
  })
}

export async function getChart(id: string) {
  return access((db) => db.get('charts', id), () => temporary.charts.get(id))
}

export async function renameChart(id: string, title: string) {
  const chart = await getChart(id)
  if (!chart) throw new Error('차트를 찾을 수 없습니다.')
  return saveChart({ ...chart, title: title.trim() || chart.title })
}

export async function listCharts(sort: SortMode = 'recent', query = '') {
  const charts = await access((db) => db.getAll('charts'), () => [...temporary.charts.values()])
  const needle = query.trim().toLocaleLowerCase()
  const filtered = needle
    ? charts.filter((item) => (item.title + ' ' + (item.craft === 'knitting' ? 'knitting colors 대바늘' : 'crochet free form 코바늘')).toLocaleLowerCase().includes(needle))
    : charts
  return filtered.sort((a, b) => {
    if (sort === 'name') return a.title.localeCompare(b.title, 'ko')
    if (sort === 'upload') return b.createdAt - a.createdAt
    return (b.lastOpenedAt ?? b.updatedAt) - (a.lastOpenedAt ?? a.updatedAt)
  })
}

export async function saveChart(chart: ChartDocument) {
  const saved = { ...chart, updatedAt: Date.now() }
  const existing = await getHomeProject('chart', saved.id)
  const project = { ...chartProject(saved), ...(existing ?? {}), title: saved.title, chartCraft: saved.craft }
  await access(async (db) => {
    const tx = db.transaction(['charts', 'homeProjects'], 'readwrite')
    await tx.objectStore('charts').put(saved)
    await tx.objectStore('homeProjects').put(project)
    await tx.done
  }, () => { temporary.charts.set(saved.id, saved); temporary.homeProjects.set(project.key, project) })
  return saved
}

export async function markChartOpened(id: string) {
  const chart = await getChart(id)
  if (chart) {
    await saveChart({ ...chart, lastOpenedAt: Date.now() })
    await markProjectWorked('chart', id)
  }
}

export async function duplicateChart(id: string) {
  const chart = await getChart(id)
  if (!chart) throw new Error('차트를 찾을 수 없습니다.')
  const layerIds = new Map(chart.layers.map((layer) => [layer.id, crypto.randomUUID()]))
  const copy: ChartDocument = {
    ...chart,
    id: crypto.randomUUID(),
    title: '복사본 - ' + chart.title,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastOpenedAt: null,
    palette: [...chart.palette],
    cells: [...chart.cells],
    layers: chart.layers.map((layer) => ({ ...layer, id: layerIds.get(layer.id)! })),
    objects: chart.objects.map((item) => ({ ...item, id: crypto.randomUUID(), layerId: layerIds.get(item.layerId) ?? item.layerId })),
  }
  await saveChart(copy)
  return copy
}

export async function deleteChart(id: string) {
  await access(async (db) => {
    const tx = db.transaction(['charts', 'homeProjects'], 'readwrite')
    await tx.objectStore('charts').delete(id)
    await tx.objectStore('homeProjects').delete('chart:' + id)
    await tx.done
  }, () => { temporary.charts.delete(id); temporary.homeProjects.delete('chart:' + id) })
}

export type KnittingReportSummary = Pick<KnittingReport, 'id' | 'title' | 'createdAt' | 'updatedAt'> & { documentId: string; status: 'draft' | 'complete'; completedAt: number | null }

export async function getKnittingReports(documentId: string) {
  const reports = await access((db) => db.getAllFromIndex('knittingReportEntries', 'by-document', documentId), () => [...temporary.knittingReports.values()].filter((report) => report.documentId === documentId))
  return reports.sort((left, right) => left.createdAt - right.createdAt)
}

export async function getKnittingReport(documentId: string) {
  const reports = await getKnittingReports(documentId)
  return reports.sort((left, right) => right.updatedAt - left.updatedAt)[0]
}

export async function getKnittingReportById(id: string) {
  return access((db) => db.get('knittingReportEntries', id), () => temporary.knittingReports.get(id))
}

export async function saveKnittingReport(report: KnittingReport) {
  const saved = { ...report, updatedAt: Math.max(Date.now(), report.updatedAt + 1) }
  const summary: KnittingReportSummary = { id: saved.id, documentId: saved.documentId, title: saved.title, createdAt: saved.createdAt, updatedAt: saved.updatedAt, status: saved.status ?? 'draft', completedAt: saved.completedAt ?? null }
  await access(async (db) => {
    const tx = db.transaction(['knittingReportEntries', 'homeReports'], 'readwrite')
    await tx.objectStore('knittingReportEntries').put(saved)
    await tx.objectStore('homeReports').put(summary)
    await tx.done
  }, () => { temporary.knittingReports.set(saved.id, saved); temporary.homeReports.set(saved.id, summary) })
  return saved
}

export async function markOpened(id: string) {
  const now = Date.now()
  await access(async (db) => {
    const tx = db.transaction(['documents', 'homeProjects'], 'readwrite')
    const item = await tx.objectStore('documents').get(id)
    if (item) {
      item.lastOpenedAt = now
      await tx.objectStore('documents').put(item)
    }
    const project = await tx.objectStore('homeProjects').get('document:' + id)
    if (project) await tx.objectStore('homeProjects').put({ ...project, lastWorkedAt: now })
    await tx.done
  }, () => {
    const item = temporary.documents.get(id)
    if (item) temporary.documents.set(id, { ...item, lastOpenedAt: now })
    const project = temporary.homeProjects.get('document:' + id)
    if (project) temporary.homeProjects.set(project.key, { ...project, lastWorkedAt: now })
  })
}

export async function updateTags(id: string, tags: string[]) {
  const cleaned = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))]
  await access(async (db) => {
    const tx = db.transaction(['documents', 'homeProjects'], 'readwrite')
    const item = await tx.objectStore('documents').get(id)
    if (item) {
      item.tags = cleaned
      await tx.objectStore('documents').put(item)
    }
    const project = await tx.objectStore('homeProjects').get('document:' + id)
    if (project) await tx.objectStore('homeProjects').put({ ...project, tags: cleaned })
    await tx.done
  }, () => {
    const item = temporary.documents.get(id)
    if (item) temporary.documents.set(id, { ...item, tags: cleaned })
    const project = temporary.homeProjects.get('document:' + id)
    if (project) temporary.homeProjects.set(project.key, { ...project, tags: cleaned })
  })
}

export async function renameDocument(id: string, name: string) {
  const requestedName = name.trim()
  if (!requestedName) throw new Error('이름을 입력하세요.')
  const fileNameFor = (item: DocumentRecord) => {
    if (item.kind === 'photos') return requestedName
    const baseName = requestedName.replace(/\.pdf$/i, '').trim()
    if (!baseName) throw new Error('PDF 이름을 입력하세요.')
    return baseName + '.pdf'
  }
  return access(async (db) => {
    const tx = db.transaction(['documents', 'homeProjects'], 'readwrite')
    const item = await tx.objectStore('documents').get(id)
    if (!item) throw new Error('PDF를 찾을 수 없습니다.')
    const renamed = { ...item, fileName: fileNameFor(item) }
    await tx.objectStore('documents').put(renamed)
    const project = await tx.objectStore('homeProjects').get('document:' + id)
    if (project) await tx.objectStore('homeProjects').put({ ...project, title: renamed.fileName.replace(/\.pdf$/i, ''), fileName: renamed.fileName })
    await tx.done
    return renamed
  }, () => {
    const item = temporary.documents.get(id)
    if (!item) throw new Error('PDF를 찾을 수 없습니다.')
    const renamed = { ...item, fileName: fileNameFor(item) }
    temporary.documents.set(id, renamed)
    const project = temporary.homeProjects.get('document:' + id)
    if (project) temporary.homeProjects.set(project.key, { ...project, title: renamed.fileName.replace(/\.pdf$/i, ''), fileName: renamed.fileName })
    return renamed
  })
}

export async function duplicateDocument(id: string) {
  const original = await getDocument(id)
  if (!original) throw new Error('문서를 찾을 수 없습니다.')
  let copy: DocumentRecord
  if (original.kind === 'photos') {
    const sourcePhotos = await getPhotoPages(id)
    copy = await createPhotoFolder('복사본 - ' + original.fileName, sourcePhotos.map(({ blob, width, height, addedAt, sourceName }) => ({ blob, width, height, addedAt, sourceName })), original.cover)
  } else {
    copy = {
      ...original,
      id: crypto.randomUUID(),
      fileName: '복사본 - ' + original.fileName,
      createdAt: Date.now(),
      lastOpenedAt: null,
      tags: [],
    }
    await addDocument(copy)
  }
  const reports = await getKnittingReports(id)
  for (const report of reports) {
    const title = '복사본 - ' + report.title
    await saveKnittingReport({ ...report, id: crypto.randomUUID(), documentId: copy.id, title, fields: { ...report.fields, 'project.name': title } })
  }
  return copy
}

export async function deleteDocument(id: string) {
  await access(async (db) => {
    const tx = db.transaction(['documents', 'pages', 'viewers', 'pageWork', 'knittingReports', 'knittingReportEntries', 'pageRecognition', 'photoPages', 'homeProjects', 'homeReports'], 'readwrite')
    await tx.objectStore('documents').delete(id)
    await tx.objectStore('viewers').delete(id)
    await tx.objectStore('knittingReports').delete(id)
    await tx.objectStore('homeProjects').delete('document:' + id)
    const photoCursor = await tx.objectStore('photoPages').index('by-document').openCursor(IDBKeyRange.only(id))
    let currentPhoto = photoCursor
    while (currentPhoto) {
      await currentPhoto.delete()
      currentPhoto = await currentPhoto.continue()
    }
    let recognitionCursor = await tx.objectStore('pageRecognition').index('by-document').openCursor(IDBKeyRange.only(id))
    while (recognitionCursor) {
      await recognitionCursor.delete()
      recognitionCursor = await recognitionCursor.continue()
    }
    let reportCursor = await tx.objectStore('knittingReportEntries').index('by-document').openCursor(IDBKeyRange.only(id))
    while (reportCursor) {
      await reportCursor.delete()
      reportCursor = await reportCursor.continue()
    }
    let homeReportCursor = await tx.objectStore('homeReports').index('by-document').openCursor(IDBKeyRange.only(id))
    while (homeReportCursor) {
      await homeReportCursor.delete()
      homeReportCursor = await homeReportCursor.continue()
    }
    let cursor = await tx.objectStore('pages').index('by-document').openCursor(IDBKeyRange.only(id))
    while (cursor) {
      await cursor.delete()
      cursor = await cursor.continue()
    }
    let workCursor = await tx.objectStore('pageWork').index('by-document').openCursor(IDBKeyRange.only(id))
    while (workCursor) {
      await workCursor.delete()
      workCursor = await workCursor.continue()
    }
    await tx.done
  }, () => {
    temporary.documents.delete(id)
    temporary.homeProjects.delete('document:' + id)
    for (const [key, photo] of temporary.photoPages) if (photo.documentId === id) temporary.photoPages.delete(key)
    temporary.viewers.delete(id)
    for (const [key, report] of temporary.knittingReports) if (report.documentId === id) temporary.knittingReports.delete(key)
    for (const [key, report] of temporary.homeReports) if (report.documentId === id) temporary.homeReports.delete(key)
    for (const [key, page] of temporary.pages) if (page.documentId === id) temporary.pages.delete(key)
    for (const [key, work] of temporary.pageWork) if (work.documentId === id) temporary.pageWork.delete(key)
    for (const [key, recognition] of temporary.pageRecognition) if (recognition.documentId === id) temporary.pageRecognition.delete(key)
  })
}

export async function getPageRecognition(id: string, pageNumber: number) {
  return access((db) => db.get('pageRecognition', [id, pageNumber]), () => temporary.pageRecognition.get(pageKey(id, pageNumber)))
}

export async function savePageRecognition(id: string, pageNumber: number, change: Partial<Omit<PageRecognitionRecord, 'documentId' | 'pageNumber' | 'version'>>) {
  const key = pageKey(id, pageNumber)
  await access(async (db) => {
    const tx = db.transaction('pageRecognition', 'readwrite')
    const current = await tx.store.get([id, pageNumber])
    await tx.store.put({
      documentId: id,
      pageNumber,
      version: 1,
      pdfLinksDone: false,
      pdfLinks: [],
      qrLinksDone: false,
      qrLinks: [],
      qrInputMaxDimension: 0,
      ...current,
      ...change,
    })
    await tx.done
  }, () => {
    const current = temporary.pageRecognition.get(key)
    temporary.pageRecognition.set(key, {
      documentId: id,
      pageNumber,
      version: 1,
      pdfLinksDone: false,
      pdfLinks: [],
      qrLinksDone: false,
      qrLinks: [],
      qrInputMaxDimension: 0,
      ...current,
      ...change,
    })
  })
}

export async function getPages(id: string) {
  return access((db) => db.getAllFromIndex('pages', 'by-document', id), () => [...temporary.pages.values()].filter((page) => page.documentId === id))
}

export async function getPage(id: string, pageNumber: number) {
  return access((db) => db.get('pages', [id, pageNumber]), () => temporary.pages.get(pageKey(id, pageNumber)))
}

export async function setPageFlag(id: string, pageNumber: number, flag: 'hidden' | 'bookmarked', value: boolean) {
  await access(async (db) => {
    const tx = db.transaction('pages', 'readwrite')
    const page = await tx.store.get([id, pageNumber]) ?? { documentId: id, pageNumber, hidden: false, bookmarked: false }
    page[flag] = value
    await tx.store.put(page)
    await tx.done
  }, () => {
    const key = pageKey(id, pageNumber)
    const page = temporary.pages.get(key) ?? { documentId: id, pageNumber, hidden: false, bookmarked: false }
    temporary.pages.set(key, { ...page, [flag]: value })
  })
}

export async function getPageWork(id: string, pageNumber: number): Promise<PageWorkRecord> {
  const saved = await access((db) => db.get('pageWork', [id, pageNumber]), () => temporary.pageWork.get(pageKey(id, pageNumber)))
  const work = normalizePageWork(saved ?? {
    documentId: id,
    pageNumber,
    horizontalPosition: 0.5,
    verticalPosition: 0.5,
    annotations: [],
    horizontalGuides: [],
    verticalGuides: [],
    progressMigration: 'complete',
  })
  if (saved && (!saved.horizontalGuides || !saved.verticalGuides || Object.hasOwn(saved, 'rectangles'))) await savePageWork(work)
  return work
}

export async function savePageWork(work: PageWorkRecord) {
  const normalized = normalizePageWork(work)
  await access(async (db) => { await db.put('pageWork', normalized) }, () => {
    temporary.pageWork.set(pageKey(normalized.documentId, normalized.pageNumber), normalized)
  })
}

export async function getPageWorks(id: string) {
  return access((db) => db.getAllFromIndex('pageWork', 'by-document', id).then((works) => works.map(normalizePageWork)), () =>
    [...temporary.pageWork.values()].filter((work) => work.documentId === id).map(normalizePageWork))
}

export async function saveViewerAndPageWorks(snapshot: ViewerSnapshot, works: PageWorkRecord[]) {
  const viewer = stripLegacyTechniqueSlots(snapshot)
  const normalizedWorks = works.map(normalizePageWork)
  await access(async (db) => {
    const tx = db.transaction(['viewers', 'pageWork'], 'readwrite')
    const done = tx.done
    try {
      await tx.objectStore('viewers').put({ ...viewer, updatedAt: Date.now() })
      for (const work of normalizedWorks) await tx.objectStore('pageWork').put(work)
      await done
    } catch (error) {
      try { tx.abort() } catch { /* The transaction may already have finished. */ }
      await done.catch(() => {})
      throw error
    }
  }, () => {
    temporary.viewers.set(viewer.documentId, { ...viewer, updatedAt: Date.now() })
    normalizedWorks.forEach((work) => temporary.pageWork.set(pageKey(work.documentId, work.pageNumber), work))
  })
}

export async function setPagesFlag(id: string, pageNumbers: number[], flag: 'hidden' | 'bookmarked', value: boolean) {
  const uniquePages = [...new Set(pageNumbers)]
  await access(async (db) => {
    const tx = db.transaction('pages', 'readwrite')
    for (const pageNumber of uniquePages) {
      const page = await tx.store.get([id, pageNumber]) ?? { documentId: id, pageNumber, hidden: false, bookmarked: false }
      page[flag] = value
      await tx.store.put(page)
    }
    await tx.done
  }, () => {
    for (const pageNumber of uniquePages) {
      const key = pageKey(id, pageNumber)
      const page = temporary.pages.get(key) ?? { documentId: id, pageNumber, hidden: false, bookmarked: false }
      temporary.pages.set(key, { ...page, [flag]: value })
    }
  })
}

const defaultPane: PaneSnapshot = { page: 1, zoom: 1, centerX: 0.5, centerY: 0.5 }

export async function getViewer(id: string, pageCount: number): Promise<ViewerSnapshot> {
  const stored = await access((db) => db.get('viewers', id), () => temporary.viewers.get(id))
  if (stored) {
    const saved = stripLegacyTechniqueSlots(stored)
    return {
      ...saved,
      splitInitialized: saved.splitInitialized ?? saved.split,
      wideRatio: saved.wideRatio === 0.65 ? 0.5 : saved.wideRatio ?? 0.5,
      tallRatio: saved.tallRatio === 0.65 ? 0.5 : saved.tallRatio ?? 0.5,
      primary: { ...saved.primary, page: Math.min(pageCount, Math.max(1, saved.primary.page)) },
      secondary: { ...saved.secondary, page: Math.min(pageCount, Math.max(1, saved.secondary.page)) },
    }
  }
  return {
    documentId: id,
    split: false,
    splitInitialized: false,
    activePane: 'primary',
    primary: { ...defaultPane },
    secondary: { ...defaultPane },
    counters: normalizeCounterSnapshots(undefined),
    wideRatio: 0.5,
    tallRatio: 0.5,
    updatedAt: Date.now(),
  }
}

export async function saveViewer(snapshot: ViewerSnapshot) {
  const viewer = stripLegacyTechniqueSlots(snapshot)
  await access(async (db) => { await db.put('viewers', { ...viewer, updatedAt: Date.now() }) }, () => {
    temporary.viewers.set(viewer.documentId, { ...viewer, updatedAt: Date.now() })
  })
}

export async function getPreference(key: string) {
  return (await access((db) => db.get('preferences', key), () => temporary.preferences.get(key)))?.value
}

export async function savePreference(key: string, value: string) {
  const record: PreferenceRecord = { key, value }
  await access(async (db) => { await db.put('preferences', record) }, () => { temporary.preferences.set(key, record) })
}

export async function readWorkspaceData(): Promise<WorkspaceData> {
  const db = await database()
  if (!db) return {
    documents: [...temporary.documents.values()],
    pages: [...temporary.pages.values()],
    viewers: [...temporary.viewers.values()].map(stripLegacyTechniqueSlots),
    preferences: [...temporary.preferences.values()],
    pageWork: [...temporary.pageWork.values()].map(normalizePageWork),
    charts: [...temporary.charts.values()],
    knittingReports: [...temporary.knittingReports.values()],
    photoPages: [...temporary.photoPages.values()],
    homeProjects: [...temporary.homeProjects.values()],
  }
  return access((activeDb) => Promise.all([
    activeDb.getAll('documents'), activeDb.getAll('pages'), activeDb.getAll('viewers'), activeDb.getAll('preferences'), activeDb.getAll('pageWork'), activeDb.getAll('charts'), activeDb.getAll('knittingReportEntries'), activeDb.getAll('photoPages'), activeDb.getAll('homeProjects'),
  ]).then(([documents, pages, viewers, preferences, pageWork, charts, knittingReports, photoPages, homeProjects]) => ({ documents, pages, viewers: viewers.map(stripLegacyTechniqueSlots), preferences, pageWork: pageWork.map(normalizePageWork), charts, knittingReports, photoPages, homeProjects })), () => ({
    documents: [...temporary.documents.values()],
    pages: [...temporary.pages.values()],
    viewers: [...temporary.viewers.values()].map(stripLegacyTechniqueSlots),
    preferences: [...temporary.preferences.values()],
    pageWork: [...temporary.pageWork.values()].map(normalizePageWork),
    charts: [...temporary.charts.values()],
    knittingReports: [...temporary.knittingReports.values()],
    photoPages: [...temporary.photoPages.values()],
    homeProjects: [...temporary.homeProjects.values()],
  }))
}

export async function importWorkspaceData(incoming: WorkspaceData) {
  const current = await readWorkspaceData()
  const usedIds = new Set(current.documents.map((item) => item.id))
  const usedChartIds = new Set(current.charts.map((item) => item.id))
  const idMap = new Map<string, string>()
  for (const document of incoming.documents) {
    let id = document.id
    if (usedIds.has(id)) id = crypto.randomUUID()
    usedIds.add(id)
    idMap.set(document.id, id)
  }
  const documents = incoming.documents.map((item) => ({ ...item, id: idMap.get(item.id)! }))
  const photoPages = (incoming.photoPages ?? []).map((item) => ({ ...item, documentId: idMap.get(item.documentId)! }))
  const pages = incoming.pages.map((item) => ({ ...item, documentId: idMap.get(item.documentId)! }))
  const viewers = incoming.viewers.map((item) => ({ ...stripLegacyTechniqueSlots(item), documentId: idMap.get(item.documentId)! }))
  const pageWork = (incoming.pageWork ?? []).map((item) => normalizePageWork({ ...item, documentId: idMap.get(item.documentId)! }))
  const charts = (incoming.charts ?? []).map((item) => {
    let id = item.id
    if (usedChartIds.has(id)) id = crypto.randomUUID()
    usedChartIds.add(id)
    return { ...item, id }
  })
  const savedProjectByKey = new Map((incoming.homeProjects ?? []).map((item) => [item.key, item]))
  const homeProjects = [
    ...documents.map((item, index) => {
      const originalId = incoming.documents[index].id
      const saved = savedProjectByKey.get('document:' + originalId)
      return saved ? { ...saved, key: 'document:' + item.id, entityId: item.id, cover: item.cover, fileName: item.fileName } : documentProject(item)
    }),
    ...charts.map((item, index) => {
      const originalId = incoming.charts[index].id
      const saved = savedProjectByKey.get('chart:' + originalId)
      return saved ? { ...saved, key: 'chart:' + item.id, entityId: item.id } : chartProject(item)
    }),
  ]
  const usedReportIds = new Set(current.knittingReports.map((report) => report.id))
  const knittingReports = (incoming.knittingReports ?? []).map((item) => {
    let id = item.id
    if (usedReportIds.has(id)) id = crypto.randomUUID()
    usedReportIds.add(id)
    return { ...item, id, documentId: idMap.get(item.documentId)!, status: item.status ?? 'draft', completedAt: item.completedAt ?? null }
  })
  const homeReports = knittingReports.map((item) => ({ id: item.id, documentId: item.documentId, title: item.title, createdAt: item.createdAt, updatedAt: item.updatedAt, status: item.status ?? 'draft' as const, completedAt: item.completedAt ?? null }))
  const db = await database()
  if (!db) {
    documents.forEach((item) => temporary.documents.set(item.id, item))
    pages.forEach((item) => temporary.pages.set(pageKey(item.documentId, item.pageNumber), item))
    viewers.forEach((item) => temporary.viewers.set(item.documentId, item))
    pageWork.forEach((item) => temporary.pageWork.set(pageKey(item.documentId, item.pageNumber), item))
    charts.forEach((item) => temporary.charts.set(item.id, item))
    homeProjects.forEach((item) => temporary.homeProjects.set(item.key, item))
    knittingReports.forEach((item) => temporary.knittingReports.set(item.id, item))
    homeReports.forEach((item) => temporary.homeReports.set(item.id, item))
    photoPages.forEach((item) => temporary.photoPages.set(pageKey(item.documentId, item.pageNumber), item))
    incoming.preferences.forEach((item) => temporary.preferences.set(item.key, item))
    return documents.length + charts.length
  }
  return access(async (activeDb) => {
    const tx = activeDb.transaction(['documents', 'pages', 'viewers', 'preferences', 'pageWork', 'charts', 'knittingReportEntries', 'photoPages', 'homeProjects', 'homeReports'], 'readwrite')
    for (const item of documents) await tx.objectStore('documents').put(item)
    for (const item of pages) await tx.objectStore('pages').put(item)
    for (const item of viewers) await tx.objectStore('viewers').put(item)
    for (const item of pageWork) await tx.objectStore('pageWork').put(item)
    for (const item of charts) await tx.objectStore('charts').put(item)
    for (const item of homeProjects) await tx.objectStore('homeProjects').put(item)
    for (const item of knittingReports) await tx.objectStore('knittingReportEntries').put(item)
    for (const item of homeReports) await tx.objectStore('homeReports').put(item)
    for (const item of photoPages) await tx.objectStore('photoPages').put(item)
    for (const item of incoming.preferences) await tx.objectStore('preferences').put(item)
    await tx.done
    return documents.length + charts.length
  }, () => {
    documents.forEach((item) => temporary.documents.set(item.id, item))
    pages.forEach((item) => temporary.pages.set(pageKey(item.documentId, item.pageNumber), item))
    viewers.forEach((item) => temporary.viewers.set(item.documentId, item))
    pageWork.forEach((item) => temporary.pageWork.set(pageKey(item.documentId, item.pageNumber), item))
    charts.forEach((item) => temporary.charts.set(item.id, item))
    homeProjects.forEach((item) => temporary.homeProjects.set(item.key, item))
    knittingReports.forEach((item) => temporary.knittingReports.set(item.id, item))
    homeReports.forEach((item) => temporary.homeReports.set(item.id, item))
    photoPages.forEach((item) => temporary.photoPages.set(pageKey(item.documentId, item.pageNumber), item))
    incoming.preferences.forEach((item) => temporary.preferences.set(item.key, item))
    return documents.length + charts.length
  })
}

export async function storageEstimate() {
  if (!navigator.storage?.estimate) return null
  try {
    return await navigator.storage.estimate()
  } catch {
    return null
  }
}

export function isQuotaError(error: unknown) {
  return error instanceof DOMException && error.name === 'QuotaExceededError'
}
