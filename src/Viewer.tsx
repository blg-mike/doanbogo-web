import { useCallback, useEffect, useRef, useState, type FormEvent as ReactFormEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { ArrowLeft, Bookmark, CaseSensitive, Check, Columns2, Eraser, Eye, EyeOff, Grid3X3, Hash, Highlighter, Minus, MousePointer2, Pencil, Plus, Redo2, SlidersHorizontal, Type, Undo2, X } from 'lucide-react'
import yyLogo from './assets/yy-logo.png'
import { PdfPage, PdfThumbnail } from './PdfPage'
import { getDocument, getPageWork, getPages, getViewer, markOpened, renameDocument, savePageWork, saveViewer, setPageFlag, setPagesFlag } from './storage'
import { openPdf, pdfErrorMessage } from './pdf'
import KnittingReport from './KnittingReport'
import type { AnnotationSettings, AnnotationStyle, AnnotationTool, ColorworkCreateRequest, ColorworkSettings, PageRecord, PageRotation, PageWorkRecord, PaneId, PaneSnapshot, ProgressSettings, TechniqueCropSlot, ViewerSnapshot } from './types'
import { defaultColorworkSettings, getColorworkDimensions, resizeColorworkGrid } from './colorwork'
import { clampCounterValue, counterValueFromInput } from './counter'
import { TechniqueDialog, TechniquePopover } from './Technique'
import { detectPdfQrLinks, extractPdfPageLinks, type PdfQrLink } from './qr'

type Size = { width: number; height: number }
type WorkAction = { before: PageWorkRecord; after: PageWorkRecord }
type PageHistory = { actions: WorkAction[]; cursor: number }
type CounterSessionState = { documentId: string; visible: boolean; values: number[]; editingIndex: number | null; draft: string }

function createCounterSession(documentId: string): CounterSessionState {
  return { documentId, visible: false, values: [0, 0, 0, 0, 0], editingIndex: null, draft: '' }
}

const defaultProgressSettings: ProgressSettings = {
  horizontal: { visible: true, color: '#f1c40f', thickness: 12, opacity: 0.5 },
  vertical: { visible: true, color: '#2673e8', thickness: 1, opacity: 1 },
}

const defaultAnnotationSettings: AnnotationSettings = {
  pen: { color: '#2673e8', thickness: 2, opacity: 1, fontSize: 16 },
  line: { color: '#2673e8', thickness: 2, opacity: 1, fontSize: 16 },
  highlight: { color: '#f1c40f', thickness: 16, opacity: 0.3, fontSize: 16 },
  text: { color: '#202d43', thickness: 2, opacity: 1, fontSize: 18 },
}

function clamp(value: number, low: number, high: number) {
  return Math.min(high, Math.max(low, value))
}

function dividerRatio(position: number, start: number, extent: number) {
  const handleSize = 14
  return clamp((position - start - handleSize / 2) / Math.max(1, extent - handleSize), 0.25, 0.75)
}

function splitBasis(ratio: number) {
  return 'calc(' + ratio * 100 + '% - ' + ratio * 14 + 'px)'
}

function blankWork(documentId: string, pageNumber: number): PageWorkRecord {
  return {
    documentId, pageNumber, horizontalPosition: 0.5, verticalPosition: 0.5, annotations: [],
    horizontalGuides: [{ id: 'legacy-horizontal', position: 0.5 }],
    verticalGuides: [{ id: 'legacy-vertical', position: 0.5 }],
  }
}

function HiddenPagesDialog({ pdf, pages, selected, onClose, onToggle, onRestoreSelected, onRestoreAll }: {
  pdf: PDFDocumentProxy
  pages: PageRecord[]
  selected: Set<number>
  onClose: () => void
  onToggle: (page: number) => void
  onRestoreSelected: () => void
  onRestoreAll: () => void
}) {
  const gridRef = useRef<HTMLDivElement>(null)
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="modal-card hidden-pages-modal" role="dialog" aria-modal="true" aria-label="숨긴 페이지 관리">
        <div className="modal-heading"><div><p className="eyebrow">PAGE MANAGEMENT</p><h2>숨긴 페이지</h2></div><button className="icon-button" aria-label="닫기" onClick={onClose}><X size={20} /></button></div>
        {pages.length ? <>
          <p className="hidden-page-hint">복구할 페이지를 선택하세요.</p>
          <div className="hidden-page-grid" ref={gridRef}>{pages.map((page) => <PdfThumbnail
            key={page.pageNumber} pdf={pdf} pageNumber={page.pageNumber} active={false} hidden bookmarked={page.bookmarked}
            selected={selected.has(page.pageNumber)} root={gridRef} onSelect={() => onToggle(page.pageNumber)}
          />)}</div>
          <div className="hidden-page-actions"><span>{selected.size}개 선택</span><button className="secondary-button" disabled={!selected.size} onClick={onRestoreSelected}><Eye size={16} />선택한 페이지 복구</button><button className="primary-button" onClick={onRestoreAll}><Eye size={16} />전체 복구</button></div>
        </> : <div className="no-hidden-pages">숨긴 페이지가 없습니다.</div>}
      </section>
    </div>
  )
}

function ProgressSettingsDialog({ settings, work, onSettingsChange, onWorkChange, onClose }: {
  settings: ProgressSettings
  work: PageWorkRecord
  onSettingsChange: (settings: ProgressSettings) => void
  onWorkChange: (work: PageWorkRecord, before: PageWorkRecord, immediate?: boolean, recordHistory?: boolean) => void
  onClose: () => void
}) {
  const guideEditBefore = useRef<PageWorkRecord | null>(null)

  function update(axis: 'horizontal' | 'vertical', change: Partial<ProgressSettings['horizontal']>) {
    onSettingsChange({ ...settings, [axis]: { ...settings[axis], ...change } })
  }

  function guides(axis: 'horizontal' | 'vertical') {
    return axis === 'horizontal' ? work.horizontalGuides ?? [{ id: 'legacy-horizontal', position: work.horizontalPosition }] : work.verticalGuides ?? [{ id: 'legacy-vertical', position: work.verticalPosition }]
  }

  function changeGuide(axis: 'horizontal' | 'vertical', id: string, position: number) {
    const key = axis === 'horizontal' ? 'horizontalGuides' : 'verticalGuides'
    const legacyKey = axis === 'horizontal' ? 'horizontalPosition' : 'verticalPosition'
    const before = guideEditBefore.current ?? work
    onWorkChange({ ...work, [key]: guides(axis).map((guide) => guide.id === id ? { ...guide, position } : guide), [legacyKey]: position }, before, false, false)
  }

  function beginGuideEdit() {
    guideEditBefore.current ??= work
  }

  function finishGuideEdit() {
    const before = guideEditBefore.current
    if (!before) return
    guideEditBefore.current = null
    onWorkChange(work, before, true, true)
  }

  function addGuide(axis: 'horizontal' | 'vertical') {
    const current = guides(axis)
    if (current.length >= 10) return
    const key = axis === 'horizontal' ? 'horizontalGuides' : 'verticalGuides'
    onWorkChange({ ...work, [key]: [...current, { id: crypto.randomUUID(), position: 0.5 }] }, work)
  }

  function removeGuide(axis: 'horizontal' | 'vertical', id: string) {
    const key = axis === 'horizontal' ? 'horizontalGuides' : 'verticalGuides'
    onWorkChange({ ...work, [key]: guides(axis).filter((guide) => guide.id !== id) }, work)
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="modal-card progress-settings-modal" role="dialog" aria-modal="true" aria-label="진행선 설정">
        <div className="modal-heading"><div><p className="eyebrow">PAGE GUIDES</p><h2>가로·세로 진행선</h2></div><button className="icon-button" aria-label="닫기" onClick={onClose}><X size={20} /></button></div>
        <div className="progress-settings-list">
          {(['horizontal', 'vertical'] as const).map((axis) => {
            const line = settings[axis]
            const axisGuides = guides(axis)
            const name = axis === 'horizontal' ? '가로선' : '세로선'
            return <fieldset key={axis} className="progress-setting">
              <legend><label><input type="checkbox" checked={line.visible} onChange={(event) => update(axis, { visible: event.currentTarget.checked })} />{name} 표시</label></legend>
              <label>색상<input aria-label={name + ' 색상'} type="color" value={line.color} onChange={(event) => update(axis, { color: event.currentTarget.value })} /></label>
              <label>굵기 <span>{line.thickness}px</span><input aria-label={name + ' 굵기'} type="range" min="1" max="12" value={line.thickness} onChange={(event) => update(axis, { thickness: Number(event.currentTarget.value) })} /></label>
              <label>투명도 <span>{Math.round(line.opacity * 100)}%</span><input aria-label={name + ' 투명도'} type="range" min="10" max="100" value={Math.round(line.opacity * 100)} onChange={(event) => update(axis, { opacity: Number(event.currentTarget.value) / 100 })} /></label>
              <div className="guide-position-list"><strong>{name} 위치 <span>{axisGuides.length}/10</span></strong>{axisGuides.map((guide, index) => <div key={guide.id}>
                <label htmlFor={'guide-position-' + axis + '-' + guide.id}>{index + 1}</label>
                <input id={'guide-position-' + axis + '-' + guide.id} aria-label={name + ' ' + (index + 1) + ' 위치'} type="range" min="0" max="100" value={Math.round(guide.position * 100)} onPointerDown={beginGuideEdit} onPointerUp={finishGuideEdit} onPointerCancel={finishGuideEdit} onKeyDown={beginGuideEdit} onKeyUp={finishGuideEdit} onBlur={finishGuideEdit} onChange={(event) => changeGuide(axis, guide.id, Number(event.currentTarget.value) / 100)} />
                <button type="button" className="icon-button" aria-label={name + ' ' + (index + 1) + ' 삭제'} onClick={() => removeGuide(axis, guide.id)}><X size={15} /></button>
              </div>)}</div>
              <button type="button" className="secondary-button guide-add-setting" disabled={axisGuides.length >= 10} onClick={() => addGuide(axis)}><Plus size={15} />{name} 추가</button>
            </fieldset>
          })}
        </div>
      </section>
    </div>
  )
}

function ColorworkSettingsDialog({ initial, onClose, onApply }: {
  initial: ColorworkSettings
  onClose: () => void
  onApply: (settings: ColorworkSettings) => boolean
}) {
  const [chartWidthCm, setChartWidthCm] = useState(initial.chartWidthCm)
  const [chartHeightCm, setChartHeightCm] = useState(initial.chartHeightCm)
  const [gaugeStitches, setGaugeStitches] = useState(initial.gaugeStitches)
  const [gaugeRows, setGaugeRows] = useState(initial.gaugeRows)
  const settings = { chartWidthCm, chartHeightCm, gaugeStitches, gaugeRows }
  let dimensions: ReturnType<typeof getColorworkDimensions> | null = null
  let error = ''
  try {
    dimensions = getColorworkDimensions(settings)
  } catch (cause) {
    error = cause instanceof Error ? cause.message : '차트 설정을 확인해 주세요.'
  }

  function apply(event: ReactFormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (dimensions && onApply(settings)) onClose()
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <form className="modal-card colorwork-settings-modal" role="dialog" aria-modal="true" aria-label="컬러워크 설정" onSubmit={apply}>
        <div className="modal-heading"><div><p className="eyebrow">COLORWORK GRID</p><h2>컬러워크 설정</h2></div><button type="button" className="icon-button" aria-label="닫기" onClick={onClose}><X size={20} /></button></div>
        <p className="colorwork-settings-note">게이지는 10×10cm 기준으로 계산합니다.</p>
        <div className="colorwork-input-grid">
          <label>차트 가로 <span>cm</span><input aria-label="차트 가로 cm" type="number" min="1" max="200" step="0.1" value={chartWidthCm} onChange={(event) => setChartWidthCm(Number(event.currentTarget.value))} /></label>
          <label>차트 세로 <span>cm</span><input aria-label="차트 세로 cm" type="number" min="1" max="200" step="0.1" value={chartHeightCm} onChange={(event) => setChartHeightCm(Number(event.currentTarget.value))} /></label>
          <label>게이지 코 <span>/ 10cm</span><input aria-label="게이지 코 수" type="number" min="1" max="200" step="1" value={gaugeStitches} onChange={(event) => setGaugeStitches(Number(event.currentTarget.value))} /></label>
          <label>게이지 단 <span>/ 10cm</span><input aria-label="게이지 단 수" type="number" min="1" max="200" step="1" value={gaugeRows} onChange={(event) => setGaugeRows(Number(event.currentTarget.value))} /></label>
        </div>
        {dimensions && <div className="colorwork-dimension-result">
          <span>격자 {dimensions.columns} × {dimensions.rows}칸</span>
          <small>계산 크기 약 {dimensions.actualWidthCm.toFixed(1)} × {dimensions.actualHeightCm.toFixed(1)}cm</small>
        </div>}
        {error && <p className="colorwork-settings-error" role="alert">{error}</p>}
        <div className="colorwork-settings-actions"><button type="button" className="secondary-button" onClick={onClose}>취소</button><button type="submit" className="primary-button" disabled={!dimensions}>격자 적용</button></div>
      </form>
    </div>
  )
}

export default function Viewer() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const reportMode = searchParams.get('report') === '1'
  const areaRef = useRef<HTMLDivElement>(null)
  const thumbnailRailRef = useRef<HTMLDivElement>(null)
  const snapshotRef = useRef<ViewerSnapshot | null>(null)
  const saveTimer = useRef<number | undefined>(undefined)
  const workTimers = useRef(new Map<number, number>())
  const workRef = useRef<Record<number, PageWorkRecord>>({})
  const pageWorkLoadRef = useRef(new Map<number, Promise<PageWorkRecord>>())
  const workDocumentIdRef = useRef(id)
  const historyRef = useRef(new Map<number, PageHistory>())
  const dragRef = useRef<{ pointerId: number; orientation: 'wide' | 'tall'; rect: DOMRect } | null>(null)
  const [documentName, setDocumentName] = useState('')
  const [renameDialog, setRenameDialog] = useState(false)
  const [renameDraft, setRenameDraft] = useState('')
  const [renameError, setRenameError] = useState('')
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [snapshot, setSnapshot] = useState<ViewerSnapshot | null>(null)
  const [loadedId, setLoadedId] = useState('')
  const [savedCounterSession, setSavedCounterSession] = useState(() => createCounterSession(id))
  const counterSession = savedCounterSession.documentId === id ? savedCounterSession : createCounterSession(id)
  const { visible: counterPanelVisible, values: counterValues, editingIndex: editingCounterIndex, draft: counterDraft } = counterSession
  const counterInputRef = useRef<HTMLInputElement>(null)
  const cancelCounterBlur = useRef(false)
  const [pages, setPages] = useState<PageRecord[]>([])
  const [pageWorks, setPageWorks] = useState<Record<number, PageWorkRecord>>({})
  const [histories, setHistories] = useState<Record<number, PageHistory>>({})
  const [tool, setTool] = useState<AnnotationTool>('pan')
  const [colorworkRequest, setColorworkRequest] = useState<ColorworkCreateRequest | null>(null)
  const [colorworkDialog, setColorworkDialog] = useState(false)
  const [colorworkBrushColor, setColorworkBrushColor] = useState('#F1C40F')
  const [colorworkBrushOpacity, setColorworkBrushOpacity] = useState(0.25)
  const [colorworkEraser, setColorworkEraser] = useState(false)
  const [pageDialog, setPageDialog] = useState(false)
  const [selectedHiddenPages, setSelectedHiddenPages] = useState<Set<number>>(new Set())
  const [progressDialog, setProgressDialog] = useState(false)
  const [techniqueDialog, setTechniqueDialog] = useState(false)
  const [techniquePopoverIndex, setTechniquePopoverIndex] = useState<number | null>(null)
  const [pdfLinksByPage, setPdfLinksByPage] = useState<Record<number, PdfQrLink[]>>({})
  const pdfLinkPagesRef = useRef(new Set<number>())
  const pdfLinkPendingRef = useRef(new Set<string>())
  const [qrLinksByPage, setQrLinksByPage] = useState<Record<number, PdfQrLink[]>>({})
  const qrLinksRef = useRef(new Map<number, PdfQrLink[]>())
  const qrScanPendingRef = useRef(new Set<string>())
  const qrDocumentGenerationRef = useRef(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<{ id: string; message: string } | null>(null)
  const [splitPreview, setSplitPreview] = useState<number | null>(null)
  const [areaSize, setAreaSize] = useState<Size>({ width: 0, height: 0 })

  useEffect(() => {
    if (editingCounterIndex === null) return
    counterInputRef.current?.focus()
    counterInputRef.current?.select()
  }, [editingCounterIndex])

  const pushSnapshot = useCallback((next: ViewerSnapshot, immediate = false) => {
    snapshotRef.current = next
    setSnapshot(next)
    if (saveTimer.current !== undefined) window.clearTimeout(saveTimer.current)
    if (immediate) {
      void saveViewer(next)
      return
    }
    saveTimer.current = window.setTimeout(() => void saveViewer(next), 350)
  }, [])

  const updateHistory = useCallback((page: number, history: PageHistory) => {
    historyRef.current.set(page, history)
    setHistories((current) => ({ ...current, [page]: history }))
  }, [])

  const flushPendingPageWorks = useCallback(() => {
    workTimers.current.forEach((timer) => window.clearTimeout(timer))
    workTimers.current.clear()
    Object.values(workRef.current).forEach((work) => void savePageWork(work))
  }, [])

  const onPageRendered = useCallback((pageNumber: number, source: HTMLCanvasElement) => {
    const generation = qrDocumentGenerationRef.current
    const scanKey = generation + ':' + pageNumber
    if (!pdf) return
    const scanPdfLinks = !pdfLinkPagesRef.current.has(pageNumber) && !pdfLinkPendingRef.current.has(scanKey)
    const scanQr = !qrLinksRef.current.has(pageNumber) && !qrScanPendingRef.current.has(scanKey)
    if (!scanPdfLinks && !scanQr) return
    if (scanPdfLinks) pdfLinkPendingRef.current.add(scanKey)
    if (scanQr) qrScanPendingRef.current.add(scanKey)
    let qrCanvas: HTMLCanvasElement | null = null
    if (scanQr) {
      const scale = Math.min(1, 1400 / Math.max(source.width, source.height))
      qrCanvas = document.createElement('canvas')
      qrCanvas.width = Math.max(1, Math.round(source.width * scale))
      qrCanvas.height = Math.max(1, Math.round(source.height * scale))
      const context = qrCanvas.getContext('2d', { alpha: false })
      if (!context) {
        qrScanPendingRef.current.delete(scanKey)
        qrCanvas = null
      } else {
        context.drawImage(source, 0, 0, qrCanvas.width, qrCanvas.height)
      }
    }
    window.setTimeout(() => void (async () => {
      if (scanPdfLinks) {
        try {
          const pageProxy = await pdf.getPage(pageNumber)
          const [annotations, content] = await Promise.all([
            pageProxy.getAnnotations({ intent: 'display' }),
            pageProxy.getTextContent(),
          ])
          const textRuns = content.items.flatMap((item) => 'str' in item ? [item] : [])
          const links = extractPdfPageLinks(annotations, textRuns, pageProxy.getViewport({ scale: 1 }))
          if (generation === qrDocumentGenerationRef.current) {
            pdfLinkPagesRef.current.add(pageNumber)
            setPdfLinksByPage((current) => ({ ...current, [pageNumber]: links }))
          }
        } catch {
          if (generation === qrDocumentGenerationRef.current) {
            pdfLinkPagesRef.current.add(pageNumber)
            setPdfLinksByPage((current) => ({ ...current, [pageNumber]: [] }))
          }
        }
      }
      if (qrCanvas) {
        try {
          const links = detectPdfQrLinks(qrCanvas)
          if (generation === qrDocumentGenerationRef.current) {
            qrLinksRef.current.set(pageNumber, links)
            setQrLinksByPage((current) => ({ ...current, [pageNumber]: links }))
          }
        } catch {
          if (generation === qrDocumentGenerationRef.current) {
            qrLinksRef.current.set(pageNumber, [])
            setQrLinksByPage((current) => ({ ...current, [pageNumber]: [] }))
          }
        } finally {
          qrCanvas.width = 0
          qrCanvas.height = 0
        }
      }
      if (scanPdfLinks) pdfLinkPendingRef.current.delete(scanKey)
      if (scanQr) {
        qrScanPendingRef.current.delete(scanKey)
      }
    })(), 0)
  }, [pdf])

  useEffect(() => {
    workDocumentIdRef.current = id
    pageWorkLoadRef.current.clear()
    let disposed = false
    let closePdf: (() => Promise<void>) | undefined
    void (async () => {
      const record = await getDocument(id)
      if (!record) throw new Error('이 PDF를 찾을 수 없습니다. 도안 목록에서 다시 열어 주세요.')
      const restored = await getViewer(id, record.pageCount)
      restored.primary.page = clamp(restored.primary.page, 1, record.pageCount)
      restored.secondary.page = clamp(restored.secondary.page, 1, record.pageCount)
      const opened = await openPdf(record.pdf)
      if (disposed) {
        await opened.dispose()
        return
      }
      closePdf = opened.dispose
      qrDocumentGenerationRef.current++
      pdfLinkPagesRef.current.clear()
      pdfLinkPendingRef.current.clear()
      qrLinksRef.current.clear()
      qrScanPendingRef.current.clear()
      setPdfLinksByPage({})
      setQrLinksByPage({})
      setTechniqueDialog(false)
      setTechniquePopoverIndex(null)
      workRef.current = {}
      pageWorkLoadRef.current.clear()
      historyRef.current.clear()
      setPageWorks({})
      setHistories({})
      setDocumentName(record.fileName)
      setSnapshot(restored)
      snapshotRef.current = restored
      setPdf(opened.document)
      setLoadedId(id)
      setLoadError(null)
      await markOpened(id)
      setPages(await getPages(id))
      setLoading(false)
    })().catch((error: unknown) => {
      if (!disposed) {
        setLoadError({ id, message: error instanceof Error ? error.message : pdfErrorMessage(error) })
        setLoading(false)
      }
    })
    return () => {
      disposed = true
      if (saveTimer.current !== undefined) window.clearTimeout(saveTimer.current)
      const current = snapshotRef.current
      if (current) void saveViewer(current)
      flushPendingPageWorks()
      void closePdf?.()
    }
  }, [flushPendingPageWorks, id])

  useEffect(() => {
    const element = areaRef.current
    if (!element) return
    const measure = () => setAreaSize({ width: element.clientWidth, height: element.clientHeight })
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    window.addEventListener('resize', measure)
    requestAnimationFrame(measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [pdf, loading])

  const orientation = areaSize.width >= areaSize.height ? 'wide' : 'tall'
  const ratio = snapshot ? (orientation === 'wide' ? snapshot.wideRatio : snapshot.tallRatio) : 0.65
  const visibleCount = pdf ? pdf.numPages - pages.filter((page) => page.hidden).length : 0
  const activePage = snapshot ? snapshot[snapshot.activePane].page : 1
  const pageState = pages.find((page) => page.pageNumber === activePage)
  const isBookmarked = Boolean(pageState?.bookmarked)
  const hiddenNumbers = new Set(pages.filter((page) => page.hidden).map((page) => page.pageNumber))
  const progressSettings = snapshot?.progressSettings ?? defaultProgressSettings
  const annotationSettings = snapshot?.annotationSettings ?? defaultAnnotationSettings
  const activeAnnotationStyle = tool === 'pen' || tool === 'line' || tool === 'highlight' || tool === 'text' ? annotationSettings[tool] : null
  const activeHistory = histories[activePage] ?? { actions: [], cursor: 0 }
  const activeWork = pageWorks[activePage] ?? blankWork(id, activePage)
  const techniqueSlots = Array.from({ length: 10 }, (_, index) => snapshot?.techniqueSlots?.[index] ?? null)
  const activeColorworkGrid = activeWork.colorworkGrid ?? null
  const canUndo = activeHistory.cursor > 0
  const canRedo = activeHistory.cursor < activeHistory.actions.length
  const primaryPage = snapshot?.primary.page
  const secondaryPage = snapshot?.secondary.page
  const isSplit = snapshot?.split
  const ensurePageWork = useCallback(async (page: number) => {
    const existing = workRef.current[page]
    if (existing) return existing
    const pending = pageWorkLoadRef.current.get(page)
    if (pending) return pending
    let loadingWork: Promise<PageWorkRecord>
    loadingWork = getPageWork(id, page).then((loaded) => {
      if (workDocumentIdRef.current !== id) return loaded
      const current = workRef.current[page]
      if (current) return current
      workRef.current = { ...workRef.current, [page]: loaded }
      setPageWorks(workRef.current)
      return loaded
    }).finally(() => {
      if (pageWorkLoadRef.current.get(page) === loadingWork) pageWorkLoadRef.current.delete(page)
    })
    pageWorkLoadRef.current.set(page, loadingWork)
    return loadingWork
  }, [id])

  useEffect(() => {
    if (primaryPage === undefined || !id || loadedId !== id) return
    const needed = [...new Set(isSplit && secondaryPage !== undefined ? [primaryPage, secondaryPage] : [primaryPage])]
    void Promise.all(needed.map((page) => ensurePageWork(page)))
  }, [id, loadedId, primaryPage, secondaryPage, isSplit, ensurePageWork])

  function mutateSnapshot(change: (current: ViewerSnapshot) => ViewerSnapshot, immediate = false) {
    const current = snapshotRef.current
    if (current) pushSnapshot(change(current), immediate)
  }

  async function saveDocumentName(event: ReactFormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      const renamed = await renameDocument(id, renameDraft)
      setDocumentName(renamed.fileName)
      setRenameDialog(false)
    } catch (error) {
      setRenameError(error instanceof Error ? error.message : 'PDF 이름을 변경하지 못했습니다.')
    }
  }

  function changePane(paneId: PaneId, change: (pane: PaneSnapshot) => PaneSnapshot, immediate = false) {
    mutateSnapshot((current) => ({ ...current, [paneId]: change(current[paneId]) }), immediate)
  }

  function updateCounterSession(change: (current: CounterSessionState) => CounterSessionState) {
    setSavedCounterSession((current) => change(current.documentId === id ? current : createCounterSession(id)))
  }

  function adjustCounter(index: number, amount: number) {
    updateCounterSession((current) => ({
      ...current,
      values: current.values.map((value, item) => item === index ? clampCounterValue(value + amount) : value),
    }))
  }

  function commitCounterEdit(index: number, rawValue: string) {
    updateCounterSession((current) => ({
      ...current,
      values: current.values.map((item, itemIndex) => itemIndex === index ? counterValueFromInput(rawValue, item) : item),
      editingIndex: null,
    }))
  }

  function rotatePage(paneId: PaneId, pageNumber: number) {
    const legacyRotation = workRef.current[pageNumber]?.rotation ?? 0
    changePane(paneId, (current) => {
      const currentRotation = current.rotations?.[pageNumber] ?? legacyRotation
      const rotation = ((currentRotation + 90) % 360) as PageRotation
      return {
        ...current,
        rotations: { ...current.rotations, [pageNumber]: rotation },
        centerX: 0.5,
        centerY: 0.5,
      }
    }, true)
  }

  function setPageWork(work: PageWorkRecord, immediate: boolean, recordHistory = false, historyBefore?: PageWorkRecord) {
    const current = workRef.current[work.pageNumber]
    if (!current) return
    if (recordHistory && JSON.stringify(historyBefore ?? current) !== JSON.stringify(work)) {
      const state = historyRef.current.get(work.pageNumber) ?? { actions: [], cursor: 0 }
      const actions = state.actions.slice(0, state.cursor)
      actions.push({ before: historyBefore ?? current, after: work })
      if (actions.length > 100) actions.shift()
      updateHistory(work.pageNumber, { actions, cursor: actions.length })
    }
    workRef.current = { ...workRef.current, [work.pageNumber]: work }
    setPageWorks(workRef.current)
    const pending = workTimers.current.get(work.pageNumber)
    if (pending !== undefined) window.clearTimeout(pending)
    if (immediate) {
      workTimers.current.delete(work.pageNumber)
      void savePageWork(work)
    } else {
      workTimers.current.set(work.pageNumber, window.setTimeout(() => {
        workTimers.current.delete(work.pageNumber)
        void savePageWork(workRef.current[work.pageNumber] ?? work)
      }, 300))
    }
  }

  function undoRedo(direction: 'undo' | 'redo') {
    const state = histories[activePage]
    if (!state) return
    const nextCursor = direction === 'undo' ? state.cursor - 1 : state.cursor + 1
    const action = state.actions[direction === 'undo' ? state.cursor - 1 : state.cursor]
    if (!action) return
    updateHistory(activePage, { ...state, cursor: nextCursor })
    setPageWork(direction === 'undo' ? action.before : action.after, true, false)
  }

  function stepPage(direction: -1 | 1) {
    if (!snapshot || !pdf) return
    const currentPage = snapshot[snapshot.activePane].page
    let next = currentPage + direction
    while (next >= 1 && next <= pdf.numPages && hiddenNumbers.has(next)) next += direction
    if (next < 1) return
    if (next > pdf.numPages) {
      if (direction > 0) setSearchParams({ report: '1' })
      return
    }
    changePane(snapshot.activePane, (pane) => ({ ...pane, page: next }), true)
  }

  function selectPage(page: number, pane = snapshot?.activePane ?? 'primary') {
    if (!snapshot || hiddenNumbers.has(page)) return
    mutateSnapshot((current) => ({ ...current, activePane: pane, [pane]: { ...current[pane], page } }), true)
  }

  async function selectThumbnail(page: number) {
    if (!snapshot || hiddenNumbers.has(page)) return
    await ensurePageWork(page)
    if (reportMode) setSearchParams({})
    mutateSnapshot((current) => ({ ...current, activePane: current.activePane, [current.activePane]: { ...current[current.activePane], page } }), true)
  }

  async function toggleBookmark() {
    if (!snapshot) return
    await setPageFlag(id, activePage, 'bookmarked', !isBookmarked)
    setPages(await getPages(id))
  }

  async function hideCurrentPage() {
    if (!snapshot || !pdf || visibleCount <= 1) return
    await setPageFlag(id, activePage, 'hidden', true)
    const nextPages = await getPages(id)
    setPages(nextPages)
    const nextHidden = new Set(nextPages.filter((page) => page.hidden).map((page) => page.pageNumber))
    let replacement = activePage + 1
    while (replacement <= pdf.numPages && nextHidden.has(replacement)) replacement++
    if (replacement > pdf.numPages) {
      replacement = activePage - 1
      while (replacement >= 1 && nextHidden.has(replacement)) replacement--
    }
    mutateSnapshot((current) => {
      const primary = current.primary.page === activePage ? { ...current.primary, page: replacement } : current.primary
      const secondary = current.secondary.page === activePage ? { ...current.secondary, page: replacement } : current.secondary
      return { ...current, primary, secondary }
    }, true)
  }

  async function restorePages(pageNumbers: number[]) {
    if (!pageNumbers.length) return
    await setPagesFlag(id, pageNumbers, 'hidden', false)
    setPages(await getPages(id))
    const restored = new Set(pageNumbers)
    setSelectedHiddenPages((current) => new Set([...current].filter((page) => !restored.has(page))))
  }

  function toggleHiddenPage(page: number) {
    setSelectedHiddenPages((current) => {
      const next = new Set(current)
      if (next.has(page)) next.delete(page)
      else next.add(page)
      return next
    })
  }

  function toggleSplit() {
    if (!snapshot) return
    mutateSnapshot((current) => ({
      ...current,
      split: !current.split,
      splitInitialized: true,
      activePane: 'primary',
      secondary: current.split || current.splitInitialized ? current.secondary : { ...current.secondary, page: current.primary.page, zoom: current.primary.zoom, centerX: current.primary.centerX, centerY: current.primary.centerY, rotations: { ...current.primary.rotations } },
    }), true)
  }

  function jumpToPage(value: string) {
    if (!pdf) return
    const page = Number(value)
    if (Number.isInteger(page) && page >= 1 && page <= pdf.numPages && !hiddenNumbers.has(page)) selectPage(page)
  }

  function beginDivider(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!snapshot || !areaRef.current) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { pointerId: event.pointerId, orientation, rect: areaRef.current.getBoundingClientRect() }
    setSplitPreview(ratio)
  }

  function moveDivider(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const extent = drag.orientation === 'wide' ? drag.rect.width : drag.rect.height
    const position = drag.orientation === 'wide' ? event.clientX - drag.rect.left : event.clientY - drag.rect.top
    setSplitPreview(dividerRatio(position, 0, extent))
  }

  function finishDivider(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const extent = drag.orientation === 'wide' ? drag.rect.width : drag.rect.height
    const position = drag.orientation === 'wide' ? event.clientX - drag.rect.left : event.clientY - drag.rect.top
    const nextRatio = dividerRatio(position, 0, extent)
    dragRef.current = null
    setSplitPreview(null)
    mutateSnapshot((current) => drag.orientation === 'wide' ? { ...current, wideRatio: nextRatio } : { ...current, tallRatio: nextRatio }, true)
  }

  function saveCenter(pane: PaneId, centerX: number, centerY: number) {
    const current = snapshotRef.current
    if (!current) return
    const next = { ...current, [pane]: { ...current[pane], centerX, centerY } }
    snapshotRef.current = next
    if (saveTimer.current !== undefined) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => void saveViewer(next), 350)
  }

  function changeAnnotationStyle(toolId: 'pen' | 'line' | 'highlight' | 'text', change: Partial<AnnotationStyle>) {
    mutateSnapshot((current) => {
      const existing = current.annotationSettings ?? defaultAnnotationSettings
      return { ...current, annotationSettings: { ...existing, [toolId]: { ...existing[toolId], ...change } } }
    }, true)
  }

  function updateTechniqueSlot(index: number, slot: TechniqueCropSlot | null) {
    const current = snapshotRef.current
    if (!current) return
    const slots = Array.from({ length: 10 }, (_, slotIndex) => current.techniqueSlots?.[slotIndex] ?? null)
    slots[index] = slot
    pushSnapshot({ ...current, techniqueSlots: slots }, true)
  }

  function applyColorworkSettings(settings: ColorworkSettings) {
    if (!snapshot || colorworkRequest) return false
    const paneId = snapshot.activePane
    const pageNumber = snapshot[paneId].page
    const before = workRef.current[pageNumber]
    if (!before) return false
    if (before.colorworkGrid) {
      const resized = resizeColorworkGrid(before.colorworkGrid, settings)
      if (resized.droppedCells && !window.confirm('격자를 줄이면 색칠된 ' + resized.droppedCells + '칸이 사라집니다. 설정을 적용할까요?')) return false
      setPageWork({ ...before, colorworkGrid: resized.grid }, true, true, before)
    } else {
      setColorworkRequest({ id: crypto.randomUUID(), paneId, pageNumber, settings })
    }
    setTool('pan')
    return true
  }

  function finishColorworkRequest(requestId: string) {
    setColorworkRequest((current) => current?.id === requestId ? null : current)
  }

  function toggleColorworkVisibility() {
    if (!activeColorworkGrid) return
    const before = workRef.current[activePage] ?? activeWork
    setPageWork({ ...before, colorworkGrid: { ...activeColorworkGrid, visible: !activeColorworkGrid.visible } }, true, true, before)
  }

  function renderPane(paneId: PaneId, pane: PaneSnapshot, active: boolean) {
    const work = pageWorks[pane.page] ?? blankWork(id, pane.page)
    const rotation = pane.rotations?.[pane.page] ?? work.rotation ?? 0
    const style = tool === 'pen' || tool === 'line' || tool === 'highlight' || tool === 'text' ? annotationSettings[tool] : annotationSettings.pen
    return <PdfPage
      key={paneId + ':' + pane.page}
      pdf={pdf!}
      page={pane.page}
      paneId={paneId}
      pane={pane}
      rotation={rotation}
      active={active}
      tool={tool}
      lineSettings={progressSettings}
      annotationStyle={style}
      work={work}
      workReady={Boolean(pageWorks[pane.page])}
      createColorworkRequest={colorworkRequest?.paneId === paneId && colorworkRequest.pageNumber === pane.page ? colorworkRequest : null}
      colorworkBrushColor={colorworkBrushColor}
      colorworkBrushOpacity={colorworkBrushOpacity}
      colorworkEraser={colorworkEraser}
      onActivate={() => { if (!active) mutateSnapshot((current) => ({ ...current, activePane: paneId })) }}
      onWorkChange={setPageWork}
      onCenter={(x, y) => saveCenter(paneId, x, y)}
      onZoom={(zoom) => changePane(paneId, (current) => ({ ...current, zoom }), true)}
      onRotate={() => rotatePage(paneId, pane.page)}
      onColorworkRequestHandled={finishColorworkRequest}
      onTextToolConsumed={() => setTool('pan')}
      pageLinks={pdfLinksByPage[pane.page]}
      qrLinks={qrLinksByPage[pane.page]}
      onPageRendered={onPageRendered}
    />
  }

  const displayedRatio = splitPreview ?? ratio
  const pageRecords = pages.reduce((map, page) => map.set(page.pageNumber, page), new Map<number, PageRecord>())

  if (loadError?.id === id) return <main className="viewer-state"><div className="viewer-error-icon"><X size={22} /></div><h1>PDF를 열지 못했습니다</h1><p>{loadError.message}</p><button className="primary-button" onClick={() => navigate('/')}>도안 목록으로</button></main>
  if (loading || loadedId !== id) return <main className="viewer-state"><div className="loading-orb" /><p>PDF와 작업 위치를 불러오고 있어요…</p></main>
  if (!pdf || !snapshot) return null

  return (
    <main className="viewer-shell">
      <header className="viewer-header">
        <div className="viewer-brand"><img src={yyLogo} alt="도안보고 로고" /><small>YY공동제작</small></div>
        <button className="viewer-back" aria-label="도안 목록으로" onClick={() => navigate('/')}><ArrowLeft size={20} /><span>내 도안</span></button>
        <div className="viewer-title"><div className="viewer-title-name"><strong title={documentName}>{documentName}</strong><button type="button" className="viewer-title-edit" aria-label="PDF 이름 변경" title="PDF 이름 변경" onClick={() => { setRenameDraft(documentName.replace(/\.pdf$/i, '')); setRenameError(''); setRenameDialog(true) }}><Pencil size={14} /></button></div><span>{reportMode ? '뜨개보고서' : snapshot[snapshot.activePane].page + ' / ' + pdf.numPages + ' 페이지'}</span></div>
        <div className="viewer-header-actions">
          {!reportMode && <>
            <button className={'viewer-action ' + (snapshot.split ? 'selected' : '')} onClick={toggleSplit}><Columns2 size={18} /><span>{snapshot.split ? '한 영역 보기' : '두 영역 보기'}</span></button>
            <button className="viewer-action" onClick={() => setTechniqueDialog(true)}><CaseSensitive size={17} /><span>기법</span></button>
            <button className={'viewer-action ' + (counterPanelVisible ? 'selected' : '')} type="button" aria-label="숫자 카운터" title="숫자 카운터" aria-pressed={counterPanelVisible} onClick={() => updateCounterSession((current) => ({ ...current, visible: !current.visible }))}><Hash size={17} /><span>카운터</span></button>
            <button className="viewer-action page-management-action" aria-label="페이지 관리" title="숨긴 페이지 복구" onClick={() => { setSelectedHiddenPages(new Set()); setPageDialog(true) }}><EyeOff size={17} /><span>페이지 관리</span><span className="hidden-count">{pages.filter((page) => page.hidden).length}</span></button>
          </>}
          {reportMode && <button className="viewer-action" onClick={() => setSearchParams({})}><ArrowLeft size={16} /><span>도안으로 돌아가기</span></button>}
        </div>
      </header>
      <section className={'pdf-work-area' + (reportMode ? ' report-work-area' : '')}>
        <div className={'pdf-document-area ' + (reportMode ? '' : snapshot.split ? (orientation === 'wide' ? 'split-wide' : 'split-tall') : 'single-pane')} ref={areaRef}>
        {reportMode ? <KnittingReport documentId={id} fileName={documentName} /> : snapshot.split ? <>
          <div className="split-section" style={orientation === 'wide' ? { flex: '0 0 ' + splitBasis(displayedRatio) } : { width: '100%', flex: '0 0 ' + splitBasis(displayedRatio) }}>{renderPane('primary', snapshot.primary, snapshot.activePane === 'primary')}</div>
          <button className={'split-divider ' + orientation} aria-label="영역 크기 조정" onPointerDown={beginDivider} onPointerMove={moveDivider} onPointerUp={finishDivider} onPointerCancel={finishDivider} onLostPointerCapture={finishDivider}><span /></button>
          <div className="split-section split-section-secondary" style={orientation === 'wide' ? { flex: '0 0 ' + splitBasis(1 - displayedRatio) } : { width: '100%', flex: '0 0 ' + splitBasis(1 - displayedRatio) }}>{renderPane('secondary', snapshot.secondary, snapshot.activePane === 'secondary')}</div>
        </> : renderPane('primary', snapshot.primary, true)}
        {!reportMode && techniquePopoverIndex !== null && techniqueSlots[techniquePopoverIndex] && <TechniquePopover pdf={pdf} slots={techniqueSlots} slotIndex={techniquePopoverIndex} onNavigate={setTechniquePopoverIndex} onClose={() => setTechniquePopoverIndex(null)} />}
        </div>
        {!reportMode && counterPanelVisible && <aside id="viewer-number-counters" className="number-counter-panel" aria-label="숫자 카운터" onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
          {counterValues.map((value, index) => <div className="number-counter-row" key={index}>
            <button type="button" className="number-counter-step" aria-label={'카운터 ' + (index + 1) + ' 감소'} disabled={value <= 0} onClick={() => adjustCounter(index, -1)}>−</button>
            {editingCounterIndex === index
              ? <input
                ref={counterInputRef}
                className="number-counter-input"
                aria-label={'카운터 ' + (index + 1) + ' 숫자 입력'}
                type="number"
                inputMode="numeric"
                min="0"
                max="99"
                step="1"
                value={counterDraft}
                onChange={(event) => {
                  const draft = event.currentTarget.value
                  updateCounterSession((current) => ({ ...current, draft }))
                }}
                onBlur={(event) => {
                  if (cancelCounterBlur.current) {
                    cancelCounterBlur.current = false
                    updateCounterSession((current) => ({ ...current, editingIndex: null }))
                    return
                  }
                  commitCounterEdit(index, event.currentTarget.value)
                }}
                onKeyDown={(event) => {
                  event.stopPropagation()
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    commitCounterEdit(index, event.currentTarget.value)
                    event.currentTarget.blur()
                  } else if (event.key === 'Escape') {
                    event.preventDefault()
                    cancelCounterBlur.current = true
                    event.currentTarget.blur()
                    updateCounterSession((current) => ({ ...current, editingIndex: null }))
                  }
                }}
              />
              : <button type="button" className="number-counter-value" aria-label={'카운터 ' + (index + 1) + ' 숫자 직접 입력'} onClick={() => updateCounterSession((current) => ({ ...current, draft: String(value), editingIndex: index }))}>{value}</button>}
            <button type="button" className="number-counter-step" aria-label={'카운터 ' + (index + 1) + ' 증가'} disabled={value >= 99} onClick={() => adjustCounter(index, 1)}>+</button>
          </div>)}
        </aside>}
      </section>
      <section className="viewer-footer">
        <div className="page-thumbnail-strip" aria-label="모든 페이지 썸네일" ref={thumbnailRailRef}>
          {Array.from({ length: pdf.numPages }, (_, index) => index + 1).filter((page) => !hiddenNumbers.has(page)).map((page) => {
            const state = pageRecords.get(page)
            const active = snapshot[snapshot.activePane].page === page
            return <PdfThumbnail key={page} pdf={pdf} pageNumber={page} active={active} hidden={false} bookmarked={Boolean(state?.bookmarked)} root={thumbnailRailRef} onSelect={() => void selectThumbnail(page)} />
          })}
          <button className={'report-thumbnail' + (reportMode ? ' active' : '')} aria-label="뜨개보고서 열기" aria-current={reportMode ? 'page' : undefined} onClick={() => setSearchParams({ report: '1' })}>
            <span className="report-thumbnail-icon">+<i>7</i></span><strong>뜨개보고서</strong><small>보고서 보기</small>
          </button>
        </div>
        {reportMode ? <div className="viewer-controlbar report-controlbar"><span>PDF 페이지와 작업 내용은 그대로 저장되어 있습니다.</span><button className="secondary-button" onClick={() => setSearchParams({})}><ArrowLeft size={16} />도안 보기</button></div> : <section className="viewer-controlbar">
          <div className="viewer-tools" aria-label="필기 도구">
            <button className={'viewer-tool tool-toggle ' + (tool === 'pan' ? 'active' : '')} aria-label="이동 도구" title="이동" onClick={() => setTool('pan')}><MousePointer2 size={17} /><span>이동</span></button>
            <button className={'viewer-tool tool-toggle ' + (tool === 'pen' ? 'active' : '')} aria-label="펜" title="펜" onClick={() => setTool('pen')}><Pencil size={17} /><span>펜</span></button>
            <button className={'viewer-tool tool-toggle ' + (tool === 'line' ? 'active' : '')} aria-label="직선" title="직선" onClick={() => setTool('line')}><Minus size={17} /><span>직선</span></button>
            <button className={'viewer-tool tool-toggle ' + (tool === 'highlight' ? 'active' : '')} aria-label="형광펜" title="형광펜" onClick={() => setTool('highlight')}><Highlighter size={17} /><span>형광펜</span></button>
            <button className={'viewer-tool tool-toggle ' + (tool === 'eraser' ? 'active' : '')} aria-label="지우개" title="지우개" onClick={() => setTool('eraser')}><Eraser size={17} /><span>지우개</span></button>
            <button className={'viewer-tool tool-toggle ' + (tool === 'text' ? 'active' : '')} aria-label="텍스트" title="텍스트" onClick={() => setTool('text')}><Type size={17} /><span>텍스트</span></button>
            <button className="viewer-tool chart-tool" aria-label="컬러워크 설정" title="차트 크기와 뜨개 게이지 설정" disabled={!pageWorks[activePage] || Boolean(colorworkRequest)} onClick={() => setColorworkDialog(true)}><Grid3X3 size={17} /><span>컬러워크</span>{activeColorworkGrid && <small>{activeColorworkGrid.columns}×{activeColorworkGrid.rows}</small>}</button>
            {activeColorworkGrid && <>
              <button className="viewer-tool compact-tool" aria-label={activeColorworkGrid.visible ? '컬러워크 숨기기' : '컬러워크 보이기'} title={activeColorworkGrid.visible ? '컬러워크 숨기기' : '컬러워크 보이기'} onClick={toggleColorworkVisibility}>{activeColorworkGrid.visible ? <Eye size={16} /> : <EyeOff size={16} />}</button>
              <div className="colorwork-brush-controls" aria-label="컬러워크 색칠 도구">
                <label title="색칠 색상"><input aria-label="컬러워크 색상" type="color" value={colorworkBrushColor} disabled={colorworkEraser} onChange={(event) => setColorworkBrushColor(event.currentTarget.value)} /></label>
                <label title="색칠 투명도"><span>투명도</span><input aria-label="컬러워크 투명도" type="range" min="0" max="100" value={Math.round(colorworkBrushOpacity * 100)} disabled={colorworkEraser} onChange={(event) => setColorworkBrushOpacity(Number(event.currentTarget.value) / 100)} /></label>
                <button className={'viewer-tool compact-tool ' + (colorworkEraser ? 'active' : '')} aria-label={colorworkEraser ? '컬러워크 지우개 끄기' : '컬러워크 지우개'} title={colorworkEraser ? '지우개 끄기' : '색칠한 칸 지우기'} onClick={() => setColorworkEraser((current) => !current)}><Eraser size={16} /></button>
              </div>
            </>}
            {activeAnnotationStyle && <div className="annotation-style-controls" aria-label="필기 스타일">
              <label title="색상"><input aria-label="필기 색상" type="color" value={activeAnnotationStyle.color} onChange={(event) => changeAnnotationStyle(tool as 'pen' | 'line' | 'highlight' | 'text', { color: event.currentTarget.value })} /></label>
              {tool !== 'text' && <label title="굵기"><span>굵기</span><input aria-label="필기 굵기" type="range" min="1" max="24" value={activeAnnotationStyle.thickness} onChange={(event) => changeAnnotationStyle(tool as 'pen' | 'line' | 'highlight', { thickness: Number(event.currentTarget.value) })} /></label>}
              {tool !== 'text' && <label title="투명도"><span>투명도</span><input aria-label="필기 투명도" type="range" min="10" max="100" value={Math.round(activeAnnotationStyle.opacity * 100)} onChange={(event) => changeAnnotationStyle(tool as 'pen' | 'line' | 'highlight', { opacity: Number(event.currentTarget.value) / 100 })} /></label>}
              {tool === 'text' && <label title="글자 크기"><span>글자</span><input aria-label="글자 크기" type="range" min="10" max="48" value={activeAnnotationStyle.fontSize} onChange={(event) => changeAnnotationStyle('text', { fontSize: Number(event.currentTarget.value) })} /></label>}
            </div>}
            <span className="control-separator" />
            <button className="viewer-tool compact-tool" aria-label="실행 취소" title="실행 취소" disabled={!canUndo} onClick={() => undoRedo('undo')}><Undo2 size={17} /></button>
            <button className="viewer-tool compact-tool" aria-label="다시 실행" title="다시 실행" disabled={!canRedo} onClick={() => undoRedo('redo')}><Redo2 size={17} /></button>
            <button className="viewer-tool" aria-label="진행선 설정" title="가로·세로 진행선 설정" disabled={!pageWorks[activePage]} onClick={() => setProgressDialog(true)}><SlidersHorizontal size={17} /><span>진행선</span></button>
          </div>
          <div className="viewer-navigation">
            <button className="text-control" disabled={activePage <= 1} onClick={() => stepPage(-1)}>이전</button>
            <label className="page-jump"><input key={activePage} aria-label="페이지 번호 입력" type="number" min="1" max={pdf.numPages} defaultValue={activePage} onBlur={(event) => jumpToPage(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === 'Enter') { jumpToPage(event.currentTarget.value); event.currentTarget.blur() } }} /><span>/ {pdf.numPages}</span></label>
            <button className="text-control" disabled={activePage >= pdf.numPages && hiddenNumbers.size === 0} onClick={() => stepPage(1)}>{activePage >= pdf.numPages ? '보고서' : '다음'}</button>
            <span className="control-separator" />
            <button className={'viewer-tool ' + (isBookmarked ? 'active' : '')} aria-label={isBookmarked ? '북마크 해제' : '북마크'} onClick={() => void toggleBookmark()}><Bookmark size={17} fill={isBookmarked ? 'currentColor' : 'none'} /><span>북마크</span></button>
            <button className="viewer-tool" aria-label="페이지 숨김" disabled={visibleCount <= 1} onClick={() => void hideCurrentPage()}><EyeOff size={17} /><span>숨김</span></button>
            <span className="control-separator" />
          </div>
        </section>}
      </section>
      {renameDialog && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRenameDialog(false) }}><section className="modal-card" role="dialog" aria-modal="true" aria-label="PDF 이름 변경"><div className="modal-heading"><h2>PDF 이름 변경</h2><button className="icon-button" aria-label="닫기" onClick={() => setRenameDialog(false)}><X size={20} /></button></div><form className="modal-form" onSubmit={(event) => void saveDocumentName(event)}><label htmlFor="viewer-pdf-name">PDF 이름</label><input id="viewer-pdf-name" autoFocus required maxLength={120} value={renameDraft} onChange={(event) => setRenameDraft(event.currentTarget.value)} /><p className="modal-copy">.pdf 확장자는 저장할 때 자동으로 붙습니다.</p>{renameError && <p className="rename-error" role="alert">{renameError}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setRenameDialog(false)}>취소</button><button className="primary-button" type="submit"><Check size={17} />저장</button></div></form></section></div>}
      {pageDialog && <HiddenPagesDialog
        pdf={pdf}
        pages={pages.filter((page) => page.hidden).sort((a, b) => a.pageNumber - b.pageNumber)}
        selected={selectedHiddenPages}
        onClose={() => setPageDialog(false)}
        onToggle={toggleHiddenPage}
        onRestoreSelected={() => void restorePages([...selectedHiddenPages])}
        onRestoreAll={() => void restorePages(pages.filter((page) => page.hidden).map((page) => page.pageNumber))}
      />}
      {progressDialog && <ProgressSettingsDialog
        settings={progressSettings}
        work={activeWork}
        onSettingsChange={(next) => mutateSnapshot((current) => ({ ...current, progressSettings: next }), true)}
        onWorkChange={(next, before, immediate = true, recordHistory = true) => setPageWork(next, immediate, recordHistory, before)}
        onClose={() => setProgressDialog(false)}
      />}
      {colorworkDialog && <ColorworkSettingsDialog
        key={snapshot.activePane + ':' + activePage}
        initial={activeColorworkGrid ?? defaultColorworkSettings}
        onClose={() => setColorworkDialog(false)}
        onApply={applyColorworkSettings}
      />}
      {techniqueDialog && <TechniqueDialog
        pdf={pdf}
        pages={pages}
        slots={techniqueSlots}
        initialPage={activePage}
        onClose={() => setTechniqueDialog(false)}
        onSave={updateTechniqueSlot}
        onDelete={(index) => updateTechniqueSlot(index, null)}
        onOpen={(index) => { setTechniqueDialog(false); setTechniquePopoverIndex(index) }}
      />}
    </main>
  )
}
