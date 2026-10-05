import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { addDocument, deleteDocument, duplicateDocument, getPageRecognition, getPageWork, getPages, getViewer, listDocuments, markOpened, renameDocument, savePageRecognition, savePageWork, saveViewer, setPageFlag, updateTags } from './storage'
import type { DocumentRecord } from './types'

function makeDocument(id: string, fileName: string, createdAt: number, tags: string[] = []): DocumentRecord {
  return {
    id,
    fileName,
    size: 12,
    pageCount: 8,
    createdAt,
    lastOpenedAt: null,
    tags,
    pdf: new Blob(['sample pdf bytes'], { type: 'application/pdf' }),
    cover: null,
  }
}

describe('local document storage', () => {
  it('renames a PDF while preserving its stored document data', async () => {
    const document = makeDocument(crypto.randomUUID(), 'Original.pdf', Date.now(), ['winter'])
    await addDocument(document)

    const renamed = await renameDocument(document.id, '  New pattern.PDF  ')

    expect(renamed.fileName).toBe('New pattern.pdf')
    expect(await renamed.pdf.text()).toBe(await document.pdf.text())
    expect(renamed.tags).toEqual(['winter'])
    expect((await listDocuments()).find((item) => item.id === document.id)?.fileName).toBe('New pattern.pdf')
    await deleteDocument(document.id)
  })

  it('searches by filename and tag and keeps the selected ordering', async () => {
    const prefix = crypto.randomUUID()
    const first = makeDocument(prefix + '-a', 'Cardigan.pdf', 1)
    const second = makeDocument(prefix + '-b', 'Shawl.pdf', 2)
    await addDocument(first)
    await addDocument(second)
    await updateTags(second.id, ['winter', 'gift', 'winter'])
    await markOpened(first.id)

    expect((await listDocuments('name')).map((document) => document.fileName)).toEqual(['Cardigan.pdf', 'Shawl.pdf'])
    expect((await listDocuments('recent')).map((document) => document.id)).toEqual([first.id, second.id])
    expect((await listDocuments('name', 'GIFT')).map((document) => document.id)).toEqual([second.id])
    expect((await listDocuments('upload')).map((document) => document.id)).toEqual([second.id, first.id])

    await deleteDocument(first.id)
    await deleteDocument(second.id)
  })

  it('duplicates the PDF while starting with fresh tags and viewer state', async () => {
    const original = makeDocument(crypto.randomUUID(), 'Pattern.pdf', Date.now(), ['coat'])
    await addDocument(original)
    await setPageFlag(original.id, 4, 'bookmarked', true)
    const copy = await duplicateDocument(original.id)
    const savedCopy = (await listDocuments('name')).find((document) => document.id === copy.id)

    expect(savedCopy?.fileName).toBe('복사본 - Pattern.pdf')
    expect(savedCopy?.tags).toEqual([])
    expect(savedCopy?.pdf.size).toBe(original.pdf.size)
    expect((await getViewer(copy.id, copy.pageCount)).primary.page).toBe(1)
    expect(await getPages(copy.id)).toEqual([])

    await deleteDocument(original.id)
    await deleteDocument(copy.id)
  })

  it('keeps each page flag, clamps restored pages, and removes all work with a document', async () => {
    const document = makeDocument(crypto.randomUUID(), 'Pages.pdf', Date.now())
    await addDocument(document)
    await setPageFlag(document.id, 3, 'hidden', true)
    await setPageFlag(document.id, 5, 'bookmarked', true)
    await savePageRecognition(document.id, 5, { pdfLinksDone: true, pdfLinks: [], qrLinksDone: true, qrLinks: [], qrInputMaxDimension: 1400 })
    const pdfLink = { x: 0.1, y: 0.2, width: 0.3, height: 0.1, href: 'https://example.com' }
    await savePageRecognition(document.id, 5, { pdfLinks: [pdfLink] })
    await savePageWork({
      documentId: document.id, pageNumber: 5, horizontalPosition: 0.3, verticalPosition: 0.8, rotation: 90,
      horizontalGuides: [{ id: 'guide-h-1', position: 0.3 }, { id: 'guide-h-2', position: 0.65 }],
      verticalGuides: [{ id: 'guide-v-1', position: 0.8 }], annotations: [],
    })
    const viewer = await getViewer(document.id, document.pageCount)
    const splitViewer = {
      ...viewer,
      primary: { ...viewer.primary, page: 6, rotations: { 6: 90 as const } },
      secondary: { ...viewer.secondary, page: 7, zoom: 2.5, centerX: 0.25, centerY: 0.75, rotations: { 7: 270 as const } },
      split: true,
      splitInitialized: true,
    }
    await saveViewer(splitViewer)
    await saveViewer({ ...splitViewer, split: false })

    expect(await getPages(document.id)).toEqual([
      { documentId: document.id, pageNumber: 3, hidden: true, bookmarked: false },
      { documentId: document.id, pageNumber: 5, hidden: false, bookmarked: true },
    ])
    expect(await getPageRecognition(document.id, 5)).toMatchObject({
      version: 1,
      pdfLinksDone: true,
      pdfLinks: [pdfLink],
      qrLinksDone: true,
      qrInputMaxDimension: 1400,
    })
    expect(await getPageWork(document.id, 5)).toMatchObject({
      rotation: 90,
      horizontalGuides: [{ id: 'guide-h-1', position: 0.3 }, { id: 'guide-h-2', position: 0.65 }],
      verticalGuides: [{ id: 'guide-v-1', position: 0.8 }],
    })
    expect(await getViewer(document.id, document.pageCount)).toMatchObject({
      split: false,
      splitInitialized: true,
      primary: { page: 6, rotations: { 6: 90 } },
      secondary: { page: 7, zoom: 2.5, centerX: 0.25, centerY: 0.75 },
    })
    expect((await getViewer(document.id, 4)).primary.page).toBe(4)

    await deleteDocument(document.id)
    expect(await getPages(document.id)).toEqual([])
    expect(await getPageRecognition(document.id, 5)).toBeUndefined()
    expect(await getPageWork(document.id, 5)).toMatchObject({ horizontalPosition: 0.5, verticalPosition: 0.5, annotations: [] })
    expect((await listDocuments('name')).some((item) => item.id === document.id)).toBe(false)
  })
})
