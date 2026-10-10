import { formatNumber, t, translateMessage } from './locales/index'
import { Fragment, useCallback, useEffect, useRef, useState, type DragEvent as ReactDragEvent, type FormEvent as ReactFormEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type UIEvent as ReactUIEvent } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Bookmark, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Columns2, Eraser, Eye, EyeClosed, EyeOff, Files, Grid3X3, GripVertical, Highlighter, Maximize2, Minus, MousePointer2, Pencil, Plus, Redo2, RotateCwSquare, ScanLine, Settings2, Square, Tally5, Type, Undo2, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import BrandLoading from './BrandLoading'
import yyLogo from './assets/yy-logo.png'
import { cancelThumbnailRenders, PdfPage, PdfThumbnail, setThumbnailRenderingPaused, waitForThumbnailQueueIdle } from './PdfPage'
import { getDocument, getPageRecognition, getPageWork, getPageWorks, getPages, getViewer, markOpened, renameDocument, savePageRecords, savePageWork, saveViewer, saveViewerAndPageWorks, setPageFlag, setPagesHiddenState } from './storage'
import { pdfPageRenderQueue } from './pdfPageRenderQueue'
import { openPdf, pdfErrorMessage } from './pdf'
import { openPhotoDocument } from './photoDocument'
import KnittingReport from './KnittingReport'
import type { AnnotationSettings, AnnotationStyle, AnnotationTool, ColorworkCreateRequest, ColorworkSettings, CounterHistoryEntry, CounterSnapshot, CounterTimeLap, DocumentRecord, PageRecord, PageRotation, PageWorkRecord, PaneId, PaneSnapshot, ProgressGuide, ProgressSettings, ThumbnailGroup, ViewerSnapshot } from './types'
import { defaultColorworkSettings, getColorworkDimensions, resizeColorworkGrid } from './colorwork'
import { MAX_COUNTER_HISTORY, MAX_COUNTER_ROW, advanceLinkedCounters, counterAlertState, counterSideForRow, createCounter, findCounterRewindCheckpoint, normalizeCounterSnapshots, progressGuideForCounter, reanchorProgressGuideForCounter, restoreCounterGroup, setCounterGroupRow } from './smartCounter'
import CounterPanel from './CounterPanel'
import DocumentWorkTimer, { type DocumentTimerClock } from './DocumentWorkTimer'
import type { PdfQrLink } from './qr'
import { withRecentPdfLinks } from './pdfRecognitionState'
import { applyColorworkCellChanges, type ColorworkCellChange } from './colorworkHistory'
import { PageWorkPersistence } from './pageWorkPersistence'
import { enqueuePdfRecognition, pausePdfRecognitionForReport, releasePdfRecognitionViewer, resumePdfRecognitionFromReport, subscribePdfRecognition, updatePdfRecognitionPageVisibility } from './pdfRecognition'
import { getViewerResourcePolicy, setThumbnailPagesExcluded } from './pdfRenderResources'
import { guidePositionForRotation } from './focusGeometry'
import { canHidePageSelection, compactPageThumbnails, completePageList, createHiddenPageGroupId, createThumbnailGroupId, movePagesToThumbnailGroup, nextVisiblePageAfterHide, normalizeHiddenPageGroups, updatePageHiddenState, visiblePageRange, type PageThumbnailItem } from './pageManagement'
import { createDefaultPrimaryProgressGuide, migrateProgressGuides, prepareProgressGuidesForDirectInteraction, progressGuideCandidates } from './progressLines'
import { ColorPresetButtons } from './ColorPresetButtons'
import { DESIGN_SYSTEM_COLORS, FUNCTIONAL_COLOR_PRESETS } from './designTokens'
import { useDismissiblePopover } from './useDismissiblePopover'

type Size = { width: number; height: number }
type WorkAction = { before?: PageWorkRecord; after?: PageWorkRecord; cellChanges?: ColorworkCellChange[] }
type PageHistory = { actions: WorkAction[]; cursor: number; byteCosts: number[] }
const MAX_CACHED_PAGE_WORKS = getViewerResourcePolicy().cachedPageWorks
const MAX_PAGE_HISTORY_ACTIONS = 30
const MAX_PAGE_HISTORY_BYTES = getViewerResourcePolicy().tablet ? 8 * 1024 * 1024 : 32 * 1024 * 1024
type ThumbnailSelection = { pages: number[]; anchor: number; lastPage: number }
type ThumbnailTouchGesture = {
  pointerId: number
  pointerType: 'mouse' | 'touch'
  pageNumber: number
  draggedPages: number[]
  startX: number
  startY: number
  startScrollLeft: number
  clientX: number
  clientY: number
  button: HTMLButtonElement
  mode: 'pending' | 'scroll' | 'select' | 'drag'
  dropTarget?: { kind: 'hidden'; groupId: string | null; key: string } | { kind: 'label'; groupId: string; key: string }
  timer: number
  edgeTimer?: number
}
type CounterGuideAction = { kind: 'advance' | 'correct'; pageNumber: number; guideId: string }
type CounterTimeLapAction = Omit<CounterTimeLap, 'historyEntryId'>
type TimerBarDrag = { pointerId: number; offsetX: number; offsetY: number }

function createCounterSession(documentId: string) { return { documentId, visible: false } }

const defaultProgressSettings: ProgressSettings = {
  horizontal: { visible: true, color: DESIGN_SYSTEM_COLORS.progress, thickness: 4, opacity: 0.8 },
  vertical: { visible: true, color: DESIGN_SYSTEM_COLORS.secondary, thickness: 1, opacity: 1 },
}

const defaultAnnotationSettings: AnnotationSettings = {
  pen: { color: FUNCTIONAL_COLOR_PRESETS[0].color, thickness: 2, opacity: 1, fontSize: 16 },
  line: { color: FUNCTIONAL_COLOR_PRESETS[0].color, thickness: 2, opacity: 1, fontSize: 16 },
  highlight: { color: DESIGN_SYSTEM_COLORS.warning, thickness: 16, opacity: 0.3, fontSize: 16 },
  text: { color: DESIGN_SYSTEM_COLORS.text, thickness: 2, opacity: 1, fontSize: 18 },
}
const viewerSaveErrorMessage = '뷰어 위치를 저장하지 못했습니다. 저장 공간을 확인하고 다시 시도해 주세요.'
const pageWorkSaveErrorMessage = '페이지 작업을 저장하지 못했습니다. 저장 공간을 확인하고 다시 시도해 주세요.'
let zoomHintShownInSession = false

function clamp(value: number, low: number, high: number) {
  return Math.min(high, Math.max(low, value))
}

function thumbnailGroupLabel(name: string) {
  const characters = Array.from(name)
  return characters.length > 7 ? characters.slice(0, 7).join('') + '...' : name
}

function dividerRatio(position: number, start: number, extent: number) {
  const handleSize = 14
  return clamp((position - start - handleSize / 2) / Math.max(1, extent - handleSize), 0.25, 0.75)
}

function splitBasis(ratio: number) {
  return 'calc(' + ratio * 100 + '% - ' + ratio * 14 + 'px)'
}

function estimatePageWorkBytes(work: PageWorkRecord) {
  const gridBytes = (work.colorworkGrid?.cells.length ?? 0) * 8
  const annotationBytes = work.annotations.reduce((sum, annotation) => sum + annotation.points.length * 16 + (annotation.text?.length ?? 0) * 2 + 96, 0)
  const guideBytes = ((work.horizontalGuides?.length ?? 0) + (work.verticalGuides?.length ?? 0)) * 32
  const regionHighlightBytes = (work.regionHighlights?.length ?? 0) * 64
  return gridBytes + annotationBytes + guideBytes + regionHighlightBytes + 256
}

function estimateHistoryActionBytes(action: WorkAction) {
  if (action.cellChanges) return action.cellChanges.length * 48
  return (action.before ? estimatePageWorkBytes(action.before) : 0) + (action.after ? estimatePageWorkBytes(action.after) : 0)
}

function cancelPageWorksFrame(frame: { current: number | undefined }) {
  if (frame.current === undefined) return
  cancelAnimationFrame(frame.current)
  frame.current = undefined
}

interface ViewerPdfSession {
  pdf: PDFDocumentProxy
  dispose: () => Promise<void>
  released: boolean
}

async function releaseViewerPdfSession(session: ViewerPdfSession) {
  if (session.released) return
  session.released = true
  await session.dispose()
}

function rememberRecentPage<T>(cache: Map<number, T>, pageNumber: number, value: T, limit = 4) {
  cache.delete(pageNumber)
  cache.set(pageNumber, value)
  while (cache.size > limit) cache.delete(cache.keys().next().value!)
}

function blankWork(documentId: string, pageNumber: number): PageWorkRecord {
  return {
    documentId, pageNumber, horizontalPosition: 0.5, verticalPosition: 0.5, annotations: [], regionHighlights: [], progressMigration: 'complete',
    horizontalGuides: [],
    verticalGuides: [],
  }
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
    error = cause instanceof Error ? translateMessage(cause.message) : t('차트 설정을 확인해 주세요.')
  }

  function apply(event: ReactFormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (dimensions && onApply(settings)) onClose()
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <form className="modal-card colorwork-settings-modal" role="dialog" aria-modal="true" aria-label={t("컬러워크 설정")} onSubmit={apply}>
        <div className="modal-heading"><div><p className="eyebrow">{t('컬러워크 설정')}</p><h2>{t("컬러워크 설정")}</h2></div><button type="button" className="icon-button" aria-label={t("닫기")} onClick={onClose}><X size={20} /></button></div>
        <p className="colorwork-settings-note">{t("게이지는 10×10cm 기준으로 계산합니다.")}</p>
        <div className="colorwork-input-grid">
          <label>{t("차트 가로 ")}<span>cm</span><input aria-label={t("차트 가로 cm")} type="number" min="1" max="200" step="0.1" value={chartWidthCm} onChange={(event) => setChartWidthCm(Number(event.currentTarget.value))} /></label>
          <label>{t("차트 세로 ")}<span>cm</span><input aria-label={t("차트 세로 cm")} type="number" min="1" max="200" step="0.1" value={chartHeightCm} onChange={(event) => setChartHeightCm(Number(event.currentTarget.value))} /></label>
          <label>{t("게이지 코 ")}<span>/ 10cm</span><input aria-label={t("게이지 코 수")} type="number" min="1" max="200" step="1" value={gaugeStitches} onChange={(event) => setGaugeStitches(Number(event.currentTarget.value))} /></label>
          <label>{t("게이지 단 ")}<span>/ 10cm</span><input aria-label={t("게이지 단 수")} type="number" min="1" max="200" step="1" value={gaugeRows} onChange={(event) => setGaugeRows(Number(event.currentTarget.value))} /></label>
        </div>
        {dimensions && <div className="colorwork-dimension-result">
          <span>{t("격자 ")}{dimensions.columns} × {dimensions.rows}{t("칸")}</span>
          <small>{t("계산 크기 약 ")}{dimensions.actualWidthCm.toFixed(1)} × {dimensions.actualHeightCm.toFixed(1)}cm</small>
        </div>}
        {error && <p className="colorwork-settings-error" role="alert">{error}</p>}
        <div className="colorwork-settings-actions"><button type="button" className="secondary-button" onClick={onClose}>{t("취소")}</button><button type="submit" className="primary-button" disabled={!dimensions}>{t("격자 적용")}</button></div>
      </form>
    </div>
  )
}

export default function Viewer() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabletResourcePolicy = getViewerResourcePolicy().tablet
  const reportMode = searchParams.get('report') === '1'
  const [showZoomHint, setShowZoomHint] = useState(() => {
    if (tabletResourcePolicy || zoomHintShownInSession) return false
    try {
      return !window.localStorage.getItem('doanbogo:pc-zoom-hint:v1')
    } catch { return true }
  })
  const areaRef = useRef<HTMLDivElement>(null)
  const viewerShellRef = useRef<HTMLElement>(null)
  const timerClockRef = useRef<DocumentTimerClock | null>(null)
  const lapBaselineRef = useRef<{ sessionId: string; elapsedMs: number } | null>(null)
  const fallbackTimerSessionIdRef = useRef('')
  const thumbnailRailRef = useRef<HTMLDivElement>(null)
  const thumbnailGroupListRef = useRef<HTMLDivElement>(null)
  const thumbnailMouseDragRef = useRef<{ pointerId: number; startX: number; scrollLeft: number; dragging: boolean } | null>(null)
  const counterActionQueueRef = useRef<Promise<void>>(Promise.resolve())
  const counterActionLockRef = useRef(false)
  const snapshotRef = useRef<ViewerSnapshot | null>(null)
  const saveTimer = useRef<number | undefined>(undefined)
  const pdfSessionRef = useRef<ViewerPdfSession | null>(null)
  const viewerLifecycleRef = useRef<'active' | 'suspending' | 'suspended' | 'resuming'>('active')
  const resumeAfterSuspendRef = useRef(false)
  const suspendAfterOpenRef = useRef(false)
  const initializedDocumentRef = useRef('')
  const linkTasksRef = useRef(new Set<Promise<void>>())
  const pdfCleanupTasksRef = useRef(new Set<Promise<void>>())
  const thumbnailScrollRef = useRef(0)
  const thumbnailScrollTimerRef = useRef<number | undefined>(undefined)
  const [pdfOpenCycle, setPdfOpenCycle] = useState(0)
  const [suspended, setSuspended] = useState(false)
  const [suspendError, setSuspendError] = useState('')
  const pageWorksFrameRef = useRef<number | undefined>(undefined)
  const [pageWorkPersistence] = useState(() => new PageWorkPersistence(savePageWork, 300, () => {
    setSuspendError(pageWorkSaveErrorMessage)
  }))
  const workRef = useRef<Record<number, PageWorkRecord>>({})
  const pageWorkLoadRef = useRef(new Map<number, Promise<PageWorkRecord>>())
  const pageWorkOrderRef = useRef<number[]>([])
  const pageWorkCacheTrimRef = useRef<Promise<void> | null>(null)
  const workDocumentIdRef = useRef(id)
  const historyRef = useRef(new Map<number, PageHistory>())
  const dragRef = useRef<{ pointerId: number; orientation: 'wide' | 'tall'; rect: DOMRect } | null>(null)
  const [documentName, setDocumentName] = useState('')
  const [documentKind, setDocumentKind] = useState<'pdf' | 'photos'>('pdf')
  const [documentWorkTimeMs, setDocumentWorkTimeMs] = useState(0)
  const [timerPortalHost, setTimerPortalHost] = useState<HTMLDivElement | null>(null)
  const [timerBarState, setTimerBarState] = useState<{ documentId: string; left: number | null; top: number }>(() => ({ documentId: id, left: null, top: 12 }))
  if (timerBarState.documentId !== id) setTimerBarState({ documentId: id, left: null, top: 12 })
  const timerBarPosition = timerBarState.documentId === id ? timerBarState : { documentId: id, left: null, top: 12 }
  const timerBarDragRef = useRef<TimerBarDrag | null>(null)
  const [timerHasUnsaved, setTimerHasUnsaved] = useState(false)
  const [timerSaving, setTimerSaving] = useState(false)
  const [counterActionSaving, setCounterActionSaving] = useState(false)
  const [exitPromptOpen, setExitPromptOpen] = useState(false)
  const [exitPromptTarget, setExitPromptTarget] = useState<'home' | 'report'>('home')
  const [timerSessionKey, setTimerSessionKey] = useState(0)
  const displayDocumentName = documentKind === 'photos' ? documentName : documentName.replace(/\.pdf$/i, '')
  const onTimerUnsavedChange = useCallback((unsaved: boolean) => setTimerHasUnsaved(unsaved), [])
  const onTimerSavingChange = useCallback((saving: boolean) => setTimerSaving(saving), [])
  const onTimerTotalChange = useCallback((total: number) => setDocumentWorkTimeMs(total), [])
  const onTimerClockChange = useCallback((clock: DocumentTimerClock | null) => {
    timerClockRef.current = clock
    if (clock) lapBaselineRef.current = { sessionId: clock.sessionId, elapsedMs: 0 }
  }, [])
  const requestViewerExit = useCallback(() => {
    if (timerSaving) return
    if (timerHasUnsaved) {
      setExitPromptTarget('home')
      setExitPromptOpen(true)
      return
    }
    navigate('/')
  }, [navigate, timerHasUnsaved, timerSaving])
  const [renameDialog, setRenameDialog] = useState(false)
  const [renameDraft, setRenameDraft] = useState('')
  const [renameError, setRenameError] = useState('')
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [snapshot, setSnapshot] = useState<ViewerSnapshot | null>(null)
  const [loadedId, setLoadedId] = useState('')
  const [savedCounterSession, setSavedCounterSession] = useState(() => createCounterSession(id))
  const counterSession = savedCounterSession.documentId === id ? savedCounterSession : createCounterSession(id)
  const counterPanelVisible = counterSession.visible
  const counters = normalizeCounterSnapshots(snapshot?.counters)
  const mainCounterBases = counters.filter((counter) => counter.kind === 'simple' && counter.unit === 'row' && !counter.linkedToId)
  const mainCounter = mainCounterBases.find((counter) => counter.id === snapshot?.counterMainId) ?? mainCounterBases[0]
  const mainCounterCanStepBack = Boolean(snapshot && mainCounter && mainCounter.value > 1 && findCounterRewindCheckpoint(snapshot.counterHistory ?? [], counters, mainCounter.id, mainCounter.value - 1))
  const [counterRowEditing, setCounterRowEditing] = useState(false)
  const [counterRowDraft, setCounterRowDraft] = useState('1')
  const counterRowInputRef = useRef<HTMLInputElement>(null)
  const skipCounterRowBlurRef = useRef(false)
  const currentCounterAlerts = snapshot ? counterAlertState(counters, snapshot.counterMainId, snapshot.counterPreviewEnabled === true) : { key: '', messages: [] as string[] }
  const counterAlertPending = Boolean(currentCounterAlerts.key && snapshot?.counterAlertAcknowledged !== currentCounterAlerts.key)
  const [pages, setPages] = useState<PageRecord[]>([])
  const pageVisibilityActionRef = useRef(false)
  const [pageVisibilitySaving, setPageVisibilitySaving] = useState(false)
  const [thumbnailUi, setThumbnailUi] = useState<{ documentId: string; error: string; selection: ThumbnailSelection | null }>(() => ({ documentId: id, error: '', selection: null }))
  const pageVisibilityError = thumbnailUi.documentId === id ? thumbnailUi.error : ''
  const thumbnailSelection = thumbnailUi.documentId === id ? thumbnailUi.selection : null
  const thumbnailTouchGestureRef = useRef<ThumbnailTouchGesture | null>(null)
  const suppressThumbnailClickRef = useRef(false)
  const draggedThumbnailPageRef = useRef<number | null>(null)
  const draggedThumbnailPagesRef = useRef<number[]>([])
  const thumbnailGroupSavingRef = useRef(false)
  const [thumbnailDropTarget, setThumbnailDropTarget] = useState<string | null>(null)
  const [thumbnailGroupState, setThumbnailGroupState] = useState(() => ({ documentId: id, expandedGroupId: null as string | null }))
  if (thumbnailGroupState.documentId !== id) setThumbnailGroupState({ documentId: id, expandedGroupId: null })
  const expandedThumbnailGroupId = thumbnailGroupState.documentId === id ? thumbnailGroupState.expandedGroupId : null
  const [thumbnailGroupDialog, setThumbnailGroupDialog] = useState(false)
  const [thumbnailGroupDraft, setThumbnailGroupDraft] = useState('')
  const [thumbnailGroupSaving, setThumbnailGroupSaving] = useState(false)
  const [thumbnailGroupError, setThumbnailGroupError] = useState('')
  const [thumbnailGroupPopover, setThumbnailGroupPopover] = useState<{ documentId: string; groupId: string; left: number; top: number } | null>(null)
  const thumbnailGroupPopoverRef = useRef<HTMLFormElement>(null)
  const [thumbnailCollapsed, setThumbnailCollapsed] = useState(() => tabletResourcePolicy)
  const [miniBarState, setMiniBarState] = useState(() => ({ documentId: id, open: false }))
  if (miniBarState.documentId !== id) setMiniBarState({ documentId: id, open: false })
  const miniBarOpen = miniBarState.documentId === id && miniBarState.open
  const miniBarAccordionButtonRef = useRef<HTMLButtonElement>(null)
  const miniBarControlsId = 'viewer-tools-' + id.replace(/[^a-zA-Z0-9_-]/g, '-')
  const [miniBarSettingsState, setMiniBarSettingsState] = useState(() => ({ documentId: id, open: false }))
  if (miniBarSettingsState.documentId !== id) setMiniBarSettingsState({ documentId: id, open: false })
  const miniBarSettingsOpen = miniBarSettingsState.documentId === id && miniBarSettingsState.open
  const setMiniBarSettingsOpen = useCallback((nextOpen: boolean | ((open: boolean) => boolean)) => {
    setMiniBarSettingsState((current) => ({ documentId: id, open: typeof nextOpen === 'function' ? nextOpen(current.documentId === id && current.open) : nextOpen }))
  }, [id])
  const miniBarSettingsPanelRef = useRef<HTMLDivElement>(null)
  const miniBarSettingsTriggerRef = useRef<HTMLButtonElement>(null)
  const thumbnailContentId = 'viewer-thumbnails-' + id.replace(/[^a-zA-Z0-9_-]/g, '-')
  const [pageWorks, setPageWorks] = useState<Record<number, PageWorkRecord>>({})
  const [histories, setHistories] = useState<Record<number, PageHistory>>({})
  const [tool, setTool] = useState<AnnotationTool>('pan')
  const [colorworkRequest, setColorworkRequest] = useState<ColorworkCreateRequest | null>(null)
  const [colorworkDialog, setColorworkDialog] = useState(false)
  const [colorworkBrushColor, setColorworkBrushColor] = useState('#F1C40F')
  const [colorworkBrushOpacity, setColorworkBrushOpacity] = useState(0.25)
  const [colorworkEraser, setColorworkEraser] = useState(false)
  const [pdfLinksByPage, setPdfLinksByPage] = useState<Record<number, PdfQrLink[]>>({})
  const pdfLinkPagesRef = useRef(new Map<number, true>())
  const recognitionLoadPendingRef = useRef(new Set<string>())
  const [qrLinksByPage, setQrLinksByPage] = useState<Record<number, PdfQrLink[]>>({})
  const qrLinksRef = useRef(new Map<number, PdfQrLink[]>())
  const recognitionRecordRef = useRef<Pick<DocumentRecord, 'id' | 'pageCount' | 'pdf' | 'kind'> | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<{ id: string; message: string } | null>(null)
  const [splitPreview, setSplitPreview] = useState<number | null>(null)
  const [areaSize, setAreaSize] = useState<Size>({ width: 0, height: 0 })
  useEffect(() => {
    if (tabletResourcePolicy || reportMode || !showZoomHint || !pdf || loadedId !== id || loading || suspended || zoomHintShownInSession) return
    try {
      window.localStorage.setItem('doanbogo:pc-zoom-hint:v1', '1')
    } catch { /* Show once per session when browser storage is unavailable. */ }
    zoomHintShownInSession = true
  }, [tabletResourcePolicy, reportMode, showZoomHint, pdf, loadedId, id, loading, suspended])

  const saveViewerWithNotice = useCallback((next: ViewerSnapshot) => saveViewer(next).then(() => {
    setSuspendError((current) => current === viewerSaveErrorMessage ? '' : current)
  }).catch((error: unknown) => {
    console.warn('[PDF] Viewer state could not be saved.', error)
    setSuspendError(viewerSaveErrorMessage)
    throw error
  }), [])

  const requestPdfSuspend = useCallback(() => {
    if (viewerLifecycleRef.current === 'suspending') {
      resumeAfterSuspendRef.current = false
      return
    }
    if (viewerLifecycleRef.current === 'resuming') viewerLifecycleRef.current = 'active'
    if (viewerLifecycleRef.current !== 'active') return
    if (!pdfSessionRef.current) {
      suspendAfterOpenRef.current = true
      return
    }
    suspendAfterOpenRef.current = false
    viewerLifecycleRef.current = 'suspending'
    thumbnailScrollRef.current = thumbnailRailRef.current?.scrollLeft ?? thumbnailScrollRef.current
    window.clearTimeout(thumbnailScrollTimerRef.current)
    thumbnailScrollTimerRef.current = undefined
    cancelThumbnailRenders()
    setLoading(true)
    setSuspended(true)
  }, [])

  const requestPdfResume = useCallback(() => {
    if (viewerLifecycleRef.current === 'suspending') {
      resumeAfterSuspendRef.current = true
      return
    }
    if (viewerLifecycleRef.current !== 'suspended') return
    resumeAfterSuspendRef.current = false
    viewerLifecycleRef.current = 'resuming'
    setLoadError(null)
    void Promise.all([
      pageWorkPersistence.flushAll(),
      snapshotRef.current ? saveViewer(snapshotRef.current) : Promise.resolve(),
    ]).then(() => setSuspendError('')).catch(() => {
      setSuspendError(viewerSaveErrorMessage)
    })
    setLoading(true)
    setSuspended(false)
    setPdfOpenCycle((current) => current + 1)
  }, [pageWorkPersistence])

  useEffect(() => {
    return () => {
      const gesture = thumbnailTouchGestureRef.current
      if (!gesture) return
      window.clearTimeout(gesture.timer)
      if (gesture.edgeTimer !== undefined) window.clearInterval(gesture.edgeTimer)
      thumbnailTouchGestureRef.current = null
    }
  }, [id])

  function setThumbnailSelection(next: ThumbnailSelection | null | ((current: ThumbnailSelection | null) => ThumbnailSelection | null)) {
    setThumbnailUi((current) => {
      const sameDocument = current.documentId === id
      const selection = typeof next === 'function' ? next(sameDocument ? current.selection : null) : next
      return { documentId: id, selection, error: sameDocument ? current.error : '' }
    })
  }

  function setPageVisibilityError(error: string) {
    setThumbnailUi((current) => ({ documentId: id, selection: current.documentId === id ? current.selection : null, error }))
  }

  const flushPendingPageWorks = useCallback(() => pageWorkPersistence.flushAll().then(() => {
    setSuspendError((current) => current === pageWorkSaveErrorMessage ? '' : current)
  }).catch((error: unknown) => {
    console.warn('[PDF] Page work could not be saved.', error)
    setSuspendError(pageWorkSaveErrorMessage)
  }), [pageWorkPersistence])

  const pushSnapshot = useCallback((next: ViewerSnapshot, immediate = false) => {
    const previous = snapshotRef.current
    if (previous && (previous.primary.page !== next.primary.page || previous.secondary.page !== next.secondary.page)) {
      void flushPendingPageWorks()
    }
    snapshotRef.current = next
    setSnapshot(next)
    if (saveTimer.current !== undefined) window.clearTimeout(saveTimer.current)
    if (immediate) {
      void saveViewerWithNotice(next).catch(() => {})
      return
    }
    saveTimer.current = window.setTimeout(() => void saveViewerWithNotice(next).catch(() => {}), 350)
  }, [flushPendingPageWorks, saveViewerWithNotice])

  const updateHistory = useCallback((page: number, history: PageHistory) => {
    historyRef.current.delete(page)
    historyRef.current.set(page, history)
    const totalBytes = () => [...historyRef.current.values()].reduce((sum, value) => sum + value.byteCosts.reduce((pageSum, bytes) => pageSum + bytes, 0), 0)
    while (totalBytes() > MAX_PAGE_HISTORY_BYTES && historyRef.current.size) {
      const oldest = historyRef.current.entries().next().value as [number, PageHistory] | undefined
      if (!oldest) break
      const [oldestPage, oldestHistory] = oldest
      const actions = oldestHistory.actions.slice(1)
      const byteCosts = oldestHistory.byteCosts.slice(1)
      if (!actions.length) historyRef.current.delete(oldestPage)
      else historyRef.current.set(oldestPage, { actions, byteCosts, cursor: Math.max(0, oldestHistory.cursor - 1) })
    }
    setHistories(Object.fromEntries(historyRef.current))
  }, [])

  const onPageRendered = useCallback((pageNumber: number) => {
    const scanKey = id + ':' + pageNumber
    const hasPdfLinks = pdfLinkPagesRef.current.has(pageNumber)
    const hasQrLinks = qrLinksRef.current.has(pageNumber)
    if (reportMode || viewerLifecycleRef.current !== 'active' || hasPdfLinks && hasQrLinks || recognitionLoadPendingRef.current.has(scanKey)) return
    recognitionLoadPendingRef.current.add(scanKey)
    const task = (async () => {
      const storedRecognition = await getPageRecognition(id, pageNumber).catch(() => undefined)
      const cached = storedRecognition?.version === 1 ? storedRecognition : undefined
      if (viewerLifecycleRef.current !== 'active') return

      if (!hasPdfLinks && cached?.pdfLinksDone) {
        rememberRecentPage(pdfLinkPagesRef.current, pageNumber, true)
        setPdfLinksByPage((current) => withRecentPdfLinks(current, pageNumber, cached.pdfLinks))
      }

      if (!hasQrLinks && cached?.qrLinksDone) {
        rememberRecentPage(qrLinksRef.current, pageNumber, cached.qrLinks)
        setQrLinksByPage((current) => withRecentPdfLinks(current, pageNumber, cached.qrLinks))
      }
    })().finally(() => {
      recognitionLoadPendingRef.current.delete(scanKey)
    })
    linkTasksRef.current.add(task)
    void task.finally(() => linkTasksRef.current.delete(task)).catch(() => {})
  }, [id, reportMode])

  useEffect(() => subscribePdfRecognition((documentId, pageNumber, result) => {
    if (documentId !== id || viewerLifecycleRef.current !== 'active') return
    if (result.pdfLinksDone) {
      rememberRecentPage(pdfLinkPagesRef.current, pageNumber, true)
      setPdfLinksByPage((current) => withRecentPdfLinks(current, pageNumber, result.pdfLinks))
    }
    if (result.qrLinksDone) {
      rememberRecentPage(qrLinksRef.current, pageNumber, result.qrLinks)
      setQrLinksByPage((current) => withRecentPdfLinks(current, pageNumber, result.qrLinks))
    }
  }), [id])

  useEffect(() => {
    const linkTasks = linkTasksRef.current
    const pdfCleanupTasks = pdfCleanupTasksRef.current
    if (viewerLifecycleRef.current === 'suspending' || viewerLifecycleRef.current === 'suspended') return
    const firstOpen = initializedDocumentRef.current !== id
    if (firstOpen) {
      workDocumentIdRef.current = id
      pageWorkLoadRef.current.clear()
      pageWorkOrderRef.current = []
      pageWorkCacheTrimRef.current = null
      cancelPageWorksFrame(pageWorksFrameRef)
    }
    let disposed = false
    let session: ViewerPdfSession | undefined
    let recognitionPdf: PDFDocumentProxy | null = null
    void (async () => {
      const record = await getDocument(id)
      if (!record) throw new Error('이 PDF를 찾을 수 없습니다. 도안 목록에서 다시 열어 주세요.')
      setDocumentKind(record.kind === 'photos' ? 'photos' : 'pdf')
      const storedSnapshot = await getViewer(id, record.pageCount)
      let restored = initializedDocumentRef.current === id && snapshotRef.current ? snapshotRef.current : storedSnapshot
      const restoredBases = normalizeCounterSnapshots(restored.counters).filter((counter) => counter.kind === 'simple' && counter.unit === 'row' && !counter.linkedToId)
      if (!restoredBases.length) {
        const main = createCounter('simple', t('메인 카운터'))
        restored = { ...restored, counters: [...normalizeCounterSnapshots(restored.counters), main], counterMainId: main.id }
        try { await saveViewer(restored) } catch (error) {
          console.warn('[PDF] Default main counter could not be saved.', error)
          setSuspendError(viewerSaveErrorMessage)
        }
      } else if (!restoredBases.some((counter) => counter.id === restored.counterMainId)) {
        restored = { ...restored, counterMainId: restoredBases[0].id }
        try { await saveViewer(restored) } catch (error) {
          console.warn('[PDF] Main counter selection could not be saved.', error)
          setSuspendError(viewerSaveErrorMessage)
        }
      }
      restored.primary.page = clamp(restored.primary.page, 1, record.pageCount)
      restored.secondary.page = clamp(restored.secondary.page, 1, record.pageCount)
      const opened = record.kind === 'photos'
        ? await openPhotoDocument(id)
        : record.pdf ? await openPdf(record.pdf) : (() => { throw new Error('PDF 자료를 찾을 수 없습니다.') })()
      if (disposed || viewerLifecycleRef.current === 'suspending' || viewerLifecycleRef.current === 'suspended') {
        await opened.dispose()
        return
      }
      recognitionPdf = opened.document
      recognitionRecordRef.current = { id, pageCount: record.pageCount, pdf: record.pdf, kind: record.kind }
      pdfLinkPagesRef.current.clear()
      recognitionLoadPendingRef.current.clear()
      qrLinksRef.current.clear()
      session = { pdf: opened.document, dispose: opened.dispose, released: false }
      pdfSessionRef.current = session
      if (firstOpen) {
        workRef.current = {}
        pageWorkLoadRef.current.clear()
        pageWorkOrderRef.current = []
        pageWorkCacheTrimRef.current = null
        historyRef.current.clear()
        setPageWorks({})
        setHistories({})
      }
      setPdfLinksByPage({})
      setQrLinksByPage({})
      setDocumentName(record.fileName)
      setDocumentKind(record.kind === 'photos' ? 'photos' : 'pdf')
      setDocumentWorkTimeMs(record.totalWorkTimeMs ?? 0)
      setSnapshot(restored)
      snapshotRef.current = restored
      setPdf(opened.document)
      const recognitionRecord = { id, pageCount: record.pageCount, pdf: record.pdf, kind: record.kind }
      enqueuePdfRecognition(recognitionRecord, opened.document)
      setLoadedId(id)
      initializedDocumentRef.current = id
      setLoadError(null)
      await markOpened(id)
      const storedPages = await getPages(id)
      const groupedPages = normalizeHiddenPageGroups(storedPages)
      const legacyGroupPages = groupedPages.filter((page) => page.hiddenGroupId && !storedPages.find((stored) => stored.pageNumber === page.pageNumber)?.hiddenGroupId)
      if (legacyGroupPages.length) {
        try {
          await savePageRecords(legacyGroupPages)
          setThumbnailUi((current) => ({ documentId: id, selection: current.documentId === id ? current.selection : null, error: '' }))
        } catch (error) {
          console.warn('[PDF] Legacy hidden page groups could not be saved.', error)
          setThumbnailUi((current) => ({ documentId: id, selection: current.documentId === id ? current.selection : null, error: '기존 숨김 그룹을 저장하지 못했습니다. 저장 공간을 확인해 주세요.' }))
        }
      }
      setPages(groupedPages)
      setLoading(false)
      if (document.visibilityState === 'hidden' && (suspendAfterOpenRef.current || tabletResourcePolicy)) {
        suspendAfterOpenRef.current = false
        requestPdfSuspend()
      } else {
        if (viewerLifecycleRef.current === 'resuming') viewerLifecycleRef.current = 'active'
        suspendAfterOpenRef.current = false
      }
    })().catch((error: unknown) => {
      if (!disposed) {
        viewerLifecycleRef.current = 'suspended'
        setLoadError({ id, message: error instanceof Error ? translateMessage(error.message) : translateMessage(pdfErrorMessage(error)) })
        setLoading(false)
      }
    })
    return () => {
      disposed = true
      const recognitionRelease = recognitionPdf ? releasePdfRecognitionViewer(id, recognitionPdf) : Promise.resolve()
      if (saveTimer.current !== undefined) window.clearTimeout(saveTimer.current)
      const current = snapshotRef.current
      if (current) void saveViewer(current)
      void pageWorkPersistence.flushAll().catch(() => {})
      cancelPageWorksFrame(pageWorksFrameRef)
      if (session && !session.released) void (async () => {
        await Promise.allSettled([
          recognitionRelease,
          ...linkTasks,
          ...pdfCleanupTasks,
          pdfPageRenderQueue.whenIdle(),
          waitForThumbnailQueueIdle(),
        ])
        await releaseViewerPdfSession(session)
      })()
      if (pdfSessionRef.current === session) pdfSessionRef.current = null
    }
  }, [id, pdfOpenCycle, pageWorkPersistence, tabletResourcePolicy, requestPdfSuspend])

  useEffect(() => {
    const record = recognitionRecordRef.current
    if (loadedId !== id || !pdf || !record) return
    if (reportMode) pausePdfRecognitionForReport(record)
    else resumePdfRecognitionFromReport(record, pdf)
  }, [id, loadedId, pdf, reportMode])

  useEffect(() => {
    if (!suspended || viewerLifecycleRef.current !== 'suspending') return
    let cancelled = false
    void (async () => {
      setSuspendError('')
      let saveFailed = false
      if (saveTimer.current !== undefined) window.clearTimeout(saveTimer.current)
      saveTimer.current = undefined
      const current = snapshotRef.current
      if (current) {
        try {
          await saveViewer(current)
        } catch {
          saveFailed = true
        }
      }
      try {
        await pageWorkPersistence.flushAll()
      } catch {
        saveFailed = true
      }

      const session = pdfSessionRef.current
      await Promise.allSettled([
        ...(session ? [releasePdfRecognitionViewer(id, session.pdf)] : []),
        ...linkTasksRef.current,
        ...pdfCleanupTasksRef.current,
      ])
      await Promise.allSettled([pdfPageRenderQueue.whenIdle(), waitForThumbnailQueueIdle()])

      if (session) await releaseViewerPdfSession(session)
      if (pdfSessionRef.current === session) pdfSessionRef.current = null
      if (cancelled) return

      setPdf(null)
      viewerLifecycleRef.current = 'suspended'
      setPdfOpenCycle((cycle) => cycle + 1)
      if (saveFailed) setSuspendError('일부 작업을 저장하지 못했습니다. 인터넷 연결을 확인하고 복귀 후 다시 저장해 주세요.')
      if (resumeAfterSuspendRef.current || document.visibilityState === 'visible') requestPdfResume()
    })().catch(() => {
      if (!cancelled) {
        viewerLifecycleRef.current = 'suspended'
        setPdf(null)
        setPdfOpenCycle((cycle) => cycle + 1)
        setSuspendError('PDF 메모리를 해제하지 못했습니다. 다시 열어 주세요.')
        if (resumeAfterSuspendRef.current || document.visibilityState === 'visible') requestPdfResume()
      }
    })
    return () => { cancelled = true }
  }, [suspended, pageWorkPersistence, requestPdfResume, id])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (tabletResourcePolicy) requestPdfSuspend()
        else {
          void pageWorkPersistence.flushAll().catch(() => {})
          if (snapshotRef.current) void saveViewerWithNotice(snapshotRef.current).catch(() => {})
        }
      } else if (tabletResourcePolicy) requestPdfResume()
    }
    const handlePageHide = () => {
      if (tabletResourcePolicy) requestPdfSuspend()
      else {
        void pageWorkPersistence.flushAll().catch(() => {})
        if (snapshotRef.current) void saveViewerWithNotice(snapshotRef.current).catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', handlePageHide)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [pageWorkPersistence, tabletResourcePolicy, requestPdfResume, requestPdfSuspend, saveViewerWithNotice])

  useEffect(() => {
    if (!timerHasUnsaved) return
    const viewerHref = window.location.href
    const viewerState = window.history.state as { idx?: number; [key: string]: unknown } | null
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    const interceptBackNavigation = (event: PopStateEvent) => {
      event.stopImmediatePropagation()
      const previousState = event.state as { idx?: number } | null
      const previousIndex = previousState?.idx
      const nextIndex = typeof previousIndex === 'number' && Number.isSafeInteger(previousIndex) ? previousIndex + 1 : (viewerState?.idx ?? 0)
      window.history.pushState({ ...viewerState, idx: nextIndex }, '', viewerHref)
      setExitPromptTarget('home')
      setExitPromptOpen(true)
    }
    window.addEventListener('beforeunload', warnBeforeLeaving)
    window.addEventListener('popstate', interceptBackNavigation, true)
    return () => {
      window.removeEventListener('beforeunload', warnBeforeLeaving)
      window.removeEventListener('popstate', interceptBackNavigation, true)
    }
  }, [timerHasUnsaved])

  useEffect(() => {
    if (!pdf || suspended || thumbnailCollapsed) return
    const frame = requestAnimationFrame(() => {
      if (thumbnailRailRef.current) thumbnailRailRef.current.scrollLeft = thumbnailScrollRef.current
    })
    return () => cancelAnimationFrame(frame)
  }, [pdf, suspended, thumbnailCollapsed])

  useEffect(() => () => {
    window.clearTimeout(thumbnailScrollTimerRef.current)
    setThumbnailRenderingPaused(false)
  }, [])

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
  const ratio = snapshot ? (orientation === 'wide' ? snapshot.wideRatio : snapshot.tallRatio) : 0.5
  const activePage = snapshot ? snapshot[snapshot.activePane].page : 1
  const pageState = pages.find((page) => page.pageNumber === activePage)
  const isBookmarked = Boolean(pageState?.bookmarked)
  const hiddenNumbers = new Set(pages.filter((page) => page.hidden).map((page) => page.pageNumber))
  const visiblePageNumbers = pdf ? Array.from({ length: pdf.numPages }, (_, index) => index + 1).filter((page) => !hiddenNumbers.has(page)) : []
  const activeVisiblePageIndex = visiblePageNumbers.indexOf(activePage)
  const selectedThumbnailPages = thumbnailSelection?.pages ?? []
  const selectedThumbnailSet = new Set(selectedThumbnailPages)
  const thumbnailGroups = snapshot?.thumbnailGroups ?? []
  const hideSelectionWouldRemoveLastPage = selectedThumbnailPages.length > 0 && !canHidePageSelection(pdf?.numPages ?? 0, hiddenNumbers, selectedThumbnailSet)
  const progressSettings = snapshot?.progressSettings ?? defaultProgressSettings
  const annotationSettings = snapshot?.annotationSettings ?? defaultAnnotationSettings
  const activeAnnotationStyle = tool === 'pen' || tool === 'line' || tool === 'highlight' || tool === 'text' ? annotationSettings[tool] : null
  const activeHistory = histories[activePage] ?? { actions: [], cursor: 0, byteCosts: [] }
  const activeWork = pageWorks[activePage] ?? blankWork(id, activePage)
  const activeZoom = snapshot ? snapshot[snapshot.activePane].zoom : 1
  const activeRotation = snapshot ? snapshot[snapshot.activePane].rotations?.[activePage] ?? activeWork.rotation ?? 0 : 0
  const activeColorworkGrid = activeWork.colorworkGrid ?? null
  const canUndo = activeHistory.cursor > 0
  const canRedo = activeHistory.cursor < activeHistory.actions.length
  const primaryPage = snapshot?.primary.page
  const secondaryPage = snapshot?.secondary.page
  const isSplit = snapshot?.split

  useDismissiblePopover(miniBarSettingsOpen, miniBarSettingsPanelRef, miniBarSettingsTriggerRef, () => setMiniBarSettingsOpen(false))

  useEffect(() => {
    if (!miniBarOpen || miniBarSettingsOpen || thumbnailGroupPopover || thumbnailGroupDialog || colorworkDialog || renameDialog || exitPromptOpen) return
    const closeMiniBar = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      setMiniBarState((current) => current.documentId === id ? { ...current, open: false } : current)
      setMiniBarSettingsOpen(false)
      miniBarAccordionButtonRef.current?.focus()
    }
    document.addEventListener('keydown', closeMiniBar)
    return () => document.removeEventListener('keydown', closeMiniBar)
  }, [id, miniBarOpen, miniBarSettingsOpen, thumbnailGroupPopover, thumbnailGroupDialog, colorworkDialog, renameDialog, exitPromptOpen, setMiniBarSettingsOpen])

  useEffect(() => {
    if (!thumbnailGroupPopover || thumbnailGroupPopover.documentId !== id) return
    const dismissOutside = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element) || thumbnailGroupPopoverRef.current?.contains(target)) return
      const trigger = target.closest<HTMLElement>('[data-thumbnail-group-settings]')
      if (trigger?.dataset.thumbnailGroupSettings === thumbnailGroupPopover.groupId) return
      setThumbnailGroupPopover(null)
    }
    const dismissEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setThumbnailGroupPopover(null)
      document.querySelector<HTMLButtonElement>('[data-thumbnail-group-settings="' + CSS.escape(thumbnailGroupPopover.groupId) + '"]')?.focus()
    }
    document.addEventListener('pointerdown', dismissOutside)
    document.addEventListener('keydown', dismissEscape)
    return () => {
      document.removeEventListener('pointerdown', dismissOutside)
      document.removeEventListener('keydown', dismissEscape)
    }
  }, [id, thumbnailGroupPopover])

  useEffect(() => {
    draggedThumbnailPageRef.current = null
    setThumbnailDropTarget(null)
  }, [id])

  useEffect(() => {
    if (!pdf || suspended) return
    let cancelled = false
    const timer = window.setTimeout(() => void (async () => {
      await Promise.allSettled([pdfPageRenderQueue.whenIdle(), waitForThumbnailQueueIdle(), ...linkTasksRef.current])
      if (cancelled || document.visibilityState !== 'visible' || viewerLifecycleRef.current !== 'active' || pdfSessionRef.current?.released || linkTasksRef.current.size) return
      const cleanup = Promise.resolve().then(() => pdf.cleanup(true)).then(() => {}).catch(() => {})
      pdfCleanupTasksRef.current.add(cleanup)
      try {
        await cleanup
      } finally {
        pdfCleanupTasksRef.current.delete(cleanup)
      }
    })(), tabletResourcePolicy && thumbnailCollapsed ? 200 : 1200)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [pdf, suspended, primaryPage, secondaryPage, isSplit, tabletResourcePolicy, thumbnailCollapsed])

  const trimPageWorkCache = useCallback(() => {
    if (pageWorkCacheTrimRef.current) return pageWorkCacheTrimRef.current
    let pending: Promise<void>
    pending = (async () => {
      while (pageWorkOrderRef.current.length > MAX_CACHED_PAGE_WORKS && workDocumentIdRef.current === id) {
        const current = snapshotRef.current
        const needed = new Set(current
          ? current.split ? [current.primary.page, current.secondary.page] : [current[current.activePane].page]
          : [])
        const victim = pageWorkOrderRef.current.find((page) => !needed.has(page))
        if (victim === undefined) return
        await pageWorkPersistence.flushAll()
        if (workDocumentIdRef.current !== id) return
        const latest = snapshotRef.current
        const stillNeeded = latest
          ? latest.split ? [latest.primary.page, latest.secondary.page].includes(victim) : latest[latest.activePane].page === victim
          : false
        if (stillNeeded) {
          pageWorkOrderRef.current = [...pageWorkOrderRef.current.filter((page) => page !== victim), victim]
          continue
        }
        const nextWorks = { ...workRef.current }
        delete nextWorks[victim]
        workRef.current = nextWorks
        historyRef.current.delete(victim)
        pageWorkOrderRef.current = pageWorkOrderRef.current.filter((page) => page !== victim)
        setPageWorks((currentWorks) => {
          const next = { ...currentWorks }
          delete next[victim]
          return next
        })
        setHistories((currentHistories) => {
          const next = { ...currentHistories }
          delete next[victim]
          return next
        })
      }
    })().finally(() => {
      if (pageWorkCacheTrimRef.current === pending) pageWorkCacheTrimRef.current = null
    })
    pageWorkCacheTrimRef.current = pending
    return pending
  }, [id, pageWorkPersistence])

  const touchPageWork = useCallback((page: number) => {
    pageWorkOrderRef.current = [...pageWorkOrderRef.current.filter((item) => item !== page), page]
    void trimPageWorkCache().catch((error: unknown) => {
      console.warn('[PDF] Cached page work could not be trimmed.', error)
    })
  }, [trimPageWorkCache])

  const ensurePageWork = useCallback(async (page: number) => {
    const existing = workRef.current[page]
    if (existing) {
      touchPageWork(page)
      return existing
    }
    const pending = pageWorkLoadRef.current.get(page)
    if (pending) {
      const loaded = await pending
      touchPageWork(page)
      return loaded
    }
    let loadingWork: Promise<PageWorkRecord>
    loadingWork = getPageWork(id, page).then((savedWork) => {
      if (workDocumentIdRef.current !== id) return savedWork
      const current = workRef.current[page]
      if (current) {
        touchPageWork(page)
        return current
      }
      const loaded = prepareProgressGuidesForDirectInteraction(savedWork)
      workRef.current = { ...workRef.current, [page]: loaded }
      touchPageWork(page)
      setPageWorks(workRef.current)
      if (loaded !== savedWork) {
        void pageWorkPersistence.schedule(loaded, true).catch((error: unknown) => {
          console.warn('[PDF] Legacy progress guides could not be migrated.', error)
          setSuspendError(pageWorkSaveErrorMessage)
        })
      }
      return loaded
    }).finally(() => {
      if (pageWorkLoadRef.current.get(page) === loadingWork) pageWorkLoadRef.current.delete(page)
    })
    pageWorkLoadRef.current.set(page, loadingWork)
    return loadingWork
  }, [id, pageWorkPersistence, touchPageWork])

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
      setRenameError(error instanceof Error ? translateMessage(error.message) : t('PDF 이름을 변경하지 못했습니다.'))
    }
  }

  function changePane(paneId: PaneId, change: (pane: PaneSnapshot) => PaneSnapshot, immediate = false) {
    mutateSnapshot((current) => ({ ...current, [paneId]: change(current[paneId]) }), immediate)
  }

  function commitCounterTransaction(nextCounters: CounterSnapshot[], label: string, actualRow = 0, restoreGuides?: CounterHistoryEntry['guides'], saveHistory = true, autoPanY?: number, baseCounterId?: string, snapshotChanges?: Partial<ViewerSnapshot>, guideAction?: CounterGuideAction, lapAction?: CounterTimeLapAction) {
    const operation = counterActionQueueRef.current.then(async () => {
      const current = snapshotRef.current
      if (!current) return
      const undoneHistory = !saveHistory && restoreGuides ? current.counterHistory?.at(-1) : undefined
      const undoneTimeLap = undoneHistory?.timeLapId ? current.counterTimeLaps?.find((lap) => lap.id === undoneHistory.timeLapId) : undefined
      if (saveTimer.current !== undefined) window.clearTimeout(saveTimer.current)
      saveTimer.current = undefined
      const provisional = { ...current, ...snapshotChanges, counters: nextCounters, ...(autoPanY === undefined ? {} : { [current.activePane]: { ...current[current.activePane], centerY: autoPanY } }) }
      snapshotRef.current = provisional
      setSnapshot(provisional)
      try {
        await pageWorkPersistence.flushAll()
        const works = await getPageWorks(id)
        const counterById = new Map(nextCounters.map((counter) => [counter.id, counter]))
        const previousCounterById = new Map(normalizeCounterSnapshots(current.counters).map((counter) => [counter.id, counter]))
        const restoreByPage = new Map((restoreGuides ?? []).map((item) => [item.pageNumber, item]))
        const beforeGuides: CounterHistoryEntry['guides'] = []
        const updatedWorks: PageWorkRecord[] = []
        for (const work of works) {
          const horizontalGuides = work.horizontalGuides ?? []
          const verticalGuides = work.verticalGuides ?? []
          const restore = restoreByPage.get(work.pageNumber)
          let nextHorizontal = horizontalGuides
          let nextVertical = verticalGuides
          if (restore) {
            const savedById = new Map([...restore.horizontalGuides, ...restore.verticalGuides].map((guide) => [guide.id, guide]))
            nextHorizontal = horizontalGuides.map((guide) => savedById.has(guide.id) ? { ...guide, ...savedById.get(guide.id) } : guide)
            nextVertical = verticalGuides.map((guide) => savedById.has(guide.id) ? { ...guide, ...savedById.get(guide.id) } : guide)
          } else {
          const updateGuides = (guides: ProgressGuide[], pageNumber: number) => guides.map((guide) => {
              if (guide.linkedCounterId && !counterById.has(guide.linkedCounterId)) {
                return {
                  ...guide,
                  linkedCounterId: undefined,
                  name: undefined,
                  color: undefined,
                  chartRegion: undefined,
                  focus: guide.focus ? { ...guide.focus, scope: 'page' as const } : undefined,
                }
              }
              const counter = guide.linkedCounterId ? counterById.get(guide.linkedCounterId) : undefined
              if (!counter || !guideAction || guideAction.pageNumber !== pageNumber || guideAction.guideId !== guide.id || guide.role !== 'primary') return guide
              const previousCounter = previousCounterById.get(counter.id)
              const rowOf = (item: CounterSnapshot | undefined) => item ? item.kind === 'simple' ? item.value : item.currentRow ?? 1 : 1
              const updated = guideAction.kind === 'advance'
                ? progressGuideForCounter(guide, counter, rowOf(previousCounter))
                : reanchorProgressGuideForCounter(guide, rowOf(previousCounter), rowOf(counter))
              const changed = updated.position !== guide.position || updated.name !== guide.name || updated.color !== guide.color ||
                updated.markerProgress !== guide.markerProgress || updated.rowSpacingStartRow !== guide.rowSpacingStartRow ||
                updated.counterRowOffset !== guide.counterRowOffset || JSON.stringify(updated.rotationPositions) !== JSON.stringify(guide.rotationPositions)
              return changed ? updated : guide
            })
            nextHorizontal = updateGuides(horizontalGuides, work.pageNumber)
            nextVertical = updateGuides(verticalGuides, work.pageNumber)
          }
          const changed = nextHorizontal.some((guide, index) => guide !== horizontalGuides[index]) || nextVertical.some((guide, index) => guide !== verticalGuides[index])
          if (!changed) continue
          beforeGuides.push({ pageNumber: work.pageNumber, horizontalGuides: horizontalGuides.map((guide) => ({ ...guide })), verticalGuides: verticalGuides.map((guide) => ({ ...guide })) })
          updatedWorks.push({ ...work, horizontalGuides: nextHorizontal, verticalGuides: nextVertical })
        }
        let counterHistory = current.counterHistory ?? []
        let counterTimeLaps = current.counterTimeLaps ?? []
        if (saveHistory) {
          const historyEntryId = crypto.randomUUID()
          const entry: CounterHistoryEntry = { id: historyEntryId, label, counters: normalizeCounterSnapshots(current.counters), guides: beforeGuides, actualRow, ...(baseCounterId ? { baseCounterId } : {}), ...(lapAction ? { timeLapId: lapAction.id } : {}), savedAt: Date.now() }
          counterHistory = [...counterHistory, entry].slice(-MAX_COUNTER_HISTORY)
          if (lapAction) counterTimeLaps = [...counterTimeLaps, { ...lapAction, historyEntryId }]
        } else if (restoreGuides) {
          counterHistory = counterHistory.slice(0, -1)
          if (undoneTimeLap) counterTimeLaps = counterTimeLaps.filter((lap) => lap.id !== undoneTimeLap.id)
        }
        const autoPanGuideStillLinked = current.counterGuideAutoPanId
          ? works.some((work) => [...(work.horizontalGuides ?? []), ...(work.verticalGuides ?? [])].some((guide) => guide.id === current.counterGuideAutoPanId && Boolean(guide.linkedCounterId && counterById.has(guide.linkedCounterId))))
          : false
        const nextSnapshot = { ...provisional, counterHistory, counterTimeLaps, ...(current.counterGuideAutoPanId && !autoPanGuideStillLinked ? { counterGuideAutoPanId: null } : {}) }
        snapshotRef.current = nextSnapshot
        setSnapshot(nextSnapshot)
        await saveViewerAndPageWorks(nextSnapshot, updatedWorks)
        if (updatedWorks.length) {
          const nextWorkRef = { ...workRef.current }
          updatedWorks.forEach((work) => { if (Object.hasOwn(nextWorkRef, work.pageNumber)) nextWorkRef[work.pageNumber] = work })
          workRef.current = nextWorkRef
          setPageWorks((currentWorks) => {
            const next = { ...currentWorks }
            updatedWorks.forEach((work) => { if (Object.hasOwn(next, work.pageNumber)) next[work.pageNumber] = work })
            return next
          })
        }
        const activeSessionId = timerClockRef.current?.sessionId
        if (lapAction && activeSessionId === lapAction.sessionId) lapBaselineRef.current = { sessionId: lapAction.sessionId, elapsedMs: lapAction.elapsedMs }
        if (undoneTimeLap && activeSessionId === undoneTimeLap.sessionId) {
          const previousLap = counterTimeLaps.filter((lap) => lap.sessionId === undoneTimeLap.sessionId).at(-1)
          lapBaselineRef.current = { sessionId: undoneTimeLap.sessionId, elapsedMs: previousLap?.elapsedMs ?? 0 }
        }
        setSuspendError((error) => error.startsWith('카운터') ? '' : error)
      } catch (error) {
        console.warn('[PDF] Counter state could not be saved.', error)
        if (lapAction || undoneTimeLap) {
          snapshotRef.current = current
          setSnapshot(current)
        }
        setSuspendError('카운터와 진행선을 저장하지 못했습니다. 저장 공간을 확인하고 다시 시도해 주세요.')
      }
    })
    counterActionQueueRef.current = operation.catch(() => {})
    return operation
  }

  function updateCounterPanel(nextCounters: CounterSnapshot[], label: string) {
    const current = snapshotRef.current
    if (!current) return
    if (label.startsWith('sound:')) {
      pushSnapshot({ ...current, counterSoundEnabled: label.slice(6) === 'true' }, true)
      return
    }
    if (label.startsWith('preview:')) {
      pushSnapshot({ ...current, counterPreviewEnabled: label.slice(8) === 'true' }, true)
      return
    }
    if (label.startsWith('collapse:')) {
      const [, kind, value] = label.split(':')
      if (kind === 'simple' || kind === 'pattern' || kind === 'task') pushSnapshot({ ...current, collapsedCounterKinds: { ...current.collapsedCounterKinds, [kind]: value === 'true' } }, true)
      return
    }
    if (label.startsWith('panel:')) {
      pushSnapshot({ ...current, counterPanelCollapsed: label.slice(6) === 'true' }, true)
      return
    }
    commitCounterTransaction(nextCounters, label, 0, undefined, true, undefined, undefined, undefined, counterGuideCorrection(current, nextCounters))
  }

  function counterGuideCorrection(current: ViewerSnapshot, nextCounters: CounterSnapshot[]): CounterGuideAction | undefined {
    const rowOf = (counter: CounterSnapshot) => counter.kind === 'simple' ? counter.value : counter.currentRow ?? 1
    const previous = new Map(normalizeCounterSnapshots(current.counters).map((counter) => [counter.id, counter]))
    const changedIds = new Set(nextCounters.flatMap((counter) => {
      const before = previous.get(counter.id)
      return before && rowOf(before) !== rowOf(counter) ? [counter.id] : []
    }))
    if (!changedIds.size) return undefined
    const pageNumber = current[current.activePane].page
    const guide = (workRef.current[pageNumber]?.horizontalGuides ?? []).find((item) => item.role === 'primary' && item.linkedCounterId && changedIds.has(item.linkedCounterId))
    return guide ? { kind: 'correct', pageNumber, guideId: guide.id } : undefined
  }

  function toggleProgressLines() {
    const current = snapshotRef.current
    if (!current) return
    const pageNumber = current[current.activePane].page
    const before = workRef.current[pageNumber]
    if (!before) return
    const settings = current.progressSettings ?? defaultProgressSettings
    const primary = before.horizontalGuides?.find((guide) => guide.role === 'primary')
    if (primary) {
      mutateSnapshot((snapshot) => ({ ...snapshot, progressSettings: { ...settings, horizontal: { ...settings.horizontal, visible: !settings.horizontal.visible } } }), true)
      return
    }

    const visibleRect = (() => {
      const overlay = document.querySelector<SVGSVGElement>('.pdf-pane.is-active .progress-line-overlay > svg')
      const scrollArea = overlay?.closest('.pdf-scroll-area')
      if (!overlay || !scrollArea) return null
      const pageRect = overlay.getBoundingClientRect()
      const scrollRect = scrollArea.getBoundingClientRect()
      const left = Math.max(pageRect.left, scrollRect.left)
      const right = Math.min(pageRect.right, scrollRect.right)
      const top = Math.max(pageRect.top, scrollRect.top)
      const bottom = Math.min(pageRect.bottom, scrollRect.bottom)
      if (right <= left || bottom <= top) return null
      return { x: ((left + right) / 2 - pageRect.left) / Math.max(1, pageRect.width), y: ((top + bottom) / 2 - pageRect.top) / Math.max(1, pageRect.height) }
    })()
    let next: PageWorkRecord
    if (before.progressMigration === 'pending') {
      const candidates = progressGuideCandidates(before)
      const preferred = candidates.find(({ axis, guide }) => axis === 'horizontal' && guide.linkedCounterId) ?? candidates.find(({ axis }) => axis === 'horizontal') ?? candidates[0]
      next = migrateProgressGuides(before, preferred ? preferred.axis + ':' + preferred.guide.id : '', [])
    } else {
      const guide = createDefaultPrimaryProgressGuide(clamp(visibleRect?.y ?? 0.5, 0, 1))
      next = { ...before, progressMigration: 'complete', horizontalGuides: [...(before.horizontalGuides ?? []), guide] }
    }
    setPageWork(next, true, true, before)
    if (!settings.horizontal.visible) mutateSnapshot((snapshot) => ({ ...snapshot, progressSettings: { ...settings, horizontal: { ...settings.horizontal, visible: true } } }), true)
  }

  function saveCounterSettings(nextCounters: CounterSnapshot[], changes: Partial<ViewerSnapshot>, label: string) {
    const current = snapshotRef.current
    if (!current) return
    commitCounterTransaction(nextCounters, label, 0, undefined, false, undefined, undefined, changes, counterGuideCorrection(current, nextCounters))
  }

  function updateCounterSnapshot(changes: Partial<ViewerSnapshot>) {
    const current = snapshotRef.current
    if (!current) return
    pushSnapshot({ ...current, ...changes }, true)
  }

  function acquireCounterActionLock() {
    if (counterActionLockRef.current) return false
    counterActionLockRef.current = true
    setCounterActionSaving(true)
    return true
  }

  function releaseCounterActionLock() {
    counterActionLockRef.current = false
    setCounterActionSaving(false)
  }

  function createCounterTimeLap(counterId: string, rowDelta: -1 | 1): CounterTimeLapAction {
    const clock = timerClockRef.current
    if (!clock && !fallbackTimerSessionIdRef.current) fallbackTimerSessionIdRef.current = crypto.randomUUID()
    const sessionId = clock?.sessionId ?? fallbackTimerSessionIdRef.current
    const elapsedMs = Math.max(0, Math.floor(clock?.elapsedNow() ?? 0))
    const baseline = lapBaselineRef.current?.sessionId === sessionId ? lapBaselineRef.current.elapsedMs : 0
    return { id: crypto.randomUUID(), counterId, sessionId, elapsedMs, durationMs: Math.max(0, elapsedMs - baseline), rowDelta, recordedAt: Date.now() }
  }

  function beginCounterRowEdit() {
    if (!mainCounter) return
    setCounterRowDraft(String(mainCounter.value))
    setCounterRowEditing(true)
  }

  function finishCounterRowEdit() {
    const current = snapshotRef.current
    const currentCounters = normalizeCounterSnapshots(current?.counters)
    const activeBase = currentCounters.filter((counter) => counter.kind === 'simple' && counter.unit === 'row' && !counter.linkedToId)
      .find((counter) => counter.id === current?.counterMainId) ?? currentCounters.find((counter) => counter.kind === 'simple' && counter.unit === 'row' && !counter.linkedToId)
    setCounterRowEditing(false)
    if (!activeBase) return
    const value = Number(counterRowDraft)
    if (!Number.isSafeInteger(value) || value < 1 || value > MAX_COUNTER_ROW) {
      setCounterRowDraft(String(activeBase.value))
      setSuspendError(t('1에서 9999 사이의 정수를 입력하세요.'))
      return
    }
    setCounterRowDraft(String(value))
    setCounterValue(activeBase.id, value)
  }

  function advanceCounterGroup(counterId: string) {
    const current = snapshotRef.current
    if (!current) return
    const currentCounters = normalizeCounterSnapshots(current.counters)
    const base = currentCounters.find((counter) => counter.id === counterId)
    if (!base || base.kind !== 'simple' || base.unit !== 'row' || base.linkedToId || base.goalCompleted || base.value >= MAX_COUNTER_ROW && base.goalRow !== base.value) return
    if (!acquireCounterActionLock()) return
    const lapAction = createCounterTimeLap(counterId, 1)
    const completingGoal = Boolean(base.goalRow && base.value === base.goalRow)
    const advanced = advanceLinkedCounters(currentCounters, counterId, base.value)
    const nextCounters = completingGoal
      ? advanced.map((counter) => counter.id === base.id ? { ...counter, value: base.value, goalCompleted: true } : counter)
      : advanced
    const activePage = current[current.activePane].page
    const activeWork = workRef.current[activePage]
    const activeRotation = current[current.activePane].rotations?.[activePage] ?? activeWork?.rotation ?? 0
    const linkedGuide = [...(activeWork?.horizontalGuides ?? []), ...(activeWork?.verticalGuides ?? [])].find((guide) => guide.id === current.counterGuideAutoPanId && guide.linkedCounterId)
    const linkedCounter = linkedGuide ? nextCounters.find((counter) => counter.id === linkedGuide.linkedCounterId) : undefined
    const linkedRow = linkedCounter?.kind === 'simple' ? linkedCounter.value : linkedCounter?.currentRow ?? 1
    const autoPanY = linkedGuide && linkedCounter ? guidePositionForRotation(linkedGuide, linkedRow, activeRotation) : undefined
    const primaryGuide = (activeWork?.horizontalGuides ?? []).find((guide) => guide.role === 'primary' && guide.linkedCounterId === base.id)
    const label = base.name + ' · ' + base.value + (completingGoal ? '단 목표 완료' : '단 완료')
    void commitCounterTransaction(nextCounters, label, base.value, undefined, true, autoPanY, base.id, undefined, primaryGuide ? { kind: 'advance', pageNumber: activePage, guideId: primaryGuide.id } : undefined, lapAction).finally(releaseCounterActionLock)
  }

  function setCounterValue(counterId: string, value: number) {
    const current = snapshotRef.current
    if (!current) return
    const currentCounters = normalizeCounterSnapshots(current.counters)
    const selected = currentCounters.find((counter) => counter.id === counterId)
    const bounded = Math.max(0, Math.min(MAX_COUNTER_ROW, Math.trunc(value)))
    const mainBase = currentCounters.filter((counter) => counter.kind === 'simple' && counter.unit === 'row' && !counter.linkedToId)
      .find((counter) => counter.id === current.counterMainId) ?? currentCounters.find((counter) => counter.kind === 'simple' && counter.unit === 'row' && !counter.linkedToId)
    const isMainRow = Boolean(selected && selected.id === mainBase?.id)
    const next = selected?.kind === 'simple' && selected.unit === 'row' && !selected.linkedToId && isMainRow
      ? currentCounters.map((counter) => counter.id === counterId ? { ...counter, value: Math.max(1, bounded) } : counter)
      : selected?.kind === 'simple' && selected.unit === 'row' && !selected.linkedToId
        ? setCounterGroupRow(currentCounters, counterId, Math.max(1, bounded))
      : currentCounters.map((counter) => counter.id !== counterId ? counter : counter.kind === 'simple'
        ? { ...counter, value: bounded }
        : counter.kind === 'pattern' ? { ...counter, currentRow: Math.max(1, bounded) }
        : { ...counter, value: bounded, completedCount: bounded })
    const editedRow = next.find((counter) => counter.id === counterId)
    const beforeRow = selected?.kind === 'simple' ? selected.value : selected?.currentRow
    const nextRow = editedRow?.kind === 'simple' ? editedRow.value : editedRow?.currentRow
    if (beforeRow === nextRow) return
    const edited = next.find((counter) => counter.id === counterId)
    if (!acquireCounterActionLock()) return
    void commitCounterTransaction(next, (edited?.name ?? '카운터') + ' 숫자 보정', edited?.kind === 'simple' ? edited.value : edited?.currentRow ?? 0, undefined, true, undefined, undefined, undefined, counterGuideCorrection(current, next)).finally(releaseCounterActionLock)
  }

  function undoCounterAction() {
    const current = snapshotRef.current
    const history = current?.counterHistory ?? []
    const latest = history.at(-1)
    if (!current || !latest || !acquireCounterActionLock()) return
    void commitCounterTransaction(latest.counters, latest.label + ' 되돌리기', latest.actualRow, latest.guides, false).finally(releaseCounterActionLock)
  }

  function rewindCounter(baseId: string, targetRow: number, recordLap = false) {
    const current = snapshotRef.current
    const counters = normalizeCounterSnapshots(current?.counters)
    const base = counters.find((counter) => counter.id === baseId)
    if (!current || !base || base.kind !== 'simple' || targetRow < 1 || targetRow >= base.value) return
    const checkpoint = findCounterRewindCheckpoint(current.counterHistory ?? [], counters, baseId, targetRow)
    if (!checkpoint) return
    const next = normalizeCounterSnapshots(restoreCounterGroup(counters, checkpoint.counters, baseId))
    const groupIds = new Set(checkpoint.counters.filter((counter) => counter.id === baseId || counter.linkedToId === baseId).map((counter) => counter.id))
    const restoreGuides = checkpoint.guides.map((item) => ({
      ...item,
      horizontalGuides: item.horizontalGuides.filter((guide) => guide.linkedCounterId && groupIds.has(guide.linkedCounterId)),
      verticalGuides: item.verticalGuides.filter((guide) => guide.linkedCounterId && groupIds.has(guide.linkedCounterId)),
    })).filter((item) => item.horizontalGuides.length || item.verticalGuides.length)
    if (!acquireCounterActionLock()) return
    const lapAction = recordLap ? createCounterTimeLap(baseId, -1) : undefined
    const operation = commitCounterTransaction(next, '단 되돌아가기', targetRow, restoreGuides, true, undefined, baseId, undefined, undefined, lapAction)
    void operation.finally(releaseCounterActionLock)
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

  function schedulePageWorksRender() {
    if (pageWorksFrameRef.current !== undefined) return
    pageWorksFrameRef.current = requestAnimationFrame(() => {
      pageWorksFrameRef.current = undefined
      setPageWorks(workRef.current)
    })
  }

  function setPageWork(work: PageWorkRecord, immediate: boolean, recordHistory = false, historyBefore?: PageWorkRecord, cellChanges?: ColorworkCellChange[]) {
    const current = workRef.current[work.pageNumber]
    if (!current) return
    touchPageWork(work.pageNumber)
    if (recordHistory) {
      const before = historyBefore ?? current
      const action: WorkAction = cellChanges?.length ? { cellChanges } : { before, after: work }
      const state = historyRef.current.get(work.pageNumber) ?? { actions: [], cursor: 0, byteCosts: [] }
      const actions = state.actions.slice(0, state.cursor)
      const byteCosts = state.byteCosts.slice(0, state.cursor)
      const actionBytes = estimateHistoryActionBytes(action)
      actions.push(action)
      byteCosts.push(actionBytes)
      while (actions.length > MAX_PAGE_HISTORY_ACTIONS) {
        actions.shift()
        byteCosts.shift()
      }
      updateHistory(work.pageNumber, { actions, cursor: actions.length, byteCosts })
    }
    workRef.current = { ...workRef.current, [work.pageNumber]: work }
    schedulePageWorksRender()
    void pageWorkPersistence.schedule(work, immediate).catch((error: unknown) => {
      console.warn('[PDF] Page work could not be saved.', error)
      setSuspendError(pageWorkSaveErrorMessage)
    })
  }

  function undoRedo(direction: 'undo' | 'redo') {
    const state = historyRef.current.get(activePage)
    if (!state) return
    const nextCursor = direction === 'undo' ? state.cursor - 1 : state.cursor + 1
    const action = state.actions[direction === 'undo' ? state.cursor - 1 : state.cursor]
    if (!action) return
    let nextWork: PageWorkRecord | undefined
    if (action.cellChanges) {
      const current = workRef.current[activePage]
      const grid = current?.colorworkGrid
      if (!current || !grid) return
      nextWork = {
        ...current,
        colorworkGrid: { ...grid, cells: applyColorworkCellChanges(grid.cells, action.cellChanges, direction) },
      }
    } else {
      nextWork = direction === 'undo' ? action.before : action.after
    }
    if (!nextWork) return
    updateHistory(activePage, { ...state, cursor: nextCursor })
    setPageWork(nextWork, true, false)
  }

  function selectThumbnail(page: number) {
    if (!snapshot || hiddenNumbers.has(page)) return
    if (reportMode) setSearchParams({})
    mutateSnapshot((current) => ({ ...current, activePane: current.activePane, [current.activePane]: { ...current[current.activePane], page } }), true)
  }

  function navigateVisiblePage(direction: -1 | 1) {
    const nextPage = visiblePageNumbers[activeVisiblePageIndex + direction]
    if (nextPage !== undefined) selectThumbnail(nextPage)
  }

  function updateThumbnailRange(gesture: ThumbnailTouchGesture) {
    const target = document.elementFromPoint(gesture.clientX, gesture.clientY)?.closest<HTMLElement>('.page-thumbnail[data-page-number]')
    const pageNumber = Number(target?.dataset.pageNumber)
    if (!Number.isInteger(pageNumber) || hiddenNumbers.has(pageNumber) || !pdf) return
    const visiblePages = Array.from({ length: pdf.numPages }, (_, index) => index + 1).filter((page) => !hiddenNumbers.has(page))
    const selectedPages = visiblePageRange(visiblePages, gesture.pageNumber, pageNumber)
    if (selectedPages.length) setThumbnailSelection({ pages: selectedPages, anchor: gesture.pageNumber, lastPage: pageNumber })
  }

  function findThumbnailTouchDropTarget(gesture: ThumbnailTouchGesture) {
    const target = document.elementFromPoint(gesture.clientX, gesture.clientY)
    const labelGroup = target?.closest<HTMLElement>('[data-thumbnail-label-drop]')
    if (labelGroup) {
      const groupId = labelGroup.dataset.thumbnailLabelDrop ?? ''
      const selected = gesture.pointerType === 'mouse'
        ? gesture.draggedPages
        : thumbnailSelection?.pages.includes(gesture.pageNumber) ? thumbnailSelection.pages : [gesture.pageNumber]
      return canDropPagesIntoThumbnailGroup(selected, groupId) ? { kind: 'label' as const, groupId, key: 'label-group:' + groupId } : undefined
    }
    const groupBadge = target?.closest<HTMLElement>('.hidden-thumbnail-run-button[data-group-id]')
    if (groupBadge) {
      const groupId = groupBadge.dataset.groupId ?? null
      return canDropThumbnailIntoGroup(gesture.pageNumber, groupId) ? { kind: 'hidden' as const, groupId, key: 'group:' + groupId } : undefined
    }
    const pageTarget = target?.closest<HTMLElement>('.page-thumbnail[data-page-number]')
    const targetPage = Number(pageTarget?.dataset.pageNumber)
    if (Number.isInteger(targetPage)) {
      const groupId = pageRecords.get(targetPage)?.hiddenGroupId ?? null
      if (!canDropThumbnailIntoGroup(gesture.pageNumber, groupId)) return undefined
      return { kind: 'hidden' as const, groupId, key: groupId ? 'group-page:' + groupId : 'outside-page:' + targetPage }
    }
    if (target && thumbnailRailRef.current?.contains(target) && canDropThumbnailIntoGroup(gesture.pageNumber, null)) {
      return { kind: 'hidden' as const, groupId: null, key: 'outside-rail' }
    }
    return undefined
  }

  function beginThumbnailMouseDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse' || event.button !== 0 || event.ctrlKey || event.shiftKey || pageVisibilitySaving) return
    if ((event.target as HTMLElement).closest('.thumbnail-hide-button, .page-thumbnail')) return
    suppressThumbnailClickRef.current = false
    thumbnailMouseDragRef.current = { pointerId: event.pointerId, startX: event.clientX, scrollLeft: event.currentTarget.scrollLeft, dragging: false }
  }

  function moveThumbnailMouseDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = thumbnailMouseDragRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    const delta = event.clientX - gesture.startX
    if (!gesture.dragging && Math.abs(delta) <= 8) return
    if (!gesture.dragging) {
      gesture.dragging = true
      event.currentTarget.setPointerCapture(event.pointerId)
      event.currentTarget.classList.add('dragging')
    }
    event.preventDefault()
    event.currentTarget.scrollLeft = gesture.scrollLeft - delta
  }

  function finishThumbnailMouseDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = thumbnailMouseDragRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    thumbnailMouseDragRef.current = null
    event.currentTarget.classList.remove('dragging')
    if (gesture.dragging) suppressThumbnailClickRef.current = true
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  function beginThumbnailTouch(pageNumber: number, event: ReactPointerEvent<HTMLButtonElement>) {
    if ((event.pointerType !== 'touch' && event.pointerType !== 'mouse') || event.button !== 0 || event.ctrlKey || event.shiftKey || hiddenNumbers.has(pageNumber) || pageVisibilitySaving || thumbnailGroupSaving || !thumbnailRailRef.current) return
    const selectedPages = selectedThumbnailSet.has(pageNumber) ? [...selectedThumbnailPages] : [pageNumber]
    const gesture: ThumbnailTouchGesture = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      pageNumber,
      draggedPages: selectedPages,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: thumbnailRailRef.current.scrollLeft,
      clientX: event.clientX,
      clientY: event.clientY,
      button: event.currentTarget,
      mode: 'pending',
      timer: 0,
    }
    thumbnailTouchGestureRef.current = gesture
    try { gesture.button.setPointerCapture(event.pointerId) } catch { /* The browser may have already canceled this pointer. */ }
    if (event.pointerType === 'mouse') return
    gesture.timer = window.setTimeout(() => {
      if (thumbnailTouchGestureRef.current !== gesture || gesture.mode !== 'pending') return
      gesture.mode = 'select'
      setThumbnailSelection((current) => current?.pages.includes(pageNumber) ? current : { pages: [pageNumber], anchor: pageNumber, lastPage: pageNumber })
    }, 450)
  }

  function moveThumbnailTouch(event: ReactPointerEvent<HTMLButtonElement>) {
    const gesture = thumbnailTouchGestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    gesture.clientX = event.clientX
    gesture.clientY = event.clientY
    const deltaX = event.clientX - gesture.startX
    const deltaY = event.clientY - gesture.startY
    const rail = thumbnailRailRef.current
    if (gesture.mode === 'pending' && Math.hypot(deltaX, deltaY) > 8) {
      window.clearTimeout(gesture.timer)
      gesture.mode = gesture.pointerType === 'mouse' || selectedThumbnailSet.has(gesture.pageNumber) ? 'drag' : 'scroll'
    }
    if (gesture.mode === 'scroll') {
      if (rail && Math.abs(deltaX) > Math.abs(deltaY)) {
        event.preventDefault()
        rail.scrollLeft = gesture.startScrollLeft - deltaX
      }
      return
    }
    if (gesture.mode === 'drag') event.preventDefault()
    if ((gesture.mode !== 'select' && gesture.mode !== 'drag') || !rail) return
    event.preventDefault()
    const dropTarget = findThumbnailTouchDropTarget(gesture)
    if (dropTarget) {
      gesture.dropTarget = dropTarget
      setThumbnailDropTarget(dropTarget.key)
      if (dropTarget.kind === 'label') {
        const list = thumbnailGroupListRef.current
        const bounds = list?.getBoundingClientRect()
        const direction = bounds ? gesture.clientX < bounds.left + 30 ? -1 : gesture.clientX > bounds.right - 30 ? 1 : 0 : 0
        if (!direction) {
          if (gesture.edgeTimer !== undefined) window.clearInterval(gesture.edgeTimer)
          gesture.edgeTimer = undefined
        } else if (gesture.edgeTimer === undefined && list) {
          gesture.edgeTimer = window.setInterval(() => {
            if (thumbnailTouchGestureRef.current !== gesture || (gesture.mode !== 'select' && gesture.mode !== 'drag')) return
            const currentBounds = list.getBoundingClientRect()
            const currentDirection = gesture.clientX < currentBounds.left + 30 ? -1 : gesture.clientX > currentBounds.right - 30 ? 1 : 0
            if (currentDirection) list.scrollLeft += currentDirection * 14
          }, 45)
        }
      }
      return
    }
    gesture.dropTarget = undefined
    setThumbnailDropTarget(null)
    if (gesture.mode === 'select') updateThumbnailRange(gesture)
    const bounds = rail.getBoundingClientRect()
    const direction = gesture.clientX < bounds.left + 36 ? -1 : gesture.clientX > bounds.right - 36 ? 1 : 0
    if (!direction) {
      if (gesture.edgeTimer !== undefined) window.clearInterval(gesture.edgeTimer)
      gesture.edgeTimer = undefined
    } else if (gesture.edgeTimer === undefined) {
      gesture.edgeTimer = window.setInterval(() => {
        if (thumbnailTouchGestureRef.current !== gesture || gesture.mode !== 'select') return
        const edgeDirection = gesture.clientX < bounds.left + 36 ? -1 : gesture.clientX > bounds.right - 36 ? 1 : 0
        if (!edgeDirection) return
        rail.scrollLeft += edgeDirection * 16
        updateThumbnailRange(gesture)
      }, 45)
    }
  }

  function finishThumbnailTouch(event: ReactPointerEvent<HTMLButtonElement>, canceled = false) {
    const gesture = thumbnailTouchGestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    window.clearTimeout(gesture.timer)
    if (gesture.edgeTimer !== undefined) window.clearInterval(gesture.edgeTimer)
    thumbnailTouchGestureRef.current = null
    if (!canceled && gesture.mode !== 'pending') {
      suppressThumbnailClickRef.current = true
      window.setTimeout(() => { suppressThumbnailClickRef.current = false }, 0)
      if (gesture.dropTarget?.kind === 'label') {
        const selectedPages = gesture.pointerType === 'mouse'
          ? gesture.draggedPages
          : thumbnailSelection?.pages.includes(gesture.pageNumber) ? thumbnailSelection.pages : [gesture.pageNumber]
        void movePagesToThumbnailGroupTarget(selectedPages, gesture.dropTarget.groupId)
      } else if (gesture.dropTarget?.kind === 'hidden') {
        void moveThumbnailToGroup(gesture.pageNumber, gesture.dropTarget.groupId)
      }
    }
    setThumbnailDropTarget(null)
    if (gesture.button.hasPointerCapture(event.pointerId)) gesture.button.releasePointerCapture(event.pointerId)
  }

  function toggleThumbnailAccordion() {
    if (!thumbnailCollapsed) {
      collapseExpandedThumbnailGroup()
      thumbnailScrollRef.current = thumbnailRailRef.current?.scrollLeft ?? thumbnailScrollRef.current
      window.clearTimeout(thumbnailScrollTimerRef.current)
      thumbnailScrollTimerRef.current = undefined
      setThumbnailRenderingPaused(false)
      const gesture = thumbnailTouchGestureRef.current
      if (gesture) {
        window.clearTimeout(gesture.timer)
        if (gesture.edgeTimer !== undefined) window.clearInterval(gesture.edgeTimer)
        thumbnailTouchGestureRef.current = null
        if (gesture.button.hasPointerCapture(gesture.pointerId)) gesture.button.releasePointerCapture(gesture.pointerId)
      }
    }
    setThumbnailCollapsed((current) => !current)
  }

  function handleThumbnailScroll(event: ReactUIEvent<HTMLDivElement>) {
    thumbnailScrollRef.current = event.currentTarget.scrollLeft
    if (!tabletResourcePolicy) return
    setThumbnailRenderingPaused(true)
    window.clearTimeout(thumbnailScrollTimerRef.current)
    thumbnailScrollTimerRef.current = window.setTimeout(() => {
      thumbnailScrollTimerRef.current = undefined
      setThumbnailRenderingPaused(false)
    }, 200)
  }

  function handleThumbnailSelect(pageNumber: number, event: ReactMouseEvent<HTMLButtonElement>) {
    if (suppressThumbnailClickRef.current) {
      suppressThumbnailClickRef.current = false
      event.preventDefault()
      return
    }
    if (pageVisibilitySaving || thumbnailGroupSaving) return
    setPageVisibilityError('')
    if (event.shiftKey) {
      event.preventDefault()
      setThumbnailSelection((current) => {
        const anchor = current?.anchor ?? snapshot?.[snapshot.activePane].page ?? pageNumber
        const visiblePages = Array.from({ length: pdf?.numPages ?? 0 }, (_, index) => index + 1).filter((page) => !hiddenNumbers.has(page))
        const range = visiblePageRange(visiblePages, anchor, pageNumber)
        const pages = Array.from(new Set([...(current?.pages ?? []), ...range]))
        return { pages, anchor, lastPage: pageNumber }
      })
      return
    }
    if (event.ctrlKey) {
      event.preventDefault()
      setThumbnailSelection((current) => {
        const selected = current?.pages ?? []
        if (selected.includes(pageNumber)) {
          const pages = selected.filter((page) => page !== pageNumber)
          return pages.length ? { pages, anchor: current?.anchor ?? pages[0], lastPage: pages.at(-1)! } : null
        }
        return { pages: [...selected, pageNumber], anchor: current?.anchor ?? pageNumber, lastPage: pageNumber }
      })
      return
    }
    setThumbnailSelection({ pages: [pageNumber], anchor: pageNumber, lastPage: pageNumber })
    void selectThumbnail(pageNumber)
  }

  async function hideSelectedThumbnails() {
    if (!thumbnailSelection || pageVisibilitySaving) return
    const selected = new Set(thumbnailSelection.pages)
    if (!canHidePageSelection(pdf?.numPages ?? 0, hiddenNumbers, selected)) return
    try {
      await applyPageVisibility(thumbnailSelection.pages, true)
      setThumbnailSelection(null)
    } catch (error) {
      setPageVisibilityError(error instanceof Error ? translateMessage(error.message) : t('페이지를 숨기지 못했습니다.'))
    }
  }

  async function toggleHiddenPageGroup(groupId: string, pageNumbers: number[], expanded: boolean) {
    if (pageVisibilitySaving) return
    try {
      await applyPageVisibility(pageNumbers, expanded, groupId)
      setThumbnailSelection(null)
    } catch (error) {
      setPageVisibilityError(error instanceof Error ? translateMessage(error.message) : t('숨김 그룹을 변경하지 못했습니다.'))
    }
  }

  async function toggleBookmark() {
    if (!snapshot) return
    await setPageFlag(id, activePage, 'bookmarked', !isBookmarked)
    setPages(await getPages(id))
  }

  async function applyPageVisibility(pageNumbers: number[], hidden: boolean, existingGroupId?: string) {
    if (pageVisibilityActionRef.current) throw new Error('페이지 변경을 처리 중입니다.')
    pageVisibilityActionRef.current = true
    setPageVisibilitySaving(true)
    setPageVisibilityError('')
    try {
      if (!pdf || !snapshotRef.current) throw new Error('PDF 페이지 상태를 불러오지 못했습니다.')
      const requested = [...new Set(pageNumbers)]
      if (requested.some((pageNumber) => !Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pdf.numPages)) {
        throw new Error('선택한 페이지를 확인하지 못했습니다.')
      }
      if (!requested.length) return

      const requestedPages = new Set(requested)
      const hiddenAfter = new Set(pages.filter((page) => page.hidden).map((page) => page.pageNumber))
      for (const pageNumber of requested) {
        if (hidden) hiddenAfter.add(pageNumber)
        else hiddenAfter.delete(pageNumber)
      }
      if (pdf.numPages - hiddenAfter.size < 1) throw new Error('최소 한 페이지는 표시 상태로 남아야 합니다.')

      const hiddenGroupId = hidden ? existingGroupId ?? createHiddenPageGroupId() : existingGroupId
      const nextPages = completePageList(id, pdf.numPages, pages).map((page) => requestedPages.has(page.pageNumber)
        ? updatePageHiddenState(page, hidden, hiddenGroupId)
        : page)
      await setPagesHiddenState(id, requested, hidden, hiddenGroupId)
      setThumbnailPagesExcluded(pdf, requested, hidden)
      updatePdfRecognitionPageVisibility(id, requested, hidden)
      setPages(nextPages)
      if (!hidden && pdf && recognitionRecordRef.current) enqueuePdfRecognition(recognitionRecordRef.current, pdf, true)
      if (hidden) {
        setThumbnailSelection((current) => {
          if (!current) return null
          const remaining = current.pages.filter((pageNumber) => !requestedPages.has(pageNumber))
          if (!remaining.length) return null
          return {
            pages: remaining,
            anchor: remaining.includes(current.anchor) ? current.anchor : remaining[0],
            lastPage: remaining.includes(current.lastPage) ? current.lastPage : remaining.at(-1)!,
          }
        })
        const actualHidden = new Set(nextPages.filter((page) => page.hidden).map((page) => page.pageNumber))
        const relocatePane = (pane: PaneSnapshot) => {
          if (!actualHidden.has(pane.page)) return pane
          const nextPage = nextVisiblePageAfterHide(pane.page, pdf.numPages, actualHidden)
          return nextPage === null ? pane : { ...pane, page: nextPage }
        }
        mutateSnapshot((current) => ({ ...current, primary: relocatePane(current.primary), secondary: relocatePane(current.secondary) }), true)
      }
    } finally {
      pageVisibilityActionRef.current = false
      setPageVisibilitySaving(false)
    }
  }

  function toggleSplit() {
    if (!snapshot) return
    mutateSnapshot((current) => ({
      ...current,
      split: !current.split,
      splitInitialized: true,
      wideRatio: !current.split && !current.splitInitialized ? 0.5 : current.wideRatio,
      tallRatio: !current.split && !current.splitInitialized ? 0.5 : current.tallRatio,
      secondary: current.split || current.splitInitialized ? current.secondary : { ...current.secondary, page: current.primary.page, zoom: current.primary.zoom, centerX: current.primary.centerX, centerY: current.primary.centerY, rotations: { ...current.primary.rotations } },
    }), true)
  }

  function beginDivider(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!snapshot || !areaRef.current) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { pointerId: event.pointerId, orientation, rect: areaRef.current.getBoundingClientRect() }
    setSplitPreview(ratio)
  }

  function beginTimerBarDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const shell = viewerShellRef.current
    const bar = event.currentTarget.closest<HTMLElement>('.viewer-timer-bar')
    if (!shell || !bar) return
    event.preventDefault()
    const shellRect = shell.getBoundingClientRect()
    const barRect = bar.getBoundingClientRect()
    const left = clamp(barRect.left - shellRect.left, 0, Math.max(0, shellRect.width - barRect.width))
    const top = clamp(barRect.top - shellRect.top, 0, Math.max(0, shellRect.height - barRect.height))
    setTimerBarState({ documentId: id, left, top })
    timerBarDragRef.current = { pointerId: event.pointerId, offsetX: event.clientX - barRect.left, offsetY: event.clientY - barRect.top }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveTimerBarDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = timerBarDragRef.current
    const shell = viewerShellRef.current
    const bar = event.currentTarget.closest<HTMLElement>('.viewer-timer-bar')
    if (!drag || drag.pointerId !== event.pointerId || !shell || !bar) return
    const shellRect = shell.getBoundingClientRect()
    setTimerBarState({
      documentId: id,
      left: clamp(event.clientX - shellRect.left - drag.offsetX, 0, Math.max(0, shellRect.width - bar.offsetWidth)),
      top: clamp(event.clientY - shellRect.top - drag.offsetY, 0, Math.max(0, shellRect.height - bar.offsetHeight)),
    })
  }

  function finishTimerBarDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (timerBarDragRef.current?.pointerId === event.pointerId) timerBarDragRef.current = null
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
    saveTimer.current = window.setTimeout(() => void saveViewerWithNotice(next).catch(() => {}), 350)
  }

  function changeAnnotationStyle(toolId: 'pen' | 'line' | 'highlight' | 'text', change: Partial<AnnotationStyle>) {
    mutateSnapshot((current) => {
      const existing = current.annotationSettings ?? defaultAnnotationSettings
      return { ...current, annotationSettings: { ...existing, [toolId]: { ...existing[toolId], ...change } } }
    }, true)
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
    const style = tool === 'region-highlight' ? annotationSettings.highlight : tool === 'pen' || tool === 'line' || tool === 'highlight' || tool === 'text' ? annotationSettings[tool] : annotationSettings.pen
    return <PdfPage
      key={paneId + ':' + pane.page}
      pdf={pdf!}
      page={pane.page}
      paneId={paneId}
      pane={pane}
      splitView={Boolean(snapshot?.split)}
      rotation={rotation}
      active={active}
      tool={tool}
      lineSettings={progressSettings}
      counters={counters}
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
      onColorworkRequestHandled={finishColorworkRequest}
      onTextToolConsumed={() => setTool('pan')}
      onRegionHighlightToolConsumed={() => setTool('pan')}
      pageLinks={pdfLinksByPage[pane.page]}
      qrLinks={qrLinksByPage[pane.page]}
      onPageRendered={onPageRendered}
    />
  }

  const displayedRatio = splitPreview ?? ratio
  const pageRecords = pages.reduce((map, page) => map.set(page.pageNumber, page), new Map<number, PageRecord>())

  function canDropThumbnailIntoGroup(sourcePageNumber: number | null, targetGroupId: string | null) {
    const source = sourcePageNumber === null ? undefined : pageRecords.get(sourcePageNumber)
    const sourceGroupId = source?.hiddenGroupId ?? null
    return Boolean(source && sourceGroupId !== targetGroupId && (sourceGroupId || targetGroupId))
  }

  function canDropPagesIntoThumbnailGroup(pageNumbers: number[], targetGroupId: string) {
    const targetExists = thumbnailGroups.some((group) => group.id === targetGroupId)
    return targetExists && pageNumbers.some((pageNumber) => thumbnailGroups.some((group) => group.id !== targetGroupId && group.pageNumbers.includes(pageNumber)) || !thumbnailGroups.some((group) => group.pageNumbers.includes(pageNumber)))
  }

  async function saveThumbnailGroups(nextGroups: ThumbnailGroup[]) {
    if (thumbnailGroupSavingRef.current) return false
    const current = snapshotRef.current
    if (!current) return false
    thumbnailGroupSavingRef.current = true
    setThumbnailGroupSaving(true)
    setThumbnailGroupError('')
    if (saveTimer.current !== undefined) window.clearTimeout(saveTimer.current)
    saveTimer.current = undefined
    const optimistic = { ...current, thumbnailGroups: nextGroups }
    snapshotRef.current = optimistic
    setSnapshot(optimistic)
    try {
      await saveViewer(optimistic)
      setSuspendError((message) => message === viewerSaveErrorMessage ? '' : message)
      return true
    } catch (error) {
      const latest = snapshotRef.current ?? optimistic
      const rollback = { ...latest, thumbnailGroups: current.thumbnailGroups }
      snapshotRef.current = rollback
      setSnapshot(rollback)
      try { await saveViewer(rollback) } catch { /* Keep the visible rollback and report the storage failure. */ }
      console.warn('[PDF] Thumbnail groups could not be saved.', error)
      setThumbnailGroupError(t('그룹을 저장하지 못했습니다. 저장 공간을 확인해 주세요.'))
      return false
    } finally {
      thumbnailGroupSavingRef.current = false
      setThumbnailGroupSaving(false)
    }
  }

  async function createThumbnailGroup(event?: ReactFormEvent<HTMLFormElement>) {
    event?.preventDefault()
    const name = thumbnailGroupDraft.trim()
    if (!name) {
      setThumbnailGroupError(t('그룹 이름은 비워 둘 수 없습니다.'))
      return
    }
    if (name.length > 100) return
    const nextGroups = [...thumbnailGroups, { id: createThumbnailGroupId(), name, pageNumbers: [] }]
    if (await saveThumbnailGroups(nextGroups)) {
      setThumbnailGroupDialog(false)
      setThumbnailGroupDraft('')
      setThumbnailGroupError('')
    }
  }

  async function renameThumbnailGroup(groupId: string, name: string) {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setThumbnailGroupError(t('그룹 이름은 비워 둘 수 없습니다.'))
      return false
    }
    if (trimmedName.length > 100) return false
    const nextGroups = thumbnailGroups.map((group) => group.id === groupId ? { ...group, name: trimmedName } : group)
    const saved = await saveThumbnailGroups(nextGroups)
    if (saved) setThumbnailGroupPopover(null)
    return saved
  }

  async function ungroupThumbnailGroup(groupId: string) {
    const nextGroups = thumbnailGroups.filter((group) => group.id !== groupId)
    if (await saveThumbnailGroups(nextGroups)) {
      if (expandedThumbnailGroupId === groupId && pdf) {
        const group = thumbnailGroups.find((item) => item.id === groupId)
        if (group) setThumbnailPagesExcluded(pdf, group.pageNumbers, true)
      }
      setThumbnailGroupPopover(null)
      setThumbnailGroupState((state) => ({ ...state, expandedGroupId: state.expandedGroupId === groupId ? null : state.expandedGroupId }))
    }
  }

  async function movePagesToThumbnailGroupTarget(pageNumbers: number[], targetGroupId: string) {
    const movablePages = [...new Set(pageNumbers)].filter((pageNumber) => pageNumber >= 1 && pageNumber <= (pdf?.numPages ?? 0))
    if (!movablePages.length || !canDropPagesIntoThumbnailGroup(movablePages, targetGroupId) || thumbnailGroupSavingRef.current) return
    const nextGroups = movePagesToThumbnailGroup(thumbnailGroups, movablePages, targetGroupId)
    suppressThumbnailClickRef.current = true
    window.setTimeout(() => { suppressThumbnailClickRef.current = false }, 0)
    if (await saveThumbnailGroups(nextGroups)) {
      if (expandedThumbnailGroupId && expandedThumbnailGroupId !== targetGroupId && pdf) {
        const collapsedGroup = thumbnailGroups.find((group) => group.id === expandedThumbnailGroupId)
        if (collapsedGroup) setThumbnailPagesExcluded(pdf, collapsedGroup.pageNumbers, true)
      }
      setThumbnailSelection(null)
      setThumbnailGroupError('')
      setThumbnailGroupState((state) => ({ ...state, expandedGroupId: targetGroupId }))
    }
  }

  function openThumbnailGroupPopover(groupId: string, event: ReactMouseEvent<HTMLButtonElement>) {
    if (suppressThumbnailClickRef.current) {
      suppressThumbnailClickRef.current = false
      event.preventDefault()
      event.stopPropagation()
      return
    }
    const group = thumbnailGroups.find((item) => item.id === groupId)
    if (!group) return
    if (thumbnailGroupPopover?.groupId === groupId) {
      setThumbnailGroupPopover(null)
      return
    }
    const bounds = event.currentTarget.getBoundingClientRect()
    setThumbnailGroupDraft(group.name)
    setThumbnailGroupPopover({ documentId: id, groupId, left: clamp(bounds.left, 8, Math.max(8, window.innerWidth - 280)), top: clamp(bounds.bottom + 6, 8, Math.max(8, window.innerHeight - 190)) })
  }

  function toggleThumbnailLabelGroup(groupId: string) {
    if (thumbnailGroupSaving) return
    const nextExpandedGroupId = expandedThumbnailGroupId === groupId ? null : groupId
    if (expandedThumbnailGroupId && expandedThumbnailGroupId !== nextExpandedGroupId) {
      const collapsedGroup = thumbnailGroups.find((group) => group.id === expandedThumbnailGroupId)
      if (collapsedGroup && pdf) setThumbnailPagesExcluded(pdf, collapsedGroup.pageNumbers, true)
    }
    setThumbnailGroupState((state) => ({ ...state, expandedGroupId: nextExpandedGroupId }))
  }

  function collapseExpandedThumbnailGroup() {
    if (!expandedThumbnailGroupId) return
    const group = thumbnailGroups.find((item) => item.id === expandedThumbnailGroupId)
    if (group && pdf) setThumbnailPagesExcluded(pdf, group.pageNumbers, true)
    setThumbnailGroupState((state) => ({ ...state, expandedGroupId: null }))
  }

  function startThumbnailDrag(pageNumber: number, event: ReactDragEvent<HTMLButtonElement>) {
    if (pageVisibilitySaving || thumbnailGroupSaving || !pageRecords.has(pageNumber)) {
      event.preventDefault()
      return
    }
    draggedThumbnailPageRef.current = pageNumber
    draggedThumbnailPagesRef.current = selectedThumbnailSet.has(pageNumber) ? [...selectedThumbnailPages] : [pageNumber]
    event.dataTransfer.setData('application/x-doanbogo-page', String(pageNumber))
    event.dataTransfer.setData('application/x-doanbogo-pages', JSON.stringify(draggedThumbnailPagesRef.current))
    event.dataTransfer.setData('text/plain', String(pageNumber))
    event.dataTransfer.effectAllowed = 'move'
    setThumbnailDropTarget(null)
  }

  function finishThumbnailDrag() {
    draggedThumbnailPageRef.current = null
    draggedThumbnailPagesRef.current = []
    setThumbnailDropTarget(null)
  }

  function thumbnailDragOverLabelGroup(groupId: string, event: ReactDragEvent<HTMLButtonElement>) {
    if (!canDropPagesIntoThumbnailGroup(draggedThumbnailPagesRef.current, groupId)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setThumbnailDropTarget('label-group:' + groupId)
    const list = thumbnailGroupListRef.current
    if (list) {
      const bounds = list.getBoundingClientRect()
      if (event.clientX < bounds.left + 28) list.scrollLeft -= 12
      else if (event.clientX > bounds.right - 28) list.scrollLeft += 12
    }
  }

  function dropThumbnailIntoLabelGroup(groupId: string, event: ReactDragEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    setThumbnailDropTarget(null)
    void movePagesToThumbnailGroupTarget(draggedThumbnailPagesRef.current, groupId)
  }

  function thumbnailDragOverGroup(groupId: string, event: ReactDragEvent<HTMLButtonElement>) {
    if (!canDropThumbnailIntoGroup(draggedThumbnailPageRef.current, groupId)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setThumbnailDropTarget('group:' + groupId)
  }

  function thumbnailDragOverPage(pageNumber: number, event: ReactDragEvent<HTMLButtonElement>) {
    const targetGroupId = pageRecords.get(pageNumber)?.hiddenGroupId ?? null
    if (!canDropThumbnailIntoGroup(draggedThumbnailPageRef.current, targetGroupId)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setThumbnailDropTarget((targetGroupId ? 'group-page:' + targetGroupId : 'outside-page:' + pageNumber))
  }

  function thumbnailDragOverRail(event: ReactDragEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('.page-thumbnail, .hidden-thumbnail-run-button, .thumbnail-hide-button, .report-thumbnail')) return
    if (!canDropThumbnailIntoGroup(draggedThumbnailPageRef.current, null)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setThumbnailDropTarget('outside-rail')
  }

  async function moveThumbnailToGroup(pageNumber: number, targetGroupId: string | null) {
    const source = pageNumber === null ? undefined : pageRecords.get(pageNumber)
    if (pageNumber === null || !source || pageVisibilitySaving || !canDropThumbnailIntoGroup(pageNumber, targetGroupId)) return
    const targetGroupExpanded = Boolean(targetGroupId && pages.some((page) => page.hiddenGroupId === targetGroupId && !page.hidden))
    suppressThumbnailClickRef.current = true
    window.setTimeout(() => { suppressThumbnailClickRef.current = false }, 0)
    try {
      await applyPageVisibility([pageNumber], Boolean(targetGroupId) && !targetGroupExpanded, targetGroupId ?? undefined)
      setThumbnailSelection(null)
    } catch (error) {
      setPageVisibilityError(error instanceof Error ? translateMessage(error.message) : t('숨김 그룹을 변경하지 못했습니다.'))
    }
  }

  function moveDraggedThumbnail(targetGroupId: string | null) {
    const pageNumber = draggedThumbnailPageRef.current
    if (pageNumber !== null) void moveThumbnailToGroup(pageNumber, targetGroupId)
  }

  function dropThumbnailIntoGroup(groupId: string, event: ReactDragEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    setThumbnailDropTarget(null)
    void moveDraggedThumbnail(groupId)
  }

  function dropThumbnailOnPage(pageNumber: number, event: ReactDragEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    setThumbnailDropTarget(null)
    void moveDraggedThumbnail(pageRecords.get(pageNumber)?.hiddenGroupId ?? null)
  }

  function dropThumbnailOutsideGroup(event: ReactDragEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('.page-thumbnail, .hidden-thumbnail-run-button, .thumbnail-hide-button, .report-thumbnail')) return
    event.preventDefault()
    event.stopPropagation()
    setThumbnailDropTarget(null)
    void moveDraggedThumbnail(null)
  }

  function renderPageThumbnail(pageNumber: number, nested = false) {
    const state = pageRecords.get(pageNumber)
    const active = snapshot![snapshot!.activePane].page === pageNumber
    const selected = selectedThumbnailSet.has(pageNumber)
    return <div className={'page-thumbnail-entry' + (nested ? ' thumbnail-group-child-entry' : '')} key={pageNumber}>
      <PdfThumbnail
        pdf={pdf!} pageNumber={pageNumber} active={active} hidden={false} bookmarked={Boolean(state?.bookmarked)} selected={selected} draggable={false}
        title={state?.hiddenGroupId ? t('그룹에서 꺼내려면 바깥 썸네일이나 빈 곳으로 드래그하세요.') : undefined}
        dropTarget={thumbnailDropTarget === (state?.hiddenGroupId ? 'group-page:' + state.hiddenGroupId : 'outside-page:' + pageNumber) ? (state?.hiddenGroupId ? 'group' : 'outside') : undefined}
        disabled={pageVisibilitySaving || thumbnailGroupSaving} root={thumbnailRailRef}
        onSelect={(event) => handleThumbnailSelect(pageNumber, event)}
        onDragStart={(event) => startThumbnailDrag(pageNumber, event)}
        onDragEnd={finishThumbnailDrag}
        onDragOver={(event) => thumbnailDragOverPage(pageNumber, event)}
        onDrop={(event) => dropThumbnailOnPage(pageNumber, event)}
        onPointerDown={(event) => beginThumbnailTouch(pageNumber, event)}
        onPointerMove={moveThumbnailTouch}
        onPointerUp={finishThumbnailTouch}
        onPointerCancel={(event) => finishThumbnailTouch(event, true)}
        onLostPointerCapture={(event) => finishThumbnailTouch(event, true)}
      />
      {selected && thumbnailSelection?.lastPage === pageNumber && <button
        type="button"
        className="thumbnail-hide-button"
        aria-label={'선택한 ' + selectedThumbnailPages.length + '개 페이지 숨김'}
        title={hideSelectionWouldRemoveLastPage ? t('최소 한 페이지는 표시 상태로 남아야 합니다.') : t('선택한 페이지 숨김')}
        disabled={pageVisibilitySaving || thumbnailGroupSaving || hideSelectionWouldRemoveLastPage}
        onClick={() => void hideSelectedThumbnails()}
      ><EyeOff size={13} /><span>{pageVisibilitySaving ? t('저장 중') : t('숨김')}</span></button>}
    </div>
  }

  function renderThumbnailItem(item: PageThumbnailItem, nested = false): ReactNode {
    if (item.type === 'page') return renderPageThumbnail(item.pageNumber, nested)
    if (item.type === 'hidden-group') {
      const fullGroupPages = pages.filter((page) => page.hiddenGroupId === item.groupId).map((page) => page.pageNumber)
      const togglePages = fullGroupPages.length ? fullGroupPages : item.pageNumbers
      return <Fragment key={'hidden-' + item.groupId + '-' + item.firstPage}>
        <div className="page-thumbnail-entry hidden-group-toggle-entry thumbnail-group-child-entry">
          <button
            type="button"
            className={'hidden-thumbnail-run-button' + (thumbnailDropTarget === 'group:' + item.groupId ? ' drop-target-group' : '')}
            data-group-id={item.groupId}
            aria-label={item.pageNumbers.join(', ') + '페이지 ' + (item.expanded ? t('숨김') : t('복구'))}
            aria-expanded={item.expanded}
            title={item.pageNumbers.length + '개 페이지 ' + (item.expanded ? t('숨김') : t('복구')) + ' · ' + t('이 그룹에 페이지를 추가하려면 여기로 드래그하세요.')}
            disabled={pageVisibilitySaving}
            onClick={() => void toggleHiddenPageGroup(item.groupId, togglePages, item.expanded)}
            onDragOver={(event) => thumbnailDragOverGroup(item.groupId, event)}
            onDrop={(event) => dropThumbnailIntoGroup(item.groupId, event)}
          ><span className="hidden-thumbnail-group-pill" aria-hidden="true"><span>•••</span>{item.expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}</span></button>
        </div>
        {item.expanded && item.pageNumbers.map((pageNumber) => renderPageThumbnail(pageNumber, true))}
      </Fragment>
    }

    return <Fragment key={'label-' + item.groupId}>
      <div className="page-thumbnail-entry thumbnail-label-group-entry">
        <button
          type="button"
          className="thumbnail-label-group-name"
          data-thumbnail-group-settings={item.groupId}
          aria-label={t('그룹 설정: {name}', { name: item.name })}
          title={item.name}
          onClick={(event) => openThumbnailGroupPopover(item.groupId, event)}
        >{thumbnailGroupLabel(item.name)}</button>
        <button
          type="button"
          className={'thumbnail-label-group-card' + (item.expanded ? ' expanded' : '') + (thumbnailDropTarget === 'label-group:' + item.groupId ? ' drop-target' : '')}
          data-thumbnail-label-drop={item.groupId}
          aria-label={t('그룹 {name}, 페이지 {count}개', { name: item.name, count: item.pageNumbers.length })}
          aria-expanded={item.expanded}
          title={t('그룹 {name}, 페이지 {count}개', { name: item.name, count: item.pageNumbers.length })}
          disabled={thumbnailGroupSaving}
          onClick={() => toggleThumbnailLabelGroup(item.groupId)}
          onDragOver={(event) => thumbnailDragOverLabelGroup(item.groupId, event)}
          onDrop={(event) => dropThumbnailIntoLabelGroup(item.groupId, event)}
        >
          <span className="thumbnail-label-group-image"><Files size={21} /><small>{t('{count}개 페이지', { count: item.pageNumbers.length })}</small></span>
        </button>
      </div>
      {item.expanded && <div className="thumbnail-group-children" role="group" aria-label={t('그룹 {name}의 페이지', { name: item.name })}>
        {item.children.map((child) => renderThumbnailItem(child, true))}
      </div>}
    </Fragment>
  }

  const timerPortalTarget = loadError?.id === id || suspended || loading || loadedId !== id || !pdf || !snapshot ? null : timerPortalHost
  const timerElement = <DocumentWorkTimer key={id + ':' + timerSessionKey} documentId={id} portalTarget={timerPortalTarget} onTotalWorkTimeChange={onTimerTotalChange} onUnsavedChange={onTimerUnsavedChange} onSavingChange={onTimerSavingChange} onClockChange={onTimerClockChange} />
  const requestReportExit = () => {
    if (timerSaving) return
    if (timerHasUnsaved) {
      setExitPromptTarget('report')
      setExitPromptOpen(true)
      return
    }
    setSearchParams({ report: '1' })
  }
  if (loadError?.id === id) return <>{timerElement}<main className="viewer-state"><div className="viewer-error-icon"><X size={22} /></div><h1>{documentKind === 'photos' ? t('사진 폴더를 열지 못했습니다') : t('PDF를 열지 못했습니다')}</h1><p>{loadError.message}</p><button className="primary-button" onClick={requestPdfResume}>{t("다시 시도")}</button><button className="secondary-button" disabled={timerSaving} onClick={requestViewerExit}>{t("도안 목록으로")}</button></main></>
  if (suspended || loading || loadedId !== id) return <>{timerElement}<BrandLoading kind="pdf" requestId={'pdf:' + id + ':' + pdfOpenCycle} layout="screen" messageOverride={suspendError ? translateMessage(suspendError) : undefined} /></>
  if (!pdf || !snapshot) return timerElement

  return (
    <>
    {timerElement}
    <main ref={viewerShellRef} className={'viewer-shell' + (reportMode ? ' report-mode' : '') + (thumbnailCollapsed ? ' thumbnail-collapsed' : '') + (selectedThumbnailPages.length > 0 || pageVisibilityError || thumbnailGroupError ? ' thumbnail-feedback-visible' : '') + (counterPanelVisible && !reportMode ? ' counter-panel-visible' : '')}>
      {suspendError && <div className="viewer-save-warning" role="alert"><span>{translateMessage(suspendError)}</span><button type="button" aria-label={t("저장 알림 닫기")} onClick={() => setSuspendError('')}><X size={14} /></button></div>}
      {showZoomHint && !reportMode && <aside className="viewer-zoom-hint" role="status"><span>{t("마우스 휠로 확대 · 이동 도구에서 드래그로 이동")}</span><button type="button" aria-label={t("확대·이동 안내 닫기")} onClick={() => setShowZoomHint(false)}><X size={15} /></button></aside>}
      <header className="viewer-header">
        <div className="viewer-brand"><img src={yyLogo} alt={t("도안보고 로고")} /><small>{t("YY공동제작")}</small></div>
        <button className="viewer-back" aria-label={t("도안 목록으로")} disabled={timerSaving} onClick={requestViewerExit}><ArrowLeft size={20} /><span>{t("내 도안")}</span></button>
        <div className="viewer-title"><div className="viewer-title-name"><strong title={displayDocumentName}>{displayDocumentName}</strong><button type="button" className="viewer-title-edit" aria-label={t("이름 변경")} title={t("이름 변경")} onClick={() => { setRenameDraft(displayDocumentName); setRenameError(''); setRenameDialog(true) }}><Pencil size={14} /></button></div>{reportMode && <span>{t('뜨개보고서')}</span>}</div>
        <div className="viewer-header-actions">
          {!reportMode && <>
            <div className="viewer-header-history" role="group" aria-label={t('실행 취소') + ' / ' + t('다시 실행')}>
              <button type="button" className="viewer-action viewer-header-icon-action" aria-label={t('실행 취소')} title={t('실행 취소')} disabled={!canUndo} onClick={() => undoRedo('undo')}><Undo2 size={18} /></button>
              <button type="button" className="viewer-action viewer-header-icon-action" aria-label={t('다시 실행')} title={t('다시 실행')} disabled={!canRedo} onClick={() => undoRedo('redo')}><Redo2 size={18} /></button>
            </div>
            <button className={'viewer-action ' + (snapshot.split ? 'selected' : '')} onClick={toggleSplit}><Columns2 size={18} /><span>{snapshot.split ? t('한 영역 보기') : t('두 영역 보기')}</span></button>
          </>}
          {reportMode && <button className="viewer-action" onClick={() => setSearchParams({})}><ArrowLeft size={16} /><span>{t("도안으로 돌아가기")}</span></button>}
        </div>
      </header>
      <section className={'pdf-work-area' + (reportMode ? ' report-work-area' : '')}>
        <div className={'pdf-document-area ' + (reportMode ? '' : snapshot.split ? (orientation === 'wide' ? 'split-wide' : 'split-tall') : 'single-pane')} ref={areaRef}>
        {reportMode ? <KnittingReport documentId={id} fileName={documentName} pageCount={pdf.numPages} totalWorkTimeMs={documentWorkTimeMs} onBack={() => setSearchParams({})} /> : snapshot.split ? <>
          <div className="split-section" style={orientation === 'wide' ? { flex: '0 0 ' + splitBasis(displayedRatio) } : { width: '100%', flex: '0 0 ' + splitBasis(displayedRatio) }}>{renderPane('primary', snapshot.primary, snapshot.activePane === 'primary')}</div>
          <button className={'split-divider ' + orientation} aria-label={t("영역 크기 조정")} onPointerDown={beginDivider} onPointerMove={moveDivider} onPointerUp={finishDivider} onPointerCancel={finishDivider} onLostPointerCapture={finishDivider}><span /></button>
          <div className="split-section split-section-secondary" style={orientation === 'wide' ? { flex: '0 0 ' + splitBasis(1 - displayedRatio) } : { width: '100%', flex: '0 0 ' + splitBasis(1 - displayedRatio) }}>{renderPane('secondary', snapshot.secondary, snapshot.activePane === 'secondary')}</div>
        </> : renderPane(snapshot.activePane, snapshot[snapshot.activePane], true)}
        </div>
        {!reportMode && counterPanelVisible && <CounterPanel snapshot={snapshot} counters={counters} onChange={updateCounterPanel} onUndo={undoCounterAction} onRewind={rewindCounter} onCounterValue={setCounterValue} onSettingsSave={saveCounterSettings} onSnapshotUpdate={updateCounterSnapshot} onClose={() => setSavedCounterSession({ documentId: id, visible: false })} />}
      </section>
      <section className={'viewer-footer' + (thumbnailCollapsed ? ' thumbnail-collapsed' : '')}>
        <div id={thumbnailContentId} className="thumbnail-content" hidden={thumbnailCollapsed}>
        {!thumbnailCollapsed && <>
        <div className="thumbnail-group-section">
          <button type="button" className="thumbnail-group-add" disabled={thumbnailGroupSaving} onClick={() => { setThumbnailGroupDraft(''); setThumbnailGroupError(''); setThumbnailGroupDialog(true) }}><Plus size={15} /><span>{t('그룹 추가')}</span></button>
          <div className="thumbnail-group-list" ref={thumbnailGroupListRef} aria-label={t('썸네일 그룹')}>
            {thumbnailGroups.map((group) => <button
              type="button"
              key={group.id}
              className={'thumbnail-group-label' + (thumbnailDropTarget === 'label-group:' + group.id ? ' drop-target' : '') + (expandedThumbnailGroupId === group.id ? ' expanded' : '')}
              data-thumbnail-group-settings={group.id}
              data-thumbnail-label-drop={group.id}
              aria-label={t('그룹 설정: {name}, 페이지 {count}개', { name: group.name, count: group.pageNumbers.length })}
              aria-expanded={expandedThumbnailGroupId === group.id}
              title={group.name + ' · ' + t('{count}개 페이지', { count: group.pageNumbers.length })}
              disabled={thumbnailGroupSaving}
              onClick={(event) => openThumbnailGroupPopover(group.id, event)}
              onDragOver={(event) => thumbnailDragOverLabelGroup(group.id, event)}
              onDrop={(event) => dropThumbnailIntoLabelGroup(group.id, event)}
            ><span>{thumbnailGroupLabel(group.name)}</span><small>{group.pageNumbers.length}</small></button>)}
          </div>
        </div>
        <div className={'page-thumbnail-strip' + (thumbnailDropTarget === 'outside-rail' ? ' drop-target-outside' : '')} aria-label={t("모든 페이지 썸네일")} ref={thumbnailRailRef} onScroll={handleThumbnailScroll} onDragOver={thumbnailDragOverRail} onDrop={dropThumbnailOutsideGroup} onDragLeave={(event) => { const nextTarget = event.relatedTarget; if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return; setThumbnailDropTarget(null) }}
          onClick={(event) => {
            if (!expandedThumbnailGroupId) return
            if ((event.target as HTMLElement).closest('.page-thumbnail, .hidden-thumbnail-run-button, .thumbnail-hide-button, .report-thumbnail, [data-thumbnail-label-drop], [data-thumbnail-group-settings]')) return
            collapseExpandedThumbnailGroup()
          }}
          onWheel={(event) => {
            if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return
            const rail = event.currentTarget
            const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rail.clientWidth : 1)
            rail.scrollLeft += delta
          }}
          onPointerDown={beginThumbnailMouseDrag} onPointerMove={moveThumbnailMouseDrag}
          onPointerUp={finishThumbnailMouseDrag} onPointerCancel={finishThumbnailMouseDrag} onLostPointerCapture={finishThumbnailMouseDrag}
          onDragStart={(event) => { if (!(event.target as HTMLElement).closest('.page-thumbnail[draggable="true"]')) event.preventDefault() }}
          onClickCapture={(event) => {
            if (!suppressThumbnailClickRef.current) return
            suppressThumbnailClickRef.current = false
            event.preventDefault()
            event.stopPropagation()
          }}
        >
          {compactPageThumbnails(pdf.numPages, pages, thumbnailGroups, expandedThumbnailGroupId).map((item) => renderThumbnailItem(item))}
          <button className={'report-thumbnail' + (reportMode ? ' active' : '')} aria-label={t("뜨개보고서 열기")} aria-current={reportMode ? 'page' : undefined} disabled={timerSaving} onClick={requestReportExit}>
            <span className="report-thumbnail-icon">+<i>7</i></span><strong>{t("뜨개보고서")}</strong><small>{t("보고서 보기")}</small>
          </button>
        </div>
        {(selectedThumbnailPages.length > 0 || pageVisibilityError || thumbnailGroupError) && <div className="thumbnail-selection-feedback">
          {selectedThumbnailPages.length > 0 && <span>{selectedThumbnailPages.length}{t("개 페이지 선택")}</span>}
          {hideSelectionWouldRemoveLastPage && <span role="status">{t("최소 한 페이지는 표시 상태로 남아야 합니다.")}</span>}
          {pageVisibilityError && <span role="alert">{translateMessage(pageVisibilityError)}</span>}
          {thumbnailGroupError && <span role="alert">{thumbnailGroupError}</span>}
        </div>}
        </>}
        </div>
        {!reportMode && <div className="viewer-footer-controls">
          <div className="viewer-footer-primary-controls">
          <div className="viewer-footer-zoom-controls" role="group" aria-label={t('축소') + ' / ' + t('확대')}>
            <button type="button" className="viewer-page-control-button" aria-label={t("축소")} title={t("25% 축소")} disabled={activeZoom <= 1} onClick={() => changePane(snapshot.activePane, (pane) => ({ ...pane, zoom: Math.max(1, Math.round((pane.zoom - 0.25) * 100) / 100) }), true)}><Minus size={17} /></button>
            <span className="viewer-footer-zoom" aria-label={Math.round(activeZoom * 100) + '%'}>{Math.round(activeZoom * 100)}%</span>
            <button type="button" className="viewer-page-control-button" aria-label={t("확대")} title={t("25% 확대")} disabled={activeZoom >= 5} onClick={() => changePane(snapshot.activePane, (pane) => ({ ...pane, zoom: Math.min(5, Math.round((pane.zoom + 0.25) * 100) / 100) }), true)}><Plus size={17} /></button>
            <button type="button" className="viewer-page-control-button" aria-label={t("화면 맞춤")} title={t("100% 확대와 페이지 중앙으로 맞춤")} onClick={() => changePane(snapshot.activePane, (pane) => ({ ...pane, zoom: 1, centerX: 0.5, centerY: 0.5 }), true)}><Maximize2 size={16} /></button>
          </div>
          <button type="button" className="viewer-page-control-button" aria-label={t('시계 방향 90도 회전')} title={t('90도 회전 · 현재 {angle}도', { angle: activeRotation })} disabled={!pageWorks[activePage]} onClick={() => rotatePage(snapshot.activePane, activePage)}><RotateCwSquare size={17} /></button>
          <button
            type="button"
            className="thumbnail-accordion-button"
            aria-expanded={!thumbnailCollapsed}
            aria-controls={thumbnailContentId}
            aria-label={thumbnailCollapsed ? t('썸네일 펼치기') : t('썸네일 접기')}
            title={thumbnailCollapsed ? t('썸네일 펼치기') : t('썸네일 접기')}
            onClick={toggleThumbnailAccordion}
          >
            {thumbnailCollapsed ? <ChevronDown size={17} /> : <ChevronUp size={17} />}
          </button>
          <button type="button" className={'viewer-page-control-button viewer-footer-bookmark' + (isBookmarked ? ' selected' : '')} aria-label={isBookmarked ? t('북마크 해제') : t('북마크')} title={isBookmarked ? t('북마크 해제') : t('북마크')} aria-pressed={isBookmarked} onClick={() => void toggleBookmark()}><Bookmark size={17} fill={isBookmarked ? 'currentColor' : 'none'} /></button>
          </div>
          <div className="viewer-footer-page-navigation" role="group" aria-label={t('페이지')}>
            <button type="button" className="viewer-page-control-button" aria-label={t('이전')} title={t('이전')} disabled={activeVisiblePageIndex <= 0} onClick={() => navigateVisiblePage(-1)}><ChevronLeft size={18} /></button>
            <span className="viewer-footer-page-count" aria-label={t('페이지') + ' ' + activePage + ' / ' + pdf.numPages} title={t('페이지') + ' ' + activePage + ' / ' + pdf.numPages}>{formatNumber(activePage)} / {formatNumber(pdf.numPages)}</span>
            <button type="button" className="viewer-page-control-button" aria-label={t('다음')} title={t('다음')} disabled={activeVisiblePageIndex < 0 || activeVisiblePageIndex >= visiblePageNumbers.length - 1} onClick={() => navigateVisiblePage(1)}><ChevronRight size={18} /></button>
          </div>
        </div>}
      </section>
      <div className="viewer-floating-layer">
        <div className={'viewer-floating-bar viewer-timer-bar' + (timerBarPosition.left === null ? '' : ' positioned')} style={timerBarPosition.left === null ? undefined : { left: timerBarPosition.left, top: timerBarPosition.top, right: 'auto' }} role="group" aria-label={t('작업 타이머')}>
          <button type="button" className="viewer-floating-drag-handle" aria-label={t('작업 타이머 이동')} title={t('작업 타이머 이동')} onPointerDown={beginTimerBarDrag} onPointerMove={moveTimerBarDrag} onPointerUp={finishTimerBarDrag} onPointerCancel={finishTimerBarDrag} onLostPointerCapture={finishTimerBarDrag}><GripVertical size={17} /></button>
          <div className="viewer-timer-portal-host" ref={setTimerPortalHost} />
        </div>
        {!reportMode && <div className={'viewer-floating-bar viewer-mini-bar' + (miniBarOpen ? ' expanded' : '')}>
          <button ref={miniBarAccordionButtonRef} type="button" className="viewer-mini-accordion-button" aria-label={t('뷰어 도구')} title={t('뷰어 도구')} aria-expanded={miniBarOpen} aria-controls={miniBarControlsId} onClick={() => { const open = !miniBarOpen; setMiniBarState({ documentId: id, open }); if (!open) setMiniBarSettingsOpen(false) }}>
            <Grid3X3 size={17} /><span aria-hidden="true">{miniBarOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
          </button>
          <div id={miniBarControlsId} className="viewer-mini-scroll" hidden={!miniBarOpen}>
        <section className="viewer-controlbar" role="toolbar" aria-orientation="vertical" aria-label={t('뷰어 도구')}>
          <div className="viewer-controlbar-main">
            <div className="viewer-tools" role="group" aria-label={t('필기 도구')}>
              <button type="button" className={'viewer-tool tool-toggle ' + (tool === 'pan' ? 'active' : '')} aria-label={t('이동 도구')} title={t('이동')} aria-pressed={tool === 'pan'} onClick={() => setTool('pan')}><MousePointer2 size={17} /><span>{t('이동')}</span></button>
              <button type="button" className={'viewer-tool tool-toggle ' + (tool === 'pen' ? 'active' : '')} aria-label={t('펜')} title={t('펜')} aria-pressed={tool === 'pen'} onClick={() => setTool('pen')}><Pencil size={17} /><span>{t('펜')}</span></button>
              <button type="button" className={'viewer-tool tool-toggle ' + (tool === 'line' ? 'active' : '')} aria-label={t('직선')} title={t('직선')} aria-pressed={tool === 'line'} onClick={() => setTool('line')}><Minus size={17} /><span>{t('직선')}</span></button>
              <button type="button" className={'viewer-tool tool-toggle ' + (tool === 'highlight' ? 'active' : '')} aria-label={t('형광펜')} title={t('형광펜')} aria-pressed={tool === 'highlight'} onClick={() => setTool('highlight')}><Highlighter size={17} /><span>{t('형광펜')}</span></button>
              <button type="button" className={'viewer-tool tool-toggle region-highlight-tool ' + (tool === 'region-highlight' ? 'active' : '')} aria-label={t('구간 강조')} title={t('구간 강조')} aria-pressed={tool === 'region-highlight'} onClick={() => { setMiniBarSettingsOpen(false); setTool('region-highlight') }}><Square size={17} /><span>{t('구간 강조')}</span></button>
              <button type="button" className={'viewer-tool tool-toggle ' + (tool === 'eraser' ? 'active' : '')} aria-label={t('지우개')} title={t('지우개')} aria-pressed={tool === 'eraser'} onClick={() => setTool('eraser')}><Eraser size={17} /><span>{t('지우개')}</span></button>
              <button type="button" className={'viewer-tool tool-toggle ' + (tool === 'text' ? 'active' : '')} aria-label={t('텍스트')} title={t('텍스트')} aria-pressed={tool === 'text'} onClick={() => setTool('text')}><Type size={17} /><span>{t('텍스트')}</span></button>
              <button type="button" className="viewer-tool chart-tool" aria-label={t('컬러워크 설정')} title={t('차트 크기와 뜨개 게이지 설정')} disabled={!pageWorks[activePage] || Boolean(colorworkRequest)} onClick={() => setColorworkDialog(true)}><Grid3X3 size={17} /><span>{t('컬러워크')}</span>{activeColorworkGrid && <small>{activeColorworkGrid.columns}×{activeColorworkGrid.rows}</small>}</button>
              {activeColorworkGrid && <>
                <button type="button" className="viewer-tool compact-tool" aria-label={activeColorworkGrid.visible ? t('컬러워크 숨기기') : t('컬러워크 보이기')} title={activeColorworkGrid.visible ? t('컬러워크 숨기기') : t('컬러워크 보이기')} aria-pressed={activeColorworkGrid.visible} onClick={toggleColorworkVisibility}>{activeColorworkGrid.visible ? <Eye size={16} /> : <EyeOff size={16} />}</button>
                <button type="button" className={'viewer-tool compact-tool ' + (colorworkEraser ? 'active' : '')} aria-label={colorworkEraser ? t('컬러워크 지우개 끄기') : t('컬러워크 지우개')} title={colorworkEraser ? t('지우개 끄기') : t('색칠한 칸 지우기')} aria-pressed={colorworkEraser} onClick={() => setColorworkEraser((current) => !current)}><Eraser size={16} /></button>
              </>}
              {!activeColorworkGrid?.visible && <>
                <span className="control-separator" aria-hidden="true" />
                <button type="button" className="viewer-tool progress-toggle-tool" aria-label={!activeWork.horizontalGuides?.some((guide) => guide.role === 'primary') ? t('진행선 시작') : progressSettings.horizontal.visible ? t('진행선 숨기기') : t('진행선 표시')} title={!activeWork.horizontalGuides?.some((guide) => guide.role === 'primary') ? t('진행선 시작') : progressSettings.horizontal.visible ? t('진행선 숨기기') : t('진행선 표시')} aria-pressed={Boolean(activeWork.horizontalGuides?.some((guide) => guide.role === 'primary')) && progressSettings.horizontal.visible} disabled={!pageWorks[activePage]} onClick={toggleProgressLines}>{progressSettings.horizontal.visible ? <ScanLine size={17} /> : <EyeClosed size={17} />}<span>{t('진행선')}</span></button>
              </>}
              {(activeAnnotationStyle || activeColorworkGrid) && <button ref={miniBarSettingsTriggerRef} type="button" className={'viewer-tool compact-tool ' + (miniBarSettingsOpen ? 'active' : '')} aria-label={t('도구 설정')} title={t('도구 설정')} aria-expanded={miniBarSettingsOpen} onClick={() => setMiniBarSettingsOpen((open) => !open)}><Settings2 size={17} /></button>}
            </div>
          </div>
          <span className="control-separator" aria-hidden="true" />
          <div className="viewer-counter-tools" role="group" aria-label={t('카운터')}>
            <button type="button" className="viewer-mini-counter-step" aria-label={t('이전 단으로 되돌리기')} title={mainCounterCanStepBack ? t('이전 단으로 되돌리기') : t('정확한 복원 이력이 없습니다')} disabled={!mainCounterCanStepBack || counterActionSaving} onClick={() => { if (mainCounter && mainCounter.value > 1) rewindCounter(mainCounter.id, mainCounter.value - 1, true) }}>−</button>
            {mainCounter && (counterRowEditing
              ? <input ref={counterRowInputRef} className="viewer-mini-counter-row-input" aria-label={t('단 번호 입력')} type="number" inputMode="numeric" min="1" max={MAX_COUNTER_ROW} step="1" autoFocus disabled={counterActionSaving} value={counterRowDraft} onChange={(event) => setCounterRowDraft(event.currentTarget.value)} onBlur={() => { if (skipCounterRowBlurRef.current) { skipCounterRowBlurRef.current = false; return } finishCounterRowEdit() }} onKeyDown={(event) => {
                if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() }
                if (event.key === 'Escape') { event.preventDefault(); skipCounterRowBlurRef.current = true; setCounterRowDraft(String(mainCounter.value)); setCounterRowEditing(false); event.currentTarget.blur() }
              }} />
              : <button type="button" className="viewer-mini-counter-row" aria-label={t('현재 단 입력')} title={t('현재 단 입력')} disabled={counterActionSaving} onClick={beginCounterRowEdit}><strong>{formatNumber(mainCounter.value)}</strong><span>{t('단')}</span><small>{counterSideForRow(mainCounter, mainCounter.value).toUpperCase()}</small></button>)}
            <button type="button" className="viewer-mini-counter-step" aria-label={t('현재 단 완료 후 다음 단으로 이동')} disabled={!mainCounter || counterActionSaving || mainCounter.goalCompleted === true || mainCounter.value >= MAX_COUNTER_ROW && mainCounter.goalRow !== mainCounter.value} onClick={() => { if (mainCounter) advanceCounterGroup(mainCounter.id) }}>+</button>
            <button type="button" className={'viewer-mini-lap-toggle' + (counterPanelVisible ? ' active' : '')} aria-label={counterAlertPending ? t('카운터 · 확인할 알림 있음') : t('타임랩')} title={t('타임랩')} aria-pressed={counterPanelVisible} onClick={() => setSavedCounterSession({ documentId: id, visible: !counterPanelVisible })}><Tally5 size={16} /><span>{t('타임랩')}</span>{counterAlertPending && <i className="counter-notification-dot" aria-hidden="true" />}</button>
          </div>
        </section>
          </div>
          {miniBarSettingsOpen && <div className="viewer-mini-settings-panel" ref={miniBarSettingsPanelRef} role="group" aria-label={t('도구 설정')}>
            {activeAnnotationStyle && <section className="viewer-mini-settings-section">
              <strong>{t('필기 스타일')}</strong>
              <ColorPresetButtons label={t('필기 색상')} className="annotation-color-presets" value={activeAnnotationStyle.color} onChange={(color) => changeAnnotationStyle(tool as 'pen' | 'line' | 'highlight' | 'text', { color })} />
              {tool !== 'text' && <label><span>{t('굵기')}</span><input aria-label={t('필기 굵기')} type="range" min="1" max="24" value={activeAnnotationStyle.thickness} onChange={(event) => changeAnnotationStyle(tool as 'pen' | 'line' | 'highlight', { thickness: Number(event.currentTarget.value) })} /></label>}
              {tool !== 'text' && <label><span>{t('투명도')}</span><input aria-label={t('필기 투명도')} type="range" min="10" max="100" value={Math.round(activeAnnotationStyle.opacity * 100)} onChange={(event) => changeAnnotationStyle(tool as 'pen' | 'line' | 'highlight', { opacity: Number(event.currentTarget.value) / 100 })} /></label>}
              {tool === 'text' && <label><span>{t('글자 크기')}</span><input aria-label={t('글자 크기')} type="range" min="10" max="48" value={activeAnnotationStyle.fontSize} onChange={(event) => changeAnnotationStyle('text', { fontSize: Number(event.currentTarget.value) })} /></label>}
            </section>}
            {activeColorworkGrid && <section className="viewer-mini-settings-section">
              <strong>{t('컬러워크 색칠 도구')}</strong>
              <label><span>{t('색상')}</span><input aria-label={t('컬러워크 색상')} type="color" value={colorworkBrushColor} onClick={() => { if (colorworkEraser) setColorworkEraser(false) }} onChange={(event) => setColorworkBrushColor(event.currentTarget.value)} /></label>
              <label><span>{t('투명도')}</span><input aria-label={t('컬러워크 투명도')} type="range" min="0" max="100" value={Math.round(colorworkBrushOpacity * 100)} disabled={colorworkEraser} onChange={(event) => setColorworkBrushOpacity(Number(event.currentTarget.value) / 100)} /></label>
            </section>}
          </div>}
        </div>}
      </div>
      {thumbnailGroupPopover?.documentId === id && createPortal(<form
        ref={thumbnailGroupPopoverRef}
        className="thumbnail-group-settings-popover"
        style={{ left: thumbnailGroupPopover.left + 'px', top: thumbnailGroupPopover.top + 'px' }}
        role="dialog"
        aria-label={t('그룹 설정')}
        onSubmit={(event) => { event.preventDefault(); void renameThumbnailGroup(thumbnailGroupPopover.groupId, thumbnailGroupDraft) }}
      >
        <label>{t('그룹 이름')}<input autoFocus maxLength={100} value={thumbnailGroupDraft} onChange={(event) => setThumbnailGroupDraft(event.currentTarget.value)} /></label>
        <div className="thumbnail-group-popover-actions">
          <button type="button" className="thumbnail-group-ungroup" disabled={thumbnailGroupSaving} onClick={() => void ungroupThumbnailGroup(thumbnailGroupPopover.groupId)}>{t('그룹 해제')}</button>
          <button type="submit" className="primary-button" disabled={thumbnailGroupSaving || !thumbnailGroupDraft.trim()}>{t('저장')}</button>
        </div>
        {thumbnailGroupError && <span role="alert">{thumbnailGroupError}</span>}
      </form>, document.body)}
      {thumbnailGroupDialog && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setThumbnailGroupDialog(false) }}>
        <form className="modal-card thumbnail-group-dialog" role="dialog" aria-modal="true" aria-label={t('그룹 추가')} onSubmit={(event) => void createThumbnailGroup(event)}>
          <div className="modal-heading"><h2>{t('그룹 추가')}</h2><button type="button" className="icon-button" aria-label={t('닫기')} onClick={() => setThumbnailGroupDialog(false)}><X size={19} /></button></div>
          <div className="modal-form">
            <label htmlFor="thumbnail-group-name">{t('그룹 이름')}</label>
            <input id="thumbnail-group-name" autoFocus maxLength={100} value={thumbnailGroupDraft} onChange={(event) => setThumbnailGroupDraft(event.currentTarget.value)} placeholder={t('그룹 이름 입력')} />
            {thumbnailGroupError && <p className="thumbnail-group-error" role="alert">{thumbnailGroupError}</p>}
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setThumbnailGroupDialog(false)}>{t('취소')}</button><button type="submit" className="primary-button" disabled={thumbnailGroupSaving}>{t('확인')}</button></div>
          </div>
        </form>
      </div>}
      {exitPromptOpen && <div className="modal-backdrop" role="presentation"><section className="modal-card" role="alertdialog" aria-modal="true" aria-labelledby="timer-exit-title" aria-describedby="timer-exit-message"><div className="modal-heading"><h2 id="timer-exit-title">{t('저장되지 않은 작업시간')}</h2></div><p id="timer-exit-message" className="timer-exit-message">{t('일시정지를 누르지 않아 마지막 저장 이후 측정한 시간은 누적 작업시간에 저장되지 않습니다.')}</p><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setExitPromptOpen(false)}>{t('계속 작업')}</button><button type="button" className="primary-button" onClick={() => { setExitPromptOpen(false); if (exitPromptTarget === 'report') { setTimerHasUnsaved(false); setTimerSessionKey((key) => key + 1); setSearchParams({ report: '1' }) } else navigate('/') }}>{t('나가기')}</button></div></section></div>}
      {renameDialog && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRenameDialog(false) }}><section className="modal-card" role="dialog" aria-modal="true" aria-label={t("이름 변경")}><div className="modal-heading"><h2>{documentKind === 'photos' ? t('사진 폴더 이름 변경') : t('PDF 이름 변경')}</h2><button className="icon-button" aria-label={t("닫기")} onClick={() => setRenameDialog(false)}><X size={20} /></button></div><form className="modal-form" onSubmit={(event) => void saveDocumentName(event)}><label htmlFor="viewer-pdf-name">{documentKind === 'photos' ? t('폴더 이름') : t('PDF 이름')}</label><input id="viewer-pdf-name" autoFocus required maxLength={120} value={renameDraft} onChange={(event) => setRenameDraft(event.currentTarget.value)} />{renameError && <p className="rename-error" role="alert">{renameError}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setRenameDialog(false)}>{t("취소")}</button><button className="primary-button" type="submit"><Check size={17} />{t("저장")}</button></div></form></section></div>}
      {colorworkDialog && <ColorworkSettingsDialog
        key={snapshot.activePane + ':' + activePage}
        initial={activeColorworkGrid ?? defaultColorworkSettings}
        onClose={() => setColorworkDialog(false)}
        onApply={applyColorworkSettings}
      />}
    </main>
    </>
  )
}
