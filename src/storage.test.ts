import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { addDocument, addDocumentWorkSessions, addDocumentWorkTime, appendPhotoPages, createPhotoFolder, deleteDocument, deleteKnittingReport, duplicateDocument, getHomeProject, getKnittingReportById, getKnittingReports, getPageRecognition, getPageWork, getPages, getPhotoPage, getPhotoPages, getViewer, listDocuments, listHomeReports, markOpened, normalizePageWork, renameDocument, resetDocumentWorkTime, saveDocumentWorkTimeNote, saveKnittingReport, savePageRecognition, savePageRecords, savePageWork, saveViewer, saveViewerAndPageWorks, setPageFlag, updateTags } from './storage'
import { createCounter } from './smartCounter'
import type { DocumentRecord, KnittingReport } from './types'
import { localWorkDateKey } from './workTime'

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
  it('deletes one report and its home summary atomically without deleting the project or its other reports', async () => {
    const document = makeDocument(crypto.randomUUID(), 'Report deletion.pdf', Date.now())
    await addDocument(document)
    const makeReport = (id: string, title: string): KnittingReport => ({
      id, documentId: document.id, title, createdAt: Date.now(), updatedAt: Date.now(), fields: { 'project.name': title },
      representativePhoto: 'data:image/jpeg;base64,photo', yarns: [], needles: [], accessories: [], measurements: [], modifications: [],
      finishedPhotos: [{ id: id + '-finished', label: '완성', dataUrl: 'data:image/jpeg;base64,finished' }],
      workPhotos: [{ id: id + '-work', label: '진행', dataUrl: 'data:image/jpeg;base64,work', uploadedAt: Date.now(), activityDate: '2026-10-11' }],
    })
    const removed = makeReport('report-remove-' + crypto.randomUUID(), '삭제할 보고서')
    const retained = makeReport('report-keep-' + crypto.randomUUID(), '유지할 보고서')
    await saveKnittingReport(removed)
    await saveKnittingReport(retained)

    await deleteKnittingReport(removed.id)

    expect(await getKnittingReportById(removed.id)).toBeUndefined()
    expect(await getKnittingReports(document.id)).toEqual([expect.objectContaining({ id: retained.id, workPhotos: retained.workPhotos })])
    expect((await listHomeReports()).some((report) => report.id === removed.id)).toBe(false)
    expect((await listHomeReports()).some((report) => report.id === retained.id)).toBe(true)
    expect((await listDocuments()).some((item) => item.id === document.id)).toBe(true)
    await deleteDocument(document.id)
  })

  it('starts new page work without creating a progress line', async () => {
    const work = await getPageWork(crypto.randomUUID(), 1)

    expect(work).toMatchObject({ progressMigration: 'complete', horizontalGuides: [], verticalGuides: [] })
  })

  it('marks legacy progress guides for Viewer compatibility migration', () => {
    const work = normalizePageWork({
      documentId: 'legacy-doc', pageNumber: 1, horizontalPosition: 0.4, verticalPosition: 0.7, annotations: [],
      horizontalGuides: [{ id: 'legacy-h', position: 0.4 }], verticalGuides: [{ id: 'legacy-v', position: 0.7 }],
    })
    expect(work.progressMigration).toBe('pending')
    expect(work.horizontalGuides).toEqual([{ id: 'legacy-h', position: 0.4 }])
    expect(work.verticalGuides).toEqual([{ id: 'legacy-v', position: 0.7 }])
  })

  it('renames a PDF while preserving its stored document data', async () => {
    const document = makeDocument(crypto.randomUUID(), 'Original.pdf', Date.now(), ['winter'])
    await addDocument(document)

    const renamed = await renameDocument(document.id, '  New pattern.PDF  ')

    expect(renamed.fileName).toBe('New pattern.pdf')
    expect(await renamed.pdf!.text()).toBe(await document.pdf!.text())
    expect(renamed.tags).toEqual(['winter'])
    expect((await listDocuments()).find((item) => item.id === document.id)?.fileName).toBe('New pattern.pdf')
    await deleteDocument(document.id)
  })

  it('adds paused work time atomically to the document and workspace summary', async () => {
    const document = makeDocument(crypto.randomUUID(), 'Timer.pdf', Date.now())
    await addDocument(document)

    await Promise.all([addDocumentWorkTime(document.id, 30_000, '2026-10-13'), addDocumentWorkTime(document.id, 20_000, '2026-10-13')])

    expect((await listDocuments()).find((item) => item.id === document.id)?.totalWorkTimeMs).toBe(50_000)
    expect((await listDocuments()).find((item) => item.id === document.id)).toMatchObject({ todayWorkDate: '2026-10-13', todayWorkTimeMs: 50_000 })
    expect((await listDocuments()).find((item) => item.id === document.id)?.workTimeDays).toEqual([{ date: '2026-10-13', elapsedMs: 50_000 }])
    expect(await getHomeProject('document', document.id)).toMatchObject({ totalWorkTimeMs: 50_000, todayWorkDate: '2026-10-13', todayWorkTimeMs: 50_000 })
    expect((await getHomeProject('document', document.id))?.workTimeDays).toEqual([{ date: '2026-10-13', elapsedMs: 50_000 }])
    await addDocumentWorkTime(document.id, 10_000, '2026-10-14')
    expect((await listDocuments()).find((item) => item.id === document.id)).toMatchObject({ totalWorkTimeMs: 60_000, todayWorkDate: '2026-10-14', todayWorkTimeMs: 10_000 })
    expect((await listDocuments()).find((item) => item.id === document.id)?.workTimeDays).toEqual([{ date: '2026-10-13', elapsedMs: 50_000 }, { date: '2026-10-14', elapsedMs: 10_000 }])
    expect((await getHomeProject('document', document.id))).toMatchObject({ totalWorkTimeMs: 60_000, todayWorkDate: '2026-10-14', todayWorkTimeMs: 10_000 })
    await deleteDocument(document.id)

    const legacyDocument = { ...makeDocument(crypto.randomUUID(), 'Legacy timer.pdf', Date.now()), todayWorkDate: '2026-10-12', todayWorkTimeMs: 120_000 }
    await addDocument(legacyDocument)
    await addDocumentWorkTime(legacyDocument.id, 1_000, '2026-10-13')
    expect((await listDocuments()).find((item) => item.id === legacyDocument.id)?.workTimeDays).toEqual([
      { date: '2026-10-12', elapsedMs: 120_000 },
      { date: '2026-10-13', elapsedMs: 1_000 },
    ])
    await deleteDocument(legacyDocument.id)
  })

  it('resets work time by date or in full while keeping work notes', async () => {
    const document = makeDocument(crypto.randomUUID(), 'Reset work time.pdf', Date.now())
    await addDocument(document)
    const firstStart = new Date(2026, 9, 13, 9).getTime()
    const secondStart = new Date(2026, 9, 14, 10).getTime()
    const firstDate = localWorkDateKey(new Date(firstStart))
    const secondDate = localWorkDateKey(new Date(secondStart))
    const firstSession = { id: 'reset-one:' + firstDate, startedAt: firstStart, endedAt: firstStart + 30 * 60_000, elapsedMs: 30 * 60_000, workDate: firstDate }
    const secondSession = { id: 'reset-two:' + secondDate, startedAt: secondStart, endedAt: secondStart + 60 * 60_000, elapsedMs: 60 * 60_000, workDate: secondDate }
    await addDocumentWorkTime(document.id, 60_000, firstDate)
    await addDocumentWorkTime(document.id, 2 * 60_000, secondDate)
    await addDocumentWorkSessions(document.id, [firstSession, secondSession])
    await saveDocumentWorkTimeNote(document.id, firstDate, '메모 유지')

    const daily = await resetDocumentWorkTime(document.id, firstDate)

    expect(daily).toMatchObject({ totalWorkTimeMs: 62 * 60_000, workTimeDays: [{ date: secondDate, elapsedMs: 62 * 60_000 }] })
    expect((await listDocuments()).find((item) => item.id === document.id)).toMatchObject({ workTimeSessions: [secondSession], workTimeNotes: { [firstDate]: '메모 유지' } })
    expect(await getHomeProject('document', document.id)).toMatchObject({ totalWorkTimeMs: 62 * 60_000, workTimeDays: [{ date: secondDate, elapsedMs: 62 * 60_000 }] })

    const all = await resetDocumentWorkTime(document.id)

    expect(all).toMatchObject({ totalWorkTimeMs: 0, todayWorkTimeMs: 0, workTimeDays: [] })
    expect((await listDocuments()).find((item) => item.id === document.id)).toMatchObject({ workTimeSessions: [], workTimeNotes: { [firstDate]: '메모 유지' } })
    expect(await getHomeProject('document', document.id)).toMatchObject({ totalWorkTimeMs: 0, workTimeDays: [] })
    await deleteDocument(document.id)
  })

  it('stores work sessions idempotently and saves or clears a note by work date', async () => {
    const document = makeDocument(crypto.randomUUID(), 'Session timer.pdf', Date.now())
    const startedAt = new Date(2026, 9, 14, 9).getTime()
    const session = {
      id: 'timer-session:' + localWorkDateKey(new Date(startedAt)),
      startedAt,
      endedAt: startedAt + 30 * 60_000,
      elapsedMs: 30 * 60_000,
      workDate: localWorkDateKey(new Date(startedAt)),
    }

    await expect(addDocumentWorkSessions(document.id, [session])).rejects.toThrow()
    await addDocument(document)
    await addDocumentWorkSessions(document.id, [session])
    await addDocumentWorkSessions(document.id, [session])

    const saved = (await listDocuments()).find((item) => item.id === document.id)!
    expect(saved).toMatchObject({ totalWorkTimeMs: session.elapsedMs, workTimeSessions: [session], workTimeDays: [{ date: session.workDate, elapsedMs: session.elapsedMs }] })
    expect(await getHomeProject('document', document.id)).toMatchObject({ totalWorkTimeMs: session.elapsedMs, workTimeDays: [{ date: session.workDate, elapsedMs: session.elapsedMs }] })
    expect(await saveDocumentWorkTimeNote(document.id, session.workDate, '오늘은 소매를 완성했다.')).toEqual({ [session.workDate]: '오늘은 소매를 완성했다.' })
    expect((await listDocuments()).find((item) => item.id === document.id)?.workTimeNotes).toEqual({ [session.workDate]: '오늘은 소매를 완성했다.' })
    expect(await saveDocumentWorkTimeNote(document.id, session.workDate, '   ')).toEqual({})
    expect((await listDocuments()).find((item) => item.id === document.id)?.workTimeNotes).toEqual({})
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
    const original = { ...makeDocument(crypto.randomUUID(), 'Pattern.pdf', Date.now(), ['coat']), totalWorkTimeMs: 60_000 }
    await addDocument(original)
    const startedAt = new Date(2026, 9, 14, 9).getTime()
    const workDate = localWorkDateKey(new Date(startedAt))
    await addDocumentWorkSessions(original.id, [{ id: 'copied-session:' + workDate, startedAt, endedAt: startedAt + 30_000, elapsedMs: 30_000, workDate }])
    await saveDocumentWorkTimeNote(original.id, workDate, '원본 기록')
    await setPageFlag(original.id, 4, 'bookmarked', true)
    const copy = await duplicateDocument(original.id)
    const savedCopy = (await listDocuments('name')).find((document) => document.id === copy.id)

    expect(savedCopy?.fileName).toBe('복사본 - Pattern.pdf')
    expect(savedCopy?.tags).toEqual([])
    expect(savedCopy?.totalWorkTimeMs).toBe(0)
    expect(savedCopy?.workTimeSessions).toEqual([])
    expect(savedCopy?.workTimeNotes).toEqual({})
    expect(savedCopy?.pdf?.size).toBe(original.pdf!.size)
    expect((await getViewer(copy.id, copy.pageCount)).primary.page).toBe(1)
    expect(await getPages(copy.id)).toEqual([])

    await deleteDocument(original.id)
    await deleteDocument(copy.id)
  })

  it('stores, appends, duplicates, renames, and deletes image pages in a photo folder', async () => {
    const folder = await createPhotoFolder('뜨개 도안', [
      { blob: new Blob(['photo-1'], { type: 'image/jpeg' }), width: 100, height: 200, addedAt: 1, sourceName: 'page-1.jpg' },
    ], new Blob(['small-cover'], { type: 'image/jpeg' }))
    await appendPhotoPages(folder.id, [
      { blob: new Blob(['photo-2'], { type: 'image/jpeg' }), width: 200, height: 100, addedAt: 2, sourceName: 'page-2.jpg' },
    ])
    const saved = (await listDocuments()).find((item) => item.id === folder.id)!
    expect(saved).toMatchObject({ kind: 'photos', fileName: '뜨개 도안', pageCount: 2, size: 14, pdf: null })
    expect((await getPhotoPages(folder.id)).map((photo) => photo.sourceName)).toEqual(['page-1.jpg', 'page-2.jpg'])
    expect((await getPhotoPage(folder.id, 2))?.width).toBe(200)

    const renamed = await renameDocument(folder.id, '새 사진 도안')
    expect(renamed.fileName).toBe('새 사진 도안')
    const copy = await duplicateDocument(folder.id)
    expect(copy).toMatchObject({ kind: 'photos', fileName: '복사본 - 새 사진 도안', pageCount: 2, size: 14 })
    expect(await copy.cover?.text()).toBe('small-cover')
    expect((await getPhotoPages(copy.id)).map((photo) => photo.blob.size)).toEqual([7, 7])

    await deleteDocument(folder.id)
    expect(await getPhotoPages(folder.id)).toEqual([])
    await deleteDocument(copy.id)
  })

  it('restores legacy hidden pages while preserving bookmarks and all document work', async () => {
    const document = makeDocument(crypto.randomUUID(), 'Pages.pdf', Date.now())
    await addDocument(document)
    await savePageRecords([
      { documentId: document.id, pageNumber: 3, hidden: true, hiddenGroupId: 'legacy-group', bookmarked: false } as unknown as import('./types').PageRecord,
      { documentId: document.id, pageNumber: 5, hidden: false, bookmarked: true },
    ])
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
      { documentId: document.id, pageNumber: 3, hidden: false, bookmarked: false },
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

  it('saves label membership without changing page records', async () => {
    const document = makeDocument(crypto.randomUUID(), 'Thumbnail group move.pdf', Date.now())
    await addDocument(document)
    await savePageRecords([{ documentId: document.id, pageNumber: 2, hidden: false, bookmarked: true }])
    const viewer = await getViewer(document.id, document.pageCount)
    const nextViewer = { ...viewer, thumbnailGroups: [{ id: 'label-a', name: 'A', pageNumbers: [3, 4] }] }

    await saveViewer(nextViewer)

    expect((await getViewer(document.id, document.pageCount)).thumbnailGroups).toEqual(nextViewer.thumbnailGroups)
    expect(await getPages(document.id)).toEqual([{ documentId: document.id, pageNumber: 2, hidden: false, bookmarked: true }])
    await deleteDocument(document.id)
  })

  it('preserves current and undo counts when existing free counters become rows', async () => {
    const document = makeDocument(crypto.randomUUID(), 'Free counter units.pdf', Date.now())
    await addDocument(document)
    const viewer = await getViewer(document.id, document.pageCount)
    const counters = (['stitch', 'row', 'round'] as const).map((unit, index) => ({ ...createCounter('simple', unit), id: unit, unit, value: 12 + index }))
    const history = { id: 'unit-history', label: 'free counter', counters: counters.map((counter) => ({ ...counter, value: counter.value - 1 })), guides: [], actualRow: 0, counterOnly: true, savedAt: 1 }
    for (const save of [saveViewer, (snapshot: typeof viewer) => saveViewerAndPageWorks(snapshot, [])]) {
      await save({ ...viewer, counters, counterHistory: [history] })
      const restored = await getViewer(document.id, document.pageCount)
      expect(restored.counters).toMatchObject([{ id: 'stitch', unit: 'row', value: 12 }, { id: 'row', unit: 'row', value: 13 }, { id: 'round', unit: 'row', value: 14 }])
      expect(restored.counterMainId).toBe('row')
      expect(restored.counterHistory).toMatchObject([{ id: history.id, counterOnly: true, counters: [{ id: 'stitch', unit: 'row', value: 11 }, { id: 'row', unit: 'row', value: 12 }, { id: 'round', unit: 'row', value: 13 }] }])
    }
    await deleteDocument(document.id)
  })

  it('commits counter state and linked guide work in the same storage transaction', async () => {
    const document = makeDocument(crypto.randomUUID(), 'Counter transaction.pdf', Date.now())
    await addDocument(document)
    const viewer = await getViewer(document.id, document.pageCount)
    const counter = { ...createCounter('simple', '몸판 단'), value: 8, unit: 'row' as const }
    const guide = { id: 'linked-guide', position: 0.4, linkedCounterId: counter.id, name: counter.name, color: counter.color, chartRegion: { x: 0.1, y: 0.1, width: 0.8, height: 0.8, firstRow: 1, lastRow: 8, startCounterRow: 1, repeat: false, direction: 'top-to-bottom' as const } }
    await saveViewerAndPageWorks({ ...viewer, counters: [counter] }, [{
      documentId: document.id, pageNumber: 2, horizontalPosition: 0.4, verticalPosition: 0.5,
      horizontalGuides: [guide], verticalGuides: [], annotations: [],
    }])
    expect((await getViewer(document.id, document.pageCount)).counters).toMatchObject([{ id: counter.id, value: 8 }])
    expect(await getPageWork(document.id, 2)).toMatchObject({ horizontalGuides: [{ id: 'linked-guide', linkedCounterId: counter.id, position: 0.4 }] })
    await deleteDocument(document.id)
  })

  it('does not save only the viewer when one linked page work makes the transaction fail', async () => {
    const document = makeDocument(crypto.randomUUID(), 'Counter rollback.pdf', Date.now())
    await addDocument(document)
    const viewer = await getViewer(document.id, document.pageCount)
    const initial = { ...createCounter('simple', '몸판 단'), value: 8, unit: 'row' as const }
    const initialWork = {
      documentId: document.id, pageNumber: 2, horizontalPosition: 0.4, verticalPosition: 0.5,
      horizontalGuides: [{ id: 'guide', position: 0.4 }], verticalGuides: [], annotations: [],
    }
    await saveViewerAndPageWorks({ ...viewer, counters: [initial] }, [initialWork])
    const changed = { ...initial, value: 9 }
    await expect(saveViewerAndPageWorks({ ...viewer, counters: [changed] }, [{ ...initialWork, pageNumber: Number.NaN }])).rejects.toThrow()

    expect((await getViewer(document.id, document.pageCount)).counters).toMatchObject([{ id: initial.id, value: 8 }])
    expect(await getPageWork(document.id, 2)).toMatchObject({ horizontalGuides: [{ id: 'guide', position: 0.4 }] })
    await deleteDocument(document.id)
  })
})
