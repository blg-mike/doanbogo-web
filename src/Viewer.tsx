import { formatNumber, t, translateMessage } from './locales/index'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent as ReactDragEvent, type FormEvent as ReactFormEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type UIEvent as ReactUIEvent } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Bell, Bookmark, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Columns2, Copy, Eraser, Eye, EyeClosed, EyeOff, Files, Focus, Grid3X3, GripVertical, Highlighter, Maximize2, Minus, Minimize2, MoreHorizontal, MoveDiagonal, MousePointer2, Pencil, Plus, Redo2, RefreshCw, ScanLine, Settings2, Square, Trash2, Type, Undo2, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import BrandLoading from './BrandLoading'
import yyLogo from './assets/yy-logo.png'
import viewerToolsIcon from './assets/viewer-tools-icon.png'
import { cancelThumbnailRenders, PdfPage, PdfThumbnail, setThumbnailRenderingPaused, waitForThumbnailQueueIdle } from './PdfPage'
import { getDocument, getPageRecognition, getPageWork, getPageWorks, getPages, getPreference, getViewer, markOpened, renameDocument, savePageWork, savePreference, saveViewer, saveViewerAndPageWorks, setPageFlag } from './storage'
import { pdfPageRenderQueue } from './pdfPageRenderQueue'
import { openPdf, pdfErrorMessage } from './pdf'
import { openPhotoDocument } from './photoDocument'
import KnittingReport from './KnittingReport'
import type { AnnotationSettings, AnnotationStyle, AnnotationTool, ColorworkCreateRequest, ColorworkSettings, CounterHistoryEntry, CounterSnapshot, CounterTimerLinkMode, DocumentRecord, DocumentWorkTimeDay, PageRecord, PageRotation, PageWorkRecord, PaneId, PaneSnapshot, ProgressGuide, ProgressSettings, ThumbnailGroup, ThumbnailRailOrderItem, ViewerSnapshot } from './types'
import { defaultColorworkSettings, getColorworkDimensions, resizeColorworkGrid } from './colorwork'
import { MAX_COUNTERS_PER_TYPE, MAX_COUNTER_HISTORY, MAX_COUNTER_ROW, advanceLinkedCounters, counterAlertState, counterSideForRow, createCounter, duplicateCounterSnapshot, findCounterRewindCheckpoint, maxCountersForType, nextPatternAlertRow, normalizeCounterSnapshots, progressGuideForCounter, reanchorProgressGuideForCounter, repeatCounterProgress, repeatCounterStepBlock, restoreCounterGroup, setCounterGroupRow, stepAuxiliaryCounter, stepRepeatCounter } from './smartCounter'
import { CounterStepButton } from './CounterStepButton'
import CounterPanel from './CounterPanel'
import { repeatCounterBlockLabel, translateCounterAlert } from './counterAlertText'
import DocumentWorkTimer, { type DocumentTimerClock, type DocumentWorkTimeTotals } from './DocumentWorkTimer'
import { isCounterTimerLinkMode, resolveCounterTimerAction, type CounterTimerChoice } from './timerCounterLink'
import type { PdfQrLink } from './qr'
import { orderVisibleRecognitionPages, withRecentPdfLinks } from './pdfRecognitionState'
import { applyColorworkCellChanges, type ColorworkCellChange } from './colorworkHistory'
import { PageWorkPersistence } from './pageWorkPersistence'
import { cancelPdfRecognitionExceptPages, cancelPdfRecognitionPages, pausePdfRecognitionForReport, releasePdfRecognitionViewer, requestPdfPageRecognition, resumePdfRecognitionFromReport, subscribePdfRecognition } from './pdfRecognition'
import { getViewerResourcePolicy, setThumbnailPagesExcluded } from './pdfRenderResources'
import { guidePositionForRotation, isChartAutoFollowRotationCompatible } from './focusGeometry'
import { compactPageThumbnails, completePageList, createThumbnailGroupFromPages, createThumbnailGroupId, movePagesToThumbnailGroup, moveThumbnailRailItem, normalizeThumbnailRailOrder, reconcileThumbnailRailOrder, removePagesFromThumbnailGroups, reorderThumbnailGroups, thumbnailPagesForDrag, thumbnailRailOrderKey, visiblePageRange, type PageThumbnailItem } from './pageManagement'
import { ensurePrimaryProgressGuide, prepareProgressGuidesForDirectInteraction } from './progressLines'
import { ColorPresetButtons } from './ColorPresetButtons'
import { ANNOTATION_COLOR_PRESETS, DEFAULT_VERTICAL_GUIDE_COLOR } from './designTokens'
import { addedLimitedAnnotations, applyLimitedAnnotationAdditions, exceededAnnotationLimit, isAnnotationLimitReached, PAGE_ANNOTATION_LIMITS, type LimitedAnnotationKind } from './annotationLimits'
import { useDismissiblePopover } from './useDismissiblePopover'
import { getRequiredPageWorkPages, loadPageWorkWithTimeout, PageWorkLoadTimeoutError } from './pageWorkLoading'
import { normalizeWorkTimeDays } from './workTime'
import { nearestZoomLevel, stepZoomLevel, ZOOM_LEVELS } from './viewerInteraction'
import { getDefaultViewerPopupSize, getViewerPopupSize, getViewerPopupSizeClass, readViewerPopupAvailableBounds, viewerPopupDragMoved, type ViewerPopupRect } from './viewerPopupResize'
import { readViewerToolSize, saveViewerToolSize, type ViewerToolSize } from './viewerToolSizes'
import { useViewerPopupResize } from './useViewerPopupResize'
import { useTouchTablet } from './useTouchTablet'
import { useViewerPopupDrag } from './useViewerPopupDrag'
import { createViewerToolPosition, getViewerToolPosition, readViewerToolPosition, saveViewerToolPosition, type ViewerToolPosition } from './viewerToolPositions'

type Size = { width: number; height: number }
type WorkAction = { before?: PageWorkRecord; after?: PageWorkRecord; cellChanges?: ColorworkCellChange[] }
type PageHistory = { actions: WorkAction[]; cursor: number; byteCosts: number[] }
type PageWorkLoadUiEntry = { requestId: number; status: 'loading' } | { requestId: number; status: 'error'; message: string }
type PageWorkLoadRequest = { requestId: number; promise: Promise<PageWorkRecord | null> }
const MAX_CACHED_PAGE_WORKS = getViewerResourcePolicy().cachedPageWorks
const MAX_PAGE_HISTORY_ACTIONS = 30
const MAX_PAGE_HISTORY_BYTES = getViewerResourcePolicy().tablet ? 8 * 1024 * 1024 : 32 * 1024 * 1024
const colorworkEnabled = false
const EMPTY_THUMBNAIL_GROUPS: ThumbnailGroup[] = []
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
  dragPreview?: HTMLDivElement
  dropTarget?: { kind: 'outside'; key: string } | { kind: 'label'; groupId: string; key: string }
  timer: number
  frameId?: number
}
type ThumbnailReorderTarget = { kind: 'labels' | 'rail'; itemKey: string; position: 'before' | 'after' }
type ThumbnailReorderGesture = {
  kind: 'labels' | 'rail'
  pointerId: number
  pointerType: 'mouse' | 'touch'
  sourceKey: string
  startX: number
  startY: number
  startScrollLeft: number
  clientX: number
  clientY: number
  button: HTMLButtonElement
  sourceElement: HTMLElement
  scrollElement: HTMLDivElement
  mode: 'pending' | 'scroll' | 'drag' | 'cancel'
  timer: number
  frameId?: number
  preview?: HTMLDivElement
  target?: ThumbnailReorderTarget
}
type CounterGuideAction = { kind: 'advance' | 'correct'; pageNumber: number; guideId: string }
type TimerBarDrag = { pointerId: number; offsetX: number; offsetY: number; startX: number; startY: number; bar: HTMLElement; shell: HTMLElement; clientX: number; clientY: number; frameId: number | null }
type TimerBarPress = { pointerId: number; startX: number; startY: number; bar: HTMLElement; shell: HTMLElement; timerId: number; active: boolean; cleanup: () => void }
function createCounterSession(documentId: string) { return { documentId, visible: false } }

const defaultProgressSettings: ProgressSettings = {
  horizontal: { visible: true, color: ANNOTATION_COLOR_PRESETS[0].color, thickness: 4, opacity: 0.8 },
  vertical: { visible: true, color: DEFAULT_VERTICAL_GUIDE_COLOR, thickness: 1, opacity: 1 },
}

const defaultAnnotationSettings: AnnotationSettings = {
  pen: { color: ANNOTATION_COLOR_PRESETS[9].color, thickness: 2, opacity: 1, fontSize: 16 },
  line: { color: ANNOTATION_COLOR_PRESETS[9].color, thickness: 2, opacity: 1, fontSize: 16 },
  highlight: { color: ANNOTATION_COLOR_PRESETS[3].color, thickness: 16, opacity: 0.3, fontSize: 16 },
  text: { color: ANNOTATION_COLOR_PRESETS[9].color, thickness: 2, opacity: 1, fontSize: 18 },
}
const annotationToolLabelKeys: Record<LimitedAnnotationKind, '펜' | '형광펜' | '텍스트' | '구간 강조'> = {
  pen: '펜',
  highlight: '형광펜',
  text: '텍스트',
  'region-highlight': '구간 강조',
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

function preventViewerContextMenu(event: ReactMouseEvent<HTMLElement>) {
  const target = event.target
  if (target instanceof Element && target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return
  event.preventDefault()
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
  useEffect(() => {
    if (reportMode) return
    const roots = [document.documentElement, document.body]
    const previous = roots.map((root) => root.style.overscrollBehaviorY)
    roots.forEach((root) => { root.style.overscrollBehaviorY = 'none' })
    return () => roots.forEach((root, index) => { root.style.overscrollBehaviorY = previous[index] })
  }, [reportMode])
  const [showZoomHint, setShowZoomHint] = useState(() => {
    if (tabletResourcePolicy || zoomHintShownInSession) return false
    try {
      return !window.localStorage.getItem('doanbogo:pc-zoom-hint:v1')
    } catch { return true }
  })
  const areaRef = useRef<HTMLDivElement>(null)
  const viewerShellRef = useRef<HTMLElement>(null)
  const timerClockRef = useRef<DocumentTimerClock | null>(null)
  const counterTimerModeRef = useRef<CounterTimerLinkMode>('ask-once')
  const counterTimerChoiceRef = useRef<CounterTimerChoice>(null)
  const counterTimerPromptLockRef = useRef(false)
  const thumbnailGroupSavePromiseRef = useRef<Promise<boolean> | null>(null)
  const thumbnailRailRef = useRef<HTMLDivElement>(null)
  const thumbnailGroupListRef = useRef<HTMLDivElement>(null)
  const thumbnailMouseDragRef = useRef<{ pointerId: number; startX: number; scrollLeft: number; dragging: boolean } | null>(null)
  const counterActionQueueRef = useRef<Promise<void>>(Promise.resolve())
  const counterActionRetryRef = useRef<(() => Promise<boolean>) | null>(null)
  const counterActionLockRef = useRef(false)
  const snapshotRef = useRef<ViewerSnapshot | null>(null)
  const paneGestureOwnerRef = useRef<PaneId | null>(null)
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
  const [annotationLimitNotice, setAnnotationLimitNotice] = useState('')
  const annotationLimitNoticeTimerRef = useRef<number | undefined>(undefined)
  useEffect(() => () => {
    if (annotationLimitNoticeTimerRef.current !== undefined) window.clearTimeout(annotationLimitNoticeTimerRef.current)
  }, [])
  const pageWorksFrameRef = useRef<number | undefined>(undefined)
  const [pageWorkPersistence] = useState(() => new PageWorkPersistence(savePageWork, 300, () => {
    setSuspendError(pageWorkSaveErrorMessage)
  }))
  const workRef = useRef<Record<number, PageWorkRecord>>({})
  const pageWorkLoadRef = useRef(new Map<number, PageWorkLoadRequest>())
  const pageWorkLoadRequestIdRef = useRef(0)
  const pageWorkOrderRef = useRef<number[]>([])
  const pageWorkCacheTrimRef = useRef<Promise<void> | null>(null)
  const workDocumentIdRef = useRef(id)
  const historyRef = useRef(new Map<number, PageHistory>())
  const dragRef = useRef<{ pointerId: number; orientation: 'wide' | 'tall'; rect: DOMRect } | null>(null)
  const [documentName, setDocumentName] = useState('')
  const [documentKind, setDocumentKind] = useState<'pdf' | 'photos'>('pdf')
  const [documentWorkTimeMs, setDocumentWorkTimeMs] = useState(0)
  const [todayWorkDate, setTodayWorkDate] = useState('')
  const [todayWorkTimeMs, setTodayWorkTimeMs] = useState(0)
  const [documentWorkTimeDays, setDocumentWorkTimeDays] = useState<DocumentWorkTimeDay[]>([])
  const [counterTimerMode, setCounterTimerMode] = useState<CounterTimerLinkMode>('ask-once')
  const [counterTimerPromptOpen, setCounterTimerPromptOpen] = useState(false)
  const [counterTimerPromptSaving, setCounterTimerPromptSaving] = useState(false)
  const [counterTimerPromptError, setCounterTimerPromptError] = useState('')
  const [timerPortalHost, setTimerPortalHost] = useState<HTMLDivElement | null>(null)
  const coarsePointer = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  const touchTablet = useTouchTablet()
  const [preferredTimerSize, setPreferredTimerSize] = useState<ViewerToolSize | null>(() => readViewerToolSize('timerBar'))
  const [preferredTimerPosition, setPreferredTimerPosition] = useState<ViewerToolPosition | null>(() => readViewerToolPosition('timerBar'))
  const [displayedTimerSize, setDisplayedTimerSize] = useState<ViewerToolSize | null>(null)
  const timerBarRef = useRef<HTMLDivElement>(null)
  const timerRestoreButtonRef = useRef<HTMLButtonElement>(null)
  const timerRestorePointerRef = useRef<{ pointerId: number; startX: number; startY: number; moved: boolean } | null>(null)
  const timerRestorePositionRef = useRef(false)
  const [timerBarState, setTimerBarState] = useState<{ documentId: string; left: number | null; top: number }>(() => ({ documentId: id, left: null, top: 12 }))
  if (timerBarState.documentId !== id) {
    setTimerBarState({ documentId: id, left: null, top: 12 })
    timerRestorePositionRef.current = false
    timerRestorePointerRef.current = null
  }
  const timerBarPosition = timerBarState.documentId === id ? timerBarState : { documentId: id, left: null, top: 12 }
  const [timerMinimizedUi, setTimerMinimizedUi] = useState(() => ({ documentId: id, minimized: false }))
  if (timerMinimizedUi.documentId !== id) setTimerMinimizedUi({ documentId: id, minimized: false })
  const timerMinimized = timerMinimizedUi.documentId === id && timerMinimizedUi.minimized
  const [timerErrorUi, setTimerErrorUi] = useState(() => ({ documentId: id, hasError: false }))
  if (timerErrorUi.documentId !== id) setTimerErrorUi({ documentId: id, hasError: false })
  const timerSaveError = timerErrorUi.documentId === id && timerErrorUi.hasError
  const timerBarPositioned = timerBarPosition.left !== null
  const timerBarDragRef = useRef<TimerBarDrag | null>(null)
  const timerBarPressRef = useRef<TimerBarPress | null>(null)
  const timerBarResizeActiveRef = useRef(false)
  const timerTabletDragActiveRef = useRef(false)
  const timerBarClickSuppressUntilRef = useRef(0)
  useEffect(() => () => {
    timerBarPressRef.current?.cleanup()
    const drag = timerBarDragRef.current
    if (drag?.frameId !== null && drag?.frameId !== undefined) cancelAnimationFrame(drag.frameId)
    drag?.bar.classList.remove('is-dragging')
    timerBarDragRef.current = null
  }, [])
  const [timerHasUnsaved, setTimerHasUnsaved] = useState(false)
  const [timerSaving, setTimerSaving] = useState(false)
  const [counterActionSaving, setCounterActionSaving] = useState(false)
  const [counterSettingsSaving, setCounterSettingsSaving] = useState(false)
  const [counterPanelRequest, setCounterPanelRequest] = useState<{ id: number; action: 'add' | 'edit'; counterId?: string }>({ id: 0, action: 'add' })
  const [counterDeleteToastId, setCounterDeleteToastId] = useState<string | null>(null)
  const counterDeleteToastTimerRef = useRef<number | undefined>(undefined)
  useEffect(() => () => {
    if (counterDeleteToastTimerRef.current !== undefined) window.clearTimeout(counterDeleteToastTimerRef.current)
  }, [])
  const [exitPromptOpen, setExitPromptOpen] = useState(false)
  const [exitPromptTarget, setExitPromptTarget] = useState<'home' | 'report'>('home')
  const [timerSessionKey, setTimerSessionKey] = useState(0)
  const displayDocumentName = documentKind === 'photos' ? documentName : documentName.replace(/\.pdf$/i, '')
  const onTimerUnsavedChange = useCallback((unsaved: boolean) => setTimerHasUnsaved(unsaved), [])
  const onTimerSavingChange = useCallback((saving: boolean) => setTimerSaving(saving), [])
  const onTimerErrorChange = useCallback((hasError: boolean) => setTimerErrorUi({ documentId: id, hasError }), [id])
  const onTimerWorkTimeChange = useCallback((totals: DocumentWorkTimeTotals) => {
    setDocumentWorkTimeMs(totals.totalWorkTimeMs)
    setTodayWorkDate(totals.todayWorkDate)
    setTodayWorkTimeMs(totals.todayWorkTimeMs)
    setDocumentWorkTimeDays(totals.workTimeDays)
  }, [])
  const onTimerTodayWorkTimeChange = useCallback((date: string, elapsedMs: number) => {
    setTodayWorkDate(date)
    setTodayWorkTimeMs(elapsedMs)
  }, [])
  const onTimerClockChange = useCallback((clock: DocumentTimerClock | null) => {
    timerClockRef.current = clock
  }, [])
  const addViewerWorkTime = useCallback((workDate: string, elapsedMs: number) => {
    const clock = timerClockRef.current
    if (!clock) return Promise.reject(new Error('작업시간 입력을 준비하지 못했습니다.'))
    return clock.addWorkTime(workDate, elapsedMs)
  }, [])
  const [viewerExitSaving, setViewerExitSaving] = useState(false)
  const [viewerExitError, setViewerExitError] = useState('')
  const viewerExitInFlightRef = useRef(false)
  const [workTimePanelBlockUi, setWorkTimePanelBlockUi] = useState(() => ({ documentId: id, blocked: false }))
  if (workTimePanelBlockUi.documentId !== id) setWorkTimePanelBlockUi({ documentId: id, blocked: false })
  const workTimePanelBlocking = workTimePanelBlockUi.documentId === id && workTimePanelBlockUi.blocked
  const onWorkTimePanelBlockingChange = useCallback((blocked: boolean) => setWorkTimePanelBlockUi({ documentId: id, blocked }), [id])
  const [workTimeRecordUi, setWorkTimeRecordUi] = useState(() => ({ documentId: id, open: false }))
  if (workTimeRecordUi.documentId !== id) setWorkTimeRecordUi({ documentId: id, open: false })
  const workTimeRecordOpen = workTimeRecordUi.documentId === id && workTimeRecordUi.open
  const onWorkTimeRecordOpenChange = useCallback((open: boolean) => setWorkTimeRecordUi({ documentId: id, open }), [id])
  const [focusViewUi, setFocusViewUi] = useState(() => ({ documentId: id, enabled: false }))
  if (focusViewUi.documentId !== id) setFocusViewUi({ documentId: id, enabled: false })
  const focusView = focusViewUi.documentId === id && focusViewUi.enabled && !reportMode
  const headerMoreTriggerRef = useRef<HTMLButtonElement>(null)
  const headerMorePanelRef = useRef<HTMLDivElement>(null)
  const desktopFocusTriggerRef = useRef<HTMLButtonElement>(null)
  const focusRestoreButtonRef = useRef<HTMLButtonElement>(null)
  const footerMoreTriggerRef = useRef<HTMLButtonElement>(null)
  const footerMorePanelRef = useRef<HTMLDivElement>(null)
  const zoomMenuTriggerRef = useRef<HTMLButtonElement>(null)
  const zoomMenuPanelRef = useRef<HTMLDivElement>(null)
  const counterPanelFocusRef = useRef<HTMLButtonElement>(null)
  const [headerMoreOpen, setHeaderMoreOpen] = useState(false)
  const [footerMoreOpen, setFooterMoreOpen] = useState(false)
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false)
  const requestViewerExit = useCallback(async () => {
    if (viewerExitInFlightRef.current) return
    viewerExitInFlightRef.current = true
    setViewerExitSaving(true)
    setViewerExitError('')
    try {
      await timerClockRef.current?.pauseAndSave()
      await counterActionQueueRef.current
      const retryCounterAction = counterActionRetryRef.current
      if (retryCounterAction && !await retryCounterAction()) {
        setViewerExitError(t('카운터와 진행선을 저장하지 못했습니다. 저장 공간을 확인하고 다시 시도해 주세요.'))
        setViewerExitSaving(false)
        viewerExitInFlightRef.current = false
        return
      }
      const pendingGroupSave = thumbnailGroupSavePromiseRef.current
      if (pendingGroupSave && !await pendingGroupSave) throw new Error('그룹 저장에 실패했습니다.')
      if (saveTimer.current !== undefined) window.clearTimeout(saveTimer.current)
      saveTimer.current = undefined
      await pageWorkPersistence.flushAll()
      const storedWorks = await getPageWorks(id)
      const latestWorks = new Map(storedWorks.map((work) => [work.pageNumber, work]))
      Object.values(workRef.current).forEach((work) => latestWorks.set(work.pageNumber, work))
      const latestSnapshot = snapshotRef.current
      if (latestSnapshot) await saveViewerAndPageWorks(latestSnapshot, [...latestWorks.values()])
      navigate('/projects')
    } catch (error) {
      console.warn('[PDF] Viewer exit save failed.', error)
      setViewerExitError(t('저장하지 못했습니다. 저장 공간을 확인한 뒤 다시 시도해 주세요.'))
      setViewerExitSaving(false)
      viewerExitInFlightRef.current = false
    }
  }, [id, navigate, pageWorkPersistence])
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
  const auxiliaryCounters = counters.filter((counter) => counter.id !== mainCounter?.id)
  const [counterDetailsUi, setCounterDetailsUi] = useState(() => ({ documentId: id, expanded: true }))
  const counterDetailsExpanded = counterDetailsUi.documentId === id ? counterDetailsUi.expanded : true
  const setCounterDetailsExpanded = (next: boolean | ((expanded: boolean) => boolean)) => setCounterDetailsUi((current) => ({
    documentId: id,
    expanded: typeof next === 'function' ? next(current.documentId === id ? current.expanded : true) : next,
  }))
  const [counterRowEditing, setCounterRowEditing] = useState(false)
  const [counterRowDraft, setCounterRowDraft] = useState('1')
  const counterRowInputRef = useRef<HTMLInputElement>(null)
  const skipCounterRowBlurRef = useRef(false)
  const currentCounterAlerts = snapshot ? counterAlertState(counters, snapshot.counterMainId, snapshot.counterPreviewEnabled === true) : { key: '', messages: [] as string[], alerts: [] as { counterId: string; message: string }[] }
  const counterAlertPending = Boolean(currentCounterAlerts.key && snapshot?.counterAlertAcknowledged !== currentCounterAlerts.key)
  const miniBarAlerts = currentCounterAlerts.alerts.filter((alert) => !counterDetailsExpanded || alert.counterId === mainCounter?.id)
  const [pages, setPages] = useState<PageRecord[]>([])
  const [thumbnailUi, setThumbnailUi] = useState<{ documentId: string; selection: ThumbnailSelection | null }>(() => ({ documentId: id, selection: null }))
  const thumbnailSelection = thumbnailUi.documentId === id ? thumbnailUi.selection : null
  const thumbnailTouchGestureRef = useRef<ThumbnailTouchGesture | null>(null)
  const thumbnailReorderGestureRef = useRef<ThumbnailReorderGesture | null>(null)
  const [thumbnailReorderFeedbackUi, setThumbnailReorderFeedbackUi] = useState<{ documentId: string; target: ThumbnailReorderTarget | null }>(() => ({ documentId: id, target: null }))
  const thumbnailReorderFeedback = thumbnailReorderFeedbackUi.documentId === id ? thumbnailReorderFeedbackUi.target : null
  const thumbnailReorderFeedbackRef = useRef<ThumbnailReorderTarget | null>(null)
  const suppressThumbnailClickRef = useRef(false)
  const draggedThumbnailPageRef = useRef<number | null>(null)
  const draggedThumbnailPagesRef = useRef<number[]>([])
  const thumbnailGroupSavingRef = useRef(false)
  const [thumbnailDropTargetUi, setThumbnailDropTargetUi] = useState<{ documentId: string; target: string | null }>(() => ({ documentId: id, target: null }))
  const thumbnailDropTarget = thumbnailDropTargetUi.documentId === id ? thumbnailDropTargetUi.target : null
  const thumbnailDropTargetRef = useRef<string | null>(null)
  const [thumbnailGroupState, setThumbnailGroupState] = useState(() => ({ documentId: id, expandedGroupId: null as string | null }))
  if (thumbnailGroupState.documentId !== id) setThumbnailGroupState({ documentId: id, expandedGroupId: null })
  const expandedThumbnailGroupId = thumbnailGroupState.documentId === id ? thumbnailGroupState.expandedGroupId : null
  const [thumbnailGroupDialog, setThumbnailGroupDialog] = useState(false)
  const [thumbnailGroupTarget, setThumbnailGroupTarget] = useState<{ documentId: string; pages: number[] } | null>(null)
  const [thumbnailGroupDraft, setThumbnailGroupDraft] = useState('')
  const [thumbnailGroupSaving, setThumbnailGroupSaving] = useState(false)
  const [thumbnailGroupError, setThumbnailGroupError] = useState('')
  const [thumbnailRailScrolling, setThumbnailRailScrolling] = useState(false)
  const [thumbnailGroupPopover, setThumbnailGroupPopover] = useState<{ documentId: string; groupId: string; left: number; top: number; mode: 'menu' | 'rename' | 'order' | 'rail-order' } | null>(null)
  const [thumbnailGroupOrderDraft, setThumbnailGroupOrderDraft] = useState<string[]>([])
  const [thumbnailRailOrderDraft, setThumbnailRailOrderDraft] = useState<ThumbnailRailOrderItem[]>([])
  const thumbnailGroupPopoverRef = useRef<HTMLFormElement>(null)
  const [thumbnailCollapsed, setThumbnailCollapsed] = useState(() => tabletResourcePolicy)
  const [miniBarState, setMiniBarState] = useState(() => ({ documentId: id, open: false }))
  if (miniBarState.documentId !== id) setMiniBarState({ documentId: id, open: false })
  const miniBarOpen = miniBarState.documentId === id && miniBarState.open
  const closeMiniBarOnPdfActionRef = useRef(false)
  const miniBarAccordionButtonRef = useRef<HTMLButtonElement>(null)
  const miniBarControlsRef = useRef<HTMLDivElement>(null)
  const miniBarControlsId = 'viewer-tools-' + id.replace(/[^a-zA-Z0-9_-]/g, '-')
  const [miniBarSettingsState, setMiniBarSettingsState] = useState(() => ({ documentId: id, open: false }))
  if (miniBarSettingsState.documentId !== id) setMiniBarSettingsState({ documentId: id, open: false })
  const miniBarSettingsOpen = miniBarSettingsState.documentId === id && miniBarSettingsState.open
  const [textStylePortalTarget, setTextStylePortalTarget] = useState<HTMLDivElement | null>(null)
  const setMiniBarSettingsOpen = useCallback((nextOpen: boolean | ((open: boolean) => boolean)) => {
    setMiniBarSettingsState((current) => ({ documentId: id, open: typeof nextOpen === 'function' ? nextOpen(current.documentId === id && current.open) : nextOpen }))
  }, [id])
  const miniBarSettingsPanelRef = useRef<HTMLDivElement>(null)
  const miniBarSettingsTriggerRef = useRef<HTMLButtonElement>(null)
  const thumbnailContentId = 'viewer-thumbnails-' + id.replace(/[^a-zA-Z0-9_-]/g, '-')
  const [pageWorks, setPageWorks] = useState<Record<number, PageWorkRecord>>({})
  const [pageWorkLoadUi, setPageWorkLoadUi] = useState<{ documentId: string; pages: Record<number, PageWorkLoadUiEntry> }>(() => ({ documentId: id, pages: {} }))
  const pageWorkLoadEntries = pageWorkLoadUi.documentId === id ? pageWorkLoadUi.pages : {}
  const updatePageWorkLoadUi = useCallback((page: number, requestId: number, entry: PageWorkLoadUiEntry | null) => {
    setPageWorkLoadUi((current) => {
      if (current.documentId !== id && current.documentId === workDocumentIdRef.current) return current
      const pages = { ...(current.documentId === id ? current.pages : {}) }
      const existing = pages[page]
      if (entry === null) {
        if (existing?.requestId !== requestId) return current
        delete pages[page]
      } else {
        if (existing && existing.requestId > requestId) return current
        pages[page] = entry
      }
      return { documentId: id, pages }
    })
  }, [id])
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
  const recognitionRequestTimerRef = useRef<number | undefined>(undefined)
  const recognitionRequestViewKeyRef = useRef('')
  const [recognitionErrorPages, setRecognitionErrorPages] = useState<Record<number, true>>({})
  const [recognitionVisible, setRecognitionVisible] = useState(false)
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
    setThumbnailRailScrolling(false)
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
    const rail = thumbnailRailRef.current
    return () => {
      const reorderGesture = thumbnailReorderGestureRef.current
      if (reorderGesture) {
        window.clearTimeout(reorderGesture.timer)
        if (reorderGesture.frameId !== undefined) window.cancelAnimationFrame(reorderGesture.frameId)
        reorderGesture.sourceElement.classList.remove('thumbnail-reordering-source')
        reorderGesture.preview?.remove()
        thumbnailReorderGestureRef.current = null
        thumbnailReorderFeedbackRef.current = null
        setThumbnailReorderFeedbackUi({ documentId: id, target: null })
        try {
          if (reorderGesture.button.hasPointerCapture(reorderGesture.pointerId)) reorderGesture.button.releasePointerCapture(reorderGesture.pointerId)
        } catch { /* The browser may already have released the pointer. */ }
      }
      const gesture = thumbnailTouchGestureRef.current
      if (!gesture) return
      window.clearTimeout(gesture.timer)
      if (gesture.frameId !== undefined) window.cancelAnimationFrame(gesture.frameId)
      gesture.draggedPages.forEach((pageNumber) => rail?.querySelector<HTMLElement>('.page-thumbnail[data-page-number="' + pageNumber + '"]')?.classList.remove('dragging-source'))
      gesture.dragPreview?.remove()
      thumbnailTouchGestureRef.current = null
      try {
        if (gesture.button.hasPointerCapture(gesture.pointerId)) gesture.button.releasePointerCapture(gesture.pointerId)
      } catch { /* The browser may already have released the pointer. */ }
    }
  }, [id, loadedId, thumbnailCollapsed])

  const cancelThumbnailReorder = useCallback(() => {
    const gesture = thumbnailReorderGestureRef.current
    if (!gesture) return
    window.clearTimeout(gesture.timer)
    if (gesture.frameId !== undefined) window.cancelAnimationFrame(gesture.frameId)
    gesture.sourceElement.classList.remove('thumbnail-reordering-source')
    gesture.preview?.remove()
    thumbnailReorderGestureRef.current = null
    thumbnailReorderFeedbackRef.current = null
    setThumbnailReorderFeedbackUi({ documentId: id, target: null })
    suppressThumbnailClickRef.current = true
    window.setTimeout(() => { suppressThumbnailClickRef.current = false }, 0)
    try {
      if (gesture.button.hasPointerCapture(gesture.pointerId)) gesture.button.releasePointerCapture(gesture.pointerId)
    } catch { /* The browser may already have released the pointer. */ }
  }, [id])

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !thumbnailReorderGestureRef.current) return
      event.preventDefault()
      event.stopPropagation()
      cancelThumbnailReorder()
    }
    window.addEventListener('keydown', handleEscape, true)
    return () => window.removeEventListener('keydown', handleEscape, true)
  }, [cancelThumbnailReorder])

  function setThumbnailSelection(next: ThumbnailSelection | null | ((current: ThumbnailSelection | null) => ThumbnailSelection | null)) {
    setThumbnailUi((current) => {
      const sameDocument = current.documentId === id
      const selection = typeof next === 'function' ? next(sameDocument ? current.selection : null) : next
      if (sameDocument && current.selection?.anchor === selection?.anchor && current.selection?.lastPage === selection?.lastPage &&
        current.selection?.pages.length === selection?.pages.length && current.selection?.pages.every((page, index) => page === selection?.pages[index])) return current
      return { documentId: id, selection }
    })
  }

  function updateThumbnailDropTarget(nextTarget: string | null) {
    if (thumbnailDropTargetRef.current === nextTarget) return
    thumbnailDropTargetRef.current = nextTarget
    setThumbnailDropTargetUi({ documentId: id, target: nextTarget })
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

  const requestVisibleRecognition = useCallback(() => {
    const record = recognitionRecordRef.current
    const viewerPdf = pdfSessionRef.current?.pdf
    const current = snapshotRef.current
    if (reportMode || !record || record.id !== id || !viewerPdf || !current || viewerLifecycleRef.current !== 'active' || document.visibilityState !== 'visible') return
    const activePage = current[current.activePane].page
    const otherPane = current.activePane === 'primary' ? 'secondary' : 'primary'
    const visiblePages = orderVisibleRecognitionPages(activePage, current.split ? [current[otherPane].page] : [])
    for (const pageNumber of visiblePages) {
      if (pdfLinkPagesRef.current.has(pageNumber) && qrLinksRef.current.has(pageNumber)) continue
      requestPdfPageRecognition(record, pageNumber, viewerPdf, pageNumber === activePage)
    }
  }, [id, reportMode])

  const scheduleVisibleRecognition = useCallback(() => {
    if (recognitionRequestTimerRef.current !== undefined) window.clearTimeout(recognitionRequestTimerRef.current)
    const current = snapshotRef.current
    recognitionRequestViewKeyRef.current = [id, reportMode, current?.primary.page, current?.primary.zoom, current?.secondary.page, current?.secondary.zoom, current?.activePane, current?.split].join(':')
    recognitionRequestTimerRef.current = window.setTimeout(() => {
      recognitionRequestTimerRef.current = undefined
      requestVisibleRecognition()
    }, 300)
  }, [id, reportMode, requestVisibleRecognition])

  const onPageRendered = useCallback((pageNumber: number) => {
    const scanKey = id + ':' + pageNumber
    if (reportMode || viewerLifecycleRef.current !== 'active') return
    scheduleVisibleRecognition()
    if (pdfLinkPagesRef.current.has(pageNumber) && qrLinksRef.current.has(pageNumber) || recognitionLoadPendingRef.current.has(scanKey)) return
    recognitionLoadPendingRef.current.add(scanKey)
    const task = (async () => {
      const storedRecognition = await getPageRecognition(id, pageNumber).catch(() => undefined)
      const cached = storedRecognition?.version === 1 ? storedRecognition : undefined
      if (viewerLifecycleRef.current !== 'active' || recognitionRecordRef.current?.id !== id) return

      if (!pdfLinkPagesRef.current.has(pageNumber) && cached?.pdfLinksDone) {
        rememberRecentPage(pdfLinkPagesRef.current, pageNumber, true)
        setPdfLinksByPage((current) => withRecentPdfLinks(current, pageNumber, cached.pdfLinks))
      }

      if (!qrLinksRef.current.has(pageNumber) && cached?.qrLinksDone) {
        rememberRecentPage(qrLinksRef.current, pageNumber, cached.qrLinks)
        setQrLinksByPage((current) => withRecentPdfLinks(current, pageNumber, cached.qrLinks))
      }
    })().finally(() => {
      recognitionLoadPendingRef.current.delete(scanKey)
    })
    linkTasksRef.current.add(task)
    void task.finally(() => linkTasksRef.current.delete(task)).catch(() => {})
  }, [id, reportMode, scheduleVisibleRecognition])

  useEffect(() => subscribePdfRecognition((documentId, pageNumber, result) => {
    if (documentId !== id || viewerLifecycleRef.current !== 'active') return
    if (result.kind === 'error') {
      setRecognitionErrorPages((current) => ({ ...current, [pageNumber]: true }))
      return
    }
    if (result.result.pdfLinksDone) {
      rememberRecentPage(pdfLinkPagesRef.current, pageNumber, true)
      setPdfLinksByPage((current) => withRecentPdfLinks(current, pageNumber, result.result.pdfLinks))
    }
    if (result.result.qrLinksDone) {
      rememberRecentPage(qrLinksRef.current, pageNumber, result.result.qrLinks)
      setQrLinksByPage((current) => withRecentPdfLinks(current, pageNumber, result.result.qrLinks))
    }
    if (result.result.pdfLinksDone && result.result.qrLinksDone) {
      setRecognitionErrorPages((current) => {
        if (!current[pageNumber]) return current
        const next = { ...current }
        delete next[pageNumber]
        return next
      })
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
      const [savedTimerMode, savedTimerChoice] = await Promise.all([getPreference('counterTimerLinkMode'), getPreference('counterTimerAskOnceChoice')])
      const nextTimerMode = isCounterTimerLinkMode(savedTimerMode) ? savedTimerMode : 'ask-once'
      const nextTimerChoice: CounterTimerChoice = savedTimerChoice === 'start' || savedTimerChoice === 'skip' ? savedTimerChoice : null
      counterTimerModeRef.current = nextTimerMode
      counterTimerChoiceRef.current = nextTimerChoice
      setCounterTimerMode(nextTimerMode)
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
      const primaryZoom = nearestZoomLevel(restored.primary.zoom)
      const secondaryZoom = nearestZoomLevel(restored.secondary.zoom)
      if (primaryZoom !== restored.primary.zoom || secondaryZoom !== restored.secondary.zoom) {
        restored = { ...restored, primary: { ...restored.primary, zoom: primaryZoom }, secondary: { ...restored.secondary, zoom: secondaryZoom } }
        try { await saveViewer(restored) } catch (error) {
          console.warn('[PDF] Viewer zoom could not be normalized.', error)
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
      setRecognitionErrorPages({})
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
      setTodayWorkDate(record.todayWorkDate ?? '')
      setTodayWorkTimeMs(record.todayWorkTimeMs ?? 0)
      setDocumentWorkTimeDays(normalizeWorkTimeDays(record.workTimeDays, record.todayWorkDate, record.todayWorkTimeMs))
      setSnapshot(restored)
      snapshotRef.current = restored
      setPdf(opened.document)
      setLoadedId(id)
      initializedDocumentRef.current = id
      setLoadError(null)
      await markOpened(id)
      const storedPages = await getPages(id)
      setPages(completePageList(id, opened.document.numPages, storedPages))
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
      if (recognitionRequestTimerRef.current !== undefined) window.clearTimeout(recognitionRequestTimerRef.current)
      recognitionRequestTimerRef.current = undefined
      cancelPdfRecognitionPages(id)
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
    else resumePdfRecognitionFromReport(record)
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
      setRecognitionVisible(document.visibilityState === 'visible')
      if (document.visibilityState === 'hidden') {
        if (recognitionRequestTimerRef.current !== undefined) window.clearTimeout(recognitionRequestTimerRef.current)
        recognitionRequestTimerRef.current = undefined
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
    if (!pdf || suspended || thumbnailCollapsed || focusView) return
    const frame = requestAnimationFrame(() => {
      if (thumbnailRailRef.current) thumbnailRailRef.current.scrollLeft = thumbnailScrollRef.current
    })
    return () => cancelAnimationFrame(frame)
  }, [pdf, suspended, thumbnailCollapsed, focusView])

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

  useEffect(() => {
    if (!timerBarPositioned || reportMode || timerMinimized) return
    const shell = viewerShellRef.current
    const bar = shell?.querySelector<HTMLElement>('.viewer-timer-bar')
    if (!shell || !bar) return
    const clampPosition = () => {
      if (timerMinimized || timerBarResizeActiveRef.current || timerTabletDragActiveRef.current) return
      const shellRect = shell.getBoundingClientRect()
      const barRect = bar.getBoundingClientRect()
      const bounds = coarsePointer ? readViewerPopupAvailableBounds(shell) : null
      const minLeft = bounds ? bounds.left - shellRect.left : 0
      const minTop = bounds ? bounds.top - shellRect.top : window.matchMedia('(max-width: 600px)').matches ? 44 : 0
      const maxLeft = bounds ? bounds.left + bounds.width - shellRect.left - barRect.width : Math.max(0, shellRect.width - barRect.width)
      const maxTop = bounds ? bounds.top + bounds.height - shellRect.top - barRect.height : Math.max(0, shellRect.height - barRect.height)
      const savedPosition = touchTablet && bounds && preferredTimerPosition && displayedTimerSize && !timerRestorePositionRef.current
        ? getViewerToolPosition(bounds, displayedTimerSize, preferredTimerPosition)
        : null
      setTimerBarState((current) => {
        if (current.documentId !== id || current.left === null) return current
        const left = savedPosition ? savedPosition.left - shellRect.left : clamp(current.left, minLeft, Math.max(minLeft, maxLeft))
        const top = savedPosition ? savedPosition.top - shellRect.top : clamp(current.top, minTop, Math.max(minTop, maxTop))
        return left === current.left && top === current.top ? current : { ...current, left, top }
      })
    }
    const observer = new ResizeObserver(clampPosition)
    observer.observe(shell)
    observer.observe(bar)
    window.addEventListener('resize', clampPosition)
    window.visualViewport?.addEventListener('resize', clampPosition)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', clampPosition)
      window.visualViewport?.removeEventListener('resize', clampPosition)
    }
  }, [coarsePointer, displayedTimerSize, id, preferredTimerPosition, reportMode, timerBarPositioned, timerMinimized, touchTablet])

  useLayoutEffect(() => {
    if (!coarsePointer || reportMode) return
    const shell = viewerShellRef.current
    const bar = shell?.querySelector<HTMLElement>('.viewer-timer-bar')
    if (!shell || !bar) return
    const updateSize = () => {
      if (timerMinimized || timerBarResizeActiveRef.current || timerTabletDragActiveRef.current) return
      const bounds = readViewerPopupAvailableBounds(shell)
      if (!bounds) return
      const topRows = ['.viewer-counter-tools', '.viewer-timer-portal-host']
        .map((selector) => bar.querySelector<HTMLElement>(selector)?.getBoundingClientRect().height ?? 0)
      const detailsHeader = bar.querySelector<HTMLElement>('.viewer-counter-details-header')?.getBoundingClientRect().height ?? 44
      const minHeight = Math.ceil(Math.max(...topRows, 44) + detailsHeader + (counterDetailsExpanded ? 96 + 44 : 0) + 24)
      const minWidth = touchTablet ? 480 : 260
      const preferred = preferredTimerSize ?? getDefaultViewerPopupSize('timerBar', bounds, minHeight, minWidth)
      const size = preferred ? getViewerPopupSize(preferred, bounds, minHeight, minWidth) : null
      if (!size) return
      setDisplayedTimerSize((current) => current?.width === size.width && current.height === size.height ? current : size)
      const shellRect = shell.getBoundingClientRect()
      const minLeft = bounds.left - shellRect.left
      const minTop = bounds.top - shellRect.top
      const maxLeft = bounds.left + bounds.width - shellRect.left - size.width
      const maxTop = bounds.top + bounds.height - shellRect.top - (counterDetailsExpanded ? size.height : bar.getBoundingClientRect().height)
      const barRect = bar.getBoundingClientRect()
      const savedPosition = touchTablet && preferredTimerPosition && !timerRestorePositionRef.current
          ? getViewerToolPosition(bounds, size, preferredTimerPosition)
          : null
      const baseLeft = timerBarPosition.left ?? (savedPosition ? savedPosition.left - shellRect.left : barRect.left - shellRect.left)
      const baseTop = timerBarPosition.left === null ? (savedPosition ? savedPosition.top - shellRect.top : barRect.top - shellRect.top) : timerBarPosition.top
      const left = clamp(baseLeft, minLeft, Math.max(minLeft, maxLeft))
      const top = clamp(baseTop, minTop, Math.max(minTop, maxTop))
      if (timerRestorePositionRef.current) {
        const position = touchTablet ? createViewerToolPosition(bounds, { left: shellRect.left + left, top: shellRect.top + top, width: size.width, height: size.height }) : null
        if (position) {
          saveViewerToolPosition('timerBar', position)
          setPreferredTimerPosition(position)
        }
        timerRestorePositionRef.current = false
      }
      setTimerBarState((current) => current.documentId !== id || left === current.left && top === current.top ? current : { ...current, left, top })
    }
    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(shell)
    observer.observe(bar)
    window.addEventListener('resize', updateSize)
    window.visualViewport?.addEventListener('resize', updateSize)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateSize)
      window.visualViewport?.removeEventListener('resize', updateSize)
    }
  }, [coarsePointer, counterDetailsExpanded, id, loadedId, pdf, preferredTimerPosition, preferredTimerSize, reportMode, timerBarPosition.left, timerBarPosition.top, timerMinimized, timerPortalHost, touchTablet])

  const orientation = areaSize.width >= areaSize.height ? 'wide' : 'tall'
  const ratio = snapshot ? (orientation === 'wide' ? snapshot.wideRatio : snapshot.tallRatio) : 0.5
  const activePage = snapshot ? snapshot[snapshot.activePane].page : 1
  const pageState = pages.find((page) => page.pageNumber === activePage)
  const isBookmarked = Boolean(pageState?.bookmarked)
  const visiblePageNumbers = pdf ? Array.from({ length: pdf.numPages }, (_, index) => index + 1) : []
  const activeVisiblePageIndex = visiblePageNumbers.indexOf(activePage)
  const selectedThumbnailPages = thumbnailSelection?.pages ?? []
  const selectedThumbnailSet = new Set(selectedThumbnailPages)
  const thumbnailGroups = snapshot?.thumbnailGroups ?? EMPTY_THUMBNAIL_GROUPS
  const progressSettings = snapshot?.progressSettings ?? defaultProgressSettings
  const annotationSettings = snapshot?.annotationSettings ?? defaultAnnotationSettings
  const activeAnnotationStyle = tool === 'pen' || tool === 'line' || tool === 'highlight' || tool === 'text' ? annotationSettings[tool] : null
  const activeHistory = histories[activePage] ?? { actions: [], cursor: 0, byteCosts: [] }
  const activeWork = pageWorks[activePage] ?? blankWork(id, activePage)
  const activeHasPrimaryGuide = activeWork.horizontalGuides?.some((guide) => guide.role === 'primary') ?? false
  const activeZoom = snapshot ? snapshot[snapshot.activePane].zoom : 1
  const activeRotation = snapshot ? snapshot[snapshot.activePane].rotations?.[activePage] ?? activeWork.rotation ?? 0 : 0
  const activeColorworkGrid = colorworkEnabled ? activeWork.colorworkGrid ?? null : null
  const canUndo = activeHistory.cursor > 0
  const canRedo = activeHistory.cursor < activeHistory.actions.length
  const primaryPage = snapshot?.primary.page
  const secondaryPage = snapshot?.secondary.page
  const isSplit = snapshot?.split
  const activePaneId = snapshot?.activePane
  const focusViewBlocked = timerSaving || viewerExitSaving || counterActionSaving || thumbnailGroupSaving || thumbnailGroupSavingRef.current || Boolean(thumbnailGroupSavePromiseRef.current) || renameDialog || thumbnailGroupDialog || colorworkDialog || counterTimerPromptOpen || counterTimerPromptSaving || exitPromptOpen || counterRowEditing || workTimePanelBlocking || thumbnailGroupPopover?.mode === 'rename' || thumbnailGroupPopover?.mode === 'order' || thumbnailGroupPopover?.mode === 'rail-order'
  useEffect(() => {
    const currentViewKey = [id, reportMode, snapshot?.primary.page, snapshot?.primary.zoom, snapshot?.secondary.page, snapshot?.secondary.zoom, snapshot?.activePane, snapshot?.split].join(':')
    if (recognitionRequestTimerRef.current !== undefined && recognitionRequestViewKeyRef.current !== currentViewKey) {
      window.clearTimeout(recognitionRequestTimerRef.current)
      recognitionRequestTimerRef.current = undefined
    }
    const current = snapshotRef.current
    const activePage = current?.[current.activePane].page
    const otherPane = current?.activePane === 'primary' ? 'secondary' : 'primary'
    const visiblePages = !reportMode && current && activePage !== undefined
      ? orderVisibleRecognitionPages(activePage, current.split ? [current[otherPane].page] : [])
      : []
    cancelPdfRecognitionExceptPages(id, visiblePages)
  }, [id, loadedId, reportMode, primaryPage, secondaryPage, isSplit, activePaneId, snapshot?.primary.page, snapshot?.primary.zoom, snapshot?.secondary.page, snapshot?.secondary.zoom, snapshot?.activePane, snapshot?.split])

  useEffect(() => {
    if (!recognitionVisible || !pdf || loadedId !== id || reportMode) return
    scheduleVisibleRecognition()
  }, [recognitionVisible, pdf, loadedId, id, reportMode, scheduleVisibleRecognition])

  const retryPageRecognition = useCallback((pageNumber: number) => {
    const record = recognitionRecordRef.current
    const viewerPdf = pdfSessionRef.current?.pdf
    const current = snapshotRef.current
    if (!record || record.id !== id || !viewerPdf || !current) return
    setRecognitionErrorPages((errors) => {
      const next = { ...errors }
      delete next[pageNumber]
      return next
    })
    requestPdfPageRecognition(record, pageNumber, viewerPdf, current[current.activePane].page === pageNumber)
  }, [id])
  useEffect(() => {
    if (!miniBarOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (focusView) return
      if (event.target instanceof Element && event.target.closest('.counter-modal-backdrop')) return
      event.preventDefault()
      event.stopPropagation()
      closeMiniBarOnPdfActionRef.current = false
      setMiniBarState((current) => current.documentId === id ? { ...current, open: false } : current)
      setMiniBarSettingsOpen(false)
      miniBarAccordionButtonRef.current?.focus()
    }
    document.addEventListener('keydown', closeOnEscape, true)
    return () => document.removeEventListener('keydown', closeOnEscape, true)
  }, [focusView, miniBarOpen, id, setMiniBarSettingsOpen])
  useDismissiblePopover(miniBarSettingsOpen, miniBarSettingsPanelRef, miniBarSettingsTriggerRef, () => setMiniBarSettingsOpen(false))
  useDismissiblePopover(headerMoreOpen, headerMorePanelRef, headerMoreTriggerRef, () => setHeaderMoreOpen(false))
  useDismissiblePopover(footerMoreOpen, footerMorePanelRef, footerMoreTriggerRef, () => setFooterMoreOpen(false))
  useDismissiblePopover(zoomMenuOpen, zoomMenuPanelRef, zoomMenuTriggerRef, () => setZoomMenuOpen(false))

  useEffect(() => {
    if (!focusView) return
    const exitOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      setFocusViewUi({ documentId: id, enabled: false })
      window.requestAnimationFrame(() => desktopFocusTriggerRef.current?.focus())
    }
    window.addEventListener('keydown', exitOnEscape)
    return () => window.removeEventListener('keydown', exitOnEscape)
  }, [focusView, id])

  useEffect(() => {
    const root = document.documentElement
    const previousHeight = root.style.getPropertyValue('--viewer-viewport-height')
    const hadLock = root.classList.contains('viewer-viewport-locked')
    const updateViewport = () => {
      const height = window.visualViewport?.height ?? window.innerHeight
      root.style.setProperty('--viewer-viewport-height', Math.max(1, height) + 'px')
    }
    root.classList.add('viewer-viewport-locked')
    updateViewport()
    window.addEventListener('resize', updateViewport)
    window.addEventListener('orientationchange', updateViewport)
    window.visualViewport?.addEventListener('resize', updateViewport)
    window.visualViewport?.addEventListener('scroll', updateViewport)
    return () => {
      window.removeEventListener('resize', updateViewport)
      window.removeEventListener('orientationchange', updateViewport)
      window.visualViewport?.removeEventListener('resize', updateViewport)
      window.visualViewport?.removeEventListener('scroll', updateViewport)
      if (!hadLock) root.classList.remove('viewer-viewport-locked')
      if (previousHeight) root.style.setProperty('--viewer-viewport-height', previousHeight)
      else root.style.removeProperty('--viewer-viewport-height')
    }
  }, [])

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
    thumbnailDropTargetRef.current = null
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
    if (pending) return pending.promise

    const requestId = ++pageWorkLoadRequestIdRef.current
    updatePageWorkLoadUi(page, requestId, { requestId, status: 'loading' })
    let request: PageWorkLoadRequest
    const loadingWork = loadPageWorkWithTimeout(() => getPageWork(id, page)).then((savedWork) => {
      if (workDocumentIdRef.current !== id || pageWorkLoadRef.current.get(page) !== request) return null
      const current = workRef.current[page]
      if (current) {
        touchPageWork(page)
        updatePageWorkLoadUi(page, requestId, null)
        return current
      }
      const loaded = ensurePrimaryProgressGuide(prepareProgressGuidesForDirectInteraction(savedWork))
      workRef.current = { ...workRef.current, [page]: loaded }
      touchPageWork(page)
      setPageWorks(workRef.current)
      updatePageWorkLoadUi(page, requestId, null)
      if (loaded !== savedWork) {
        void pageWorkPersistence.schedule(loaded, true).catch((error: unknown) => {
          console.warn('[PDF] Legacy progress guides could not be migrated.', error)
          setSuspendError(pageWorkSaveErrorMessage)
        })
      }
      return loaded
    }).catch((error: unknown) => {
      if (workDocumentIdRef.current === id && pageWorkLoadRef.current.get(page) === request) {
        const message = error instanceof PageWorkLoadTimeoutError
          ? t('페이지 작업 데이터를 불러오는 데 20초 이상 걸렸습니다. 다시 시도해 주세요.')
          : t('페이지 작업 데이터를 불러오지 못했습니다. 다시 시도해 주세요.')
        updatePageWorkLoadUi(page, requestId, { requestId, status: 'error', message })
      }
      return null
    }).finally(() => {
      if (pageWorkLoadRef.current.get(page) === request) pageWorkLoadRef.current.delete(page)
    })
    request = { requestId, promise: loadingWork }
    pageWorkLoadRef.current.set(page, request)
    return loadingWork
  }, [id, pageWorkPersistence, touchPageWork, updatePageWorkLoadUi])

  useEffect(() => {
    if (activePaneId === undefined || !id || loadedId !== id || primaryPage === undefined || secondaryPage === undefined) return
    const needed = getRequiredPageWorkPages({ split: Boolean(isSplit), activePage, primaryPage, secondaryPage })
    void Promise.all(needed.map((page) => ensurePageWork(page)))
  }, [id, loadedId, activePaneId, activePage, primaryPage, secondaryPage, isSplit, ensurePageWork])

  function mutateSnapshot(change: (current: ViewerSnapshot) => ViewerSnapshot, immediate = false) {
    const current = snapshotRef.current
    if (!current) return
    const next = change(current)
    pushSnapshot(next, immediate)
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

  function commitCounterTransaction(nextCounters: CounterSnapshot[], label: string, actualRow = 0, restoreGuides?: CounterHistoryEntry['guides'], saveHistory = true, autoPanY?: number, baseCounterId?: string, snapshotChanges?: Partial<ViewerSnapshot>, guideAction?: CounterGuideAction, counterOnly = false) {
    const retryAction = () => commitCounterTransaction(nextCounters, label, actualRow, restoreGuides, saveHistory, autoPanY, baseCounterId, snapshotChanges, guideAction, counterOnly)
    const operation = counterActionQueueRef.current.then(async () => {
      const current = snapshotRef.current
      if (!current) return true
      if (saveTimer.current !== undefined) window.clearTimeout(saveTimer.current)
      saveTimer.current = undefined
      const provisional = { ...current, ...snapshotChanges, counters: nextCounters, ...(autoPanY === undefined ? {} : { [current.activePane]: { ...current[current.activePane], centerY: autoPanY } }) }
      snapshotRef.current = provisional
      setSnapshot(provisional)
      try {
        if (!counterOnly) await pageWorkPersistence.flushAll()
        const works = counterOnly ? [] : await getPageWorks(id)
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
        if (saveHistory) {
          const historyEntryId = crypto.randomUUID()
          const entry: CounterHistoryEntry = { id: historyEntryId, label, counters: normalizeCounterSnapshots(current.counters), guides: beforeGuides, actualRow, ...(baseCounterId ? { baseCounterId } : {}), ...(counterOnly ? { counterOnly: true } : {}), savedAt: Date.now() }
          counterHistory = [...counterHistory, entry].slice(-MAX_COUNTER_HISTORY)
        } else if (!saveHistory) {
          counterHistory = counterHistory.slice(0, -1)
        }
        const autoPanGuideStillLinked = current.counterGuideAutoPanId
          ? works.some((work) => [...(work.horizontalGuides ?? []), ...(work.verticalGuides ?? [])].some((guide) => guide.id === current.counterGuideAutoPanId && Boolean(guide.linkedCounterId && counterById.has(guide.linkedCounterId))))
          : false
        const nextSnapshot = { ...provisional, counterHistory, ...(!counterOnly && current.counterGuideAutoPanId && !autoPanGuideStillLinked ? { counterGuideAutoPanId: null } : {}) }
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
        setSuspendError((error) => error.startsWith('카운터') ? '' : error)
        if (counterActionRetryRef.current === retryAction) counterActionRetryRef.current = null
        return true
      } catch (error) {
        console.warn('[PDF] Counter state could not be saved.', error)
        snapshotRef.current = current
        setSnapshot(current)
        setSuspendError('카운터와 진행선을 저장하지 못했습니다. 저장 공간을 확인하고 다시 시도해 주세요.')
        return false
      }
    })
    counterActionRetryRef.current = retryAction
    counterActionQueueRef.current = operation.then(() => undefined, () => undefined)
    return operation
  }

  function handleCounterTimerInteraction() {
    const clock = timerClockRef.current
    if (clock?.isRunning()) return
    const action = resolveCounterTimerAction(counterTimerModeRef.current, counterTimerChoiceRef.current)
    if (action === 'start') {
      clock?.startIfNotStartedToday()
      return
    }
    if (action === 'prompt' && !counterTimerPromptLockRef.current) {
      counterTimerPromptLockRef.current = true
      setCounterTimerPromptError('')
      setCounterTimerPromptOpen(true)
    }
  }

  async function changeCounterTimerLinkMode(mode: CounterTimerLinkMode) {
    if (mode === 'ask-once') await savePreference('counterTimerAskOnceChoice', '')
    await savePreference('counterTimerLinkMode', mode)
    counterTimerModeRef.current = mode
    if (mode === 'ask-once') counterTimerChoiceRef.current = null
    setCounterTimerMode(mode)
  }

  async function chooseCounterTimerPrompt(choice: Exclude<CounterTimerChoice, null>) {
    if (counterTimerPromptSaving) return
    setCounterTimerPromptSaving(true)
    setCounterTimerPromptError('')
    try {
      await savePreference('counterTimerAskOnceChoice', choice)
      counterTimerChoiceRef.current = choice
      counterTimerPromptLockRef.current = false
      setCounterTimerPromptOpen(false)
      if (choice === 'start') timerClockRef.current?.startIfNotStartedToday()
    } catch {
      setCounterTimerPromptError(t('타이머 연동 설정을 저장하지 못했습니다. 다시 시도해 주세요.'))
    } finally {
      setCounterTimerPromptSaving(false)
    }
  }

  function updateCounterPanel(nextCounters: CounterSnapshot[], label: string): Promise<boolean> | boolean {
    const current = snapshotRef.current
    if (!current) return false
    if (label.startsWith('sound:')) {
      pushSnapshot({ ...current, counterSoundEnabled: label.slice(6) === 'true' }, true)
      return true
    }
    if (label.startsWith('preview:')) {
      pushSnapshot({ ...current, counterPreviewEnabled: label.slice(8) === 'true' }, true)
      return true
    }
    if (label.startsWith('collapse:')) {
      const [, kind, value] = label.split(':')
      if (kind === 'simple' || kind === 'pattern' || kind === 'task' || kind === 'repeat') pushSnapshot({ ...current, collapsedCounterKinds: { ...current.collapsedCounterKinds, [kind]: value === 'true' } }, true)
      return true
    }
    if (label.startsWith('panel:')) {
      pushSnapshot({ ...current, counterPanelCollapsed: label.slice(6) === 'true' }, true)
      return true
    }
    if (label.endsWith(' 진행') || label.endsWith(' 감소')) handleCounterTimerInteraction()
    return commitCounterTransaction(nextCounters, label, 0, undefined, true, undefined, undefined, undefined, counterGuideCorrection(current, nextCounters))
  }

  function requestCounterPanelAction(action: 'add' | 'edit', counterId?: string) {
    setCounterPanelRequest((current) => ({ id: current.id + 1, action, ...(counterId ? { counterId } : {}) }))
    updateCounterSnapshot({ counterPanelCollapsed: false })
    setSavedCounterSession({ documentId: id, visible: true })
  }

  async function duplicateCounterAction(counterId: string) {
    const current = snapshotRef.current
    if (!current) return false
    const currentCounters = normalizeCounterSnapshots(current.counters)
    const selected = currentCounters.find((counter) => counter.id === counterId)
    if (!selected || maxCountersForType(currentCounters, selected.kind) >= MAX_COUNTERS_PER_TYPE) return false
    const duplicate = duplicateCounterSnapshot(selected, `${selected.name} (${t('복사본')})`)
    const next = [...currentCounters]
    next.splice(next.findIndex((counter) => counter.id === selected.id) + 1, 0, duplicate)
    return (await updateCounterPanel(next, '카운터 복제')) !== false
  }

  async function deleteCounterAction(counterId: string) {
    const current = snapshotRef.current
    if (!current) return false
    const currentCounters = normalizeCounterSnapshots(current.counters)
    const selected = currentCounters.find((counter) => counter.id === counterId)
    if (!selected || !window.confirm(t('카운터를 삭제할까요?') + ' (' + formatNumber(1) + ')\n' + selected.name)) return false
    const next = currentCounters.filter((counter) => counter.id !== selected.id).map((counter) => ({
      ...counter,
      ...(counter.linkedToId === selected.id ? { linkedToId: undefined } : {}),
      ...(counter.repeatLinkedToId === selected.id ? { repeatLinkedToId: undefined } : {}),
    }))
    const deleted = (await updateCounterPanel(next, '카운터 삭제')) !== false
    if (deleted) {
      setCounterDeleteToastId(snapshotRef.current?.counterHistory?.at(-1)?.id ?? null)
      if (counterDeleteToastTimerRef.current !== undefined) window.clearTimeout(counterDeleteToastTimerRef.current)
      counterDeleteToastTimerRef.current = window.setTimeout(() => setCounterDeleteToastId(null), 6000)
    }
    return deleted
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
    const next = ensurePrimaryProgressGuide(prepareProgressGuidesForDirectInteraction({
      ...before,
      horizontalPosition: clamp(visibleRect?.y ?? before.horizontalPosition ?? 0.5, 0, 1),
    }))
    setPageWork(next, true, true, before)
    if (!settings.horizontal.visible) mutateSnapshot((snapshot) => ({ ...snapshot, progressSettings: { ...settings, horizontal: { ...settings.horizontal, visible: true } } }), true)
  }

  function saveCounterSettings(nextCounters: CounterSnapshot[], changes: Partial<ViewerSnapshot>, label: string): Promise<boolean> {
    const current = snapshotRef.current
    if (!current) return Promise.resolve(false)
    return commitCounterTransaction(nextCounters, label, 0, undefined, false, undefined, undefined, changes, counterGuideCorrection(current, nextCounters))
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
    handleCounterTimerInteraction()
    const alertToAcknowledge = counterAlertState(currentCounters, counterId, current.counterPreviewEnabled === true).key
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
    const autoPanY = linkedGuide && linkedCounter && (!linkedGuide.chartRegion?.rowRanges?.length || isChartAutoFollowRotationCompatible(linkedGuide, activeRotation))
      ? guidePositionForRotation(linkedGuide, linkedRow, activeRotation)
      : undefined
    const primaryGuide = (activeWork?.horizontalGuides ?? []).find((guide) => guide.role === 'primary' && guide.linkedCounterId === base.id)
    const label = base.name + ' · ' + base.value + (completingGoal ? '단 목표 완료' : '단 완료')
    void commitCounterTransaction(nextCounters, label, base.value, undefined, true, autoPanY, base.id, { counterAlertAcknowledged: alertToAcknowledge }, primaryGuide ? { kind: 'advance', pageNumber: activePage, guideId: primaryGuide.id } : undefined).finally(releaseCounterActionLock)
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
    handleCounterTimerInteraction()
    void commitCounterTransaction(next, (edited?.name ?? '카운터') + ' 숫자 보정', edited?.kind === 'simple' ? edited.value : edited?.currentRow ?? 0, undefined, true, undefined, undefined, undefined, counterGuideCorrection(current, next)).finally(releaseCounterActionLock)
  }

  function undoCounterAction() {
    const current = snapshotRef.current
    const history = current?.counterHistory ?? []
    const latest = history.at(-1)
    if (!current || !latest || !acquireCounterActionLock()) return
    if (!latest.counterOnly) handleCounterTimerInteraction()
    void commitCounterTransaction(latest.counters, latest.label + ' 되돌리기', latest.actualRow, latest.counterOnly ? undefined : latest.guides, false, undefined, undefined, undefined, undefined, latest.counterOnly === true).finally(releaseCounterActionLock)
  }

  function stepRepeatCounterAction(counterId: string, direction: -1 | 1) {
    const current = snapshotRef.current
    if (!current) return
    const currentCounters = normalizeCounterSnapshots(current.counters)
    const selected = currentCounters.find((counter) => counter.id === counterId && counter.kind === 'repeat')
    if (!selected || selected.kind !== 'repeat') return
    const result = stepRepeatCounter(currentCounters, counterId, direction)
    if (result.blocked) {
      const blockedLabel = repeatCounterBlockLabel(result.blocked)
      if (blockedLabel) setSuspendError(blockedLabel)
      else if (result.blocked === 'complete') setSuspendError(t('목표 반복 완료'))
      return
    }
    if (!acquireCounterActionLock()) return
    const label = selected.name + ' · ' + t(direction > 0 ? '반복 단 완료' : '반복 단 되돌리기')
    void commitCounterTransaction(result.counters, label, 0, undefined, true, undefined, undefined, undefined, undefined, true).finally(releaseCounterActionLock)
  }

  function stepAuxiliaryCounterAction(counterId: string, direction: -1 | 1) {
    const current = snapshotRef.current
    if (!current || !acquireCounterActionLock()) return
    const result = stepAuxiliaryCounter(normalizeCounterSnapshots(current.counters), counterId, direction)
    if (result.blocked) {
      releaseCounterActionLock()
      return
    }
    const selected = normalizeCounterSnapshots(current.counters).find((counter) => counter.id === counterId)
    handleCounterTimerInteraction()
    const label = (selected?.name ?? t('카운터')) + ' · ' + t(direction > 0 ? '보조 카운터 늘리기' : '보조 카운터 줄이기')
    void commitCounterTransaction(result.counters, label, 0, undefined, true, undefined, undefined, undefined, undefined, true).finally(releaseCounterActionLock)
  }

  function rewindCounter(baseId: string, targetRow: number) {
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
    handleCounterTimerInteraction()
    const operation = commitCounterTransaction(next, '단 되돌아가기', targetRow, restoreGuides, true, undefined, baseId)
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

  function notifyAnnotationLimit(kind: LimitedAnnotationKind) {
    setAnnotationLimitNotice(t('페이지당 {tool} 최대 {count}개까지 추가할 수 있습니다.', {
      tool: t(annotationToolLabelKeys[kind]),
      count: formatNumber(PAGE_ANNOTATION_LIMITS[kind]),
    }))
    if (annotationLimitNoticeTimerRef.current !== undefined) window.clearTimeout(annotationLimitNoticeTimerRef.current)
    annotationLimitNoticeTimerRef.current = window.setTimeout(() => {
      annotationLimitNoticeTimerRef.current = undefined
      setAnnotationLimitNotice('')
    }, 5000)
  }

  function canCreateLimitedAnnotation(pageNumber: number, kind: LimitedAnnotationKind) {
    const current = workRef.current[pageNumber]
    if (!current || !isAnnotationLimitReached(current, kind)) return Boolean(current)
    notifyAnnotationLimit(kind)
    return false
  }

  function recordPageWorkHistory(pageNumber: number, before: PageWorkRecord, after: PageWorkRecord, cellChanges?: ColorworkCellChange[]) {
    const action: WorkAction = cellChanges?.length ? { cellChanges } : { before, after }
    const state = historyRef.current.get(pageNumber) ?? { actions: [], cursor: 0, byteCosts: [] }
    const actions = state.actions.slice(0, state.cursor)
    const byteCosts = state.byteCosts.slice(0, state.cursor)
    actions.push(action)
    byteCosts.push(estimateHistoryActionBytes(action))
    while (actions.length > MAX_PAGE_HISTORY_ACTIONS) {
      actions.shift()
      byteCosts.shift()
    }
    updateHistory(pageNumber, { actions, cursor: actions.length, byteCosts })
  }

  function setPageWork(work: PageWorkRecord, immediate: boolean, recordHistory = false, historyBefore?: PageWorkRecord, cellChanges?: ColorworkCellChange[]): boolean {
    const current = workRef.current[work.pageNumber]
    if (!current) return false
    const additions = addedLimitedAnnotations(current, work)
    const hasLimitedChanges = additions.addedAnnotations.length > 0 || additions.updatedTextAnnotations.length > 0 || additions.addedRegions.length > 0
    const nextWork = hasLimitedChanges ? applyLimitedAnnotationAdditions(current, additions) : work
    const exceededKind = exceededAnnotationLimit(nextWork, additions.kinds)
    if (exceededKind) {
      notifyAnnotationLimit(exceededKind)
      return false
    }
    const newlyCreatedTextIds = additions.updatedTextAnnotations
      .filter((annotation) => !historyBefore?.annotations.some((before) => before.id === annotation.id))
      .map((annotation) => annotation.id)
    let before = historyBefore ?? current
    if (additions.addedAnnotations.some((annotation) => annotation.type === 'pen' || annotation.type === 'highlight') || additions.addedRegions.length) {
      before = current
    } else if (newlyCreatedTextIds.length) {
      const createdTextIds = new Set(newlyCreatedTextIds)
      before = { ...current, annotations: current.annotations.filter((annotation) => !createdTextIds.has(annotation.id)) }
    }
    touchPageWork(work.pageNumber)
    if (recordHistory) recordPageWorkHistory(work.pageNumber, before, nextWork, cellChanges)
    workRef.current = { ...workRef.current, [work.pageNumber]: nextWork }
    schedulePageWorksRender()
    void pageWorkPersistence.schedule(nextWork, immediate).catch((error: unknown) => {
      console.warn('[PDF] Page work could not be saved.', error)
      setSuspendError(pageWorkSaveErrorMessage)
    })
    return true
  }

  async function applyChartRowsWork(work: PageWorkRecord, before: PageWorkRecord) {
    if (!setPageWork(work, false, false)) return false
    const latest = workRef.current[work.pageNumber]
    if (!latest) return false
    try {
      await pageWorkPersistence.flush(latest)
      recordPageWorkHistory(work.pageNumber, before, latest)
      setSuspendError((error) => error === pageWorkSaveErrorMessage ? '' : error)
      return true
    } catch (error) {
      console.warn('[PDF] Chart row guide could not be saved.', error)
      setPageWork(before, false, false)
      const restored = workRef.current[before.pageNumber]
      if (restored) await pageWorkPersistence.flush(restored).catch(() => {})
      setSuspendError(pageWorkSaveErrorMessage)
      return false
    }
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
    if (!snapshot) return
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
    if (!Number.isInteger(pageNumber) || !pdf) return
    const selectedPages = visiblePageRange(visiblePageNumbers, gesture.pageNumber, pageNumber)
    if (selectedPages.length) setThumbnailSelection({ pages: selectedPages, anchor: gesture.pageNumber, lastPage: pageNumber })
  }

  function findThumbnailTouchDropTarget(gesture: ThumbnailTouchGesture) {
    const target = document.elementFromPoint(gesture.clientX, gesture.clientY)
    const labelGroup = target?.closest<HTMLElement>('[data-thumbnail-label-drop]')
    if (labelGroup) {
      const groupId = labelGroup.dataset.thumbnailLabelDrop ?? ''
      return canDropPagesIntoThumbnailGroup(gesture.draggedPages, groupId) ? { kind: 'label' as const, groupId, key: 'label-group:' + groupId } : undefined
    }
    const pageTarget = target?.closest<HTMLElement>('.page-thumbnail[data-page-number]')
    const targetPage = Number(pageTarget?.dataset.pageNumber)
    if (target && thumbnailRailRef.current?.contains(target) && canDropPagesOutsideGroups(gesture.draggedPages)) {
      return { kind: 'outside' as const, key: Number.isInteger(targetPage) ? 'outside-page:' + targetPage : 'outside-rail' }
    }
    return undefined
  }

  function updateThumbnailReorderFeedback(nextTarget: ThumbnailReorderTarget | undefined) {
    const next = nextTarget ?? null
    const current = thumbnailReorderFeedbackRef.current
    if (current?.kind === next?.kind && current?.itemKey === next?.itemKey && current?.position === next?.position) return
    thumbnailReorderFeedbackRef.current = next
    setThumbnailReorderFeedbackUi({ documentId: id, target: next })
  }

  function thumbnailReorderTargetAt(gesture: ThumbnailReorderGesture): ThumbnailReorderTarget | undefined {
    const root = gesture.scrollElement
    const bounds = root.getBoundingClientRect()
    if (gesture.clientX < bounds.left || gesture.clientX > bounds.right || gesture.clientY < bounds.top || gesture.clientY > bounds.bottom) return undefined
    const selector = gesture.kind === 'labels' ? '[data-thumbnail-order-label]' : '[data-thumbnail-rail-item]'
    const targetElement = document.elementFromPoint(gesture.clientX, gesture.clientY)?.closest<HTMLElement>(selector)
    const readTarget = (element: HTMLElement): ThumbnailReorderTarget | undefined => {
      const itemKey = gesture.kind === 'labels' ? 'group:' + (element.dataset.thumbnailOrderLabel ?? '') : element.dataset.thumbnailRailItem
      if (!itemKey || itemKey === gesture.sourceKey) return undefined
      const rect = element.getBoundingClientRect()
      return { kind: gesture.kind, itemKey, position: gesture.clientX < rect.left + rect.width / 2 ? 'before' : 'after' }
    }
    if (targetElement) return readTarget(targetElement)
    const candidates = [...root.querySelectorAll<HTMLElement>(selector)].filter((element) => {
      const itemKey = gesture.kind === 'labels' ? 'group:' + (element.dataset.thumbnailOrderLabel ?? '') : element.dataset.thumbnailRailItem
      return itemKey && itemKey !== gesture.sourceKey
    })
    if (!candidates.length) return undefined
    let closest = candidates[0]
    let closestDistance = Number.POSITIVE_INFINITY
    for (const candidate of candidates) {
      const rect = candidate.getBoundingClientRect()
      const distance = Math.abs(gesture.clientX - (rect.left + rect.width / 2))
      if (distance < closestDistance) {
        closest = candidate
        closestDistance = distance
      }
    }
    return readTarget(closest)
  }

  function createThumbnailReorderPreview(gesture: ThumbnailReorderGesture) {
    const bounds = gesture.sourceElement.getBoundingClientRect()
    const preview = document.createElement('div')
    preview.className = 'thumbnail-reorder-preview'
    preview.setAttribute('aria-hidden', 'true')
    preview.style.width = bounds.width + 'px'
    preview.style.height = bounds.height + 'px'
    const clone = gesture.sourceElement.cloneNode(true) as HTMLElement
    clone.classList.remove('thumbnail-reordering-source', 'thumbnail-order-before', 'thumbnail-order-after', 'drop-target')
    clone.classList.add('thumbnail-reorder-preview-content')
    clone.removeAttribute('data-thumbnail-rail-item')
    clone.removeAttribute('data-thumbnail-order-label')
    clone.removeAttribute('data-thumbnail-label-drop')
    clone.removeAttribute('aria-current')
    clone.removeAttribute('aria-pressed')
    clone.removeAttribute('aria-expanded')
    clone.removeAttribute('aria-haspopup')
    clone.tabIndex = -1
    const sourceCanvases = gesture.sourceElement.querySelectorAll('canvas')
    clone.querySelectorAll('canvas').forEach((canvas, index) => {
      const sourceCanvas = sourceCanvases[index]
      if (!sourceCanvas?.width || !sourceCanvas.height) return
      canvas.width = sourceCanvas.width
      canvas.height = sourceCanvas.height
      canvas.getContext('2d')?.drawImage(sourceCanvas, 0, 0)
    })
    if (clone instanceof HTMLButtonElement) clone.disabled = false
    preview.append(clone)
    document.body.append(preview)
    gesture.preview = preview
    positionThumbnailReorderPreview(gesture)
  }

  function positionThumbnailReorderPreview(gesture: ThumbnailReorderGesture) {
    if (!gesture.preview) return
    const left = clamp(gesture.clientX + 14, 8, Math.max(8, window.innerWidth - gesture.preview.offsetWidth - 8))
    const top = clamp(gesture.clientY + 14, 8, Math.max(8, window.innerHeight - gesture.preview.offsetHeight - 8))
    gesture.preview.style.transform = 'translate3d(' + left + 'px, ' + top + 'px, 0)'
  }

  function processThumbnailReorderFrame(gesture: ThumbnailReorderGesture) {
    gesture.frameId = undefined
    if (thumbnailReorderGestureRef.current !== gesture) return
    if (gesture.mode === 'scroll') {
      gesture.scrollElement.scrollLeft = gesture.startScrollLeft - (gesture.clientX - gesture.startX)
      return
    }
    if (gesture.mode !== 'drag') return
    positionThumbnailReorderPreview(gesture)
    gesture.target = thumbnailReorderTargetAt(gesture)
    updateThumbnailReorderFeedback(gesture.target)
    const bounds = gesture.scrollElement.getBoundingClientRect()
    const edge = 32
    const direction = gesture.clientX < bounds.left + edge ? -1 : gesture.clientX > bounds.right - edge ? 1 : 0
    if (direction) {
      gesture.scrollElement.scrollLeft += direction * 14
      gesture.frameId = window.requestAnimationFrame(() => processThumbnailReorderFrame(gesture))
    }
  }

  function scheduleThumbnailReorderFrame(gesture: ThumbnailReorderGesture) {
    if (gesture.frameId === undefined) gesture.frameId = window.requestAnimationFrame(() => processThumbnailReorderFrame(gesture))
  }

  function beginThumbnailReorder(kind: ThumbnailReorderGesture['kind'], sourceKey: string, event: ReactPointerEvent<HTMLButtonElement>, scrollElement: HTMLDivElement, sourceElement: HTMLElement) {
    if ((event.pointerType !== 'touch' && event.pointerType !== 'mouse') || event.button !== 0 || thumbnailGroupSavingRef.current || !scrollElement || thumbnailReorderGestureRef.current) return
    const gesture: ThumbnailReorderGesture = {
      kind,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      sourceKey,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: scrollElement.scrollLeft,
      clientX: event.clientX,
      clientY: event.clientY,
      button: event.currentTarget,
      sourceElement,
      scrollElement,
      mode: 'pending',
      timer: 0,
    }
    thumbnailReorderGestureRef.current = gesture
    try { gesture.button.setPointerCapture(event.pointerId) } catch { /* The browser may already have canceled this pointer. */ }
    gesture.timer = window.setTimeout(() => {
      if (thumbnailReorderGestureRef.current !== gesture || gesture.mode !== 'pending') return
      gesture.mode = 'drag'
      gesture.sourceElement.classList.add('thumbnail-reordering-source')
      createThumbnailReorderPreview(gesture)
      scheduleThumbnailReorderFrame(gesture)
    }, 450)
  }

  function moveThumbnailReorder(event: ReactPointerEvent<HTMLButtonElement>) {
    const gesture = thumbnailReorderGestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    gesture.clientX = event.clientX
    gesture.clientY = event.clientY
    if (gesture.mode === 'pending' && Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > 8) {
      window.clearTimeout(gesture.timer)
      gesture.mode = Math.abs(event.clientX - gesture.startX) >= Math.abs(event.clientY - gesture.startY) ? 'scroll' : 'cancel'
    }
    if (gesture.mode === 'scroll' || gesture.mode === 'drag') event.preventDefault()
    scheduleThumbnailReorderFrame(gesture)
  }

  function persistThumbnailReorder(gesture: ThumbnailReorderGesture, target: ThumbnailReorderTarget) {
    if (gesture.kind === 'labels') {
      const sourceId = gesture.sourceKey.slice('group:'.length)
      const targetId = target.itemKey.slice('group:'.length)
      const nextGroups = [...thumbnailGroups]
      const sourceIndex = nextGroups.findIndex((group) => group.id === sourceId)
      if (sourceIndex < 0 || sourceId === targetId) return
      const [source] = nextGroups.splice(sourceIndex, 1)
      const targetIndex = nextGroups.findIndex((group) => group.id === targetId)
      if (targetIndex < 0) return
      nextGroups.splice(targetIndex + (target.position === 'after' ? 1 : 0), 0, source)
      if (nextGroups.every((group, index) => group.id === thumbnailGroups[index]?.id)) return
      void saveThumbnailGroups(nextGroups)
      return
    }
    if (!snapshot || !pdf) return
    const order = normalizeThumbnailRailOrder(snapshot.thumbnailRailOrder, pdf.numPages, thumbnailGroups)
    const nextOrder = moveThumbnailRailItem(order, gesture.sourceKey, target.itemKey, target.position)
    if (nextOrder.length !== order.length || nextOrder.some((item, index) => thumbnailRailOrderKey(item) !== thumbnailRailOrderKey(order[index]))) void saveThumbnailGroups(thumbnailGroups, nextOrder)
  }

  function finishThumbnailReorder(event: ReactPointerEvent<HTMLButtonElement>, canceled = false) {
    const gesture = thumbnailReorderGestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    window.clearTimeout(gesture.timer)
    if (gesture.frameId !== undefined) window.cancelAnimationFrame(gesture.frameId)
    if (!canceled && gesture.mode === 'drag') gesture.target = thumbnailReorderTargetAt(gesture)
    const shouldSuppressClick = canceled || gesture.mode !== 'pending'
    gesture.sourceElement.classList.remove('thumbnail-reordering-source')
    gesture.preview?.remove()
    thumbnailReorderGestureRef.current = null
    updateThumbnailReorderFeedback(undefined)
    if (shouldSuppressClick) {
      suppressThumbnailClickRef.current = true
      window.setTimeout(() => { suppressThumbnailClickRef.current = false }, 0)
    }
    if (!canceled && gesture.mode === 'drag' && gesture.target) persistThumbnailReorder(gesture, gesture.target)
    try {
      if (gesture.button.hasPointerCapture(event.pointerId)) gesture.button.releasePointerCapture(event.pointerId)
    } catch { /* The browser may already have released the pointer. */ }
  }

  function beginThumbnailMouseDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse' || event.button !== 0 || event.ctrlKey || event.shiftKey) return
    if ((event.target as HTMLElement).closest('.page-thumbnail, .thumbnail-label-group-card')) return
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

  function setThumbnailDraggingVisuals(pageNumbers: number[], dragging: boolean) {
    const rail = thumbnailRailRef.current
    if (!rail) return
    for (const pageNumber of pageNumbers) {
      rail.querySelector<HTMLElement>('.page-thumbnail[data-page-number="' + pageNumber + '"]')?.classList.toggle('dragging-source', dragging)
    }
  }

  function positionThumbnailDragPreview(gesture: ThumbnailTouchGesture) {
    const preview = gesture.dragPreview
    if (!preview) return
    const left = clamp(gesture.clientX + 14, 8, Math.max(8, window.innerWidth - preview.offsetWidth - 8))
    const top = clamp(gesture.clientY + 14, 8, Math.max(8, window.innerHeight - preview.offsetHeight - 8))
    preview.style.transform = 'translate3d(' + left + 'px, ' + top + 'px, 0)'
  }

  function createThumbnailDragPreview(gesture: ThumbnailTouchGesture) {
    const rail = thumbnailRailRef.current
    const source = rail?.querySelector<HTMLButtonElement>('.page-thumbnail[data-page-number="' + gesture.pageNumber + '"]')
    if (!source) return
    const bounds = source.getBoundingClientRect()
    const preview = document.createElement('div')
    preview.className = 'thumbnail-drag-preview' + (gesture.draggedPages.length > 1 ? ' multiple' : '')
    preview.setAttribute('aria-hidden', 'true')
    preview.style.width = bounds.width + 'px'
    preview.style.height = bounds.height + 'px'

    const clone = source.cloneNode(true) as HTMLButtonElement
    clone.classList.remove('dragging-source', 'drop-target-group', 'drop-target-outside')
    clone.classList.add('thumbnail-drag-preview-card')
    clone.removeAttribute('data-page-number')
    clone.removeAttribute('aria-current')
    clone.removeAttribute('aria-pressed')
    clone.tabIndex = -1
    clone.querySelector('.thumbnail-observer')?.remove()
    const sourceCanvases = source.querySelectorAll('canvas')
    clone.querySelectorAll('canvas').forEach((canvas, index) => {
      const sourceCanvas = sourceCanvases[index]
      if (!sourceCanvas?.width || !sourceCanvas.height) return
      canvas.width = sourceCanvas.width
      canvas.height = sourceCanvas.height
      canvas.getContext('2d')?.drawImage(sourceCanvas, 0, 0)
    })
    preview.append(clone)

    if (gesture.draggedPages.length > 1) {
      const count = document.createElement('span')
      count.className = 'thumbnail-drag-preview-count'
      count.textContent = '×' + gesture.draggedPages.length
      preview.append(count)
    }

    document.body.append(preview)
    gesture.dragPreview = preview
    positionThumbnailDragPreview(gesture)
  }

  function beginThumbnailTouch(pageNumber: number, event: ReactPointerEvent<HTMLButtonElement>) {
    if ((event.pointerType !== 'touch' && event.pointerType !== 'mouse') || event.button !== 0 || event.ctrlKey || event.shiftKey || thumbnailGroupSaving || !thumbnailRailRef.current) return
    const selectedPages = thumbnailPagesForDrag(selectedThumbnailPages, pageNumber)
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
    if (gesture.mode === 'pending' && Math.hypot(deltaX, deltaY) > 8) {
      window.clearTimeout(gesture.timer)
      gesture.mode = gesture.pointerType === 'mouse' || selectedThumbnailSet.has(gesture.pageNumber) ? 'drag' : 'scroll'
      if (gesture.mode === 'drag') {
        setThumbnailDraggingVisuals(gesture.draggedPages, true)
        createThumbnailDragPreview(gesture)
      }
    }
    if (gesture.mode === 'scroll' && Math.abs(deltaX) > Math.abs(deltaY)) event.preventDefault()
    if (gesture.mode === 'drag' || gesture.mode === 'select') event.preventDefault()
    if (gesture.frameId === undefined) gesture.frameId = window.requestAnimationFrame(() => processThumbnailTouchFrame(gesture))
  }

  function processThumbnailTouchFrame(gesture: ThumbnailTouchGesture) {
    gesture.frameId = undefined
    if (thumbnailTouchGestureRef.current !== gesture) return
    const rail = thumbnailRailRef.current
    if (!rail) return
    if (gesture.mode === 'drag') positionThumbnailDragPreview(gesture)
    if (gesture.mode === 'scroll') {
      const deltaX = gesture.clientX - gesture.startX
      const deltaY = gesture.clientY - gesture.startY
      if (Math.abs(deltaX) > Math.abs(deltaY)) rail.scrollLeft = gesture.startScrollLeft - deltaX
      return
    }
    if (gesture.mode === 'select') updateThumbnailRange(gesture)
    if (gesture.mode !== 'drag' && gesture.mode !== 'select') return
    let edgeDirection = 0
    if (gesture.mode === 'drag') {
      gesture.dropTarget = findThumbnailTouchDropTarget(gesture)
      updateThumbnailDropTarget(gesture.dropTarget?.key ?? null)
      if (gesture.dropTarget?.kind === 'label') {
        const list = thumbnailGroupListRef.current
        const bounds = list?.getBoundingClientRect()
        edgeDirection = bounds ? gesture.clientX < bounds.left + 30 ? -1 : gesture.clientX > bounds.right - 30 ? 1 : 0 : 0
        if (edgeDirection && list) list.scrollLeft += edgeDirection * 14
      }
    }
    if (!edgeDirection) {
      const bounds = rail.getBoundingClientRect()
      edgeDirection = gesture.clientX < bounds.left + 36 ? -1 : gesture.clientX > bounds.right - 36 ? 1 : 0
      if (edgeDirection) rail.scrollLeft += edgeDirection * 16
    }
    if (gesture.mode === 'select' && edgeDirection) updateThumbnailRange(gesture)
    if (edgeDirection) gesture.frameId = window.requestAnimationFrame(() => processThumbnailTouchFrame(gesture))
  }

  function finishThumbnailTouch(event: ReactPointerEvent<HTMLButtonElement>, canceled = false) {
    const gesture = thumbnailTouchGestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    window.clearTimeout(gesture.timer)
    if (gesture.frameId !== undefined) window.cancelAnimationFrame(gesture.frameId)
    if (!canceled && gesture.mode === 'drag') gesture.dropTarget = findThumbnailTouchDropTarget(gesture)
    setThumbnailDraggingVisuals(gesture.draggedPages, false)
    gesture.dragPreview?.remove()
    thumbnailTouchGestureRef.current = null
    if (canceled) updateThumbnailDropTarget(null)
    if (canceled && gesture.mode !== 'pending') {
      suppressThumbnailClickRef.current = true
      window.setTimeout(() => { suppressThumbnailClickRef.current = false }, 0)
    }
    if (!canceled && gesture.mode !== 'pending') {
      suppressThumbnailClickRef.current = true
      window.setTimeout(() => { suppressThumbnailClickRef.current = false }, 0)
      if (gesture.mode === 'drag' && gesture.dropTarget?.kind === 'label') {
        void movePagesToThumbnailGroupTarget(gesture.draggedPages, gesture.dropTarget.groupId)
      } else if (gesture.mode === 'drag' && gesture.dropTarget?.kind === 'outside') {
        void ungroupThumbnailPages(gesture.draggedPages)
      }
    }
    updateThumbnailDropTarget(null)
    if (gesture.button.hasPointerCapture(event.pointerId)) gesture.button.releasePointerCapture(event.pointerId)
  }

  function toggleThumbnailAccordion() {
    if (!thumbnailCollapsed) {
      collapseExpandedThumbnailGroup()
      thumbnailScrollRef.current = thumbnailRailRef.current?.scrollLeft ?? thumbnailScrollRef.current
      window.clearTimeout(thumbnailScrollTimerRef.current)
      thumbnailScrollTimerRef.current = undefined
      setThumbnailRenderingPaused(false)
      setThumbnailRailScrolling(false)
      const gesture = thumbnailTouchGestureRef.current
      if (gesture) {
        window.clearTimeout(gesture.timer)
        if (gesture.frameId !== undefined) window.cancelAnimationFrame(gesture.frameId)
        setThumbnailDraggingVisuals(gesture.draggedPages, false)
        gesture.dragPreview?.remove()
        thumbnailTouchGestureRef.current = null
        if (gesture.button.hasPointerCapture(gesture.pointerId)) gesture.button.releasePointerCapture(gesture.pointerId)
      }
    }
    setThumbnailCollapsed((current) => !current)
  }

  function handleThumbnailScroll(event: ReactUIEvent<HTMLDivElement>) {
    thumbnailScrollRef.current = event.currentTarget.scrollLeft
    setThumbnailRailScrolling(true)
    if (tabletResourcePolicy) setThumbnailRenderingPaused(true)
    window.clearTimeout(thumbnailScrollTimerRef.current)
    thumbnailScrollTimerRef.current = window.setTimeout(() => {
      thumbnailScrollTimerRef.current = undefined
      setThumbnailRailScrolling(false)
      if (tabletResourcePolicy) setThumbnailRenderingPaused(false)
    }, 200)
  }

  function handleThumbnailSelect(pageNumber: number, event: ReactMouseEvent<HTMLButtonElement>) {
    if (suppressThumbnailClickRef.current) {
      suppressThumbnailClickRef.current = false
      event.preventDefault()
      return
    }
    if (thumbnailGroupSaving) return
    if (event.shiftKey) {
      event.preventDefault()
      setThumbnailSelection((current) => {
        const anchor = current?.anchor ?? snapshot?.[snapshot.activePane].page ?? pageNumber
        const allPages = Array.from({ length: pdf?.numPages ?? 0 }, (_, index) => index + 1)
        const range = visiblePageRange(allPages, anchor, pageNumber)
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

  async function toggleBookmark() {
    if (!snapshot) return
    await setPageFlag(id, activePage, 'bookmarked', !isBookmarked)
    setPages(await getPages(id))
  }

  function toggleFocusView() {
    if (focusView) {
      setFocusViewUi({ documentId: id, enabled: false })
      window.requestAnimationFrame(() => desktopFocusTriggerRef.current?.focus())
      return
    }
    if (focusViewBlocked) return
    setHeaderMoreOpen(false)
    setFooterMoreOpen(false)
    setZoomMenuOpen(false)
    setMiniBarSettingsOpen(false)
    setThumbnailGroupPopover(null)
    onWorkTimeRecordOpenChange(false)
    onWorkTimePanelBlockingChange(false)
    setFocusViewUi({ documentId: id, enabled: true })
    window.requestAnimationFrame(() => focusRestoreButtonRef.current?.focus())
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
    if (event.pointerType === 'touch' || event.pointerType === 'mouse' && event.button !== 0) return
    const shell = viewerShellRef.current
    const bar = event.currentTarget.closest<HTMLElement>('.viewer-timer-bar')
    if (!shell || !bar) return
    event.preventDefault()
    const shellRect = shell.getBoundingClientRect()
    const barRect = bar.getBoundingClientRect()
    const left = clamp(barRect.left - shellRect.left, 0, Math.max(0, shellRect.width - barRect.width))
    const minTop = window.matchMedia('(max-width: 600px)').matches ? 44 : 0
    const top = clamp(barRect.top - shellRect.top, minTop, Math.max(minTop, shellRect.height - barRect.height))
    setTimerBarState({ documentId: id, left, top })
    bar.style.left = left + 'px'
    bar.style.top = top + 'px'
    bar.style.right = 'auto'
    timerBarDragRef.current = { pointerId: event.pointerId, offsetX: event.clientX - barRect.left, offsetY: event.clientY - barRect.top, startX: event.clientX, startY: event.clientY, bar, shell, clientX: event.clientX, clientY: event.clientY, frameId: null }
    bar.classList.add('is-dragging')
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveTimerBarDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = timerBarDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (event.currentTarget.classList.contains('viewer-timer-restore') && viewerPopupDragMoved(drag.startX, drag.startY, event.clientX, event.clientY)) timerBarClickSuppressUntilRef.current = Date.now() + 700
    scheduleTimerBarPosition(drag, event.clientX, event.clientY)
  }

  function finishTimerBarDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    finishTimerBarDragById(event.pointerId, event.clientX, event.clientY)
  }

  function applyTimerBarPosition(drag: TimerBarDrag, clientX: number, clientY: number) {
    const shellRect = drag.shell.getBoundingClientRect()
    const left = clamp(clientX - shellRect.left - drag.offsetX, 0, Math.max(0, shellRect.width - drag.bar.getBoundingClientRect().width))
    const minTop = window.matchMedia('(max-width: 600px)').matches ? 44 : 0
    const top = clamp(clientY - shellRect.top - drag.offsetY, minTop, Math.max(minTop, shellRect.height - drag.bar.getBoundingClientRect().height))
    drag.bar.style.left = left + 'px'
    drag.bar.style.top = top + 'px'
    drag.bar.style.right = 'auto'
    return { left, top }
  }

  function scheduleTimerBarPosition(drag: TimerBarDrag, clientX: number, clientY: number) {
    drag.clientX = clientX
    drag.clientY = clientY
    if (drag.frameId !== null) return
    drag.frameId = requestAnimationFrame(() => {
      drag.frameId = null
      if (timerBarDragRef.current === drag) applyTimerBarPosition(drag, drag.clientX, drag.clientY)
    })
  }

  function startTimerBarDrag(pointerId: number, bar: HTMLElement, shell: HTMLElement, clientX: number, clientY: number) {
    const shellRect = shell.getBoundingClientRect()
    const barRect = bar.getBoundingClientRect()
    const left = clamp(barRect.left - shellRect.left, 0, Math.max(0, shellRect.width - barRect.width))
    const minTop = window.matchMedia('(max-width: 600px)').matches ? 44 : 0
    const top = clamp(barRect.top - shellRect.top, minTop, Math.max(minTop, shellRect.height - barRect.height))
    setTimerBarState({ documentId: id, left, top })
    bar.style.left = left + 'px'
    bar.style.top = top + 'px'
    bar.style.right = 'auto'
    bar.classList.add('is-dragging')
    timerBarDragRef.current = { pointerId, offsetX: clientX - barRect.left, offsetY: clientY - barRect.top, startX: clientX, startY: clientY, bar, shell, clientX, clientY, frameId: null }
  }

  function finishTimerBarDragById(pointerId: number, clientX?: number, clientY?: number) {
    const drag = timerBarDragRef.current
    if (!drag || drag.pointerId !== pointerId) return
    if (drag.frameId !== null) cancelAnimationFrame(drag.frameId)
    drag.frameId = null
    const pointX = clientX ?? drag.clientX
    const pointY = clientY ?? drag.clientY
    const position = applyTimerBarPosition(drag, pointX, pointY)
    drag.bar.classList.remove('is-dragging')
    setTimerBarState({ documentId: id, ...position })
    timerBarDragRef.current = null
  }

  function beginTimerBarTouchPress(event: ReactPointerEvent<HTMLDivElement>) {
    if (touchTablet || event.pointerType !== 'touch') return
    const target = event.target instanceof HTMLElement ? event.target : null
    if (!target || !target.closest('.viewer-floating-drag-handle, .viewer-timer-restore') || target.closest('input,textarea,select,[contenteditable="true"],.viewer-counter-details,.viewer-timer-resize-handle')) return
    const shell = viewerShellRef.current
    if (!shell) return
    const bar = event.currentTarget
    const press: TimerBarPress = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, bar, shell, timerId: 0, active: false, cleanup: () => undefined }
    const cleanup = () => {
      window.clearTimeout(press.timerId)
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', finish, true)
      window.removeEventListener('pointercancel', finish, true)
      window.removeEventListener('resize', cancel, true)
      bar.removeEventListener('lostpointercapture', finish)
      if (timerBarPressRef.current === press) timerBarPressRef.current = null
    }
    const move = (pointer: PointerEvent) => {
      if (pointer.pointerId !== press.pointerId) return
      if (!press.active && Math.hypot(pointer.clientX - press.startX, pointer.clientY - press.startY) > 8) {
        cleanup()
        return
      }
      if (press.active) {
        const drag = timerBarDragRef.current
        if (drag?.pointerId === press.pointerId) scheduleTimerBarPosition(drag, pointer.clientX, pointer.clientY)
      }
    }
    const finish = (pointer: Event) => {
      if ('pointerId' in pointer && pointer.pointerId !== press.pointerId) return
      if (press.active) {
        const point = pointer instanceof PointerEvent ? pointer : undefined
        finishTimerBarDragById(press.pointerId, point?.clientX, point?.clientY)
      }
      cleanup()
    }
    const cancel = () => finish(new Event('cancel'))
    press.cleanup = cleanup
    timerBarPressRef.current = press
    press.timerId = window.setTimeout(() => {
      if (timerBarPressRef.current !== press) return
      press.active = true
      timerBarClickSuppressUntilRef.current = Date.now() + 700
      startTimerBarDrag(press.pointerId, bar, shell, press.startX, press.startY)
      try { bar.setPointerCapture(press.pointerId) } catch { /* Window listeners retain the drag if capture is unavailable. */ }
    }, 450)
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', finish, true)
    window.addEventListener('pointercancel', finish, true)
    window.addEventListener('resize', cancel, true)
    bar.addEventListener('lostpointercapture', finish)
  }

  function applyTimerPopupResize(rect: ViewerPopupRect) {
    const shell = viewerShellRef.current
    const bar = shell?.querySelector<HTMLElement>('.viewer-timer-bar')
    if (!shell || !bar) return
    const shellRect = shell.getBoundingClientRect()
    bar.style.left = rect.left - shellRect.left + 'px'
    bar.style.top = rect.top - shellRect.top + 'px'
    bar.style.right = 'auto'
    bar.style.width = rect.width + 'px'
    bar.style.height = rect.height + 'px'
    bar.style.maxWidth = 'none'
    bar.style.maxHeight = 'none'
    bar.dataset.popupSize = getViewerPopupSizeClass(rect.width)
    bar.classList.add('positioned')
  }

  function applyTimerPopupDrag(rect: ViewerPopupRect) {
    const shell = viewerShellRef.current
    const bar = timerBarRef.current
    if (!shell || !bar) return
    const shellRect = shell.getBoundingClientRect()
    bar.style.left = rect.left - shellRect.left + 'px'
    bar.style.top = rect.top - shellRect.top + 'px'
    bar.style.right = 'auto'
    bar.classList.add('positioned')
  }

  const timerTabletDrag = useViewerPopupDrag({
    enabled: touchTablet && !reportMode,
    elementRef: timerBarRef,
    getBounds: () => {
      const shell = viewerShellRef.current
      return shell ? readViewerPopupAvailableBounds(shell) : null
    },
    onStart: (rect) => {
      timerTabletDragActiveRef.current = true
      const shellRect = viewerShellRef.current?.getBoundingClientRect()
      if (shellRect) setTimerBarState({ documentId: id, left: rect.left - shellRect.left, top: rect.top - shellRect.top })
      timerBarRef.current?.classList.add('is-dragging')
      applyTimerPopupDrag(rect)
    },
    onApply: applyTimerPopupDrag,
    onCommit: (rect, bounds, moved) => {
      timerTabletDragActiveRef.current = false
      const shellRect = viewerShellRef.current?.getBoundingClientRect()
      if (shellRect) setTimerBarState({ documentId: id, left: rect.left - shellRect.left, top: rect.top - shellRect.top })
      const position = createViewerToolPosition(bounds, rect)
      if (moved && !timerMinimized && position) {
        saveViewerToolPosition('timerBar', position)
        setPreferredTimerPosition(position)
      }
      if (moved) timerBarClickSuppressUntilRef.current = Date.now() + 700
      timerBarRef.current?.classList.remove('is-dragging')
    },
    onCancel: (rect) => {
      timerTabletDragActiveRef.current = false
      const shellRect = viewerShellRef.current?.getBoundingClientRect()
      if (shellRect) setTimerBarState({ documentId: id, left: rect.left - shellRect.left, top: rect.top - shellRect.top })
      applyTimerPopupDrag(rect)
      timerBarRef.current?.classList.remove('is-dragging')
    },
  })

  function handleTimerBarDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (touchTablet) timerTabletDrag.onPointerDown(event)
    else beginTimerBarDrag(event)
  }

  function minimizeTimerPopover() {
    const shell = viewerShellRef.current
    const bar = timerBarRef.current
    if (shell && bar) {
      const shellRect = shell.getBoundingClientRect()
      const barRect = bar.getBoundingClientRect()
      setTimerBarState({ documentId: id, left: barRect.left - shellRect.left, top: barRect.top - shellRect.top })
    }
    setTimerMinimizedUi({ documentId: id, minimized: true })
  }

  function restoreTimerPopover() {
    if (!timerMinimized) return
    timerRestorePositionRef.current = touchTablet && !reportMode
    setTimerMinimizedUi({ documentId: id, minimized: false })
  }

  function beginTimerRestorePointer(event: ReactPointerEvent<HTMLButtonElement>) {
    timerRestorePointerRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false }
    handleTimerBarDrag(event)
  }

  function moveTimerRestorePointer(event: ReactPointerEvent<HTMLButtonElement>) {
    const pointer = timerRestorePointerRef.current
    if (pointer?.pointerId === event.pointerId && viewerPopupDragMoved(pointer.startX, pointer.startY, event.clientX, event.clientY)) pointer.moved = true
    moveTimerBarDrag(event)
  }

  function finishTimerRestorePointer(event: ReactPointerEvent<HTMLButtonElement>) {
    const pointer = timerRestorePointerRef.current
    if (pointer?.pointerId === event.pointerId && viewerPopupDragMoved(pointer.startX, pointer.startY, event.clientX, event.clientY)) pointer.moved = true
    finishTimerBarDrag(event)
    if (pointer?.pointerId === event.pointerId) {
      if (pointer.moved) timerBarClickSuppressUntilRef.current = Date.now() + 700
      else restoreTimerPopover()
      timerRestorePointerRef.current = null
    }
  }

  function cancelTimerRestorePointer(event: ReactPointerEvent<HTMLButtonElement>) {
    finishTimerBarDrag(event)
    if (timerRestorePointerRef.current?.pointerId === event.pointerId) timerRestorePointerRef.current = null
  }

  function beginTimerPopupResize(rect: ViewerPopupRect) {
    timerTabletDrag.cancel()
    timerBarPressRef.current?.cleanup()
    const drag = timerBarDragRef.current
    if (drag?.frameId !== null && drag?.frameId !== undefined) cancelAnimationFrame(drag.frameId)
    drag?.bar.classList.remove('is-dragging')
    timerBarDragRef.current = null
    timerBarResizeActiveRef.current = true
    const shellRect = viewerShellRef.current?.getBoundingClientRect()
    if (shellRect) setTimerBarState({ documentId: id, left: rect.left - shellRect.left, top: rect.top - shellRect.top })
  }

  function getTimerPopupMinimumHeight() {
    const bar = viewerShellRef.current?.querySelector<HTMLElement>('.viewer-timer-bar')
    if (!bar) return 180
    const topRows = ['.viewer-counter-tools', '.viewer-timer-portal-host']
      .map((selector) => bar.querySelector<HTMLElement>(selector)?.getBoundingClientRect().height ?? 0)
    const detailsHeader = bar.querySelector<HTMLElement>('.viewer-counter-details-header')?.getBoundingClientRect().height ?? 44
    return Math.ceil(Math.max(...topRows, 44) + detailsHeader + 96 + 44 + 24)
  }

  const timerResizeHandleProps = useViewerPopupResize({
    enabled: coarsePointer && !reportMode && counterDetailsExpanded,
    elementRef: timerBarRef,
    getBounds: () => {
      const shell = viewerShellRef.current
      return shell ? readViewerPopupAvailableBounds(shell) : null
    },
    getMinWidth: () => touchTablet ? 480 : 260,
    getMinHeight: getTimerPopupMinimumHeight,
    onStart: beginTimerPopupResize,
    onApply: applyTimerPopupResize,
    onCommit: (rect) => {
      timerBarResizeActiveRef.current = false
      const size = { width: rect.width, height: rect.height }
      setDisplayedTimerSize(size)
      saveViewerToolSize('timerBar', size)
      setPreferredTimerSize(size)
      const shell = viewerShellRef.current
      const bounds = shell ? readViewerPopupAvailableBounds(shell) : null
      const position = bounds ? createViewerToolPosition(bounds, rect) : null
      if (touchTablet && position) {
        saveViewerToolPosition('timerBar', position)
        setPreferredTimerPosition(position)
      }
      const shellRect = viewerShellRef.current?.getBoundingClientRect()
      if (shellRect) setTimerBarState({ documentId: id, left: rect.left - shellRect.left, top: rect.top - shellRect.top })
    },
    onCancel: (rect) => {
      timerBarResizeActiveRef.current = false
      applyTimerPopupResize(rect)
    },
  })

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

  function selectViewerTool(nextTool: AnnotationTool) {
    setTool(nextTool)
  }

  function applyColorworkSettings(settings: ColorworkSettings) {
    if (!colorworkEnabled || !snapshot || colorworkRequest) return false
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
    selectViewerTool('pan')
    return true
  }

  function finishColorworkRequest(requestId: string) {
    setColorworkRequest((current) => current?.id === requestId ? null : current)
  }

  function toggleColorworkVisibility() {
    if (!colorworkEnabled || !activeColorworkGrid) return
    const before = workRef.current[activePage] ?? activeWork
    setPageWork({ ...before, colorworkGrid: { ...activeColorworkGrid, visible: !activeColorworkGrid.visible } }, true, true, before)
  }

  function renderPane(paneId: PaneId, pane: PaneSnapshot, active: boolean) {
    const work = pageWorks[pane.page] ?? blankWork(id, pane.page)
    const loadState = pageWorkLoadEntries[pane.page]
    const rotation = pane.rotations?.[pane.page] ?? work.rotation ?? 0
    const style = tool === 'region-highlight' ? annotationSettings.highlight : tool === 'pen' || tool === 'line' || tool === 'highlight' || tool === 'text' ? annotationSettings[tool] : annotationSettings.pen
    return <PdfPage
      key={id + ':' + paneId + ':' + pane.page}
      pdf={pdf!}
      page={pane.page}
      paneId={paneId}
      pane={pane}
      paneGestureOwnerRef={paneGestureOwnerRef}
      splitView={Boolean(snapshot?.split)}
      rotation={rotation}
      active={active}
      tool={tool}
      lineSettings={progressSettings}
      counters={counters}
      mainCounterId={mainCounter?.id ?? ''}
      annotationStyle={style}
      work={work}
      colorworkEnabled={colorworkEnabled}
      workReady={Boolean(pageWorks[pane.page])}
      canCreateLimitedAnnotation={(kind) => canCreateLimitedAnnotation(pane.page, kind)}
      pageWorkLoadError={loadState?.status === 'error' ? loadState.message : undefined}
      onRetryPageWork={() => { void ensurePageWork(pane.page) }}
      recognitionError={Boolean(recognitionErrorPages[pane.page])}
      onRetryRecognition={() => retryPageRecognition(pane.page)}
      createColorworkRequest={colorworkEnabled && colorworkRequest?.paneId === paneId && colorworkRequest.pageNumber === pane.page ? colorworkRequest : null}
      colorworkBrushColor={colorworkBrushColor}
      colorworkBrushOpacity={colorworkBrushOpacity}
      colorworkEraser={colorworkEraser}
      onActivate={() => {
        if (miniBarSettingsOpen) setMiniBarSettingsOpen(false)
        if (closeMiniBarOnPdfActionRef.current) {
          closeMiniBarOnPdfActionRef.current = false
          setMiniBarState((current) => current.documentId === id ? { ...current, open: false } : current)
        }
        if (!active) mutateSnapshot((current) => ({ ...current, activePane: paneId }))
      }}
      onWorkChange={setPageWork}
      onChartRowsApply={applyChartRowsWork}
      onCenter={(x, y) => saveCenter(paneId, x, y)}
      onZoom={(zoom) => changePane(paneId, (current) => ({ ...current, zoom }), true)}
      onColorworkRequestHandled={finishColorworkRequest}
      onTextToolConsumed={() => setTool('pan')}
      onRegionHighlightToolConsumed={() => setTool('pan')}
      pageLinks={pdfLinksByPage[pane.page]}
      qrLinks={qrLinksByPage[pane.page]}
      textStylePortalTarget={textStylePortalTarget}
      onPageRendered={onPageRendered}
    />
  }

  const displayedRatio = splitPreview ?? ratio
  const pageRecords = useMemo(() => new Map(pages.map((page) => [page.pageNumber, page])), [pages])
  const thumbnailGroupByPage = useMemo(() => {
    const memberships = new Map<number, string>()
    thumbnailGroups.forEach((group) => group.pageNumbers.forEach((pageNumber) => memberships.set(pageNumber, group.id)))
    return memberships
  }, [thumbnailGroups])
  const thumbnailItems = useMemo(() => pdf ? compactPageThumbnails(pdf.numPages, thumbnailGroups, expandedThumbnailGroupId, snapshot?.thumbnailRailOrder) : [], [pdf, thumbnailGroups, expandedThumbnailGroupId, snapshot?.thumbnailRailOrder])

  function canDropPagesOutsideGroups(pageNumbers: number[]) {
    return pageNumbers.some((pageNumber) => thumbnailGroupByPage.has(pageNumber))
  }

  function canDropPagesIntoThumbnailGroup(pageNumbers: number[], targetGroupId: string) {
    return thumbnailGroups.some((group) => group.id === targetGroupId) && pageNumbers.some((pageNumber) => thumbnailGroupByPage.get(pageNumber) !== targetGroupId)
  }

  async function saveThumbnailGroups(nextGroups: ThumbnailGroup[], requestedRailOrder?: ThumbnailRailOrderItem[]) {
    if (thumbnailGroupSavingRef.current) return false
    const current = snapshotRef.current
    if (!current) return false
    const pageCount = pdf?.numPages ?? 0
    const currentGroups = current.thumbnailGroups ?? EMPTY_THUMBNAIL_GROUPS
    const nextRailOrder = requestedRailOrder
      ? normalizeThumbnailRailOrder(requestedRailOrder, pageCount, nextGroups)
      : reconcileThumbnailRailOrder(current.thumbnailRailOrder, currentGroups, nextGroups, pageCount)
    thumbnailGroupSavingRef.current = true
    setThumbnailGroupSaving(true)
    setThumbnailGroupError('')
    if (saveTimer.current !== undefined) window.clearTimeout(saveTimer.current)
    saveTimer.current = undefined
    const optimistic = { ...current, thumbnailGroups: nextGroups, thumbnailRailOrder: nextRailOrder }
    snapshotRef.current = optimistic
    setSnapshot(optimistic)
    const operation = (async () => {
      try {
        await saveViewer(optimistic)
        setSuspendError((message) => message === viewerSaveErrorMessage ? '' : message)
        return true
      } catch (error) {
        const latest = snapshotRef.current ?? optimistic
        const rollback = { ...latest, thumbnailGroups: current.thumbnailGroups, thumbnailRailOrder: current.thumbnailRailOrder }
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
    })()
    thumbnailGroupSavePromiseRef.current = operation
    try {
      return await operation
    } finally {
      if (thumbnailGroupSavePromiseRef.current === operation) thumbnailGroupSavePromiseRef.current = null
    }
  }

  function openThumbnailGroupDialog(pageNumbers?: number[]) {
    setThumbnailGroupTarget(pageNumbers?.length ? { documentId: id, pages: [...pageNumbers] } : null)
    setThumbnailGroupDraft('')
    setThumbnailGroupError('')
    setThumbnailGroupDialog(true)
  }

  function closeThumbnailGroupDialog() {
    if (thumbnailGroupSavingRef.current) return
    setThumbnailGroupDialog(false)
    setThumbnailGroupTarget(null)
    setThumbnailGroupError('')
  }

  async function createThumbnailGroup(event?: ReactFormEvent<HTMLFormElement>) {
    event?.preventDefault()
    const name = thumbnailGroupDraft.trim()
    if (!name) {
      setThumbnailGroupError(t('그룹 이름은 비워 둘 수 없습니다.'))
      return
    }
    if (name.length > 100) return
    const current = snapshotRef.current
    if (!current || thumbnailGroupTarget && thumbnailGroupTarget.documentId !== id) return
    const selectedPages = thumbnailGroupTarget?.pages ?? []
    const group = { id: createThumbnailGroupId(), name, pageNumbers: [] as number[] }
    const currentGroups = current.thumbnailGroups ?? EMPTY_THUMBNAIL_GROUPS
    const created = selectedPages.length
      ? createThumbnailGroupFromPages(currentGroups, current.thumbnailRailOrder, selectedPages, group, pdf?.numPages ?? 0)
      : { groups: [...currentGroups, group], railOrder: undefined }
    if (selectedPages.length && !created.groups.some((item) => item.id === group.id)) return
    if (await saveThumbnailGroups(created.groups, created.railOrder)) {
      if (selectedPages.length) {
        if (pdf) setThumbnailPagesExcluded(pdf, selectedPages, true)
        if (expandedThumbnailGroupId && !created.groups.some((item) => item.id === expandedThumbnailGroupId)) {
          setThumbnailGroupState((state) => ({ ...state, expandedGroupId: null }))
        }
        setThumbnailSelection(null)
      }
      setThumbnailGroupDialog(false)
      setThumbnailGroupTarget(null)
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

  async function saveThumbnailGroupOrder() {
    if (thumbnailGroupSaving) return
    const groupsById = new Map(thumbnailGroups.map((group) => [group.id, group]))
    const orderedGroups = thumbnailGroupOrderDraft.flatMap((groupId) => {
      const group = groupsById.get(groupId)
      return group ? [group] : []
    })
    thumbnailGroups.forEach((group) => { if (!thumbnailGroupOrderDraft.includes(group.id)) orderedGroups.push(group) })
    if (await saveThumbnailGroups(orderedGroups)) setThumbnailGroupPopover(null)
  }

  function moveThumbnailGroupOrder(groupId: string, direction: -1 | 1) {
    const draftGroups = thumbnailGroupOrderDraft.flatMap((itemId) => {
      const group = thumbnailGroups.find((item) => item.id === itemId)
      return group ? [group] : []
    })
    setThumbnailGroupOrderDraft(reorderThumbnailGroups(draftGroups, groupId, direction).map((group) => group.id))
  }

  async function saveThumbnailRailOrder() {
    if (!thumbnailGroupPopover || thumbnailGroupSaving) return
    if (await saveThumbnailGroups(thumbnailGroups, thumbnailRailOrderDraft)) setThumbnailGroupPopover(null)
  }

  function moveThumbnailRailGroup(groupId: string, direction: -1 | 1) {
    const sourceKey = 'group:' + groupId
    const index = thumbnailRailOrderDraft.findIndex((item) => thumbnailRailOrderKey(item) === sourceKey)
    const target = thumbnailRailOrderDraft[index + direction]
    if (index < 0 || !target) return
    setThumbnailRailOrderDraft(moveThumbnailRailItem(thumbnailRailOrderDraft, sourceKey, thumbnailRailOrderKey(target), direction < 0 ? 'before' : 'after'))
  }

  async function ungroupThumbnailGroup(groupId: string) {
    const nextGroups = thumbnailGroups.filter((group) => group.id !== groupId)
    if (await saveThumbnailGroups(nextGroups)) {
      const group = thumbnailGroups.find((item) => item.id === groupId)
      if (group && pdf) setThumbnailPagesExcluded(pdf, group.pageNumbers, false)
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
      if (expandedThumbnailGroupId === targetGroupId && pdf) setThumbnailPagesExcluded(pdf, pageNumbers, false)
      setThumbnailSelection(null)
      setThumbnailGroupError('')
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
    setThumbnailGroupOrderDraft(thumbnailGroups.map((item) => item.id))
    setThumbnailRailOrderDraft(pdf ? normalizeThumbnailRailOrder(snapshotRef.current?.thumbnailRailOrder, pdf.numPages, thumbnailGroups) : [])
    setThumbnailGroupPopover({ documentId: id, groupId, left: clamp(bounds.left, 8, Math.max(8, window.innerWidth - 280)), top: clamp(bounds.bottom + 6, 8, Math.max(8, window.innerHeight - 360)), mode: 'menu' })
  }

  function changeThumbnailGroupPopoverMode(mode: 'menu' | 'rename' | 'order' | 'rail-order') {
    setThumbnailGroupError('')
    if (mode === 'rail-order' && pdf) setThumbnailRailOrderDraft(normalizeThumbnailRailOrder(snapshotRef.current?.thumbnailRailOrder, pdf.numPages, thumbnailGroups))
    setThumbnailGroupPopover((current) => current ? { ...current, mode } : current)
  }

  function toggleThumbnailLabelGroup(groupId: string) {
    if (thumbnailGroupSaving) return
    const nextExpandedGroupId = expandedThumbnailGroupId === groupId ? null : groupId
    const expandedGroup = thumbnailGroups.find((group) => group.id === nextExpandedGroupId)
    if (expandedGroup && pdf) setThumbnailPagesExcluded(pdf, expandedGroup.pageNumbers, false)
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
    if (thumbnailGroupSaving || !pageRecords.has(pageNumber)) {
      event.preventDefault()
      return
    }
    draggedThumbnailPageRef.current = pageNumber
    draggedThumbnailPagesRef.current = thumbnailPagesForDrag(selectedThumbnailPages, pageNumber)
    setThumbnailDraggingVisuals(draggedThumbnailPagesRef.current, true)
    event.dataTransfer.setData('application/x-doanbogo-page', String(pageNumber))
    event.dataTransfer.setData('application/x-doanbogo-pages', JSON.stringify(draggedThumbnailPagesRef.current))
    event.dataTransfer.setData('text/plain', String(pageNumber))
    event.dataTransfer.effectAllowed = 'move'
    updateThumbnailDropTarget(null)
  }

  function finishThumbnailDrag() {
    setThumbnailDraggingVisuals(draggedThumbnailPagesRef.current, false)
    draggedThumbnailPageRef.current = null
    draggedThumbnailPagesRef.current = []
    updateThumbnailDropTarget(null)
  }

  function thumbnailDragOverLabelGroup(groupId: string, event: ReactDragEvent<HTMLButtonElement>) {
    if (!canDropPagesIntoThumbnailGroup(draggedThumbnailPagesRef.current, groupId)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    updateThumbnailDropTarget('label-group:' + groupId)
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
    updateThumbnailDropTarget(null)
    void movePagesToThumbnailGroupTarget(draggedThumbnailPagesRef.current, groupId)
  }

  function thumbnailDragOverPage(pageNumber: number, event: ReactDragEvent<HTMLButtonElement>) {
    const labelGroupId = thumbnailGroupByPage.get(pageNumber)
    if (labelGroupId) {
      if (!canDropPagesIntoThumbnailGroup(draggedThumbnailPagesRef.current, labelGroupId)) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      updateThumbnailDropTarget('label-group:' + labelGroupId)
      return
    }
    if (!canDropPagesOutsideGroups(draggedThumbnailPagesRef.current)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    updateThumbnailDropTarget('outside-page:' + pageNumber)
  }

  function thumbnailDragOverRail(event: ReactDragEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('.page-thumbnail, .report-thumbnail, [data-thumbnail-label-drop]')) return
    if (!canDropPagesOutsideGroups(draggedThumbnailPagesRef.current)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    updateThumbnailDropTarget('outside-rail')
  }

  async function ungroupThumbnailPages(pageNumbers: number[]) {
    const movablePages = [...new Set(pageNumbers)].filter((pageNumber) => pageRecords.has(pageNumber) && thumbnailGroupByPage.has(pageNumber))
    if (!movablePages.length || thumbnailGroupSavingRef.current || !canDropPagesOutsideGroups(movablePages)) return
    const nextGroups = removePagesFromThumbnailGroups(thumbnailGroups, movablePages)
    suppressThumbnailClickRef.current = true
    window.setTimeout(() => { suppressThumbnailClickRef.current = false }, 0)
    if (await saveThumbnailGroups(nextGroups)) {
      if (pdf) setThumbnailPagesExcluded(pdf, movablePages, false)
      if (expandedThumbnailGroupId && !nextGroups.some((group) => group.id === expandedThumbnailGroupId) && pdf) {
        setThumbnailGroupState((state) => ({ ...state, expandedGroupId: state.expandedGroupId === expandedThumbnailGroupId ? null : state.expandedGroupId }))
      }
      setThumbnailSelection(null)
      setThumbnailGroupError('')
    }
  }

  function dropThumbnailOnPage(pageNumber: number, event: ReactDragEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    updateThumbnailDropTarget(null)
    const labelGroupId = thumbnailGroupByPage.get(pageNumber)
    if (labelGroupId) void movePagesToThumbnailGroupTarget(draggedThumbnailPagesRef.current, labelGroupId)
    else void ungroupThumbnailPages(draggedThumbnailPagesRef.current)
  }

  function dropThumbnailOutsideLabelGroup(event: ReactDragEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('.page-thumbnail, .report-thumbnail, [data-thumbnail-label-drop]')) return
    event.preventDefault()
    event.stopPropagation()
    updateThumbnailDropTarget(null)
    void ungroupThumbnailPages(draggedThumbnailPagesRef.current)
  }

  function renderPageThumbnail(pageNumber: number, nested = false, labelGroupId?: string) {
    const state = pageRecords.get(pageNumber)
    const active = snapshot![snapshot!.activePane].page === pageNumber
    const selected = selectedThumbnailSet.has(pageNumber)
    const railKey = nested ? undefined : 'page:' + pageNumber
    const reorderFeedback = railKey && thumbnailReorderFeedback?.kind === 'rail' && thumbnailReorderFeedback.itemKey === railKey ? ' thumbnail-order-' + thumbnailReorderFeedback.position : ''
    return <div className={'page-thumbnail-entry' + (nested ? ' thumbnail-group-child-entry' : '') + reorderFeedback} key={pageNumber} data-thumbnail-label-drop={labelGroupId} data-thumbnail-rail-item={railKey}>
      {!reportMode && selected && thumbnailSelection?.lastPage === pageNumber && !thumbnailRailScrolling && <button
        type="button"
        className="thumbnail-selection-group-add"
        aria-label={t('그룹 추가')}
        title={t('그룹 추가')}
        disabled={thumbnailGroupSaving}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => { event.stopPropagation(); openThumbnailGroupDialog(selectedThumbnailPages) }}
      ><Plus size={17} /></button>}
      <PdfThumbnail
        pdf={pdf!} pageNumber={pageNumber} active={active} bookmarked={Boolean(state?.bookmarked)} selected={selected} draggable={false}
        dropTarget={thumbnailDropTarget === 'outside-page:' + pageNumber ? 'outside' : undefined}
        disabled={thumbnailGroupSaving} root={thumbnailRailRef}
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
    </div>
  }

  function renderThumbnailItem(item: PageThumbnailItem, nested = false, labelGroupId?: string): ReactNode {
    if (item.type === 'page') return renderPageThumbnail(item.pageNumber, nested, labelGroupId)
    const railKey = 'group:' + item.groupId
    const reorderFeedback = thumbnailReorderFeedback?.kind === 'rail' && thumbnailReorderFeedback.itemKey === railKey ? ' thumbnail-order-' + thumbnailReorderFeedback.position : ''
    return <div className={'thumbnail-rail-group-block' + reorderFeedback} data-thumbnail-rail-item={railKey} key={'label-' + item.groupId}>
      <div className="page-thumbnail-entry thumbnail-label-group-entry">
        <button
          type="button"
          className="thumbnail-label-group-name"
          data-thumbnail-group-settings={item.groupId}
          aria-haspopup="dialog"
          aria-expanded={thumbnailGroupPopover?.groupId === item.groupId}
          aria-label={t('그룹 설정: {name}', { name: item.name })}
          title={item.name}
          onClick={(event) => openThumbnailGroupPopover(item.groupId, event)}
        >{thumbnailGroupLabel(item.name)}</button>
        <button
          type="button"
          className={'thumbnail-label-group-card' + (item.expanded ? ' expanded' : '') + (thumbnailDropTarget === 'label-group:' + item.groupId ? ' drop-target' : '')}
          data-thumbnail-label-drop={item.groupId}
          aria-label={t('그룹 {name}, 페이지 {count}개', { name: item.name, count: item.pageNumbers.length }) + '. ' + t('길게 눌러 순서 변경')}
          aria-expanded={item.expanded}
          title={t('그룹 {name}, 페이지 {count}개', { name: item.name, count: item.pageNumbers.length }) + ' · ' + t('길게 눌러 순서 변경')}
          disabled={thumbnailGroupSaving}
          onClick={() => toggleThumbnailLabelGroup(item.groupId)}
          onDragOver={(event) => thumbnailDragOverLabelGroup(item.groupId, event)}
          onDrop={(event) => dropThumbnailIntoLabelGroup(item.groupId, event)}
          onPointerDown={(event) => {
            const sourceElement = event.currentTarget.closest<HTMLElement>('[data-thumbnail-rail-item]') ?? event.currentTarget
            if (thumbnailRailRef.current) beginThumbnailReorder('rail', railKey, event, thumbnailRailRef.current, sourceElement)
          }}
          onPointerMove={moveThumbnailReorder}
          onPointerUp={finishThumbnailReorder}
          onPointerCancel={(event) => finishThumbnailReorder(event, true)}
          onLostPointerCapture={(event) => finishThumbnailReorder(event, true)}
        >
          <span className="thumbnail-label-group-image"><Files size={21} /><small>{t('{count}개 페이지', { count: item.pageNumbers.length })}</small></span>
        </button>
      </div>
      {item.expanded && <div className="thumbnail-group-children" role="group" aria-label={t('그룹 {name}의 페이지', { name: item.name })}>
        {item.children.map((child) => renderThumbnailItem(child, true, item.groupId))}
      </div>}
    </div>
  }

  const timerPortalTarget = loadError?.id === id || suspended || loading || loadedId !== id || !pdf || !snapshot ? null : timerPortalHost
  const timerElement = <DocumentWorkTimer key={id + ':' + timerSessionKey} documentId={id} initialTotalWorkTimeMs={documentWorkTimeMs} initialWorkTimeDays={documentWorkTimeDays} initialTodayWorkDate={todayWorkDate} initialTodayWorkTimeMs={todayWorkTimeMs} portalTarget={timerPortalTarget} counterMiniBarLayout={!reportMode} minimized={timerMinimized} restoreButtonRef={timerRestoreButtonRef} onMinimize={minimizeTimerPopover} onErrorChange={onTimerErrorChange} onWorkTimeChange={onTimerWorkTimeChange} onTodayWorkTimeChange={onTimerTodayWorkTimeChange} onUnsavedChange={onTimerUnsavedChange} onSavingChange={onTimerSavingChange} onClockChange={onTimerClockChange} recordPanelOpen={workTimeRecordOpen} onRecordPanelOpenChange={onWorkTimeRecordOpenChange} onRecordPanelBlockingChange={onWorkTimePanelBlockingChange} />
  const requestReportExit = () => {
    if (timerSaving) return
    if (timerHasUnsaved) {
      setExitPromptTarget('report')
      setExitPromptOpen(true)
      return
    }
    setSearchParams({ report: '1' })
  }
  if (loadError?.id === id) return <>
    {timerElement}
    <main className="viewer-state"><div className="viewer-error-icon"><X size={22} /></div><h1>{documentKind === 'photos' ? t('사진 폴더를 열지 못했습니다') : t('PDF를 열지 못했습니다')}</h1><p>{loadError.message}</p><button className="primary-button" onClick={requestPdfResume}>{t('다시 시도')}</button><button className="secondary-button" disabled={timerSaving || viewerExitSaving} onClick={() => void requestViewerExit()}>{t('저장하고 나가기')}</button></main>
    {viewerExitSaving && <div className="modal-backdrop viewer-exit-modal" role="presentation"><section className="modal-card" role="alertdialog" aria-modal="true" aria-live="polite"><div className="modal-heading"><h2>{t('저장하는 중…')}</h2></div><p>{t('저장하고 나가기')}</p></section></div>}
    {viewerExitError && <div className="modal-backdrop viewer-exit-modal" role="presentation"><section className="modal-card" role="alertdialog" aria-modal="true"><div className="modal-heading"><h2>{t('저장 오류')}</h2></div><p role="alert">{viewerExitError}</p><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setViewerExitError('')}>{t('계속 작업')}</button><button type="button" className="primary-button" onClick={() => void requestViewerExit()}>{t('다시 시도')}</button></div></section></div>}
  </>
  if (suspended || loading || loadedId !== id) return <>{timerElement}<BrandLoading kind="pdf" requestId={'pdf:' + id + ':' + pdfOpenCycle} layout="screen" messageOverride={suspendError ? translateMessage(suspendError) : undefined} /></>
  if (!pdf || !snapshot) return timerElement

  return (
    <>
    {timerElement}
    <main ref={viewerShellRef} className={'viewer-shell' + (reportMode ? ' report-mode' : '') + (focusView && !reportMode ? ' focus-view' : '') + (thumbnailCollapsed ? ' thumbnail-collapsed' : '') + (selectedThumbnailPages.length > 0 || thumbnailGroupError ? ' thumbnail-feedback-visible' : '') + (counterPanelVisible && !reportMode ? ' counter-panel-visible' : '')} onContextMenu={reportMode ? undefined : preventViewerContextMenu}>
      {suspendError && <div className="viewer-save-warning" role="alert"><span>{translateMessage(suspendError)}</span><button type="button" aria-label={t("저장 알림 닫기")} onClick={() => setSuspendError('')}><X size={14} /></button></div>}
      {annotationLimitNotice && <div className="viewer-limit-notice" role="status" aria-live="polite">{annotationLimitNotice}</div>}
      {showZoomHint && !reportMode && <aside className="viewer-zoom-hint" role="status"><span>{t("마우스 휠로 확대 · 이동 도구에서 드래그로 이동")}</span><button type="button" aria-label={t("확대·이동 안내 닫기")} onClick={() => setShowZoomHint(false)}><X size={15} /></button></aside>}
      {focusView && !reportMode && <button ref={focusRestoreButtonRef} type="button" className="viewer-focus-restore" aria-label={t('UI 복원')} title={t('UI 복원')} onClick={toggleFocusView}><Minimize2 size={20} /><span>{t('UI 복원')}</span></button>}
      <header className="viewer-header">
        <div className="viewer-brand"><img src={yyLogo} alt={t("도안보고 로고")} /><small>{t("YY공동제작")}</small></div>
        <button className="viewer-back" aria-label={t('저장하고 나가기')} disabled={timerSaving || viewerExitSaving} onClick={() => void requestViewerExit()}><ArrowLeft size={20} /><span>{t('저장하고 나가기')}</span></button>
        <div className="viewer-title"><div className="viewer-title-name"><button type="button" className="viewer-title-name-button" title={displayDocumentName} onClick={() => { setRenameDraft(displayDocumentName); setRenameError(''); setRenameDialog(true) }}><strong>{displayDocumentName}</strong></button><button type="button" className="viewer-title-edit" aria-label={t("이름 변경")} title={t("이름 변경")} onClick={() => { setRenameDraft(displayDocumentName); setRenameError(''); setRenameDialog(true) }}><Pencil size={14} /></button></div>{reportMode && <span>{t('뜨개보고서')}</span>}</div>
        <div className="viewer-header-actions">
          {!reportMode && <>
            <div className="viewer-header-history" role="group" aria-label={t('실행 취소') + ' / ' + t('다시 실행')}>
              <button type="button" className="viewer-action viewer-header-icon-action" aria-label={t('실행 취소')} title={t('실행 취소')} disabled={!canUndo} onClick={() => undoRedo('undo')}><Undo2 size={18} /></button>
              <button type="button" className="viewer-action viewer-header-icon-action" aria-label={t('다시 실행')} title={t('다시 실행')} disabled={!canRedo} onClick={() => undoRedo('redo')}><Redo2 size={18} /></button>
            </div>
            <button className={'viewer-action viewer-split-toggle ' + (snapshot.split ? 'selected' : '')} aria-label={snapshot.split ? t('한 영역 보기') : t('두 영역 보기')} title={snapshot.split ? t('한 영역 보기') : t('두 영역 보기')} aria-pressed={snapshot.split} onClick={toggleSplit}><Columns2 size={18} /><span>{snapshot.split ? t('한 영역 보기') : t('두 영역 보기')}</span></button>
            <button ref={desktopFocusTriggerRef} type="button" className={'viewer-action viewer-focus-toggle' + (focusView ? ' selected' : '')} data-focus-view-trigger aria-label={t('도안만 보기')} title={t('도안만 보기')} aria-pressed={focusView} disabled={focusViewBlocked} onClick={toggleFocusView}><Focus size={19} /></button>
            <div className="viewer-header-more-anchor">
              <button ref={headerMoreTriggerRef} type="button" className="viewer-action viewer-header-more" aria-label={t('더보기')} title={t('더보기')} aria-haspopup="menu" aria-expanded={headerMoreOpen} onClick={() => setHeaderMoreOpen((open) => !open)}><MoreHorizontal size={20} /></button>
              {headerMoreOpen && <div ref={headerMorePanelRef} className="viewer-compact-menu viewer-header-menu" role="menu" aria-label={t('더보기')}>
                <button type="button" role="menuitem" disabled={!canRedo} onClick={() => { setHeaderMoreOpen(false); undoRedo('redo') }}><Redo2 size={18} /><span>{t('다시 실행')}</span></button>
                <button type="button" role="menuitem" className={snapshot.split ? 'selected' : ''} aria-pressed={snapshot.split} onClick={() => { setHeaderMoreOpen(false); toggleSplit() }}><Columns2 size={18} /><span>{snapshot.split ? t('한 영역 보기') : t('두 영역 보기')}</span></button>
                <button type="button" role="menuitem" data-focus-view-trigger disabled={focusViewBlocked} onClick={toggleFocusView}><Focus size={18} /><span>{t('도안만 보기')}</span></button>
              </div>}
            </div>
          </>}
          {reportMode && <button className="viewer-action" onClick={() => setSearchParams({})}><ArrowLeft size={16} /><span>{t("도안으로 돌아가기")}</span></button>}
        </div>
      </header>
      <section className={'pdf-work-area' + (reportMode ? ' report-work-area' : '')}>
        <div className={'pdf-document-area ' + (reportMode ? '' : snapshot.split ? (orientation === 'wide' ? 'split-wide' : 'split-tall') : 'single-pane')} ref={areaRef}>
        {reportMode ? <KnittingReport documentId={id} fileName={documentName} pageCount={pdf.numPages} totalWorkTimeMs={documentWorkTimeMs} workTimeDays={documentWorkTimeDays} onAddWorkTime={addViewerWorkTime} onBack={() => setSearchParams({})} /> : snapshot.split ? <>
          <div className="split-section" style={orientation === 'wide' ? { flex: '0 0 ' + splitBasis(displayedRatio) } : { width: '100%', flex: '0 0 ' + splitBasis(displayedRatio) }}>{renderPane('primary', snapshot.primary, snapshot.activePane === 'primary')}</div>
          <button className={'split-divider ' + orientation} aria-label={t("영역 크기 조정")} onPointerDown={beginDivider} onPointerMove={moveDivider} onPointerUp={finishDivider} onPointerCancel={finishDivider} onLostPointerCapture={finishDivider}><span /></button>
          <div className="split-section split-section-secondary" style={orientation === 'wide' ? { flex: '0 0 ' + splitBasis(1 - displayedRatio) } : { width: '100%', flex: '0 0 ' + splitBasis(1 - displayedRatio) }}>{renderPane('secondary', snapshot.secondary, snapshot.activePane === 'secondary')}</div>
        </> : renderPane(snapshot.activePane, snapshot[snapshot.activePane], true)}
        </div>
        {!reportMode && counterPanelVisible && <CounterPanel snapshot={snapshot} counters={counters} timerLinkMode={counterTimerMode} counterPanelRequest={counterPanelRequest} onChange={updateCounterPanel} onUndo={undoCounterAction} onRepeatStep={stepRepeatCounterAction} onCounterStep={stepAuxiliaryCounterAction} counterActionSaving={counterActionSaving} onSettingsSave={saveCounterSettings} onTimerLinkModeChange={changeCounterTimerLinkMode} onSnapshotUpdate={updateCounterSnapshot} triggerRef={counterPanelFocusRef} onSavingChange={setCounterSettingsSaving} onClose={() => { setSavedCounterSession({ documentId: id, visible: false }); setCounterSettingsSaving(false); requestAnimationFrame(() => counterPanelFocusRef.current?.focus()) }} />}
      </section>
      <section className={'viewer-footer' + (thumbnailCollapsed ? ' thumbnail-collapsed' : '')}>
        <div id={thumbnailContentId} className="thumbnail-content" hidden={thumbnailCollapsed || focusView}>
        {!thumbnailCollapsed && !focusView && <>
        <div className="thumbnail-group-section">
          <button type="button" className="thumbnail-group-add" disabled={thumbnailGroupSaving} onClick={() => openThumbnailGroupDialog()}><Plus size={15} /><span>{t('그룹 추가')}</span></button>
          <div className="thumbnail-group-list" ref={thumbnailGroupListRef} aria-label={t('썸네일 그룹')}>
            {thumbnailGroups.map((group) => <button
              type="button"
              key={group.id}
              className={'thumbnail-group-label' + (thumbnailDropTarget === 'label-group:' + group.id ? ' drop-target' : '') + (expandedThumbnailGroupId === group.id ? ' expanded' : '') + (thumbnailReorderFeedback?.kind === 'labels' && thumbnailReorderFeedback.itemKey === 'group:' + group.id ? ' thumbnail-order-' + thumbnailReorderFeedback.position : '')}
              data-thumbnail-group-settings={group.id}
              data-thumbnail-label-drop={group.id}
              data-thumbnail-order-label={group.id}
              aria-label={t('그룹 설정: {name}, 페이지 {count}개', { name: group.name, count: group.pageNumbers.length }) + '. ' + t('길게 눌러 순서 변경')}
              aria-haspopup="dialog"
              aria-expanded={thumbnailGroupPopover?.groupId === group.id}
              title={group.name + ' · ' + t('{count}개 페이지', { count: group.pageNumbers.length }) + ' · ' + t('길게 눌러 순서 변경')}
              disabled={thumbnailGroupSaving}
              onClick={(event) => openThumbnailGroupPopover(group.id, event)}
              onDragOver={(event) => thumbnailDragOverLabelGroup(group.id, event)}
              onDrop={(event) => dropThumbnailIntoLabelGroup(group.id, event)}
              onPointerDown={(event) => {
                if (thumbnailGroupListRef.current) beginThumbnailReorder('labels', 'group:' + group.id, event, thumbnailGroupListRef.current, event.currentTarget)
              }}
              onPointerMove={moveThumbnailReorder}
              onPointerUp={finishThumbnailReorder}
              onPointerCancel={(event) => finishThumbnailReorder(event, true)}
              onLostPointerCapture={(event) => finishThumbnailReorder(event, true)}
            ><span>{thumbnailGroupLabel(group.name)}</span><small>{group.pageNumbers.length}</small></button>)}
          </div>
        </div>
        <div className={'page-thumbnail-strip' + (thumbnailDropTarget === 'outside-rail' ? ' drop-target-outside' : '')} aria-label={t("모든 페이지 썸네일")} ref={thumbnailRailRef} onScroll={handleThumbnailScroll} onDragOver={thumbnailDragOverRail} onDrop={dropThumbnailOutsideLabelGroup} onDragLeave={(event) => { const nextTarget = event.relatedTarget; if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return; updateThumbnailDropTarget(null) }}
          onClick={(event) => {
            if (!expandedThumbnailGroupId) return
            if ((event.target as HTMLElement).closest('.page-thumbnail, .report-thumbnail, [data-thumbnail-label-drop], [data-thumbnail-group-settings]')) return
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
          {thumbnailItems.map((item) => renderThumbnailItem(item))}
          <button className={'report-thumbnail' + (reportMode ? ' active' : '')} aria-label={t("뜨개보고서 열기")} aria-current={reportMode ? 'page' : undefined} disabled={timerSaving} onClick={requestReportExit}>
            <span className="report-thumbnail-icon">+<i>7</i></span><strong>{t("뜨개보고서")}</strong><small>{t("보고서 보기")}</small>
          </button>
        </div>
        {(selectedThumbnailPages.length > 0 || thumbnailGroupError) && <div className="thumbnail-selection-feedback">
          {selectedThumbnailPages.length > 0 && <span>{selectedThumbnailPages.length}{t("개 페이지 선택")}</span>}
          {thumbnailGroupError && <span role="alert">{thumbnailGroupError}</span>}
        </div>}
        </>}
        </div>
        {!reportMode && <div className="viewer-footer-controls">
          <div className="viewer-footer-primary-controls">
          <div className="viewer-footer-zoom-controls" role="group" aria-label={t('축소') + ' / ' + t('확대')}>
            <button type="button" className="viewer-page-control-button" aria-label={t("축소")} title={t("축소")} disabled={activeZoom <= ZOOM_LEVELS[0]} onClick={() => changePane(snapshot.activePane, (pane) => ({ ...pane, zoom: stepZoomLevel(pane.zoom, -1) }), true)}><Minus size={17} /></button>
            <span className="viewer-footer-zoom" aria-label={Math.round(activeZoom * 100) + '%'}>{Math.round(activeZoom * 100)}%</span>
            <button type="button" className="viewer-page-control-button" aria-label={t("확대")} title={t("확대")} disabled={activeZoom >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]} onClick={() => changePane(snapshot.activePane, (pane) => ({ ...pane, zoom: stepZoomLevel(pane.zoom, 1) }), true)}><Plus size={17} /></button>
            <button type="button" className="viewer-page-control-button" aria-label={t("화면 맞춤")} title={t("100% 확대와 페이지 중앙으로 맞춤")} onClick={() => changePane(snapshot.activePane, (pane) => ({ ...pane, zoom: 1, centerX: 0.5, centerY: 0.5 }), true)}><Maximize2 size={16} /></button>
          </div>
          <button type="button" className="viewer-page-control-button" aria-label={t('시계 방향 90도 회전')} title={t('90도 회전 · 현재 {angle}도', { angle: activeRotation })} disabled={!pageWorks[activePage]} onClick={() => rotatePage(snapshot.activePane, activePage)}><RefreshCw size={17} /></button>
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
        {!reportMode && <div className="viewer-footer-mobile-controls">
          <button type="button" className="viewer-page-control-button" aria-label={t('이전')} title={t('이전')} disabled={activeVisiblePageIndex <= 0} onClick={() => navigateVisiblePage(-1)}><ChevronLeft size={20} /></button>
          <span className="viewer-footer-page-count" aria-label={t('페이지') + ' ' + activePage + ' / ' + pdf.numPages} title={t('페이지') + ' ' + activePage + ' / ' + pdf.numPages}>{formatNumber(activePage)} / {formatNumber(pdf.numPages)}</span>
          <button type="button" className="viewer-page-control-button" aria-label={t('다음')} title={t('다음')} disabled={activeVisiblePageIndex < 0 || activeVisiblePageIndex >= visiblePageNumbers.length - 1} onClick={() => navigateVisiblePage(1)}><ChevronRight size={20} /></button>
          <div className="viewer-mobile-menu-anchor">
            <button ref={zoomMenuTriggerRef} type="button" className="viewer-mobile-zoom-trigger" aria-haspopup="menu" aria-expanded={zoomMenuOpen} aria-label={t('확대 배율 {zoom}%', { zoom: Math.round(activeZoom * 100) })} title={t('확대 배율 {zoom}%', { zoom: Math.round(activeZoom * 100) })} onClick={() => setZoomMenuOpen((open) => !open)}>{Math.round(activeZoom * 100)}%</button>
            {zoomMenuOpen && <div ref={zoomMenuPanelRef} className="viewer-compact-menu viewer-zoom-menu" role="menu" aria-label={t('확대 배율 {zoom}%', { zoom: Math.round(activeZoom * 100) })}>
              <div className="viewer-zoom-presets" role="group" aria-label={t('확대 배율 {zoom}%', { zoom: Math.round(activeZoom * 100) })}>
                {ZOOM_LEVELS.map((zoom) => <button key={zoom} type="button" role="menuitemradio" aria-checked={Math.abs(activeZoom - zoom) < 0.0001} aria-label={t('확대 배율 {zoom}%', { zoom: zoom * 100 })} className={Math.abs(activeZoom - zoom) < 0.0001 ? 'selected' : ''} onClick={() => { changePane(snapshot.activePane, (pane) => ({ ...pane, zoom }), true); setZoomMenuOpen(false) }}>{zoom * 100}%</button>)}
              </div>
              <button type="button" role="menuitem" aria-label={t('화면 맞춤')} title={t('100% 확대와 페이지 중앙으로 맞춤')} onClick={() => { changePane(snapshot.activePane, (pane) => ({ ...pane, zoom: 1, centerX: 0.5, centerY: 0.5 }), true); setZoomMenuOpen(false) }}><Maximize2 size={18} /><span>{t('화면 맞춤')}</span></button>
            </div>}
          </div>
          <div className="viewer-mobile-menu-anchor">
            <button ref={footerMoreTriggerRef} type="button" className="viewer-page-control-button" aria-label={t('더보기')} title={t('더보기')} aria-haspopup="menu" aria-expanded={footerMoreOpen} onClick={() => setFooterMoreOpen((open) => !open)}><MoreHorizontal size={20} /></button>
            {footerMoreOpen && <div ref={footerMorePanelRef} className="viewer-compact-menu viewer-footer-more-menu" role="menu" aria-label={t('더보기')}>
              <button type="button" role="menuitem" disabled={!pageWorks[activePage]} onClick={() => { setFooterMoreOpen(false); rotatePage(snapshot.activePane, activePage) }}><RefreshCw size={18} /><span>{t('시계 방향 90도 회전')}</span></button>
              <button type="button" role="menuitem" className={isBookmarked ? 'selected' : ''} aria-pressed={isBookmarked} onClick={() => { setFooterMoreOpen(false); void toggleBookmark() }}><Bookmark size={18} fill={isBookmarked ? 'currentColor' : 'none'} /><span>{isBookmarked ? t('북마크 해제') : t('북마크')}</span></button>
              <button type="button" role="menuitem" className={!thumbnailCollapsed ? 'selected' : ''} aria-pressed={!thumbnailCollapsed} onClick={() => { setFooterMoreOpen(false); toggleThumbnailAccordion() }}>{thumbnailCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}<span>{thumbnailCollapsed ? t('썸네일 펼치기') : t('썸네일 접기')}</span></button>
            </div>}
          </div>
        </div>}
      </section>
      <div className="viewer-floating-layer">
        {counterDeleteToastId && <div className="viewer-counter-delete-toast" role="status"><span>{t('카운터를 삭제했습니다.')}</span><button type="button" disabled={snapshot.counterHistory?.at(-1)?.id !== counterDeleteToastId} onClick={() => { if (snapshot.counterHistory?.at(-1)?.id === counterDeleteToastId) undoCounterAction(); setCounterDeleteToastId(null) }}>{t('실행 취소')}</button><button type="button" aria-label={t('닫기')} onClick={() => setCounterDeleteToastId(null)}><X size={15} /></button></div>}
        <div ref={timerBarRef} className={'viewer-floating-bar viewer-timer-bar' + (!reportMode ? ' has-counter-details' : '') + (!reportMode && miniBarAlerts.length ? ' has-counter-alerts' : '') + (timerMinimized ? ' is-minimized' : '') + (timerBarPosition.left === null ? '' : ' positioned')} data-popup-size={!timerMinimized && coarsePointer && !reportMode && displayedTimerSize ? getViewerPopupSizeClass(displayedTimerSize.width) : undefined} style={{
          ...(timerBarPosition.left === null ? {} : { left: timerBarPosition.left, top: timerBarPosition.top, right: 'auto' }),
          ...(!timerMinimized && coarsePointer && !reportMode && displayedTimerSize ? { width: displayedTimerSize.width, height: counterDetailsExpanded ? displayedTimerSize.height : 'auto', maxWidth: 'none', maxHeight: 'none' } : {}),
        }} role="group" aria-label={`${t('카운터')} · ${t('작업 타이머')}`} onPointerDown={beginTimerBarTouchPress} onClickCapture={(event) => { if (Date.now() > timerBarClickSuppressUntilRef.current) return; timerBarClickSuppressUntilRef.current = 0; event.preventDefault(); event.stopPropagation() }}>
          <button type="button" className="viewer-floating-drag-handle" aria-label={t('작업 타이머 이동')} title={t('작업 타이머 이동')} onPointerDown={handleTimerBarDrag} onPointerMove={moveTimerBarDrag} onPointerUp={finishTimerBarDrag} onPointerCancel={finishTimerBarDrag} onLostPointerCapture={finishTimerBarDrag}><GripVertical size={17} /></button>
          {!reportMode && <div className="viewer-counter-tools" role="group" aria-label={t('카운터')}>
            <div className="viewer-mini-counter-step-group" role="group" aria-label={t('카운터')}>
            <button type="button" className="viewer-mini-counter-step" aria-label={t('이전 단으로 되돌리기')} title={mainCounterCanStepBack ? t('이전 단으로 되돌리기') : t('정확한 복원 이력이 없습니다')} disabled={!mainCounterCanStepBack || counterActionSaving} onClick={() => { if (mainCounter && mainCounter.value > 1) rewindCounter(mainCounter.id, mainCounter.value - 1) }}><Minus size={20} /></button>
            {mainCounter && (counterRowEditing
              ? <input ref={counterRowInputRef} className="viewer-mini-counter-row-input" aria-label={t('단 번호 입력')} type="number" inputMode="numeric" min="1" max={MAX_COUNTER_ROW} step="1" autoFocus disabled={counterActionSaving} value={counterRowDraft} onChange={(event) => setCounterRowDraft(event.currentTarget.value)} onBlur={() => { if (skipCounterRowBlurRef.current) { skipCounterRowBlurRef.current = false; return } finishCounterRowEdit() }} onKeyDown={(event) => {
                if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() }
                if (event.key === 'Escape') { event.preventDefault(); skipCounterRowBlurRef.current = true; setCounterRowDraft(String(mainCounter.value)); setCounterRowEditing(false); event.currentTarget.blur() }
              }} />
              : <button type="button" className="viewer-mini-counter-row" aria-label={t('현재 단 입력')} title={t('현재 단 입력')} disabled={counterActionSaving} onClick={beginCounterRowEdit}><strong>{formatNumber(mainCounter.value)}</strong><span>{t('단')}</span><small>{counterSideForRow(mainCounter, mainCounter.value).toUpperCase()}</small></button>)}
            <button type="button" className="viewer-mini-counter-step" aria-label={t('현재 단 완료 후 다음 단으로 이동')} disabled={!mainCounter || counterActionSaving || mainCounter.goalCompleted === true || mainCounter.value >= MAX_COUNTER_ROW && mainCounter.goalRow !== mainCounter.value} onClick={() => { if (mainCounter) advanceCounterGroup(mainCounter.id) }}><Plus size={20} /></button>
            </div>
            <button ref={counterPanelFocusRef} type="button" className={'viewer-counter-settings-toggle' + (counterPanelVisible ? ' active' : '')} aria-label={t('카운터 설정')} title={t('카운터 설정')} aria-pressed={counterPanelVisible} disabled={counterSettingsSaving} onClick={(event) => { counterPanelFocusRef.current = event.currentTarget; setSavedCounterSession({ documentId: id, visible: !counterPanelVisible }) }}><Settings2 size={16} />{counterAlertPending && <i className="counter-notification-dot" aria-hidden="true" />}</button>
          </div>}
          {!reportMode && <span className="viewer-timer-divider" aria-hidden="true" />}
          <div className="viewer-timer-portal-host" ref={setTimerPortalHost} />
          {!reportMode && <section id={'viewer-counter-details-' + id.replace(/[^a-zA-Z0-9_-]/g, '-')} className="viewer-counter-details" aria-label={t('보조 카운터 정보')}>
            <header className="viewer-counter-details-header">
              <strong>{t('보조 카운터')} · {formatNumber(auxiliaryCounters.length)}</strong>
              <div>
                <button type="button" className="viewer-counter-add-button" aria-label={t('카운터 추가')} title={t('카운터 추가')} onClick={() => requestCounterPanelAction('add')}><Plus size={15} /><span>{t('카운터 추가')}</span></button>
                <button type="button" className={'viewer-counter-details-toggle' + (counterDetailsExpanded ? ' active' : '')} aria-label={counterDetailsExpanded ? t('보조 카운터 정보 접기') : t('보조 카운터 정보 펼치기')} title={counterDetailsExpanded ? t('보조 카운터 정보 접기') : t('보조 카운터 정보 펼치기')} aria-expanded={counterDetailsExpanded} aria-controls={'viewer-counter-details-list-' + id.replace(/[^a-zA-Z0-9_-]/g, '-')} onClick={() => setCounterDetailsExpanded((expanded) => !expanded)}>{counterDetailsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
              </div>
            </header>
            {counterDetailsExpanded && <div id={'viewer-counter-details-list-' + id.replace(/[^a-zA-Z0-9_-]/g, '-')} className="viewer-counter-details-list">
            {auxiliaryCounters.length ? auxiliaryCounters.map((counter) => {
              const alerts = currentCounterAlerts.alerts.filter((alert) => alert.counterId === counter.id).map((alert) => translateCounterAlert(alert.message, false))
              const repeatProgress = counter.kind === 'repeat' ? repeatCounterProgress(counter) : null
              const progressPercent = counter.kind === 'pattern' ? Math.round((counter.patternRow ?? 1) / Math.max(1, counter.repeatLength ?? 1) * 100)
                : counter.kind === 'task' ? Math.round((counter.completedCount ?? 0) / Math.max(1, counter.total ?? 1) * 100)
                  : repeatProgress ? Math.round(repeatProgress.completedRows / Math.max(1, repeatProgress.totalRows) * 100) : null
              const repeatBlock = counter.kind === 'repeat' ? repeatCounterStepBlock(counters, counter.id, 1) : null
              const repeatBlockLabel = repeatCounterBlockLabel(repeatBlock)
              const decreaseDisabled = counter.kind === 'simple' ? counter.value <= 0 : counter.kind === 'task' ? (counter.completedCount ?? 0) <= 0 : counter.kind === 'repeat' ? counter.value <= 0 : false
              const increaseDisabled = counter.kind === 'task' ? (counter.completedCount ?? 0) >= (counter.total ?? 0) : counter.kind === 'repeat' ? repeatProgress?.complete === true || Boolean(repeatBlock) : false
              const progressSummary = counter.kind === 'pattern'
                ? t('무늬 {current} / {total}단 · 다음 {next}단', { current: formatNumber(counter.patternRow ?? 1), total: formatNumber(counter.repeatLength ?? 1), next: formatNumber(nextPatternAlertRow(counter, mainCounter?.value ?? 1) ?? 1) })
                : counter.kind === 'task'
                  ? t('{task} {completed} / {total}회 · 다음 {row}단', { task: t(counter.taskKind === 'increase' ? '늘림' : '줄임'), completed: formatNumber(counter.completedCount ?? 0), total: formatNumber(counter.total ?? 0), row: formatNumber(counter.nextTaskRow ?? counter.firstTaskRow ?? 1) })
                  : counter.kind === 'repeat' && repeatProgress
                    ? <span className="viewer-counter-detail-summary-repeat">
                      <strong>{t('반복 {start}~{end}단 × {target}회', { start: formatNumber(repeatProgress.startRow), end: formatNumber(repeatProgress.endRow), target: formatNumber(repeatProgress.target) })}</strong>
                      <span>{t('완료 반복 {completed} / {target}회', { completed: formatNumber(repeatProgress.completedRepeats), target: formatNumber(repeatProgress.target) })} · {repeatProgress.complete ? <strong role="status">{t('목표 반복 완료')}</strong> : t('현재 {row}단 진행 예정', { row: formatNumber(repeatProgress.nextRow ?? repeatProgress.startRow) })}</span>
                      <span>{t('총 {completed} / {total}단 완료', { completed: formatNumber(repeatProgress.completedRows), total: formatNumber(repeatProgress.totalRows) })}</span>
                      {repeatBlockLabel && <small>{repeatBlockLabel}</small>}
                    </span>
                    : null
              const step = (direction: -1 | 1) => counter.kind === 'repeat' ? stepRepeatCounterAction(counter.id, direction) : stepAuxiliaryCounterAction(counter.id, direction)
              return <article className={'viewer-counter-detail-item' + (progressPercent !== null ? ' has-progress' : '') + (alerts.length ? ' has-alert' : '')} style={{ '--counter-color': counter.color } as CSSProperties} key={counter.id}>
                <span className="viewer-counter-detail-color" style={{ background: counter.color }} />
                <div className="viewer-counter-detail-info"><strong>{counter.name}</strong><span className="viewer-counter-detail-summary">{counter.kind === 'task' ? t(counter.taskKind === 'increase' ? '늘림' : '줄임') : counter.kind === 'simple' ? `${formatNumber(counter.value)} ${t('단')}` : t(counter.kind === 'pattern' ? '무늬 카운터' : '반복 카운터')}</span></div>
                {progressPercent !== null && <div className="viewer-counter-detail-progress-group">
                  {alerts.map((alert, index) => <span className="viewer-counter-detail-alert" role="status" key={counter.id + '-alert-' + index}><Bell size={12} /><span>{alert}</span></span>)}
                  <div className="viewer-counter-detail-progress-summary">{progressSummary}</div><span className="viewer-counter-detail-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent} aria-label={`${counter.name} ${progressPercent}%`}><i style={{ width: progressPercent + '%', background: counter.color }} /></span>
                </div>}
                <div className="viewer-counter-detail-actions">
                  <div className="viewer-counter-detail-stepper" role="group" aria-label={counter.name}>
                    <CounterStepButton className="viewer-mini-counter-step" label={`${counter.name} · ${t('보조 카운터 줄이기')}`} disabled={counterActionSaving || decreaseDisabled} onStep={() => step(-1)}><Minus size={20} /></CounterStepButton>
                    <CounterStepButton className="viewer-mini-counter-step" label={`${counter.name} · ${t('보조 카운터 늘리기')}`} title={repeatBlockLabel} disabled={counterActionSaving || increaseDisabled} onStep={() => step(1)}><Plus size={20} /></CounterStepButton>
                  </div>
                  <details className="viewer-counter-action-menu"><summary aria-label={`${counter.name} · ${t('더보기')}`} title={t('더보기')}><MoreHorizontal size={18} /></summary><div role="menu">
                    <button type="button" role="menuitem" onClick={() => requestCounterPanelAction('edit', counter.id)}><Settings2 size={15} />{t('설정 수정')}</button>
                    <button type="button" role="menuitem" disabled={maxCountersForType(counters, counter.kind) >= MAX_COUNTERS_PER_TYPE} onClick={() => void duplicateCounterAction(counter.id)}><Copy size={15} />{t('복제')}</button>
                    <button type="button" role="menuitem" onClick={() => void deleteCounterAction(counter.id)}><Trash2 size={15} />{t('삭제')}</button>
                  </div></details>
                </div>
              </article>
            }) : <p>{t('연결된 보조 카운터가 없습니다.')}</p>}
            </div>}
          </section>}
          {!reportMode && miniBarAlerts.length > 0 && <div className="viewer-mini-counter-alerts" role="status" aria-label={t('알림')}>
            {miniBarAlerts.map((alert) => <span className="viewer-counter-detail-alert" style={{ '--counter-color': counters.find((counter) => counter.id === alert.counterId)?.color ?? 'var(--color-primary)' } as CSSProperties} key={alert.counterId}><Bell size={20} /><span>{translateCounterAlert(alert.message)}</span></span>)}
          </div>}
          {coarsePointer && !reportMode && counterDetailsExpanded && <div className="viewer-timer-resize-handle-row">
            {!touchTablet && <button type="button" aria-label={`${t('작업 타이머')} · ${t('크기 조절')}`} title={t('크기 조절')} className="viewer-timer-resize-handle bottom-left" {...timerResizeHandleProps('bottom-left')}><MoveDiagonal size={16} aria-hidden="true" /></button>}
            <button type="button" aria-label={`${t('작업 타이머')} · ${t('크기 조절')}`} title={t('크기 조절')} className="viewer-timer-resize-handle bottom-right" {...timerResizeHandleProps('bottom-right')}><MoveDiagonal size={16} aria-hidden="true" /></button>
          </div>}
          {timerMinimized && <button ref={timerRestoreButtonRef} type="button" className="viewer-timer-restore" aria-label={(timerSaveError ? t('저장 오류') + ' · ' : '') + t('작업 타이머 복원')} title={(timerSaveError ? t('저장 오류') + ' · ' : '') + t('작업 타이머 복원')} onPointerDown={beginTimerRestorePointer} onPointerMove={moveTimerRestorePointer} onPointerUp={finishTimerRestorePointer} onPointerCancel={cancelTimerRestorePointer} onLostPointerCapture={cancelTimerRestorePointer} onClick={restoreTimerPopover}><Maximize2 size={18} aria-hidden="true" />{timerSaveError && <i className="viewer-timer-restore-error" aria-hidden="true" />}</button>}
        </div>
        {!reportMode && <div ref={setTextStylePortalTarget} className={'viewer-floating-bar viewer-mini-bar' + (miniBarOpen ? ' expanded' : '')}>
          <button ref={miniBarAccordionButtonRef} type="button" className="viewer-mini-accordion-button" aria-label={t('뷰어 도구')} title={t('뷰어 도구')} aria-expanded={miniBarOpen} aria-controls={miniBarControlsId} onClick={() => { const open = !miniBarOpen; if (!open) closeMiniBarOnPdfActionRef.current = false; setMiniBarState({ documentId: id, open }); if (!open) setMiniBarSettingsOpen(false) }}>
            <img className="viewer-mini-accordion-icon" src={viewerToolsIcon} alt="" aria-hidden="true" /><span aria-hidden="true">{miniBarOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
          </button>
          <div id={miniBarControlsId} ref={miniBarControlsRef} className="viewer-mini-scroll" hidden={!miniBarOpen}>
        <section className="viewer-controlbar" role="toolbar" aria-orientation="vertical" aria-label={t('뷰어 도구')}>
          <div className="viewer-controlbar-main">
            <div className="viewer-tools" role="group" aria-label={t('필기 도구')}>
              <button type="button" className={'viewer-tool tool-toggle ' + (tool === 'pan' ? 'active' : '')} aria-label={t('이동 도구')} title={t('이동')} aria-pressed={tool === 'pan'} onClick={() => { closeMiniBarOnPdfActionRef.current = true; selectViewerTool('pan') }}><MousePointer2 size={17} /><span>{t('이동')}</span></button>
              <button type="button" className={'viewer-tool tool-toggle ' + (tool === 'pen' ? 'active' : '')} aria-label={t('펜')} title={t('펜')} aria-pressed={tool === 'pen'} onClick={() => { closeMiniBarOnPdfActionRef.current = false; selectViewerTool('pen'); setMiniBarSettingsOpen(true) }}><Pencil size={17} /><span>{t('펜')}</span></button>
              <button type="button" className={'viewer-tool tool-toggle ' + (tool === 'highlight' ? 'active' : '')} aria-label={t('형광펜')} title={t('형광펜')} aria-pressed={tool === 'highlight'} onClick={() => { closeMiniBarOnPdfActionRef.current = false; selectViewerTool('highlight'); setMiniBarSettingsOpen(true) }}><Highlighter size={17} /><span>{t('형광펜')}</span></button>
              <button type="button" className={'viewer-tool tool-toggle ' + (tool === 'eraser' ? 'active' : '')} aria-label={t('지우개')} title={t('지우개')} aria-pressed={tool === 'eraser'} onClick={() => { closeMiniBarOnPdfActionRef.current = false; selectViewerTool('eraser') }}><Eraser size={17} /><span>{t('지우개')}</span></button>
              <button type="button" className={'viewer-tool tool-toggle ' + (tool === 'text' ? 'active' : '')} aria-label={t('텍스트')} title={t('텍스트')} aria-pressed={tool === 'text'} onClick={() => { closeMiniBarOnPdfActionRef.current = false; selectViewerTool('text') }}><Type size={17} /><span>{t('텍스트')}</span></button>
              <button type="button" className={'viewer-tool tool-toggle region-highlight-tool ' + (tool === 'region-highlight' ? 'active' : '')} aria-label={t('구간 강조')} title={t('구간 강조')} aria-pressed={tool === 'region-highlight'} onClick={() => { closeMiniBarOnPdfActionRef.current = false; setMiniBarSettingsOpen(false); selectViewerTool('region-highlight') }}><Square size={17} /><span>{t('구간 강조')}</span></button>
              {colorworkEnabled && <button type="button" className="viewer-tool chart-tool" aria-label={t('컬러워크 설정')} title={t('차트 크기와 뜨개 게이지 설정')} disabled={!pageWorks[activePage] || Boolean(colorworkRequest)} onClick={() => setColorworkDialog(true)}><Grid3X3 size={17} /><span>{t('컬러워크')}</span>{activeColorworkGrid && <small>{activeColorworkGrid.columns}×{activeColorworkGrid.rows}</small>}</button>}
              {activeColorworkGrid && <>
                <button type="button" className="viewer-tool compact-tool" aria-label={activeColorworkGrid.visible ? t('컬러워크 숨기기') : t('컬러워크 보이기')} title={activeColorworkGrid.visible ? t('컬러워크 숨기기') : t('컬러워크 보이기')} aria-pressed={activeColorworkGrid.visible} onClick={toggleColorworkVisibility}>{activeColorworkGrid.visible ? <Eye size={16} /> : <EyeOff size={16} />}</button>
                <button type="button" className={'viewer-tool compact-tool ' + (colorworkEraser ? 'active' : '')} aria-label={colorworkEraser ? t('컬러워크 지우개 끄기') : t('컬러워크 지우개')} title={colorworkEraser ? t('지우개 끄기') : t('색칠한 칸 지우기')} aria-pressed={colorworkEraser} onClick={() => setColorworkEraser((current) => !current)}><Eraser size={16} /></button>
              </>}
              {!activeColorworkGrid?.visible && <>
                <span className="control-separator" aria-hidden="true" />
                <button type="button" className="viewer-tool progress-toggle-tool" aria-label={!activeHasPrimaryGuide ? t('진행선 표시') : progressSettings.horizontal.visible ? t('진행선 숨기기') : t('진행선 표시')} title={!activeHasPrimaryGuide ? t('진행선 표시') : progressSettings.horizontal.visible ? t('진행선 숨기기') : t('진행선 표시')} aria-pressed={activeHasPrimaryGuide && progressSettings.horizontal.visible} disabled={!pageWorks[activePage]} onClick={toggleProgressLines}>{progressSettings.horizontal.visible ? <ScanLine size={17} /> : <EyeClosed size={17} />}<span>{t('진행선')}</span></button>
              </>}
              {(activeAnnotationStyle || activeColorworkGrid) && <button ref={miniBarSettingsTriggerRef} type="button" className={'viewer-tool compact-tool ' + (miniBarSettingsOpen ? 'active' : '')} aria-label={t('도구 설정')} title={t('도구 설정')} aria-expanded={miniBarSettingsOpen} onClick={() => setMiniBarSettingsOpen((open) => !open)}><Settings2 size={17} /></button>}
            </div>
          </div>
        </section>
          </div>
          {miniBarSettingsOpen && <div className="viewer-mini-settings-panel" ref={miniBarSettingsPanelRef} role="group" aria-label={t('도구 설정')}>
            {activeAnnotationStyle && <section className="viewer-mini-settings-section annotation-style-section">
              <strong>{t('필기 스타일')}</strong>
              <ColorPresetButtons label={t('필기 색상')} className="annotation-color-presets" presets={ANNOTATION_COLOR_PRESETS} includeCurrentColor={false} value={activeAnnotationStyle.color} onChange={(color) => changeAnnotationStyle(tool as 'pen' | 'line' | 'highlight' | 'text', { color })} />
              {tool !== 'text' && <label><span>{t('굵기')}</span><input aria-label={t('필기 굵기')} type="range" min="1" max="24" value={activeAnnotationStyle.thickness} style={{ '--range-progress': `${((activeAnnotationStyle.thickness - 1) / 23) * 100}%` } as CSSProperties} onChange={(event) => changeAnnotationStyle(tool as 'pen' | 'line' | 'highlight', { thickness: Number(event.currentTarget.value) })} /></label>}
              {tool !== 'text' && <label><span>{t('투명도')}</span><input aria-label={t('필기 투명도')} type="range" min="10" max="100" value={Math.round(activeAnnotationStyle.opacity * 100)} style={{ '--range-progress': `${((Math.round(activeAnnotationStyle.opacity * 100) - 10) / 90) * 100}%` } as CSSProperties} onChange={(event) => changeAnnotationStyle(tool as 'pen' | 'line' | 'highlight', { opacity: Number(event.currentTarget.value) / 100 })} /></label>}
              {tool === 'text' && <label><span>{t('글자 크기')}</span><input aria-label={t('글자 크기')} type="range" min="10" max="48" value={activeAnnotationStyle.fontSize} style={{ '--range-progress': `${((activeAnnotationStyle.fontSize - 10) / 38) * 100}%` } as CSSProperties} onChange={(event) => changeAnnotationStyle('text', { fontSize: Number(event.currentTarget.value) })} /></label>}
            </section>}
            {activeColorworkGrid && <section className="viewer-mini-settings-section">
              <strong>{t('컬러워크 색칠 도구')}</strong>
              <label><span>{t('색상')}</span><input aria-label={t('컬러워크 색상')} type="color" value={colorworkBrushColor} onClick={() => { if (colorworkEraser) setColorworkEraser(false) }} onChange={(event) => setColorworkBrushColor(event.currentTarget.value)} /></label>
              <label><span>{t('투명도')}</span><input aria-label={t('컬러워크 투명도')} type="range" min="0" max="100" value={Math.round(colorworkBrushOpacity * 100)} style={{ '--range-progress': `${Math.round(colorworkBrushOpacity * 100)}%` } as CSSProperties} disabled={colorworkEraser} onChange={(event) => setColorworkBrushOpacity(Number(event.currentTarget.value) / 100)} /></label>
            </section>}
          </div>}
        </div>}
      </div>
      {thumbnailGroupPopover?.documentId === id && createPortal(<form
        ref={thumbnailGroupPopoverRef}
        className="thumbnail-group-settings-popover"
        style={{ left: thumbnailGroupPopover.left + 'px', top: thumbnailGroupPopover.top + 'px', maxHeight: 'calc(var(--viewer-viewport-height, 100dvh) - 16px)', overflowY: 'auto' }}
        role="dialog"
        aria-label={t('그룹 설정')}
        onContextMenu={preventViewerContextMenu}
        onSubmit={(event) => {
          event.preventDefault()
          if (thumbnailGroupPopover.mode === 'rename') void renameThumbnailGroup(thumbnailGroupPopover.groupId, thumbnailGroupDraft)
          if (thumbnailGroupPopover.mode === 'order') void saveThumbnailGroupOrder()
          if (thumbnailGroupPopover.mode === 'rail-order') void saveThumbnailRailOrder()
        }}
      >
        <strong>{thumbnailGroups.find((group) => group.id === thumbnailGroupPopover.groupId)?.name}</strong>
        {thumbnailGroupPopover.mode === 'menu' && <div className="thumbnail-label-menu" role="group">
          <button type="button" onClick={() => changeThumbnailGroupPopoverMode('rename')}>{t('이름 바꾸기')}</button>
          <button type="button" onClick={() => changeThumbnailGroupPopoverMode('order')}>{t('순서 바꾸기')}</button>
          <button type="button" onClick={() => changeThumbnailGroupPopoverMode('rail-order')}>{t('썸네일 위치 이동')}</button>
          <button type="button" className="thumbnail-group-ungroup" disabled={thumbnailGroupSaving} onClick={() => void ungroupThumbnailGroup(thumbnailGroupPopover.groupId)}>{t('라벨 해지하기')}</button>
        </div>}
        {thumbnailGroupPopover.mode === 'rename' && <>
          <label>{t('그룹 이름')}<input autoFocus maxLength={100} value={thumbnailGroupDraft} onChange={(event) => setThumbnailGroupDraft(event.currentTarget.value)} /></label>
          <div className="thumbnail-group-popover-actions">
            <button type="button" className="secondary-button" disabled={thumbnailGroupSaving} onClick={() => changeThumbnailGroupPopoverMode('menu')}>{t('취소')}</button>
            <button type="submit" className="primary-button" disabled={thumbnailGroupSaving || !thumbnailGroupDraft.trim()}>{t('저장')}</button>
          </div>
        </>}
        {thumbnailGroupPopover.mode === 'order' && <>
          <div className="thumbnail-label-order-list" role="list" aria-label={t('라벨 순서')}>
            {thumbnailGroupOrderDraft.map((groupId, index) => {
              const group = thumbnailGroups.find((item) => item.id === groupId)
              if (!group) return null
              return <div role="listitem" className="thumbnail-label-order-row" key={groupId}>
                <span>{group.name}</span>
                <div>
                  <button type="button" className="icon-button" aria-label={t('위로 이동')} title={t('위로 이동')} disabled={thumbnailGroupSaving || index === 0} onClick={() => moveThumbnailGroupOrder(groupId, -1)}><ChevronUp size={17} /></button>
                  <button type="button" className="icon-button" aria-label={t('아래로 이동')} title={t('아래로 이동')} disabled={thumbnailGroupSaving || index === thumbnailGroupOrderDraft.length - 1} onClick={() => moveThumbnailGroupOrder(groupId, 1)}><ChevronDown size={17} /></button>
                </div>
              </div>
            })}
          </div>
          <div className="thumbnail-group-popover-actions">
            <button type="button" className="secondary-button" disabled={thumbnailGroupSaving} onClick={() => changeThumbnailGroupPopoverMode('menu')}>{t('취소')}</button>
            <button type="submit" className="primary-button" disabled={thumbnailGroupSaving}>{t('저장')}</button>
          </div>
        </>}
        {thumbnailGroupPopover.mode === 'rail-order' && (() => {
          const index = thumbnailRailOrderDraft.findIndex((item) => item.type === 'group' && item.groupId === thumbnailGroupPopover.groupId)
          return <>
            <div className="thumbnail-rail-position-controls" role="group" aria-label={t('썸네일 위치')}>
              <span>{t('폴더 위치')} {index < 0 ? '—' : formatNumber(index + 1) + ' / ' + formatNumber(thumbnailRailOrderDraft.length)}</span>
              <div>
                <button type="button" className="icon-button" aria-label={t('왼쪽으로 이동')} title={t('왼쪽으로 이동')} disabled={thumbnailGroupSaving || index <= 0} onClick={() => moveThumbnailRailGroup(thumbnailGroupPopover.groupId, -1)}><ChevronLeft size={17} /></button>
                <button type="button" className="icon-button" aria-label={t('오른쪽으로 이동')} title={t('오른쪽으로 이동')} disabled={thumbnailGroupSaving || index < 0 || index >= thumbnailRailOrderDraft.length - 1} onClick={() => moveThumbnailRailGroup(thumbnailGroupPopover.groupId, 1)}><ChevronRight size={17} /></button>
              </div>
            </div>
            <p className="thumbnail-rail-position-help">{t('페이지와 폴더 사이에서 위치를 조정할 수 있습니다.')}</p>
            <div className="thumbnail-group-popover-actions">
              <button type="button" className="secondary-button" disabled={thumbnailGroupSaving} onClick={() => changeThumbnailGroupPopoverMode('menu')}>{t('취소')}</button>
              <button type="button" className="primary-button" disabled={thumbnailGroupSaving || index < 0} onClick={() => void saveThumbnailRailOrder()}>{t('저장')}</button>
            </div>
          </>
        })()}
        {thumbnailGroupError && <span role="alert">{thumbnailGroupError}</span>}
      </form>, document.body)}
      {thumbnailGroupDialog && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeThumbnailGroupDialog() }}>
        <form className="modal-card thumbnail-group-dialog" role="dialog" aria-modal="true" aria-label={t('그룹 추가')} onSubmit={(event) => void createThumbnailGroup(event)}>
          <div className="modal-heading"><h2>{t('그룹 추가')}</h2><button type="button" className="icon-button" aria-label={t('닫기')} disabled={thumbnailGroupSaving} onClick={closeThumbnailGroupDialog}><X size={19} /></button></div>
          <div className="modal-form">
            <label htmlFor="thumbnail-group-name">{t('그룹 이름')}</label>
            <input id="thumbnail-group-name" autoFocus maxLength={100} value={thumbnailGroupDraft} onChange={(event) => setThumbnailGroupDraft(event.currentTarget.value)} placeholder={t('그룹 이름 입력')} />
            {thumbnailGroupError && <p className="thumbnail-group-error" role="alert">{thumbnailGroupError}</p>}
            <div className="modal-actions"><button type="button" className="secondary-button" disabled={thumbnailGroupSaving} onClick={closeThumbnailGroupDialog}>{t('취소')}</button><button type="submit" className="primary-button" disabled={thumbnailGroupSaving}>{t('확인')}</button></div>
          </div>
        </form>
      </div>}
      {counterTimerPromptOpen && <div className="modal-backdrop counter-modal-backdrop" role="presentation"><section className="modal-card counter-timer-link-prompt" role="alertdialog" aria-modal="true" aria-labelledby="counter-timer-prompt-title"><div className="modal-heading"><h2 id="counter-timer-prompt-title">{t('타이머도 함께 시작할까요?')}</h2></div><p>{t('처음 카운터를 조작할 때 타이머 시작 여부를 묻고 선택을 기억합니다.')}</p>{counterTimerPromptError && <p className="counter-storage-error" role="alert">{counterTimerPromptError}</p>}<div className="modal-actions"><button type="button" className="secondary-button" disabled={counterTimerPromptSaving} onClick={() => void chooseCounterTimerPrompt('skip')}>{t('아니요, 기억')}</button><button type="button" className="primary-button" disabled={counterTimerPromptSaving} onClick={() => void chooseCounterTimerPrompt('start')}>{t('예, 시작하고 기억')}</button></div></section></div>}
      {exitPromptOpen && <div className="modal-backdrop" role="presentation"><section className="modal-card" role="alertdialog" aria-modal="true" aria-labelledby="timer-exit-title" aria-describedby="timer-exit-message"><div className="modal-heading"><h2 id="timer-exit-title">{t('저장되지 않은 작업시간')}</h2></div><p id="timer-exit-message" className="timer-exit-message">{t('일시정지를 누르지 않아 마지막 저장 이후 측정한 시간은 누적 작업시간에 저장되지 않습니다.')}</p><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setExitPromptOpen(false)}>{t('계속 작업')}</button><button type="button" className="primary-button" onClick={() => { setExitPromptOpen(false); if (exitPromptTarget === 'report') { setTimerHasUnsaved(false); setTimerSessionKey((key) => key + 1); setSearchParams({ report: '1' }) } else navigate('/projects') }}>{t('나가기')}</button></div></section></div>}
      {viewerExitSaving && <div className="modal-backdrop viewer-exit-modal" role="presentation"><section className="modal-card" role="alertdialog" aria-modal="true" aria-live="polite"><div className="modal-heading"><h2>{t('저장하는 중…')}</h2></div><p>{t('저장하고 나가기')}</p></section></div>}
      {viewerExitError && <div className="modal-backdrop viewer-exit-modal" role="presentation"><section className="modal-card" role="alertdialog" aria-modal="true" aria-labelledby="viewer-exit-error-title"><div className="modal-heading"><h2 id="viewer-exit-error-title">{t('저장 오류')}</h2></div><p role="alert">{viewerExitError}</p><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setViewerExitError('')}>{t('계속 작업')}</button><button type="button" className="primary-button" onClick={() => void requestViewerExit()}>{t('다시 시도')}</button></div></section></div>}
      {renameDialog && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRenameDialog(false) }}><section className="modal-card" role="dialog" aria-modal="true" aria-label={t("이름 변경")}><div className="modal-heading"><h2>{documentKind === 'photos' ? t('사진 폴더 이름 변경') : t('PDF 이름 변경')}</h2><button className="icon-button" aria-label={t("닫기")} onClick={() => setRenameDialog(false)}><X size={20} /></button></div><form className="modal-form" onSubmit={(event) => void saveDocumentName(event)}><label htmlFor="viewer-pdf-name">{documentKind === 'photos' ? t('폴더 이름') : t('PDF 이름')}</label><input id="viewer-pdf-name" autoFocus required maxLength={120} value={renameDraft} onChange={(event) => setRenameDraft(event.currentTarget.value)} />{renameError && <p className="rename-error" role="alert">{renameError}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setRenameDialog(false)}>{t("취소")}</button><button className="primary-button" type="submit"><Check size={17} />{t("저장")}</button></div></form></section></div>}
      {colorworkEnabled && colorworkDialog && <ColorworkSettingsDialog
        key={snapshot.activePane + ':' + activePage}
        initial={activeColorworkGrid ?? defaultColorworkSettings}
        onClose={() => setColorworkDialog(false)}
        onApply={applyColorworkSettings}
      />}
    </main>
    </>
  )
}
