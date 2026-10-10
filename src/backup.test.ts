import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { createWorkspaceBackup, readWorkspaceBackup } from './backup'
import { createCounter, isLegacyCounterSnapshots } from './smartCounter'
import { addDocument, addDocumentWorkTime, createPhotoFolder, deleteChart, deleteDocument, duplicateDocument, getChart, getHomeProject, getKnittingReport, getKnittingReports, getPageWork, getPages, getPhotoPages, getPreference, getViewer, importWorkspaceData, listCharts, listDocuments, saveChart, saveHomeProject, saveKnittingReport, savePageWork, savePreference, saveViewer, setPageFlag } from './storage'
import { createKnittingChart, makeRasterPdf } from './charts'
import type { DocumentRecord, KnittingReport } from './types'

describe('portable workspace backup', () => {
  it('migrates a legacy one-report-per-document database to report ids', async () => {
    const request = indexedDB.open('doanbogo-web', 5)
    request.onupgradeneeded = () => {
      const db = request.result
      const documents = db.createObjectStore('documents', { keyPath: 'id' })
      documents.createIndex('by-created', 'createdAt')
      documents.createIndex('by-opened', 'lastOpenedAt')
      const pages = db.createObjectStore('pages', { keyPath: ['documentId', 'pageNumber'] })
      pages.createIndex('by-document', 'documentId')
      const viewers = db.createObjectStore('viewers', { keyPath: 'documentId' })
      viewers.put({
        documentId: 'migration-check', split: false, activePane: 'primary',
        primary: { page: 1, zoom: 1, centerX: 0.5, centerY: 0.5 },
        secondary: { page: 1, zoom: 1, centerX: 0.5, centerY: 0.5 },
        counters: Array.from({ length: 5 }, (_, index) => ({
          mode: index === 0 ? 'repeat' : 'simple', value: index === 0 ? 13 : 0, repeatName: '몸판', startRow: 1,
          repeatLength: 8, repeatCount: null, taskRules: [], taskOccurrences: [],
        })),
        wideRatio: 0.5, tallRatio: 0.5, techniqueSlots: [null, null, null, null, null], updatedAt: Date.now(),
      })
      db.createObjectStore('preferences', { keyPath: 'key' })
      const pageWork = db.createObjectStore('pageWork', { keyPath: ['documentId', 'pageNumber'] })
      pageWork.createIndex('by-document', 'documentId')
      const charts = db.createObjectStore('charts', { keyPath: 'id' })
      charts.createIndex('by-updated', 'updatedAt')
      const reports = db.createObjectStore('knittingReports', { keyPath: 'documentId' })
      reports.put({
        documentId: 'migration-check', title: '기존 보고서', createdAt: 1, updatedAt: 1, fields: { 'project.name': '기존 보고서' },
        representativePhoto: '', yarns: [], needles: [], accessories: [], measurements: [], modifications: [], finishedPhotos: [],
      })
    }
    const oldDatabase = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    oldDatabase.close()

    const pdf = new Blob(['%PDF-1.7 migration'], { type: 'application/pdf' })
    await addDocument({
      id: 'migration-check', fileName: 'migration.pdf', size: pdf.size, pageCount: 1,
      createdAt: Date.now(), lastOpenedAt: null, tags: [], pdf, cover: null,
    })
    expect(await getViewer('migration-check', 1)).not.toHaveProperty('techniqueSlots')
    expect((await getViewer('migration-check', 1)).counters).toHaveLength(6)
    expect((await getViewer('migration-check', 1)).counters?.slice(0, 2)).toMatchObject([
      { kind: 'simple', value: 13, name: '몸판 단' },
      { kind: 'pattern', currentRow: 13, patternRow: 5, repeatLength: 8 },
    ])
    expect(await getKnittingReports('migration-check')).toMatchObject([{ id: 'migration-check', workPhotos: [], title: '기존 보고서' }])
    const work = await getPageWork('migration-check', 1)
    expect(work).toMatchObject({ horizontalPosition: 0.5, verticalPosition: 0.5, annotations: [] })
    await savePageWork({ ...work, horizontalPosition: 0.25 })
    expect(await getPageWork('migration-check', 1)).toMatchObject({ horizontalPosition: 0.25 })
    await deleteDocument('migration-check')
  })

  it('round-trips accumulated document work time and defaults missing timer fields to zero', async () => {
    const id = crypto.randomUUID()
    const pdf = new Blob(['%PDF timer'], { type: 'application/pdf' })
    await addDocument({ id, fileName: 'timer.pdf', size: pdf.size, pageCount: 1, createdAt: Date.now(), lastOpenedAt: null, tags: [], pdf, cover: null })
    await addDocumentWorkTime(id, 3_723_000)

    const backup = await createWorkspaceBackup()
    const restored = await readWorkspaceBackup(new File([backup], 'timer.doanbogo'))
    expect(restored.documents.find((item) => item.id === id)?.totalWorkTimeMs).toBe(3_723_000)
    expect(restored.homeProjects?.find((item) => item.entityId === id)?.totalWorkTimeMs).toBe(3_723_000)

    const files = unzipSync(new Uint8Array(await backup.arrayBuffer()))
    const manifest = JSON.parse(strFromU8(files['manifest.json'])) as { documents: Record<string, unknown>[]; homeProjects: Record<string, unknown>[] }
    delete manifest.documents.find((item) => item.id === id)!.totalWorkTimeMs
    delete manifest.homeProjects.find((item) => item.entityId === id)!.totalWorkTimeMs
    files['manifest.json'] = strToU8(JSON.stringify(manifest))
    const withoutTimerFields = await readWorkspaceBackup(new File([zipSync(files, { level: 0 })], 'older-timer.doanbogo'))
    expect(withoutTimerFields.documents.find((item) => item.id === id)?.totalWorkTimeMs).toBe(0)
    expect(withoutTimerFields.homeProjects?.find((item) => item.entityId === id)?.totalWorkTimeMs).toBe(0)

    await deleteDocument(id)
  })

  it('round-trips photo folders and image pages in the v14 backup', async () => {
    const folder = await createPhotoFolder('종이 도안', [
      { blob: new Blob(['first-page'], { type: 'image/jpeg' }), width: 1200, height: 1600, addedAt: 1, sourceName: '01.jpg' },
      { blob: new Blob(['second-page'], { type: 'image/jpeg' }), width: 1600, height: 1200, addedAt: 2, sourceName: '02.jpg' },
    ], new Blob(['small-cover'], { type: 'image/jpeg' }))
    await setPageFlag(folder.id, 2, 'bookmarked', true)
    const backup = await createWorkspaceBackup()
    const entries = unzipSync(new Uint8Array(await backup.arrayBuffer()))
    const manifest = JSON.parse(strFromU8(entries['manifest.json'])) as { version: number; documents: Record<string, unknown>[]; photoPages: Record<string, unknown>[] }
    expect(manifest.version).toBe(14)
    expect(manifest.documents.find((item) => item.id === folder.id)).toMatchObject({ kind: 'photos', pdfPath: null, pageCount: 2 })
    expect(manifest.photoPages).toHaveLength(2)

    const restored = await readWorkspaceBackup(new File([backup], 'photos.doanbogo'))
    expect(restored.documents.find((item) => item.id === folder.id)).toMatchObject({ kind: 'photos', pdf: null, pageCount: 2 })
    expect(await restored.documents.find((item) => item.id === folder.id)?.cover?.text()).toBe('small-cover')
    expect(restored.photoPages).toHaveLength(2)
    expect(await restored.photoPages?.[1].blob.text()).toBe('second-page')
    expect(restored.pages).toContainEqual({ documentId: folder.id, pageNumber: 2, hidden: false, bookmarked: true })

    await importWorkspaceData(restored)
    const imported = (await listDocuments()).find((item) => item.id !== folder.id && item.kind === 'photos')!
    expect(await getPhotoPages(imported.id)).toHaveLength(2)
    expect((await getPhotoPages(imported.id))[1].sourceName).toBe('02.jpg')
    await deleteDocument(folder.id)
    await deleteDocument(imported.id)
  })

  it('round-trips named thumbnail groups in the optional v14 viewer field', async () => {
    const id = crypto.randomUUID()
    const pdf = new Blob(['%PDF-1.7 thumbnail groups'], { type: 'application/pdf' })
    await addDocument({ id, fileName: 'groups.pdf', size: pdf.size, pageCount: 4, createdAt: Date.now(), lastOpenedAt: null, tags: [], pdf, cover: null })
    const viewer = await getViewer(id, 4)
    await saveViewer({ ...viewer, thumbnailGroups: [
      { id: 'body', name: '몸판', pageNumbers: [1, 3] },
      { id: 'empty', name: '빈 그룹', pageNumbers: [] },
    ] })

    expect((await getViewer(id, 4)).thumbnailGroups).toEqual([
      { id: 'body', name: '몸판', pageNumbers: [1, 3] },
      { id: 'empty', name: '빈 그룹', pageNumbers: [] },
    ])
    const backup = await createWorkspaceBackup()
    const restored = await readWorkspaceBackup(new File([backup], 'groups.doanbogo'))
    expect(restored.viewers.find((item) => item.documentId === id)?.thumbnailGroups).toEqual([
      { id: 'body', name: '몸판', pageNumbers: [1, 3] },
      { id: 'empty', name: '빈 그룹', pageNumbers: [] },
    ])

    await deleteDocument(id)
  })

  it('round-trips migrated progress line state and preserved legacy guides', async () => {
    const id = crypto.randomUUID()
    const pdf = new Blob(['%PDF-1.7 progress-lines'], { type: 'application/pdf' })
    await addDocument({ id, fileName: 'progress.pdf', size: pdf.size, pageCount: 1, createdAt: Date.now(), lastOpenedAt: null, tags: [], pdf, cover: null })
    const work = await getPageWork(id, 1)
    const primary = {
      id: 'primary', role: 'primary' as const, position: 0.42, xStartRatio: 0.18, xEndRatio: 0.82, markerProgress: 0.6, opacity: 0.8, thickness: 7,
      rotationPositions: { '90': { position: 0.55, xStartRatio: 0.2, xEndRatio: 0.8, rowSpacing: 0.04, rowSpacingStartRow: 42, rowSpacingDirection: 'down' as const } },
    }
    await savePageWork({
      ...work, progressMigration: 'complete', horizontalGuides: [primary], verticalGuides: [],
      legacyProgressGuides: { horizontalGuides: [{ id: 'old-h', position: 0.4 }], verticalGuides: [{ id: 'old-v', position: 0.7 }] },
    })
    const backup = await createWorkspaceBackup()
    const restored = await readWorkspaceBackup(new File([backup], 'progress.doanbogo'))
    expect(restored.pageWork[0]).toMatchObject({
      progressMigration: 'complete',
      horizontalGuides: [{ id: 'primary', role: 'primary', xStartRatio: 0.18, xEndRatio: 0.82, markerProgress: 0.6, thickness: 7, rotationPositions: { '90': { position: 0.55, rowSpacing: 0.04 } } }],
      verticalGuides: [],
      legacyProgressGuides: { horizontalGuides: [{ id: 'old-h' }], verticalGuides: [{ id: 'old-v' }] },
    })
    await deleteDocument(id)
  })

  it('discards legacy crop slots from five-slot, ten-slot, and malformed viewer backups', async () => {
    const id = crypto.randomUUID()
    const pdf = new Blob(['%PDF-1.7 slot-test'], { type: 'application/pdf' })
    await addDocument({
      id, fileName: 'legacy-slots.pdf', size: pdf.size, pageCount: 1, createdAt: Date.now(),
      lastOpenedAt: null, tags: [], pdf, cover: null,
    })
    await saveViewer(await getViewer(id, 1))

    const exported = await createWorkspaceBackup()
    const entries = unzipSync(new Uint8Array(await exported.arrayBuffer()))
    const manifest = JSON.parse(strFromU8(entries['manifest.json'])) as { viewers: Record<string, unknown>[] }
    const savedViewer = manifest.viewers.find((item) => item.documentId === id)
    expect(savedViewer).toBeDefined()
    for (const techniqueSlots of [
      Array(5).fill(null),
      Array(10).fill(null),
      'invalid legacy data',
    ]) {
      const legacyManifest = JSON.parse(JSON.stringify(manifest)) as typeof manifest
      const legacyViewer = legacyManifest.viewers.find((item) => item.documentId === id)!
      legacyViewer.techniqueSlots = techniqueSlots
      const legacyBackup = new File([zipSync({ ...entries, 'manifest.json': strToU8(JSON.stringify(legacyManifest)) })], 'legacy-slots.doanbogo')
      const restored = await readWorkspaceBackup(legacyBackup)
      const restoredViewer = restored.viewers.find((item) => item.documentId === id)!
      expect(restoredViewer).not.toHaveProperty('techniqueSlots')
      expect(restoredViewer.counters).toEqual([])
      const legacyRestoredViewer = restoredViewer as unknown as { techniqueSlots?: unknown }
      legacyRestoredViewer.techniqueSlots = techniqueSlots
      await importWorkspaceData(restored)
    }

    const reexported = await createWorkspaceBackup()
    const reexportedEntries = unzipSync(new Uint8Array(await reexported.arrayBuffer()))
    const reexportedManifest = JSON.parse(strFromU8(reexportedEntries['manifest.json'])) as { viewers: Record<string, unknown>[] }
    expect(reexportedManifest.viewers.every((item) => !Object.hasOwn(item, 'techniqueSlots'))).toBe(true)
    for (const document of (await listDocuments('name')).filter((item) => item.fileName === 'legacy-slots.pdf')) {
      await deleteDocument(document.id)
    }
  })

  it('restores an associated knitting report and its photos with a new document id', async () => {
    const pdf = new Blob(['%PDF-1.7 knitting report'], { type: 'application/pdf' })
    const documentId = crypto.randomUUID()
    await addDocument({
      id: documentId, fileName: '가디건.pdf', size: pdf.size, pageCount: 1,
      createdAt: Date.now(), lastOpenedAt: null, tags: [], pdf, cover: null,
    })
    const report: KnittingReport = {
      id: crypto.randomUUID(), documentId, title: '가디건 프로젝트', createdAt: Date.now(), updatedAt: Date.now(),
      fields: { 'project.name': '가디건 프로젝트', 'project.status': '완성' },
      representativePhoto: 'data:image/jpeg;base64,/9j/4AAQ',
      yarns: [], needles: [], accessories: [],
      measurements: [{ id: 'size-1', label: '기장', pattern: '54cm', finished: '57cm' }],
      modifications: [], finishedPhotos: [{ id: 'photo-1', label: '정면', dataUrl: 'data:image/jpeg;base64,/9j/4AAQ' }],
      workPhotos: [{ id: 'work-1', label: '소매 진행', dataUrl: 'data:image/jpeg;base64,/9j/4AAQ', uploadedAt: Date.now(), activityDate: '2026-10-01' }],
    }
    await saveKnittingReport(report)
    const secondReport = await saveKnittingReport({
      ...report,
      id: crypto.randomUUID(),
      title: '두 번째 프로젝트',
      fields: { 'project.name': '두 번째 프로젝트' },
    })
    expect(await getKnittingReports(documentId)).toHaveLength(2)
    const copy = await duplicateDocument(documentId)
    expect((await getKnittingReports(copy.id)).map((item) => item.title)).toContain('복사본 - 가디건 프로젝트')
    expect(await getKnittingReports(copy.id)).toHaveLength(2)
    expect((await getKnittingReports(copy.id)).map((item) => item.id)).not.toContain(secondReport.id)
    await deleteDocument(copy.id)
    const backup = await createWorkspaceBackup()
    const restored = await readWorkspaceBackup(new File([backup], 'report.doanbogo'))
    expect(restored.knittingReports.filter((item) => item.documentId === documentId)).toHaveLength(2)
    expect(restored.knittingReports).toContainEqual(expect.objectContaining({ title: report.title, representativePhoto: report.representativePhoto }))

    const archiveEntries = unzipSync(new Uint8Array(await backup.arrayBuffer()))
    const legacyManifest = JSON.parse(strFromU8(archiveEntries['manifest.json'])) as { version: number; knittingReports: Record<string, unknown>[] }
    legacyManifest.version = 7
    legacyManifest.knittingReports = legacyManifest.knittingReports.filter((item) => item.documentId === documentId).slice(0, 1).map(({ id: _id, workPhotos: _workPhotos, ...item }) => item)
    const legacyBackup = new File([zipSync({ ...archiveEntries, 'manifest.json': strToU8(JSON.stringify(legacyManifest)) })], 'legacy-report.doanbogo')
    const legacyRestored = await readWorkspaceBackup(legacyBackup)
    expect(legacyRestored.knittingReports[0]).toMatchObject({ id: documentId, documentId, workPhotos: [] })

    await importWorkspaceData(restored)
    const imported = (await listDocuments('name')).find((item) => item.id !== documentId)
    expect(imported).toBeTruthy()
    expect(await getKnittingReports(imported!.id)).toContainEqual(expect.objectContaining({ documentId: imported!.id, fields: report.fields, finishedPhotos: report.finishedPhotos, workPhotos: report.workPhotos }))
    await deleteDocument(documentId)
    await deleteDocument(imported!.id)
    expect(await getKnittingReport(documentId)).toBeUndefined()
  })

  it('round-trips PDFs and work state while assigning a new id on collision', async () => {
    const pdf = new Blob(['%PDF-1.7 sample'], { type: 'application/pdf' })
    const original: DocumentRecord = {
      id: crypto.randomUUID(),
      fileName: '겨울 도안.pdf',
      size: pdf.size,
      pageCount: 5,
      createdAt: Date.now(),
      lastOpenedAt: null,
      tags: ['겨울', '선물'],
      pdf,
      cover: new Blob(['jpeg-cover'], { type: 'image/jpeg' }),
    }
    await addDocument(original)
    const originalProject = await getHomeProject('document', original.id)
    const archivedAt = Date.now()
    await saveHomeProject({ ...originalProject!, status: 'paused', archivedAt })
    await setPageFlag(original.id, 3, 'bookmarked', true)
    const viewer = await getViewer(original.id, original.pageCount)
    const rowCounter = { ...createCounter('simple', '몸판 단'), id: 'body-row', value: 19, unit: 'row' as const, goalRow: 36, goalFinalSide: 'rs' as const, firstSide: 'ws' as const }
    const patternCounter = { ...createCounter('pattern', '몸판 무늬'), id: 'body-pattern', linkedToId: rowCounter.id, value: 3, currentRow: 19, patternRow: 3, startRow: 5, repeatLength: 12, repeatCount: 3, repeatStartNumber: 1, patternPreviewEnabled: true }
    const taskCounter = { ...createCounter('task', '몸판 줄임'), id: 'body-decrease', linkedToId: rowCounter.id, value: 1, currentRow: 19, taskKind: 'decrease' as const, firstTaskRow: 6, interval: 6, total: 8, completedCount: 1, nextTaskRow: 24, taskRecords: [{ row: 6, status: 'done' as const }, { row: 12, status: 'missed' as const }] }
    const counters = [rowCounter, patternCounter, taskCounter]
    await saveViewer({
      ...viewer,
      thumbnailGroups: [{ id: 'label-a', name: 'A', pageNumbers: [2, 5] }],
      counters,
      counterHistory: [{ id: 'history-1', label: '몸판 단 · 19단 완료', counters, guides: [], actualRow: 19, baseCounterId: rowCounter.id, timeLapId: 'lap-1', savedAt: Date.now() }],
      counterTimeLaps: [{ id: 'lap-1', counterId: rowCounter.id, sessionId: 'session-1', historyEntryId: 'history-1', elapsedMs: 120000, durationMs: 120000, rowDelta: 1, recordedAt: Date.now() }],
      counterSoundEnabled: false,
      counterPreviewEnabled: true,
      counterVibrationEnabled: true,
      counterMainId: rowCounter.id,
      counterAlertAcknowledged: 'body-row:19:ack',
      counterGuideAutoPanId: 'h-1',
      primary: { ...viewer.primary, page: 4, zoom: 2, centerX: 0.37, centerY: 0.68, rotations: { 4: 90 } },
      secondary: { ...viewer.secondary, rotations: { 1: 270 } },
      progressSettings: {
        horizontal: { visible: true, color: '#edc21b', thickness: 5, opacity: 0.4 },
        vertical: { visible: false, color: '#2255ee', thickness: 2, opacity: 0.8 },
      },
      annotationSettings: {
        pen: { color: '#2766d4', thickness: 3, opacity: 0.9, fontSize: 16 },
        line: { color: '#243344', thickness: 4, opacity: 1, fontSize: 16 },
        highlight: { color: '#f3de41', thickness: 18, opacity: 0.3, fontSize: 16 },
        text: { color: '#28384c', thickness: 2, opacity: 1, fontSize: 20 },
      },
    })
    expect((await getViewer(original.id, original.pageCount)).counters?.[1]).toMatchObject({ kind: 'pattern', value: 3, name: '몸판 무늬' })
    await savePageWork({
      documentId: original.id,
      pageNumber: 4,
      horizontalPosition: 0.32,
      verticalPosition: 0.72,
      horizontalGuides: [{ id: 'h-1', position: 0.32, thickness: 36, linkedCounterId: patternCounter.id, name: patternCounter.name, color: patternCounter.color, chartRegion: { x: 0.1, y: 0.2, width: 0.8, height: 0.6, firstRow: 1, lastRow: 12, startCounterRow: 5, repeat: true, direction: 'top-to-bottom' }, focus: { enabled: true, strength: 'low', range: 1, scope: 'region', rowSpacing: 0.05, dimOpacity: 0.58, bandHeightRatio: 0.12 } }, { id: 'h-2', position: 0.68 }],
      verticalGuides: [{ id: 'v-1', position: 0.72 }],
      regionHighlights: [
        { id: 'region-1', x: 0.15, y: 0.25, width: 0.32, height: 0.18, color: '#C85E4B', opacity: 0.3 },
        { id: 'region-2', x: 0.2, y: 0.3, width: 0.2, height: 0.1, color: '#557A95', opacity: 0.6 },
      ],
      colorworkGrid: {
        chartWidthCm: 2, chartHeightCm: 3, gaugeStitches: 18, gaugeRows: 24, columns: 4, rows: 7,
        x: 0.21, y: 0.33, displayWidth: 0.17, displayHeight: 0.09, visible: true,
        cells: Array.from({ length: 28 }, (_, index) => index === 0 ? { color: '#f1c40f', opacity: 0.25 } : null),
      },
      annotations: [
        { id: 'ink-1', type: 'line', points: [{ x: 0.1, y: 0.2 }, { x: 0.8, y: 0.9 }], style: { color: '#123abc', thickness: 3, opacity: 0.7, fontSize: 16 } },
        { id: 'note-1', type: 'text', text: '앞판\n무늬 반복', points: [{ x: 0.2, y: 0.3 }], boxWidth: 0.42, boxHeight: 0.18, style: { color: '#123abc', thickness: 2, opacity: 1, fontSize: 16 } },
      ],
    })
    await savePreference('view', 'list')
    await savePreference('language', 'ja')
    const chart = createKnittingChart(2, 3, 'in', 18, 24)
    chart.title = '작은 색상 차트'
    chart.cells[0] = '#e34b4b'
    await saveChart(chart)
    const report: KnittingReport = {
      id: crypto.randomUUID(), documentId: original.id, title: '겨울 스웨터', createdAt: Date.now(), updatedAt: Date.now(), status: 'complete', completedAt: Date.now(),
      fields: { 'project.name': '겨울 스웨터', 'project.status': '완성' },
      representativePhoto: 'data:image/jpeg;base64,/9j/4AAQ',
      yarns: [{ id: 'yarn-1', photo: '', brand: '실가게', product: '메리노', colorName: '크림', colorNumber: '1012', lot: '', fiber: '', country: '', weightClass: '', recommendedNeedle: '', skeinWeight: '', skeinLength: '', retailer: '', purchaseLink: '', price: '', quantity: '', usedSkeins: '4.3', usedWeight: '215', usedMeters: '850', memo: '부드러운 실', leftover: '' }], needles: [], accessories: [],
      measurements: [{ id: 'measure-1', label: '기장', pattern: '54cm', finished: '57cm', unit: 'inch' }],
      modifications: [], analysisCandidates: [{ id: 'candidate-1', section: '소매', original: '', changed: '-2cm', memo: '', source: 'note_extraction', status: 'suggested', evidence: '소매 2cm 짧게', fingerprint: 'note:1:a' }], finishedPhotos: [{ id: 'photo-1', label: '정면', dataUrl: 'data:image/jpeg;base64,/9j/4AAQ' }], workPhotos: [],
    }
    const savedReport = await saveKnittingReport(report)

    const backup = await createWorkspaceBackup()
    const archiveEntries = unzipSync(new Uint8Array(await backup.arrayBuffer()))
    const manifest = JSON.parse(strFromU8(archiveEntries['manifest.json']))
    expect(manifest.version).toBe(14)
    manifest.pages.push(
      { documentId: original.id, pageNumber: 2, hidden: true, hiddenGroupId: 'hide-batch-1', bookmarked: false },
      { documentId: original.id, pageNumber: 5, hidden: true, hiddenGroupId: 'hide-batch-1', bookmarked: false },
    )
    const legacyBackup = new File([zipSync({ ...archiveEntries, 'manifest.json': strToU8(JSON.stringify(manifest)) })], 'legacy-hidden.doanbogo')
    const restored = await readWorkspaceBackup(legacyBackup)
    const restoredViewer = restored.viewers.find((entry) => entry.documentId === original.id)!
    const restoredDocument = restored.documents.find((document) => document.id === original.id)!
    expect(restoredDocument.fileName).toBe(original.fileName)
    expect(new TextDecoder().decode(await restoredDocument.pdf!.arrayBuffer())).toBe('%PDF-1.7 sample')
    expect(restored.pages.find((page) => page.pageNumber === 3)).toMatchObject({ documentId: original.id, pageNumber: 3, hidden: false, bookmarked: true })
    expect(restored.pages.filter((page) => [2, 5].includes(page.pageNumber))).toEqual([
      { documentId: original.id, pageNumber: 2, hidden: false, bookmarked: false },
      { documentId: original.id, pageNumber: 5, hidden: false, bookmarked: false },
    ])
    expect(restored.pages.every((page) => !('hiddenGroupId' in page))).toBe(true)
    expect(restoredViewer.thumbnailGroups).toEqual([{ id: 'label-a', name: 'A', pageNumbers: [2, 5] }])
    expect(restoredViewer.primary).toMatchObject({ page: 4, zoom: 2, centerX: 0.37, centerY: 0.68 })
    expect(restoredViewer.primary.rotations).toEqual({ 4: 90 })
    expect(restoredViewer.secondary.rotations).toEqual({ 1: 270 })
    expect(restoredViewer.progressSettings?.horizontal).toMatchObject({ color: '#edc21b', thickness: 5, opacity: 0.4 })
    expect(restoredViewer.annotationSettings?.text).toMatchObject({ color: '#28384c', fontSize: 20 })
    expect(restoredViewer.counters).toMatchObject([
      { id: 'body-row', kind: 'simple', value: 19, name: '몸판 단', goalRow: 36, goalFinalSide: 'rs', firstSide: 'ws' },
      { id: 'body-pattern', kind: 'pattern', currentRow: 19, patternRow: 3, repeatLength: 12, repeatCount: 3, patternPreviewEnabled: true },
      { id: 'body-decrease', kind: 'task', completedCount: 1, nextTaskRow: 24, taskRecords: [{ row: 6, status: 'done' }, { row: 12, status: 'missed' }] },
    ])
    expect(restoredViewer.counterHistory).toHaveLength(1)
    expect(restoredViewer.counterHistory?.[0].baseCounterId).toBe('body-row')
    expect(restoredViewer.counterHistory?.[0].timeLapId).toBe('lap-1')
    expect(restoredViewer.counterTimeLaps).toMatchObject([{ id: 'lap-1', counterId: 'body-row', sessionId: 'session-1', historyEntryId: 'history-1', elapsedMs: 120000, durationMs: 120000, rowDelta: 1 }])
    expect(restoredViewer.counterPreviewEnabled).toBe(true)
    expect(restoredViewer.counterVibrationEnabled).toBe(true)
    expect(restoredViewer.counterMainId).toBe('body-row')
    expect(restoredViewer.counterAlertAcknowledged).toBe('body-row:19:ack')
    expect(restoredViewer.counterGuideAutoPanId).toBe('h-1')
    expect(restored.pageWork[0]).toMatchObject({
      pageNumber: 4,
      horizontalGuides: [{ id: 'h-1', position: 0.32, thickness: 36, linkedCounterId: 'body-pattern', focus: { enabled: true, strength: 'low', range: 1, scope: 'region', rowSpacing: 0.05, dimOpacity: 0.58, bandHeightRatio: 0.12 } }, { id: 'h-2', position: 0.68 }],
      verticalGuides: [{ id: 'v-1', position: 0.72 }],
      regionHighlights: [
        { id: 'region-1', x: 0.15, y: 0.25, width: 0.32, height: 0.18, color: '#C85E4B', opacity: 0.3 },
        { id: 'region-2', x: 0.2, y: 0.3, width: 0.2, height: 0.1, color: '#557A95', opacity: 0.6 },
      ],
      colorworkGrid: { chartWidthCm: 2, chartHeightCm: 3, columns: 4, rows: 7, visible: true },
      annotations: [{ id: 'ink-1', type: 'line' }, { id: 'note-1', text: '앞판\n무늬 반복', boxWidth: 0.42, boxHeight: 0.18 }],
    })
    expect(restored.pageWork[0].colorworkGrid?.cells).toHaveLength(28)
    expect(restored.pageWork[0].colorworkGrid?.cells[0]).toEqual({ color: '#f1c40f', opacity: 0.25 })
    expect(restored.preferences).toContainEqual({ key: 'view', value: 'list' })
    expect(restored.preferences).toContainEqual({ key: 'language', value: 'ja' })
    expect(restored.charts).toEqual([expect.objectContaining({ id: chart.id, title: chart.title, cells: ['#e34b4b', null, null, null, null, null] })])
    expect(restored.homeProjects).toContainEqual(expect.objectContaining({ key: 'document:' + original.id, status: 'paused', archivedAt }))
    expect(restored.knittingReports.filter((item) => item.documentId === original.id)).toEqual([savedReport])

    expect(await importWorkspaceData(restored)).toBe(2)
    expect(await getPreference('language')).toBe('ja')
    const imported = (await listDocuments('name')).find((item) => item.id !== original.id)
    expect(imported?.id).toBeTruthy()
    expect(await getHomeProject('document', imported!.id)).toMatchObject({ status: 'paused', archivedAt })
    expect((await getPages(imported!.id)).find((page) => page.pageNumber === 3)).toMatchObject({ documentId: imported!.id, pageNumber: 3, bookmarked: true })
    expect((await getViewer(imported!.id, original.pageCount)).primary).toMatchObject({ page: 4, zoom: 2, centerX: 0.37, centerY: 0.68 })
    expect((await getViewer(imported!.id, original.pageCount)).counters?.[1]).toMatchObject({ kind: 'pattern', value: 3, name: '몸판 무늬' })
    expect(await getPageWork(imported!.id, 4)).toMatchObject({
      horizontalGuides: [{ id: 'h-1', position: 0.32 }, { id: 'h-2', position: 0.68 }],
      verticalGuides: [{ id: 'v-1', position: 0.72 }],
      regionHighlights: [
        { id: 'region-1', x: 0.15, y: 0.25, width: 0.32, height: 0.18, color: '#C85E4B', opacity: 0.3 },
        { id: 'region-2', x: 0.2, y: 0.3, width: 0.2, height: 0.1, color: '#557A95', opacity: 0.6 },
      ],
      annotations: [{ id: 'ink-1' }, { id: 'note-1', boxWidth: 0.42, boxHeight: 0.18 }],
    })
    expect((await getPageWork(imported!.id, 4)).colorworkGrid?.cells[0]).toEqual({ color: '#f1c40f', opacity: 0.25 })
    expect(await getKnittingReport(imported!.id)).toMatchObject({
      documentId: imported!.id,
      status: 'complete',
      completedAt: savedReport.completedAt,
      fields: { 'project.name': '겨울 스웨터' },
      representativePhoto: 'data:image/jpeg;base64,/9j/4AAQ',
      finishedPhotos: [{ id: 'photo-1', label: '정면', dataUrl: 'data:image/jpeg;base64,/9j/4AAQ' }],
    })
    const importedChart = (await listCharts()).find((item) => item.id !== chart.id)
    expect(importedChart?.id).toBeTruthy()
    expect(await getChart(importedChart!.id)).toMatchObject({ title: '작은 색상 차트', cells: ['#e34b4b', null, null, null, null, null] })

    await deleteChart(chart.id)
    await deleteChart(importedChart!.id)
    await deleteDocument(original.id)
    await deleteDocument(imported!.id)
  })

  it('imports v9 counters into the independent simple, pattern, and task model', async () => {
    const pdf = new Blob(['%PDF-1.7 v9 migration'], { type: 'application/pdf' })
    const documentId = crypto.randomUUID()
    await addDocument({ id: documentId, fileName: 'v9.pdf', size: pdf.size, pageCount: 1, createdAt: Date.now(), lastOpenedAt: null, tags: [], pdf, cover: null })
    await saveViewer(await getViewer(documentId, 1))
    const exported = await createWorkspaceBackup()
    const entries = unzipSync(new Uint8Array(await exported.arrayBuffer()))
    const manifest = JSON.parse(strFromU8(entries['manifest.json'])) as { version: number; viewers: Record<string, unknown>[] }
    manifest.version = 9
    const viewer = manifest.viewers.find((item) => item.documentId === documentId)!
    viewer.counters = Array.from({ length: 5 }, (_, index) => ({
      mode: index === 0 ? 'repeat' : 'simple', value: index === 0 ? 19 : 0, repeatName: '몸판 무늬', startRow: 5,
      repeatLength: 12, repeatCount: 3,
      taskRules: index === 0 ? [{ id: 'decrease-1', kind: 'decrease', interval: 6, total: 8 }] : [],
      taskOccurrences: index === 0 ? [{ ruleId: 'decrease-1', occurrence: 1, status: 'done' }, { ruleId: 'decrease-1', occurrence: 2, status: 'missed' }] : [],
    }))
    expect(isLegacyCounterSnapshots(viewer.counters)).toBe(true)
    const legacy = new File([zipSync({ ...entries, 'manifest.json': strToU8(JSON.stringify(manifest)) })], 'v9.doanbogo')
    const restored = await readWorkspaceBackup(legacy)
    const migrated = restored.viewers.find((item) => item.documentId === documentId)!
    expect(migrated.counters).toHaveLength(7)
    expect(migrated.counters?.slice(0, 3)).toMatchObject([
      { kind: 'simple', value: 19, name: '몸판 무늬 단' },
      { kind: 'pattern', currentRow: 19, patternRow: 3, repeatLength: 12, repeatCount: 3 },
      { kind: 'task', completedCount: 1, nextTaskRow: 24, taskRecords: [{ row: 6, status: 'done' }, { row: 12, status: 'missed' }] },
    ])
    await deleteDocument(documentId)
  })

  it('imports v1 backups without page work', async () => {
    const pdf = new TextEncoder().encode('%PDF-1.7 legacy')
    const manifest = {
      format: 'doanbogo',
      version: 1,
      exportedAt: Date.now(),
      documents: [{ id: 'legacy-document', fileName: 'legacy.pdf', size: pdf.byteLength, pageCount: 1, createdAt: 1, lastOpenedAt: null, tags: [], pdfPath: 'documents/000000.pdf', coverPath: null }],
      pages: [],
      viewers: [],
      preferences: [],
    }
    const backup = new File([zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest)), 'documents/000000.pdf': pdf })], 'legacy.doanbogo')
    const restored = await readWorkspaceBackup(backup)
    expect(restored.documents[0].fileName).toBe('legacy.pdf')
    expect(restored.pageWork).toEqual([])
    expect(restored.knittingReports).toEqual([])
  })

  it('imports v2 scalar guide positions and note text without losing their original data', async () => {
    const pdf = new TextEncoder().encode('%PDF-1.7 legacy-v2')
    const manifest = {
      format: 'doanbogo', version: 2, exportedAt: Date.now(),
      documents: [{ id: 'legacy-v2', fileName: 'legacy-v2.pdf', size: pdf.byteLength, pageCount: 1, createdAt: 1, lastOpenedAt: null, tags: [], pdfPath: 'documents/000000.pdf', coverPath: null }],
      pages: [], viewers: [], preferences: [],
      pageWork: [{
        documentId: 'legacy-v2', pageNumber: 1, horizontalPosition: 0.25, verticalPosition: 0.75,
        annotations: [{ id: 'legacy-note', type: 'text', text: '기존 메모', points: [{ x: 0.2, y: 0.4 }], style: { color: '#123abc', thickness: 2, opacity: 1, fontSize: 18 } }],
      }],
    }
    const backup = new File([zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest)), 'documents/000000.pdf': pdf })], 'legacy-v2.doanbogo')
    const restored = await readWorkspaceBackup(backup)
    expect(restored.pageWork[0]).toMatchObject({
      horizontalGuides: [{ id: 'legacy-horizontal', position: 0.25 }],
      verticalGuides: [{ id: 'legacy-vertical', position: 0.75 }],
      regionHighlights: [],
      annotations: [{ id: 'legacy-note', text: '기존 메모', points: [{ x: 0.2, y: 0.4 }] }],
    })
  })

  it('imports v4 backups without a colorwork grid', async () => {
    const pdf = new TextEncoder().encode('%PDF-1.7 legacy-v4')
    const manifest = {
      format: 'doanbogo', version: 4, exportedAt: Date.now(),
      documents: [{ id: 'legacy-v4', fileName: 'legacy-v4.pdf', size: pdf.byteLength, pageCount: 1, createdAt: 1, lastOpenedAt: null, tags: [], pdfPath: 'documents/000000.pdf', coverPath: null }],
      pages: [], viewers: [], preferences: [], charts: [],
      pageWork: [{
        documentId: 'legacy-v4', pageNumber: 1, horizontalPosition: 0.5, verticalPosition: 0.5,
        horizontalGuides: [], verticalGuides: [], annotations: [],
      }],
    }
    const backup = new File([zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest)), 'documents/000000.pdf': pdf })], 'legacy-v4.doanbogo')
    const restored = await readWorkspaceBackup(backup)
    expect(restored.pageWork[0].colorworkGrid).toBeUndefined()
  })

  it('imports v6 backups and drops legacy freeform colorwork rectangles', async () => {
    const pdf = new TextEncoder().encode('%PDF-1.7 legacy-v6')
    const manifest = {
      format: 'doanbogo', version: 6, exportedAt: Date.now(),
      documents: [{ id: 'legacy-v6', fileName: 'legacy-v6.pdf', size: pdf.byteLength, pageCount: 1, createdAt: 1, lastOpenedAt: null, tags: [], pdfPath: 'documents/000000.pdf', coverPath: null }],
      pages: [], viewers: [], preferences: [], charts: [], knittingReports: [],
      pageWork: [{
        documentId: 'legacy-v6', pageNumber: 1, horizontalPosition: 0.5, verticalPosition: 0.5,
        horizontalGuides: [], verticalGuides: [], annotations: [],
        rectangles: [{ id: 'old-rectangle', x: 0.1, y: 0.2, width: 0.3, height: 0.4, color: '#f1c40f', opacity: 0.25 }],
      }],
    }
    const backup = new File([zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest)), 'documents/000000.pdf': pdf })], 'legacy-v6.doanbogo')

    const restored = await readWorkspaceBackup(backup)

    expect(restored.pageWork[0].colorworkGrid).toBeUndefined()
    expect(restored.pageWork[0]).not.toHaveProperty('rectangles')
  })

  it('rejects region highlights outside the normalized page or opacity range', async () => {
    const pdf = new TextEncoder().encode('%PDF-1.7 invalid-highlight')
    const base = {
      format: 'doanbogo', version: 14, exportedAt: Date.now(),
      documents: [{ id: 'invalid-region', fileName: 'region.pdf', size: pdf.byteLength, pageCount: 1, createdAt: 1, lastOpenedAt: null, tags: [], pdfPath: 'documents/000000.pdf', coverPath: null }],
      pages: [], viewers: [], preferences: [], charts: [], knittingReports: [], photoPages: [],
      pageWork: [{ documentId: 'invalid-region', pageNumber: 1, horizontalPosition: 0.5, verticalPosition: 0.5, annotations: [], regionHighlights: [] as unknown[] }],
    }
    for (const region of [
      { id: 'outside', x: 0.9, y: 0.2, width: 0.2, height: 0.3, color: '#C85E4B', opacity: 0.3 },
      { id: 'opacity', x: 0.2, y: 0.2, width: 0.3, height: 0.3, color: '#C85E4B', opacity: 0.09 },
    ]) {
      base.pageWork[0].regionHighlights = [region]
      const backup = new File([zipSync({ 'manifest.json': strToU8(JSON.stringify(base)), 'documents/000000.pdf': pdf })], 'invalid-region.doanbogo')
      await expect(readWorkspaceBackup(backup)).rejects.toThrow('작업 파일에 올바르지 않은 진행선·필기 정보가 있습니다.')
    }
  })

  it('rejects invalid progress guide data', async () => {
    const pdf = new TextEncoder().encode('%PDF-1.7 too-many-guides')
    for (const horizontalGuides of [
      Array.from({ length: 11 }, (_, index) => ({ id: 'h-' + index, position: 0.5 })),
      [{ id: 'h-1', position: 0.5, thickness: 37 }],
      [{ id: 'h-1', position: 0.5, focus: { enabled: true, strength: 'medium', range: 0, scope: 'page', rowSpacing: 0.03, dimOpacity: 0.81 } }],
      [{ id: 'h-1', position: 0.5, focus: { enabled: true, strength: 'medium', range: 0, scope: 'page', rowSpacing: 0.03, bandHeightRatio: 0.31 } }],
    ]) {
      const manifest = {
        format: 'doanbogo', version: 3, exportedAt: Date.now(),
        documents: [{ id: 'invalid-guides', fileName: 'guides.pdf', size: pdf.byteLength, pageCount: 1, createdAt: 1, lastOpenedAt: null, tags: [], pdfPath: 'documents/000000.pdf', coverPath: null }],
        pages: [], viewers: [], preferences: [],
        pageWork: [{
          documentId: 'invalid-guides', pageNumber: 1, horizontalPosition: 0.5, verticalPosition: 0.5,
          horizontalGuides, verticalGuides: [], annotations: [],
        }],
      }
      const backup = new File([zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest)), 'documents/000000.pdf': pdf })], 'invalid.doanbogo')
      await expect(readWorkspaceBackup(backup)).rejects.toThrow('올바르지 않은 진행선·필기 정보')
    }
  })

})

describe('raster PDF output', () => {
  it('writes each image into a separate A4 page', async () => {
    const pdf = await makeRasterPdf([
      { jpeg: new Uint8Array([0xff, 0xd8, 0xff]), width: 100, height: 140 },
      { jpeg: new Uint8Array([0xff, 0xd8, 0xff]), width: 140, height: 100 },
    ])
    const source = new TextDecoder().decode(await pdf.arrayBuffer())
    expect(source.startsWith('%PDF-1.4')).toBe(true)
    expect(source).toContain('/Count 2')
    expect(source).toContain('/Im0 4 0 R')
    expect(source).toContain('/Im1 7 0 R')
    expect(source.endsWith('%%EOF')).toBe(true)
  })
})
