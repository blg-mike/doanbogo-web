import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { getPageRecognition, savePageRecognition } from './storage'

vi.mock('./storage', () => ({ getPageRecognition: vi.fn(), savePageRecognition: vi.fn() }))
vi.mock('./pdf', () => ({ openPdf: vi.fn() }))
vi.mock('./photoDocument', () => ({ openPhotoDocument: vi.fn() }))

describe('page recognition cache failures', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('reports a cache read error without scanning or replacing the existing result', async () => {
    vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: vi.fn() })
    vi.mocked(getPageRecognition).mockRejectedValueOnce(new Error('Storage unavailable'))
    const { requestPdfPageRecognition, subscribePdfRecognition } = await import('./pdfRecognition')
    const listener = vi.fn()
    const unsubscribe = subscribePdfRecognition(listener)
    const pdf = { getPage: vi.fn() } as unknown as PDFDocumentProxy

    requestPdfPageRecognition({ id: 'document', pageCount: 3, pdf: new Blob(), kind: 'pdf' }, 2, pdf, true)
    await vi.waitFor(() => expect(listener).toHaveBeenCalledWith('document', 2, { kind: 'error' }))

    expect(pdf.getPage).not.toHaveBeenCalled()
    expect(savePageRecognition).not.toHaveBeenCalled()
    unsubscribe()
  })
})
