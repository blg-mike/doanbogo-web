import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { createWorkspaceBackup, readWorkspaceBackup } from './backup'
import { addDocument, deleteChart, deleteDocument, duplicateDocument, getChart, getKnittingReport, getPageWork, getPages, getViewer, importWorkspaceData, listCharts, listDocuments, saveChart, saveKnittingReport, savePageWork, savePreference, saveViewer, setPageFlag } from './storage'
import { createKnittingChart, makeRasterPdf } from './charts'
import type { DocumentRecord, KnittingReport } from './types'

describe('portable workspace backup', () => {
  it('adds page work storage when opening an existing v1 database', async () => {
    const request = indexedDB.open('doanbogo-web', 1)
    request.onupgradeneeded = () => {
      const db = request.result
      const documents = db.createObjectStore('documents', { keyPath: 'id' })
      documents.createIndex('by-created', 'createdAt')
      documents.createIndex('by-opened', 'lastOpenedAt')
      const pages = db.createObjectStore('pages', { keyPath: ['documentId', 'pageNumber'] })
      pages.createIndex('by-document', 'documentId')
      db.createObjectStore('viewers', { keyPath: 'documentId' })
      db.createObjectStore('preferences', { keyPath: 'key' })
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
    const work = await getPageWork('migration-check', 1)
    expect(work).toMatchObject({ horizontalPosition: 0.5, verticalPosition: 0.5, annotations: [] })
    await savePageWork({ ...work, horizontalPosition: 0.25 })
    expect(await getPageWork('migration-check', 1)).toMatchObject({ horizontalPosition: 0.25 })
    await deleteDocument('migration-check')
  })

  it('restores an associated knitting report and its photos with a new document id', async () => {
    const pdf = new Blob(['%PDF-1.7 knitting report'], { type: 'application/pdf' })
    const documentId = crypto.randomUUID()
    await addDocument({
      id: documentId, fileName: '가디건.pdf', size: pdf.size, pageCount: 1,
      createdAt: Date.now(), lastOpenedAt: null, tags: [], pdf, cover: null,
    })
    const report: KnittingReport = {
      documentId, title: '가디건 프로젝트', createdAt: Date.now(), updatedAt: Date.now(),
      fields: { 'project.name': '가디건 프로젝트', 'project.status': '완성' },
      representativePhoto: 'data:image/jpeg;base64,/9j/4AAQ',
      yarns: [], needles: [], accessories: [],
      measurements: [{ id: 'size-1', label: '기장', pattern: '54cm', finished: '57cm' }],
      modifications: [], finishedPhotos: [{ id: 'photo-1', label: '정면', dataUrl: 'data:image/jpeg;base64,/9j/4AAQ' }],
    }
    await saveKnittingReport(report)
    const copy = await duplicateDocument(documentId)
    expect(await getKnittingReport(copy.id)).toMatchObject({ title: '복사본 - 가디건 프로젝트', fields: { 'project.name': '복사본 - 가디건 프로젝트' } })
    await deleteDocument(copy.id)
    const backup = await createWorkspaceBackup()
    const restored = await readWorkspaceBackup(new File([backup], 'report.doanbogo'))
    expect(restored.knittingReports).toEqual([expect.objectContaining({ title: report.title, representativePhoto: report.representativePhoto })])

    await importWorkspaceData(restored)
    const imported = (await listDocuments('name')).find((item) => item.id !== documentId)
    expect(imported).toBeTruthy()
    expect(await getKnittingReport(imported!.id)).toMatchObject({ documentId: imported!.id, fields: report.fields, finishedPhotos: report.finishedPhotos })
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
    await setPageFlag(original.id, 3, 'bookmarked', true)
    const viewer = await getViewer(original.id, original.pageCount)
    await saveViewer({
      ...viewer,
      primary: { ...viewer.primary, page: 4, zoom: 2, centerX: 0.37, centerY: 0.68 },
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
      techniqueSlots: [
        { pageNumber: 4, x: 0.12, y: 0.23, width: 0.45, height: 0.38 }, null, null, null, null,
      ],
    })
    await savePageWork({
      documentId: original.id,
      pageNumber: 4,
      horizontalPosition: 0.32,
      verticalPosition: 0.72,
      horizontalGuides: [{ id: 'h-1', position: 0.32 }, { id: 'h-2', position: 0.68 }],
      verticalGuides: [{ id: 'v-1', position: 0.72 }],
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
    const chart = createKnittingChart(2, 3, 'in', 18, 24)
    chart.title = '작은 색상 차트'
    chart.cells[0] = '#e34b4b'
    await saveChart(chart)
    const report: KnittingReport = {
      documentId: original.id, title: '겨울 스웨터', createdAt: Date.now(), updatedAt: Date.now(),
      fields: { 'project.name': '겨울 스웨터', 'project.status': '완성' },
      representativePhoto: 'data:image/jpeg;base64,/9j/4AAQ',
      yarns: [], needles: [], accessories: [],
      measurements: [{ id: 'measure-1', label: '기장', pattern: '54cm', finished: '57cm' }],
      modifications: [], finishedPhotos: [{ id: 'photo-1', label: '정면', dataUrl: 'data:image/jpeg;base64,/9j/4AAQ' }],
    }
    const savedReport = await saveKnittingReport(report)

    const backup = await createWorkspaceBackup()
    const restored = await readWorkspaceBackup(new File([backup], 'backup.doanbogo'))
    expect(restored.documents[0].fileName).toBe(original.fileName)
    expect(new TextDecoder().decode(await restored.documents[0].pdf.arrayBuffer())).toBe('%PDF-1.7 sample')
    expect(restored.pages[0]).toMatchObject({ documentId: original.id, pageNumber: 3, bookmarked: true })
    expect(restored.viewers[0].primary).toMatchObject({ page: 4, zoom: 2, centerX: 0.37, centerY: 0.68 })
    expect(restored.viewers[0].progressSettings?.horizontal).toMatchObject({ color: '#edc21b', thickness: 5, opacity: 0.4 })
    expect(restored.viewers[0].annotationSettings?.text).toMatchObject({ color: '#28384c', fontSize: 20 })
    expect(restored.viewers[0].techniqueSlots?.[0]).toEqual({ pageNumber: 4, x: 0.12, y: 0.23, width: 0.45, height: 0.38 })
    expect(restored.pageWork[0]).toMatchObject({
      pageNumber: 4,
      horizontalGuides: [{ id: 'h-1', position: 0.32 }, { id: 'h-2', position: 0.68 }],
      verticalGuides: [{ id: 'v-1', position: 0.72 }],
      colorworkGrid: { chartWidthCm: 2, chartHeightCm: 3, columns: 4, rows: 7, visible: true },
      annotations: [{ id: 'ink-1', type: 'line' }, { id: 'note-1', text: '앞판\n무늬 반복', boxWidth: 0.42, boxHeight: 0.18 }],
    })
    expect(restored.pageWork[0].colorworkGrid?.cells).toHaveLength(28)
    expect(restored.pageWork[0].colorworkGrid?.cells[0]).toEqual({ color: '#f1c40f', opacity: 0.25 })
    expect(restored.preferences).toContainEqual({ key: 'view', value: 'list' })
    expect(restored.charts).toEqual([expect.objectContaining({ id: chart.id, title: chart.title, cells: ['#e34b4b', null, null, null, null, null] })])
    expect(restored.knittingReports).toEqual([savedReport])

    expect(await importWorkspaceData(restored)).toBe(2)
    const imported = (await listDocuments('name')).find((item) => item.id !== original.id)
    expect(imported?.id).toBeTruthy()
    expect((await getPages(imported!.id))[0]).toMatchObject({ documentId: imported!.id, pageNumber: 3, bookmarked: true })
    expect((await getViewer(imported!.id, original.pageCount)).primary).toMatchObject({ page: 4, zoom: 2, centerX: 0.37, centerY: 0.68 })
    expect(await getPageWork(imported!.id, 4)).toMatchObject({
      horizontalGuides: [{ id: 'h-1', position: 0.32 }, { id: 'h-2', position: 0.68 }],
      verticalGuides: [{ id: 'v-1', position: 0.72 }],
      annotations: [{ id: 'ink-1' }, { id: 'note-1', boxWidth: 0.42, boxHeight: 0.18 }],
    })
    expect((await getPageWork(imported!.id, 4)).colorworkGrid?.cells[0]).toEqual({ color: '#f1c40f', opacity: 0.25 })
    expect(await getKnittingReport(imported!.id)).toMatchObject({
      documentId: imported!.id,
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

  it('rejects backup data with more than ten guides in one direction', async () => {
    const pdf = new TextEncoder().encode('%PDF-1.7 too-many-guides')
    const manifest = {
      format: 'doanbogo', version: 3, exportedAt: Date.now(),
      documents: [{ id: 'too-many-guides', fileName: 'guides.pdf', size: pdf.byteLength, pageCount: 1, createdAt: 1, lastOpenedAt: null, tags: [], pdfPath: 'documents/000000.pdf', coverPath: null }],
      pages: [], viewers: [], preferences: [],
      pageWork: [{
        documentId: 'too-many-guides', pageNumber: 1, horizontalPosition: 0.5, verticalPosition: 0.5,
        horizontalGuides: Array.from({ length: 11 }, (_, index) => ({ id: 'h-' + index, position: 0.5 })),
        verticalGuides: [], annotations: [],
      }],
    }
    const backup = new File([zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest)), 'documents/000000.pdf': pdf })], 'invalid.doanbogo')
    await expect(readWorkspaceBackup(backup)).rejects.toThrow('올바르지 않은 진행선·필기 정보')
  })

  it('rejects crop slots whose region extends beyond the PDF page', async () => {
    const pdf = new TextEncoder().encode('%PDF-1.7 invalid-crop')
    const pane = { page: 1, zoom: 1, centerX: 0.5, centerY: 0.5 }
    const manifest = {
      format: 'doanbogo', version: 7, exportedAt: Date.now(),
      documents: [{ id: 'invalid-crop', fileName: 'crop.pdf', size: pdf.byteLength, pageCount: 1, createdAt: 1, lastOpenedAt: null, tags: [], pdfPath: 'documents/000000.pdf', coverPath: null }],
      pages: [],
      viewers: [{
        documentId: 'invalid-crop', split: false, activePane: 'primary', primary: pane, secondary: pane,
        wideRatio: 0.65, tallRatio: 0.65, updatedAt: 1,
        techniqueSlots: [{ pageNumber: 1, x: 0.8, y: 0.2, width: 0.3, height: 0.4 }, null, null, null, null],
      }],
      preferences: [], pageWork: [], charts: [], knittingReports: [],
    }
    const backup = new File([zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest)), 'documents/000000.pdf': pdf })], 'invalid-crop.doanbogo')
    await expect(readWorkspaceBackup(backup)).rejects.toThrow('올바르지 않은 뷰어 정보')
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
