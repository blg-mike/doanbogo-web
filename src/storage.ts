import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { ChartDocument, DocumentRecord, KnittingReport, PageRecognitionRecord, PageRecord, PageWorkRecord, PaneSnapshot, PreferenceRecord, ProgressGuide, SortMode, ViewerSnapshot } from './types'

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
}

const pageKey = (id: string, page: number) => id + '\u0000' + page

function stripLegacyTechniqueSlots(viewer: ViewerSnapshot): ViewerSnapshot {
  const cleaned = { ...viewer } as ViewerSnapshot & { techniqueSlots?: unknown }
  delete cleaned.techniqueSlots
  return cleaned
}

export function normalizePageWork(work: PageWorkRecord): PageWorkRecord {
  const normalized = { ...work } as PageWorkRecord & { rectangles?: unknown }
  delete normalized.rectangles
  return {
    ...normalized,
    rotation: [0, 90, 180, 270].includes(work.rotation ?? 0) ? (work.rotation ?? 0) : 0,
    horizontalGuides: work.horizontalGuides ?? [{ id: 'legacy-horizontal', position: work.horizontalPosition ?? 0.5 } satisfies ProgressGuide],
    verticalGuides: work.verticalGuides ?? [{ id: 'legacy-vertical', position: work.verticalPosition ?? 0.5 } satisfies ProgressGuide],
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
      const opening = openDB<DoanBogoDB>('doanbogo-web', 7, {
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
    const [documents, pages, viewers, preferences, pageWork, charts, knittingReports] = await Promise.all([
      db.getAll('documents'), db.getAll('pages'), db.getAll('viewers'), db.getAll('preferences'), db.getAll('pageWork'), db.getAll('charts'), db.getAll('knittingReportEntries'),
    ])
    documents.forEach((item) => temporary.documents.set(item.id, item))
    pages.forEach((item) => temporary.pages.set(pageKey(item.documentId, item.pageNumber), item))
    viewers.forEach((item) => temporary.viewers.set(item.documentId, stripLegacyTechniqueSlots(item)))
    preferences.forEach((item) => temporary.preferences.set(item.key, item))
    pageWork.forEach((item) => temporary.pageWork.set(pageKey(item.documentId, item.pageNumber), item))
    charts.forEach((item) => temporary.charts.set(item.id, item))
    knittingReports.forEach((item) => temporary.knittingReports.set(item.id, item))
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
  await access(async (db) => { await db.add('documents', record) }, () => { temporary.documents.set(record.id, record) })
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
  await access(async (db) => { await db.put('charts', saved) }, () => { temporary.charts.set(saved.id, saved) })
  return saved
}

export async function markChartOpened(id: string) {
  const chart = await getChart(id)
  if (chart) await saveChart({ ...chart, lastOpenedAt: Date.now() })
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
  await access(async (db) => { await db.delete('charts', id) }, () => { temporary.charts.delete(id) })
}

export type KnittingReportSummary = Pick<KnittingReport, 'id' | 'title' | 'createdAt' | 'updatedAt'>

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
  await access(async (db) => { await db.put('knittingReportEntries', saved) }, () => { temporary.knittingReports.set(saved.id, saved) })
  return saved
}

export async function markOpened(id: string) {
  await access(async (db) => {
    const tx = db.transaction('documents', 'readwrite')
    const item = await tx.store.get(id)
    if (item) {
      item.lastOpenedAt = Date.now()
      await tx.store.put(item)
    }
    await tx.done
  }, () => {
    const item = temporary.documents.get(id)
    if (item) temporary.documents.set(id, { ...item, lastOpenedAt: Date.now() })
  })
}

export async function updateTags(id: string, tags: string[]) {
  const cleaned = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))]
  await access(async (db) => {
    const tx = db.transaction('documents', 'readwrite')
    const item = await tx.store.get(id)
    if (item) {
      item.tags = cleaned
      await tx.store.put(item)
    }
    await tx.done
  }, () => {
    const item = temporary.documents.get(id)
    if (item) temporary.documents.set(id, { ...item, tags: cleaned })
  })
}

export async function renameDocument(id: string, name: string) {
  const baseName = name.trim().replace(/\.pdf$/i, '').trim()
  if (!baseName) throw new Error('PDF 이름을 입력하세요.')
  const fileName = baseName + '.pdf'
  return access(async (db) => {
    const tx = db.transaction('documents', 'readwrite')
    const item = await tx.store.get(id)
    if (!item) throw new Error('PDF를 찾을 수 없습니다.')
    const renamed = { ...item, fileName }
    await tx.store.put(renamed)
    await tx.done
    return renamed
  }, () => {
    const item = temporary.documents.get(id)
    if (!item) throw new Error('PDF를 찾을 수 없습니다.')
    const renamed = { ...item, fileName }
    temporary.documents.set(id, renamed)
    return renamed
  })
}

export async function duplicateDocument(id: string) {
  const original = await getDocument(id)
  if (!original) throw new Error('문서를 찾을 수 없습니다.')
  const copy: DocumentRecord = {
    ...original,
    id: crypto.randomUUID(),
    fileName: '복사본 - ' + original.fileName,
    createdAt: Date.now(),
    lastOpenedAt: null,
    tags: [],
  }
  await addDocument(copy)
  const reports = await getKnittingReports(id)
  for (const report of reports) {
    const title = '복사본 - ' + report.title
    await saveKnittingReport({ ...report, id: crypto.randomUUID(), documentId: copy.id, title, fields: { ...report.fields, 'project.name': title } })
  }
  return copy
}

export async function deleteDocument(id: string) {
  await access(async (db) => {
    const tx = db.transaction(['documents', 'pages', 'viewers', 'pageWork', 'knittingReports', 'knittingReportEntries', 'pageRecognition'], 'readwrite')
    await tx.objectStore('documents').delete(id)
    await tx.objectStore('viewers').delete(id)
    await tx.objectStore('knittingReports').delete(id)
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
    temporary.viewers.delete(id)
    for (const [key, report] of temporary.knittingReports) if (report.documentId === id) temporary.knittingReports.delete(key)
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
  const work = normalizePageWork(saved ?? { documentId: id, pageNumber, horizontalPosition: 0.5, verticalPosition: 0.5, annotations: [] })
  if (saved && (!saved.horizontalGuides || !saved.verticalGuides || Object.hasOwn(saved, 'rectangles'))) await savePageWork(work)
  return work
}

export async function savePageWork(work: PageWorkRecord) {
  const normalized = normalizePageWork(work)
  await access(async (db) => { await db.put('pageWork', normalized) }, () => {
    temporary.pageWork.set(pageKey(normalized.documentId, normalized.pageNumber), normalized)
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
  }
  return access((activeDb) => Promise.all([
    activeDb.getAll('documents'), activeDb.getAll('pages'), activeDb.getAll('viewers'), activeDb.getAll('preferences'), activeDb.getAll('pageWork'), activeDb.getAll('charts'), activeDb.getAll('knittingReportEntries'),
  ]).then(([documents, pages, viewers, preferences, pageWork, charts, knittingReports]) => ({ documents, pages, viewers: viewers.map(stripLegacyTechniqueSlots), preferences, pageWork: pageWork.map(normalizePageWork), charts, knittingReports })), () => ({
    documents: [...temporary.documents.values()],
    pages: [...temporary.pages.values()],
    viewers: [...temporary.viewers.values()].map(stripLegacyTechniqueSlots),
    preferences: [...temporary.preferences.values()],
    pageWork: [...temporary.pageWork.values()].map(normalizePageWork),
    charts: [...temporary.charts.values()],
    knittingReports: [...temporary.knittingReports.values()],
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
  const pages = incoming.pages.map((item) => ({ ...item, documentId: idMap.get(item.documentId)! }))
  const viewers = incoming.viewers.map((item) => ({ ...stripLegacyTechniqueSlots(item), documentId: idMap.get(item.documentId)! }))
  const pageWork = (incoming.pageWork ?? []).map((item) => normalizePageWork({ ...item, documentId: idMap.get(item.documentId)! }))
  const charts = (incoming.charts ?? []).map((item) => {
    let id = item.id
    if (usedChartIds.has(id)) id = crypto.randomUUID()
    usedChartIds.add(id)
    return { ...item, id }
  })
  const usedReportIds = new Set(current.knittingReports.map((report) => report.id))
  const knittingReports = (incoming.knittingReports ?? []).map((item) => {
    let id = item.id
    if (usedReportIds.has(id)) id = crypto.randomUUID()
    usedReportIds.add(id)
    return { ...item, id, documentId: idMap.get(item.documentId)! }
  })
  const db = await database()
  if (!db) {
    documents.forEach((item) => temporary.documents.set(item.id, item))
    pages.forEach((item) => temporary.pages.set(pageKey(item.documentId, item.pageNumber), item))
    viewers.forEach((item) => temporary.viewers.set(item.documentId, item))
    pageWork.forEach((item) => temporary.pageWork.set(pageKey(item.documentId, item.pageNumber), item))
    charts.forEach((item) => temporary.charts.set(item.id, item))
    knittingReports.forEach((item) => temporary.knittingReports.set(item.id, item))
    incoming.preferences.forEach((item) => temporary.preferences.set(item.key, item))
    return documents.length + charts.length
  }
  return access(async (activeDb) => {
    const tx = activeDb.transaction(['documents', 'pages', 'viewers', 'preferences', 'pageWork', 'charts', 'knittingReportEntries'], 'readwrite')
    for (const item of documents) await tx.objectStore('documents').put(item)
    for (const item of pages) await tx.objectStore('pages').put(item)
    for (const item of viewers) await tx.objectStore('viewers').put(item)
    for (const item of pageWork) await tx.objectStore('pageWork').put(item)
    for (const item of charts) await tx.objectStore('charts').put(item)
    for (const item of knittingReports) await tx.objectStore('knittingReportEntries').put(item)
    for (const item of incoming.preferences) await tx.objectStore('preferences').put(item)
    await tx.done
    return documents.length + charts.length
  }, () => {
    documents.forEach((item) => temporary.documents.set(item.id, item))
    pages.forEach((item) => temporary.pages.set(pageKey(item.documentId, item.pageNumber), item))
    viewers.forEach((item) => temporary.viewers.set(item.documentId, item))
    pageWork.forEach((item) => temporary.pageWork.set(pageKey(item.documentId, item.pageNumber), item))
    charts.forEach((item) => temporary.charts.set(item.id, item))
    knittingReports.forEach((item) => temporary.knittingReports.set(item.id, item))
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
