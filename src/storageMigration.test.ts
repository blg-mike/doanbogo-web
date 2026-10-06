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

describe('counter and page recognition database migration', () => {
  it('normalizes v7 counters and keeps its recognition store in version 8', async () => {
    const legacy = await createLegacyDatabase()
    legacy.close()
    const { getPageRecognition, getPreference, getViewer } = await import('./storage')

    await expect(getPageRecognition('existing-document', 1)).resolves.toBeUndefined()
    await expect(getPreference('migration-test')).resolves.toBe('existing setting')
    const viewer = await getViewer('migration-document', 1)
    expect(viewer.counters).toHaveLength(5)
    expect(viewer.counters?.slice(0, 2)).toMatchObject([{ kind: 'simple', value: 7, unit: 'row' }, { kind: 'simple', value: 0 }])
  })
})
