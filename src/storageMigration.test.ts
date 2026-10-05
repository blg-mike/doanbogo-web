import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'

function createLegacyDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('doanbogo-web', 6)
    request.onupgradeneeded = () => {
      const preferences = request.result.createObjectStore('preferences', { keyPath: 'key' })
      preferences.put({ key: 'migration-test', value: 'existing setting' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

describe('page recognition database migration', () => {
  it('opens a version 6 workspace after adding the optional recognition store', async () => {
    const legacy = await createLegacyDatabase()
    legacy.close()
    const { getPageRecognition, getPreference } = await import('./storage')

    await expect(getPageRecognition('existing-document', 1)).resolves.toBeUndefined()
    await expect(getPreference('migration-test')).resolves.toBe('existing setting')
  })
})
