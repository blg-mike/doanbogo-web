import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'

function createLegacyDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('doanbogo-web', 7)
    request.onupgradeneeded = () => {
      const db = request.result
      const documents = db.createObjectStore('documents', { keyPath: 'id' })
      documents.createIndex('by-created', 'createdAt')
      documents.createIndex('by-opened', 'lastOpenedAt')
      const pages = db.createObjectStore('pages', { keyPath: ['documentId', 'pageNumber'] })
      pages.createIndex('by-document', 'documentId')
      pages.put({ documentId: 'migration-document', pageNumber: 2, hidden: true, hiddenGroupId: 'legacy-hidden', bookmarked: true })
      pages.put({ documentId: 'migration-document', pageNumber: 3, hidden: false, hiddenGroupId: 'stale-group', bookmarked: false })
      const viewers = db.createObjectStore('viewers', { keyPath: 'documentId' })
      viewers.put({
        documentId: 'migration-document', split: false, activePane: 'primary',
        primary: { page: 1, zoom: 1, centerX: 0.5, centerY: 0.5 },
        secondary: { page: 1, zoom: 1, centerX: 0.5, centerY: 0.5 },
        counters: Array.from({ length: 5 }, (_, index) => ({
          mode: 'simple', value: index === 0 ? 7 : 0, repeatName: '', taskRules: [], taskOccurrences: [],
        })),
        wideRatio: 0.5, tallRatio: 0.5, updatedAt: Date.now(),
      })
      const preferences = request.result.createObjectStore('preferences', { keyPath: 'key' })
      preferences.put({ key: 'migration-test', value: 'existing setting' })
      const pageWork = db.createObjectStore('pageWork', { keyPath: ['documentId', 'pageNumber'] })
      pageWork.createIndex('by-document', 'documentId')
      const charts = db.createObjectStore('charts', { keyPath: 'id' })
      charts.createIndex('by-updated', 'updatedAt')
      db.createObjectStore('knittingReports', { keyPath: 'documentId' })
      const reports = db.createObjectStore('knittingReportEntries', { keyPath: 'id' })
      reports.createIndex('by-document', 'documentId')
      const recognition = db.createObjectStore('pageRecognition', { keyPath: ['documentId', 'pageNumber'] })
      recognition.createIndex('by-document', 'documentId')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

describe('legacy database migration', () => {
  it('normalizes existing counters and restores legacy hidden pages while preserving bookmarks', async () => {
    const legacy = await createLegacyDatabase()
    legacy.close()
    const { getPageRecognition, getPages, getPreference, getViewer } = await import('./storage')

    await expect(getPageRecognition('existing-document', 1)).resolves.toBeUndefined()
    await expect(getPreference('migration-test')).resolves.toBe('existing setting')
    const viewer = await getViewer('migration-document', 1)
    expect(viewer.counters).toHaveLength(5)
    expect(viewer.counters?.slice(0, 2)).toMatchObject([{ kind: 'simple', value: 7, unit: 'row' }, { kind: 'simple', value: 0 }])

    const pages = await getPages('migration-document')
    expect(pages).toEqual([
      { documentId: 'migration-document', pageNumber: 2, hidden: false, bookmarked: true },
      { documentId: 'migration-document', pageNumber: 3, hidden: false, bookmarked: false },
    ])
    expect(pages.every((page) => page.hidden === false && !('hiddenGroupId' in page))).toBe(true)
  })
})
