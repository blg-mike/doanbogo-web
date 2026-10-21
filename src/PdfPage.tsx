import { formatNumber, t, translateMessage } from './locales/index'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist'
import { Bookmark, Check, Trash2 } from 'lucide-react'
import BrandLoading from './BrandLoading'
import { ColorPresetButtons } from './ColorPresetButtons'
import { ANNOTATION_COLOR_PRESETS } from './designTokens'
import { ProgressLineOverlay } from './ProgressLineOverlay'
import { ChartRowRecognitionDialog, type ChartRowRecognitionResult } from './ChartRowRecognitionDialog'
import type { DetectedChartRow } from './chartRowDetection'
import { runChartRowsWorker } from './chartRowsWorker'
import type { AnnotationRecord, AnnotationStyle, AnnotationTool, ColorworkCell, ColorworkCreateRequest, ColorworkGrid, CounterSnapshot, PageRotation, PageWorkRecord, PaneId, PaneSnapshot, ProgressGuide, ProgressSettings, RegionHighlight } from './types'
import { createColorworkGrid, resizeColorworkGridDisplay } from './colorwork'
import { appendInkPoint, createInkAnnotation, createInkId, type ActiveInkStroke, type InkPoint } from './inkStroke'
import { shouldPreventTextNotePointerDefault, textNoteBoxAt, textNoteCounterRotation, textNoteGestureExceededThreshold } from './textNote'
import { safeQrHref, shouldOpenLinkAfterGesture, type PdfQrLink } from './qr'
import { rotatedPageSize } from './pageGeometry'
import { displayRectToPageRect, focusBandHeightRatio, focusDimOpacity, focusRowSpacing, guideGeometryForRotation, pageRectToDisplayRect } from './focusGeometry'
import { canStartPaneGesture, clientPointForPagePosition, classifyWheelInput, isEditableTarget, isZoomFocusCurrent, nearestZoomLevel, pagePositionAtClientPoint, pinchPreviewTranslation, regionHighlightPointerAction, scrollOffsetForZoomFocus, visiblePageCrop, visiblePageFocus, wheelActionForBurst, wheelZoom, type WheelInput, type ZoomFocus } from './viewerInteraction'
import { acquireThumbnailCache, getViewerResourcePolicy, MAX_PDF_CANVAS_PIXELS, pdfRasterScale, releaseCanvasWhenSettled, viewerCanvasMemory } from './pdfRenderResources'
import { pdfPageRenderQueue } from './pdfPageRenderQueue'
import type { LimitedAnnotationKind } from './annotationLimits'

type Point = { x: number; y: number }
type Size = { width: number; height: number }
type ColorworkTransform = {
  pointerId: number
  kind: 'move' | 'resize'
  start: Point
  startClient: Point
  before: ColorworkGrid
  after: ColorworkGrid
  beforeWork: PageWorkRecord
}
type ColorworkStroke = {
  pointerId: number
  before: PageWorkRecord
  cells: Map<number, ColorworkCell | null>
  originalCells: Map<number, ColorworkCell | null>
  previous: { column: number; row: number } | null
  changed: boolean
}
type RegionResizeHandle = 'nw' | 'ne' | 'sw' | 'se'
type RegionHighlightTransform = {
  id: string
  pointerId: number
  kind: 'move' | RegionResizeHandle
  start: Point
  original: RegionHighlight
  before: PageWorkRecord
  changed: boolean
}
type RegionHighlightDrawing = { pointerId: number; start: Point; before: PageWorkRecord }
type RegionPopoverPosition = { left: number; top: number }
type ChartRecognitionState = {
  guideId: string
  stage: 'select' | 'analyzing' | 'review' | 'error'
  selection?: { x: number; y: number; width: number; height: number }
  imageUrl?: string
  rows?: DetectedChartRow[]
  error?: string
  rotation: PageRotation
}
const EMPTY_REGION_HIGHLIGHTS: RegionHighlight[] = []

interface ThumbnailJob {
  cancelled: boolean
  queued: boolean
  preempted: boolean
  settled: Promise<void>
  onSettled?: () => void
  run: () => Promise<void>
  cancel: () => void
  preempt: () => void
}

const thumbnailQueue: ThumbnailJob[] = []
let activeThumbnails = 0
let activePageRenders = 0
let runningThumbnail: ThumbnailJob | null = null
const failedImageCounts = new WeakMap<PDFPageProxy, number>()
const thumbnailIdleWaiters = new Set<() => void>()
let thumbnailRenderingPaused = false

// oxlint-disable-next-line react/only-export-components -- shared with Viewer suspension before PDF disposal.
export function waitForThumbnailQueueIdle() {
  if (!activeThumbnails && !thumbnailQueue.length) return Promise.resolve()
  return new Promise<void>((resolve) => thumbnailIdleWaiters.add(resolve))
}

function resolveThumbnailIdle() {
  if (activeThumbnails || thumbnailQueue.length) return
  thumbnailIdleWaiters.forEach((resolve) => resolve())
  thumbnailIdleWaiters.clear()
}

// oxlint-disable-next-line react/only-export-components -- shared with Viewer scroll pacing.
export function setThumbnailRenderingPaused(paused: boolean) {
  thumbnailRenderingPaused = paused
  if (paused) runningThumbnail?.preempt()
  else pumpThumbnails()
}

// oxlint-disable-next-line react/only-export-components -- shared with Viewer lifecycle cleanup.
export function cancelThumbnailRenders() {
  thumbnailRenderingPaused = false
  for (const job of thumbnailQueue.splice(0)) {
    job.queued = false
    job.cancel()
    job.onSettled?.()
  }
  runningThumbnail?.cancel()
  resolveThumbnailIdle()
}

function enqueueThumbnail(job: ThumbnailJob) {
  if (job.cancelled || job.queued) return
  job.queued = true
  thumbnailQueue.push(job)
  pumpThumbnails()
}

function removeQueuedThumbnail(job: ThumbnailJob) {
  if (!job.queued) return
  const index = thumbnailQueue.indexOf(job)
  if (index >= 0) thumbnailQueue.splice(index, 1)
  job.queued = false
}

function pumpThumbnails() {
  while (!thumbnailRenderingPaused && activePageRenders === 0 && activeThumbnails < 1 && thumbnailQueue.length) {
    const job = thumbnailQueue.shift()!
    job.queued = false
    if (job.cancelled) continue
    activeThumbnails++
    runningThumbnail = job
    job.settled = job.run()
    void job.settled.finally(() => {
      activeThumbnails--
      if (runningThumbnail === job) runningThumbnail = null
      if (job.preempted && !job.cancelled) {
        job.preempted = false
        enqueueThumbnail(job)
      } else job.onSettled?.()
      pumpThumbnails()
      resolveThumbnailIdle()
    })
  }
}

function prioritizePdfPageRender() {
  activePageRenders++
  runningThumbnail?.preempt()
  let released = false
  return () => {
    if (released) return
    released = true
    activePageRenders--
    pumpThumbnails()
  }
}

function clearCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0
  canvas.height = 0
}

function clearThumbnailCanvas(canvas: HTMLCanvasElement, job: ThumbnailJob | null) {
  if (job && runningThumbnail === job) {
    void releaseCanvasWhenSettled(canvas, job.settled)
    return
  }
  clearCanvas(canvas)
}

function copyCanvas(target: HTMLCanvasElement, source: HTMLCanvasElement) {
  target.width = source.width
  target.height = source.height
  target.getContext('2d', { alpha: false })?.drawImage(source, 0, 0)
}

export function PdfThumbnail({ pdf, pageNumber, active, bookmarked, selected, draggable, title, dropTarget, disabled, root, onSelect, onDragStart, onDragEnd, onDragOver, onDrop, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onLostPointerCapture }: {
  pdf: PDFDocumentProxy
  pageNumber: number
  active: boolean
  bookmarked: boolean
  selected?: boolean
  draggable?: boolean
  title?: string
  dropTarget?: 'outside'
  disabled?: boolean
  root: RefObject<HTMLDivElement | null>
  onSelect: (event: ReactMouseEvent<HTMLButtonElement>) => void
  onDragStart?: (event: ReactDragEvent<HTMLButtonElement>) => void
  onDragEnd?: (event: ReactDragEvent<HTMLButtonElement>) => void
  onDragOver?: (event: ReactDragEvent<HTMLButtonElement>) => void
  onDrop?: (event: ReactDragEvent<HTMLButtonElement>) => void
  onPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerMove?: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerUp?: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerCancel?: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onLostPointerCapture?: (event: ReactPointerEvent<HTMLButtonElement>) => void
}) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  const [visible, setVisible] = useState(false)
  const [ready, setReady] = useState(false)
  const observerTargetRef = useRef<HTMLSpanElement>(null)
  const cacheSessionRef = useRef<ReturnType<typeof acquireThumbnailCache> | null>(null)
  const thumbnailJobRef = useRef<ThumbnailJob | null>(null)

  useEffect(() => {
    const target = observerTargetRef.current
    if (!target) return
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) setReady(false)
      setVisible(entry.isIntersecting)
    }, { root: root.current, rootMargin: '0px' })
    observer.observe(target)
    return () => observer.disconnect()
  }, [root])

  useEffect(() => {
    const session = acquireThumbnailCache(pdf, getViewerResourcePolicy())
    cacheSessionRef.current = session
    return () => {
      session.release()
      if (cacheSessionRef.current === session) cacheSessionRef.current = null
    }
  }, [pdf])

  useEffect(() => {
    if (!canvas) return
    const cache = cacheSessionRef.current?.cache
    if (!visible) {
      clearThumbnailCanvas(canvas, thumbnailJobRef.current)
      return
    }
    const cached = cache?.get(pageNumber)
    if (cached) {
      copyCanvas(canvas, cached)
      setReady(true)
      return () => clearCanvas(canvas)
    }
    let renderTask: RenderTask | undefined
    const job: ThumbnailJob = {
      cancelled: false,
      queued: false,
      preempted: false,
      settled: Promise.resolve(),
      onSettled: () => {
        if (thumbnailJobRef.current === job) thumbnailJobRef.current = null
        if (job.cancelled) clearCanvas(canvas)
      },
      run: async () => {
        renderTask = undefined
        try {
          const page = await pdf.getPage(pageNumber)
          if (job.cancelled || job.preempted) return
          const base = page.getViewport({ scale: 1 })
          const viewport = page.getViewport({ scale: Math.min(116 / base.width, 76 / base.height) })
          canvas.width = Math.ceil(viewport.width)
          canvas.height = Math.ceil(viewport.height)
          const context = canvas.getContext('2d', { alpha: false })
          if (!context || job.cancelled || job.preempted) {
            if (job.preempted) clearCanvas(canvas)
            return
          }
          renderTask = page.render({ canvas, canvasContext: context, viewport })
          await renderTask.promise
          if (job.cancelled) return
          if (job.preempted) {
            clearCanvas(canvas)
            setReady(false)
            return
          }
          const activeCache = cacheSessionRef.current?.cache
          if (activeCache) {
            const cachedCanvas = document.createElement('canvas')
            cachedCanvas.width = canvas.width
            cachedCanvas.height = canvas.height
            cachedCanvas.getContext('2d', { alpha: false })?.drawImage(canvas, 0, 0)
            activeCache.set(pageNumber, cachedCanvas)
          }
          setReady(true)
        } catch {
          // The page number stays selectable when a thumbnail cannot be rendered.
          if (!job.cancelled) {
            clearCanvas(canvas)
            setReady(false)
          }
        }
      },
      cancel: () => {
        job.cancelled = true
        renderTask?.cancel?.()
      },
      preempt: () => {
        if (job.cancelled || job.preempted) return
        job.preempted = true
        renderTask?.cancel?.()
      },
    }
    thumbnailJobRef.current = job
    enqueueThumbnail(job)
    return () => {
      job.cancel()
      removeQueuedThumbnail(job)
      clearThumbnailCanvas(canvas, job)
      if (runningThumbnail !== job && thumbnailJobRef.current === job) thumbnailJobRef.current = null
    }
  }, [canvas, pageNumber, pdf, visible])

  return (
    <button
      className={'page-thumbnail ' + (active ? 'active' : '') + (selected ? ' selected' : '') + (dropTarget ? ' drop-target-' + dropTarget : '')}
      data-page-number={pageNumber}
      draggable={draggable}
      title={title}
      aria-label={t('{page}페이지 썸네일', { page: formatNumber(pageNumber) }) + (bookmarked ? t(', 북마크') : '') + (selected ? t(', 선택됨') : '')}
      aria-current={active ? 'page' : undefined}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onLostPointerCapture}
      onContextMenu={(event) => event.preventDefault()}
    >
      <span className="page-thumbnail-image">
        <canvas ref={setCanvas} width={0} height={0} aria-hidden="true" />
        {(!ready || !visible) && <span className="thumbnail-placeholder">{pageNumber}</span>}
        {selected && <span className="thumbnail-selection-mark" aria-hidden="true"><Check size={11} strokeWidth={3} /></span>}
        {bookmarked && <span className="thumbnail-bookmark" aria-hidden="true"><Bookmark size={14} fill="currentColor" /></span>}
      </span>
      <span className="page-thumbnail-number">{pageNumber}</span>
      <span ref={observerTargetRef} className="thumbnail-observer" aria-hidden="true" />
    </button>
  )
}

function annotationPath(annotation: AnnotationRecord, width: number, height: number) {
  const points = annotation.points.map((point) => ({ x: point.x * width, y: point.y * height }))
  if (!points.length) return ''
  const first = points[0]
  if (annotation.type === 'line') {
    const last = points.at(-1)!
    return 'M ' + first.x + ' ' + first.y + ' L ' + last.x + ' ' + last.y
  }
  return points.map((point, index) => (index ? 'L ' : 'M ') + point.x + ' ' + point.y).join(' ')
}

function pointFromEvent(event: { clientX: number; clientY: number }, element: Element, rotation: PageRotation): Point {
  const rect = element.getBoundingClientRect()
  const width = element.clientWidth || rect.width
  const height = element.clientHeight || rect.height
  const rotatedSize = rotatedPageSize({ width, height }, rotation)
  const scaleX = rect.width / Math.max(rotatedSize.width, 1)
  const scaleY = rect.height / Math.max(rotatedSize.height, 1)
  return pagePositionAtClientPoint(rect, width, height, rotation, (scaleX + scaleY) / 2, event.clientX, event.clientY)
}

function boundedPagePoint(point: Point): Point {
  return { x: Math.min(1, Math.max(0, point.x)), y: Math.min(1, Math.max(0, point.y)) }
}

function regionFromPoints(first: Point, second: Point) {
  const start = boundedPagePoint(first)
  const end = boundedPagePoint(second)
  const x = Math.min(start.x, end.x)
  const y = Math.min(start.y, end.y)
  return { x, y, width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) }
}

function sameRegionGeometry(first: RegionHighlight, second: RegionHighlight) {
  return first.x === second.x && first.y === second.y && first.width === second.width && first.height === second.height
}

function distanceToSegment(point: Point, start: Point, end: Point, width: number, height: number) {
  const px = point.x * width
  const py = point.y * height
  const ax = start.x * width
  const ay = start.y * height
  const bx = end.x * width
  const by = end.y * height
  const dx = bx - ax
  const dy = by - ay
  const length = dx * dx + dy * dy
  const t = length ? Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / length)) : 0
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function regionsOverlap(first: PdfQrLink, second: PdfQrLink) {
  return first.x < second.x + second.width && first.x + first.width > second.x &&
    first.y < second.y + second.height && first.y + first.height > second.y
}

function guidesFor(work: PageWorkRecord, axis: 'horizontal' | 'vertical'): ProgressGuide[] {
  const saved = axis === 'horizontal' ? work.horizontalGuides : work.verticalGuides
  return saved ?? [{
    id: 'legacy-' + axis,
    position: axis === 'horizontal' ? work.horizontalPosition ?? 0.5 : work.verticalPosition ?? 0.5,
  }]
}

function textBox(annotation: AnnotationRecord, pageHeight: number) {
  const legacy = annotation.boxWidth === undefined || annotation.boxHeight === undefined
  const width = annotation.boxWidth ?? 0.3
  const height = annotation.boxHeight ?? 0.12
  return {
    x: Math.min(1 - width, Math.max(0, annotation.points[0].x)),
    y: Math.min(1 - height, Math.max(0, annotation.points[0].y - (legacy ? annotation.style.fontSize / pageHeight : 0))),
    width,
    height,
  }
}

function withTextBox(annotation: AnnotationRecord, pageHeight: number): AnnotationRecord {
  const box = textBox(annotation, pageHeight)
  return { ...annotation, points: [{ x: box.x, y: box.y }], boxWidth: box.width, boxHeight: box.height }
}

export function PdfPage({ pdf, page, paneId, pane, paneGestureOwnerRef, splitView, rotation, active, tool, lineSettings, counters, mainCounterId, annotationStyle, work, colorworkEnabled, workReady, canCreateLimitedAnnotation, pageWorkLoadError, onRetryPageWork, recognitionError, onRetryRecognition, colorworkBrushColor, colorworkBrushOpacity, colorworkEraser, createColorworkRequest, pageLinks, qrLinks, textStylePortalTarget, onPageRendered, onActivate, onWorkChange, onChartRowsApply, onZoom, onCenter, onColorworkRequestHandled, onTextToolConsumed, onRegionHighlightToolConsumed }: {
  pdf: PDFDocumentProxy
  page: number
  paneId: PaneId
  pane: PaneSnapshot
  paneGestureOwnerRef: { current: PaneId | null }
  splitView: boolean
  rotation: PageRotation
  active: boolean
  tool: AnnotationTool
  lineSettings: ProgressSettings
  counters: CounterSnapshot[]
  mainCounterId: string
  annotationStyle: AnnotationStyle
  work: PageWorkRecord
  colorworkEnabled: boolean
  workReady: boolean
  canCreateLimitedAnnotation: (kind: LimitedAnnotationKind) => boolean
  pageWorkLoadError?: string
  onRetryPageWork?: () => void
  recognitionError?: boolean
  onRetryRecognition?: () => void
  colorworkBrushColor: string
  colorworkBrushOpacity: number
  colorworkEraser: boolean
  createColorworkRequest: ColorworkCreateRequest | null
  pageLinks: PdfQrLink[] | undefined
  qrLinks: PdfQrLink[] | undefined
  textStylePortalTarget: HTMLElement | null
  onPageRendered: (pageNumber: number, canvas: HTMLCanvasElement) => void
  onActivate: () => void
  onWorkChange: (work: PageWorkRecord, immediate: boolean, recordHistory?: boolean, historyBefore?: PageWorkRecord, cellChanges?: { index: number; before: ColorworkCell | null; after: ColorworkCell | null }[]) => boolean
  onChartRowsApply: (work: PageWorkRecord, before: PageWorkRecord) => Promise<boolean>
  onZoom: (zoom: number, focus?: ZoomFocus) => void
  onCenter: (x: number, y: number) => void
  onColorworkRequestHandled: (id: string) => void
  onTextToolConsumed: () => void
  onRegionHighlightToolConsumed: () => void
}) {
  const resourcePolicy = getViewerResourcePolicy()
  const scrollRef = useRef<HTMLDivElement>(null)
  const rotationLayerRef = useRef<HTMLDivElement>(null)
  const pageSvgRef = useRef<SVGSVGElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const detailCanvasRef = useRef<HTMLCanvasElement>(null)
  const annotationLayerRef = useRef<HTMLDivElement>(null)
  const textInputRef = useRef<HTMLTextAreaElement>(null)
  const colorworkPanelRef = useRef<HTMLDivElement>(null)
  const colorworkCanvasRef = useRef<HTMLCanvasElement>(null)
  const regionPopoverRef = useRef<HTMLDivElement>(null)
  const regionNodesRef = useRef(new Map<string, SVGRectElement>())
  const renderQueueKey = useRef<object>({})
  const detailQueueKey = useRef<object>({})
  const renderPriority = useRef(active ? 1 : 0)
  const displayCanvasKey = useRef<object>({})
  const stagingCanvasKey = useRef<object>({})
  const detailDisplayCanvasKey = useRef<object>({})
  const detailStagingCanvasKey = useRef<object>({})
  const detailCancelRef = useRef<(() => void) | null>(null)
  const detailSequenceRef = useRef(0)
  const detailRefreshTimerRef = useRef(0)
  const handledColorworkRequest = useRef<string | null>(null)
  const colorworkTransform = useRef<ColorworkTransform | null>(null)
  const colorworkStroke = useRef<ColorworkStroke | null>(null)
  const regionDrawing = useRef<RegionHighlightDrawing | null>(null)
  const regionTransform = useRef<RegionHighlightTransform | null>(null)
  const regionStyleEditBefore = useRef<{ id: string; before: PageWorkRecord } | null>(null)
  const onCenterRef = useRef(onCenter)
  const zoomFocusRef = useRef<ZoomFocus | null>(null)
  const trackpadBurstUntilRef = useRef(0)
  const spacePressedRef = useRef(false)
  const temporaryPanRef = useRef<{ pointerId: number; x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null)
  const renderSequence = useRef(0)
  const lastRenderPage = useRef<{ page: number; rotation: PageRotation } | null>(null)
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })
  const [displayedSize, setDisplayedSize] = useState<{ page: Size; css: Size } | null>(null)
  const [displayedRaster, setDisplayedRaster] = useState<{ pdf: PDFDocumentProxy; page: number; zoom: number; rotation: PageRotation; scale: number } | null>(null)
  const [readyKey, setReadyKey] = useState('')
  const [detailRequest, setDetailRequest] = useState({ key: '', revision: 0 })
  const [renderError, setRenderError] = useState<{ key: string; message: string } | null>(null)
  const [retry, setRetry] = useState(0)
  const pinchZoom = useRef<number | null>(null)
  const linkGesturesRef = useRef(new Map<number, { href: string; startX: number; startY: number; moved: boolean; pinched: boolean }>())
  const [draft, setDraft] = useState<Point[]>([])
  const [pendingStrokePreviews, setPendingStrokePreviews] = useState<Array<{ documentId: string; pageNumber: number; annotation: AnnotationRecord }>>([])
  const [strokeError, setStrokeError] = useState(false)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<
    | { kind: 'pan'; pointerId: number; x: number; y: number; scrollLeft: number; scrollTop: number }
    | { kind: 'pinch'; firstId: number; secondId: number; distance: number; zoom: number; pagePoint: Point; pageWidth: number; pageHeight: number; layerCenterX: number; layerCenterY: number }
    | null
  >(null)
  const strokeRef = useRef<ActiveInkStroke | null>(null)
  const strokePreviewFrameRef = useRef<number | null>(null)
  const strokeListenersRef = useRef<{ svg: SVGSVGElement; move: (event: PointerEvent) => void; up: (event: PointerEvent) => void; cancel: (event: PointerEvent) => void; lost: (event: PointerEvent) => void } | null>(null)
  const failedStrokeRef = useRef<{ work: PageWorkRecord; before: PageWorkRecord; annotation: AnnotationRecord } | null>(null)
  const finishInkStrokeRef = useRef<(pointerId: number, finalPoint?: InkPoint) => void>(() => undefined)
  const erasedIds = useRef(new Set<string>())
  const actionStartWork = useRef(work)
  const textDrag = useRef<{ id: string; pointerId: number; kind: 'move' | 'resize'; start: Point; original: { x: number; y: number; width: number; height: number }; before: PageWorkRecord } | null>(null)
  const pendingTextGesture = useRef<{ id: string; pointerId: number; start: Point; clientX: number; clientY: number; original: { x: number; y: number; width: number; height: number }; wasEditing: boolean } | null>(null)
  const textEditBefore = useRef(new Map<string, PageWorkRecord>())
  const textStyleEditBefore = useRef<{ id: string; before: PageWorkRecord } | null>(null)
  const suppressTextBlur = useRef(new Set<string>())
  const currentWorkRef = useRef(work)
  const onWorkChangeRef = useRef(onWorkChange)
  onWorkChangeRef.current = onWorkChange
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [textDraft, setTextDraft] = useState<{ id: string; value: string } | null>(null)
  const [textPreviewPoint, setTextPreviewPoint] = useState<Point | null>(null)
  const [fontSizeDraft, setFontSizeDraft] = useState<{ id: string; value: string } | null>(null)
  const regionHighlights = work.regionHighlights ?? EMPTY_REGION_HIGHLIGHTS
  const [regionPreview, setRegionPreview] = useState<RegionHighlight | null>(null)
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null)
  const selectedRegionIdRef = useRef<string | null>(null)
  const [regionPopoverOpen, setRegionPopoverOpen] = useState(false)
  const [regionPopoverPosition, setRegionPopoverPosition] = useState<RegionPopoverPosition | null>(null)
  const [chartRecognition, setChartRecognition] = useState<ChartRecognitionState | null>(null)
  const [chartSelectionPreview, setChartSelectionPreview] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const chartSelectionRef = useRef<{ pointerId: number; start: Point } | null>(null)
  const chartRequestRef = useRef(0)
  const chartCancelRef = useRef<(() => void) | null>(null)
  const previousToolRef = useRef(tool)
  const updateSelectedNoteId = setSelectedNoteId
  const updateSelectedRegionId = useCallback((id: string | null) => {
    selectedRegionIdRef.current = id
    setSelectedRegionId(id)
    setRegionPopoverPosition(null)
  }, [])
  useEffect(() => {
    if (previousToolRef.current !== tool && tool === 'region-highlight') {
      setRegionPopoverOpen(false)
      updateSelectedRegionId(null)
    }
    previousToolRef.current = tool
  }, [tool, updateSelectedRegionId])
  const renderKey = [page, pane.zoom, rotation, size.width, size.height, splitView].join(':')
  const colorworkGrid = colorworkEnabled && work.colorworkGrid?.visible ? work.colorworkGrid : null
  const selectedRegion = regionHighlights.find((region) => region.id === selectedRegionId) ?? null
  const canPreviewZoom = displayedRaster?.pdf === pdf && displayedRaster.page === page && displayedRaster.rotation === rotation
  const zoomPreviewScale = canPreviewZoom ? pane.zoom / displayedRaster.zoom : 1
  const cancelDetailRender = useCallback(() => {
    window.clearTimeout(detailRefreshTimerRef.current)
    detailSequenceRef.current++
    detailCancelRef.current?.()
    detailCancelRef.current = null
    const canvas = detailCanvasRef.current
    if (canvas) {
      canvas.style.visibility = 'hidden'
      clearCanvas(canvas)
    }
    viewerCanvasMemory.release(detailDisplayCanvasKey.current)
  }, [])
  const scheduleDetailRender = useCallback(() => {
    cancelDetailRender()
    const key = renderKey
    detailRefreshTimerRef.current = window.setTimeout(() => setDetailRequest((current) => ({ key, revision: current.revision + 1 })), 200)
  }, [cancelDetailRender, renderKey])

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const measure = () => {
      const next = { width: element.clientWidth, height: element.clientHeight }
      setSize((current) => current.width === next.width && current.height === next.height ? current : next)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    measure()
    return () => {
      observer.disconnect()
    }
  }, [])

  useLayoutEffect(() => {
    cancelDetailRender()
  }, [page, pane.zoom, rotation, size.width, size.height, splitView, cancelDetailRender])

  useEffect(() => {
    const area = scrollRef.current
    if (!area) return
    const normalizeDelta = (event: WheelEvent, delta: number, axis: 'x' | 'y') => delta * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? (axis === 'x' ? area.clientWidth : area.clientHeight) : 1)
    const onWheel = (event: WheelEvent) => {
      if (isEditableTarget(event.target)) return
      if (!event.cancelable) return
      const input: WheelInput = { deltaX: event.deltaX, deltaY: event.deltaY, deltaMode: event.deltaMode, ctrlKey: event.ctrlKey }
      const now = performance.now()
      const decision = wheelActionForBurst(classifyWheelInput(input), now, trackpadBurstUntilRef.current)
      trackpadBurstUntilRef.current = decision.burstUntil
      const layer = rotationLayerRef.current
      const rect = layer?.getBoundingClientRect()
      if (decision.action === 'zoom' && layer && rect?.width && rect.height) {
        event.preventDefault()
        onActivate()
        const targetZoom = wheelZoom(pane.zoom, input)
        const position = pagePositionAtClientPoint(rect, layer.clientWidth, layer.clientHeight, rotation, zoomPreviewScale, event.clientX, event.clientY)
        const focus: ZoomFocus = { ...position, clientX: event.clientX, clientY: event.clientY, zoom: targetZoom, paneId, page, rotation }
        if (targetZoom !== pane.zoom) zoomFocusRef.current = focus
        onZoom(targetZoom, focus)
        return
      }
      onActivate()
      event.preventDefault()
      area.scrollLeft += normalizeDelta(event, event.deltaX, 'x')
      area.scrollTop += normalizeDelta(event, event.deltaY, 'y')
    }
    area.addEventListener('wheel', onWheel, { passive: false })
    return () => area.removeEventListener('wheel', onWheel)
  }, [onActivate, onZoom, pane.zoom, paneId, page, rotation, zoomPreviewScale])

  useEffect(() => {
    const area = scrollRef.current
    if (!area) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || isEditableTarget(event.target)) return
      spacePressedRef.current = true
      event.preventDefault()
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') spacePressedRef.current = false
    }
    const onBlur = () => {
      spacePressedRef.current = false
      temporaryPanRef.current = null
      area.classList.remove('is-space-panning')
    }
    const onPointerDownCapture = (event: PointerEvent) => {
      if (!spacePressedRef.current || event.button !== 0 || isEditableTarget(event.target)) return
      event.preventDefault()
      event.stopPropagation()
      onActivate()
      const gesture = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, scrollLeft: area.scrollLeft, scrollTop: area.scrollTop }
      temporaryPanRef.current = gesture
      area.classList.add('is-space-panning')
      try { area.setPointerCapture(event.pointerId) } catch { /* Pointer capture can fail after browser cancellation. */ }
    }
    const onPointerMove = (event: PointerEvent) => {
      const gesture = temporaryPanRef.current
      if (!gesture || gesture.pointerId !== event.pointerId) return
      event.preventDefault()
      area.scrollLeft = gesture.scrollLeft - (event.clientX - gesture.x)
      area.scrollTop = gesture.scrollTop - (event.clientY - gesture.y)
    }
    const finishPan = (event: PointerEvent) => {
      const gesture = temporaryPanRef.current
      if (!gesture || gesture.pointerId !== event.pointerId) return
      temporaryPanRef.current = null
      area.classList.remove('is-space-panning')
      if (area.hasPointerCapture(event.pointerId)) area.releasePointerCapture(event.pointerId)
    }
    const onVisibilityChange = () => { if (document.visibilityState === 'hidden') onBlur() }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    document.addEventListener('visibilitychange', onVisibilityChange)
    area.addEventListener('pointerdown', onPointerDownCapture, true)
    area.addEventListener('pointermove', onPointerMove)
    area.addEventListener('pointerup', finishPan)
    area.addEventListener('pointercancel', finishPan)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      area.removeEventListener('pointerdown', onPointerDownCapture, true)
      area.removeEventListener('pointermove', onPointerMove)
      area.removeEventListener('pointerup', finishPan)
      area.removeEventListener('pointercancel', finishPan)
      area.classList.remove('is-space-panning')
    }
  }, [onActivate])

  useEffect(() => () => {
    if (canvasRef.current) clearCanvas(canvasRef.current)
    if (detailCanvasRef.current) clearCanvas(detailCanvasRef.current)
    if (colorworkCanvasRef.current) clearCanvas(colorworkCanvasRef.current)
    window.clearTimeout(detailRefreshTimerRef.current)
    detailCancelRef.current?.()
    viewerCanvasMemory.release(displayCanvasKey.current)
    viewerCanvasMemory.release(stagingCanvasKey.current)
    viewerCanvasMemory.release(detailDisplayCanvasKey.current)
    viewerCanvasMemory.release(detailStagingCanvasKey.current)
  }, [])

  useEffect(() => {
    renderPriority.current = active ? 1 : 0
    pdfPageRenderQueue.setPriority(renderQueueKey.current, renderPriority.current)
  }, [active])

  useEffect(() => {
    if (!size.width || !size.height) return
    const sequence = ++renderSequence.current
    let cancelled = false
    let timedOut = false
    let renderStarted = false
    let renderTask: RenderTask | undefined
    let pendingPageRequest: Promise<PDFPageProxy> | null = null
    let renderSettled = false
    let timeoutId = 0
    let queueTimeoutId = window.setTimeout(() => {
      if (renderStarted || cancelled) return
      timedOut = true
      cancelQueuedRender?.()
      cancelRender()
      setRenderError({ key: renderKey, message: 'PDF 페이지 표시 요청이 20초 동안 대기했습니다. 다시 시도해 주세요.' })
    }, 20000)
    let debounceId = 0
    let finishDebounce: (() => void) | undefined
    let cancelPending: (() => void) | undefined
    let staging: HTMLCanvasElement | null = null
    let releasePriority: (() => void) | undefined
    let cancelQueuedRender: (() => void) | undefined
    const previousRenderPage = lastRenderPage.current
    const renderImmediately = !previousRenderPage || previousRenderPage.page !== page || previousRenderPage.rotation !== rotation
    lastRenderPage.current = { page, rotation }
    const cancelRender = () => {
      if (cancelled) return
      cancelled = true
      window.clearTimeout(queueTimeoutId)
      window.clearTimeout(debounceId)
      finishDebounce?.()
      window.clearTimeout(timeoutId)
      cancelPending?.()
      if (!renderSettled) renderTask?.cancel?.()
    }
    const runRender = async () => {
      if (cancelled || sequence !== renderSequence.current) return
      renderStarted = true
      window.clearTimeout(queueTimeoutId)
      releasePriority = prioritizePdfPageRender()
      const cancelledRender = Symbol('cancelled')
      const cancellationPromise = new Promise<typeof cancelledRender>((resolve) => {
        cancelPending = () => resolve(cancelledRender)
      })
      let rejectTimeout!: (reason: Error) => void
      const timeoutPromise = new Promise<never>((_, reject) => { rejectTimeout = reject })
      timeoutId = window.setTimeout(() => {
        timedOut = true
        const timeoutError = new Error(t('PDF 페이지 표시가 20초 안에 끝나지 않았습니다. 다시 시도해 주세요.'))
        if (renderTask) {
          renderTask.cancel()
          void renderTask.promise.catch(() => {}).then(() => rejectTimeout(timeoutError))
        } else rejectTimeout(timeoutError)
      }, 20000)
      try {
        pendingPageRequest = pdf.getPage(page)
        const pageResult = await Promise.race([pendingPageRequest, timeoutPromise, cancellationPromise])
        if (pageResult === cancelledRender || cancelled) {
          await pendingPageRequest.catch(() => {})
          return
        }
        const pdfPage = pageResult
        const base = pdfPage.getViewport({ scale: 1 })
        const fitSize = rotatedPageSize(base, rotation)
        const fit = Math.min(Math.max(1, size.width - 24) / fitSize.width, Math.max(1, size.height - 24) / fitSize.height)
        const cssScale = Math.max(0.1, fit * pane.zoom)
        const panePixelLimit = splitView ? resourcePolicy.splitViewPixels : resourcePolicy.singleViewPixels
        const maxPixels = Math.min(panePixelLimit, Math.floor(viewerCanvasMemory.availableBytes(stagingCanvasKey.current) / 4))
        if (!maxPixels) throw new Error('PDF 렌더 메모리를 확보하지 못했습니다. 다른 탭을 닫고 다시 시도해 주세요.')
        let rasterScale = 0
        let rendered = false
        for (let attempt = 0; attempt < 2 && !rendered; attempt++) {
          rasterScale = pdfRasterScale(base.width, base.height, cssScale, window.devicePixelRatio || 1, attempt ? Math.max(1, Math.floor(maxPixels / 4)) : maxPixels)
          const viewport = pdfPage.getViewport({ scale: rasterScale })
          staging = document.createElement('canvas')
          staging.width = Math.ceil(viewport.width)
          staging.height = Math.ceil(viewport.height)
          if (!viewerCanvasMemory.reserve(stagingCanvasKey.current, staging.width * staging.height * 4)) {
            clearCanvas(staging)
            viewerCanvasMemory.release(stagingCanvasKey.current)
            staging = null
            if (!attempt) continue
            throw new Error('PDF 렌더 메모리를 확보하지 못했습니다. 다른 탭을 닫고 다시 시도해 주세요.')
          }
          const context = staging.getContext('2d', { alpha: false })
          if (!context) {
            clearCanvas(staging)
            staging = null
            viewerCanvasMemory.release(stagingCanvasKey.current)
            if (!attempt) continue
            throw new Error('이 브라우저에서 PDF 화면을 만들 수 없습니다.')
          }
          try {
            const task = pdfPage.render({ canvas: staging, canvasContext: context, viewport })
            renderTask = task
            await Promise.race([task.promise, timeoutPromise])
            renderSettled = true
            rendered = true
          } catch (cause) {
            if (timedOut) {
              await renderTask?.promise.catch(() => {})
              throw new Error(t('PDF 페이지 표시가 20초 안에 끝나지 않았습니다. 다시 시도해 주세요.'))
            }
            if (attempt || cancelled || (cause instanceof Error && cause.name === 'RenderingCancelledException')) throw cause
            clearCanvas(staging)
            staging = null
            viewerCanvasMemory.release(stagingCanvasKey.current)
            renderTask = undefined
          }
        }
        if (!rendered || !staging) throw new Error(t('PDF 페이지를 표시하지 못했습니다.'))
        renderSettled = true
        if (cancelled || sequence !== renderSequence.current) return
        let failedImageCount = failedImageCounts.get(pdfPage)
        if (failedImageCount === undefined) {
          failedImageCount = [...pdfPage.objs].filter(([objectId, data]) => objectId.startsWith('img_') && data === null).length
          failedImageCounts.set(pdfPage, failedImageCount)
        }
        if (failedImageCount) {
          throw new Error(`${page}페이지의 이미지 ${failedImageCount}개를 해독하지 못했습니다. PDF.js 이미지 자산을 확인하고 PDF를 다시 열어 주세요.`)
        }
        const target = canvasRef.current
        if (!target) throw new Error('PDF 화면을 표시할 수 없습니다.')
        target.width = 0
        target.height = 0
        viewerCanvasMemory.release(displayCanvasKey.current)
        target.width = staging.width
        target.height = staging.height
        const targetContext = target.getContext('2d', { alpha: false })
        if (!targetContext) throw new Error('PDF 화면을 표시할 수 없습니다.')
        const displayBytes = target.width * target.height * 4
        if (!viewerCanvasMemory.reserve(displayCanvasKey.current, displayBytes)) {
          clearCanvas(target)
          throw new Error('PDF 화면을 표시할 메모리를 확보하지 못했습니다.')
        }
        target.style.width = base.width * cssScale + 'px'
        target.style.height = base.height * cssScale + 'px'
        targetContext.drawImage(staging, 0, 0)
        const css = { width: base.width * cssScale, height: base.height * cssScale }
        setDisplayedSize({ page: { width: base.width, height: base.height }, css })
        setDisplayedRaster({ pdf, page, zoom: pane.zoom, rotation, scale: rasterScale })
        setReadyKey(renderKey)
      } catch (cause) {
        if (!cancelled && sequence === renderSequence.current && (timedOut || !(cause instanceof Error && cause.name === 'RenderingCancelledException'))) {
          setRenderError({ key: renderKey, message: timedOut ? t('PDF 페이지 표시가 20초 안에 끝나지 않았습니다. 다시 시도해 주세요.') : cause instanceof Error ? translateMessage(cause.message) : t('PDF 페이지를 표시하지 못했습니다.') })
        }
      } finally {
        renderSettled = true
        if (cancelled && pendingPageRequest) await pendingPageRequest.catch(() => {})
        window.clearTimeout(timeoutId)
        window.clearTimeout(queueTimeoutId)
        if (staging) clearCanvas(staging)
        viewerCanvasMemory.release(stagingCanvasKey.current)
        releasePriority?.()
      }
    }
    void (async () => {
      if (!renderImmediately) {
        await new Promise<void>((resolve) => {
          finishDebounce = resolve
          debounceId = window.setTimeout(resolve, 200)
        })
      }
      if (cancelled || sequence !== renderSequence.current) return
      cancelQueuedRender = pdfPageRenderQueue.enqueue(renderQueueKey.current, runRender, cancelRender, renderPriority.current)
    })()
    return () => {
      cancelRender()
      cancelQueuedRender?.()
    }
  }, [pdf, page, pane.zoom, rotation, size.width, size.height, retry, renderKey, splitView, resourcePolicy])

  useEffect(() => {
    if (readyKey !== renderKey) return
    scheduleDetailRender()
  }, [readyKey, renderKey, scheduleDetailRender])

  useEffect(() => {
    if (detailRequest.key !== renderKey || readyKey !== renderKey || !displayedSize || !displayedRaster || displayedRaster.pdf !== pdf || displayedRaster.page !== page || displayedRaster.rotation !== rotation) return
    const area = scrollRef.current
    const layer = rotationLayerRef.current
    const target = detailCanvasRef.current
    if (!area || !layer || !target) return

    const pageWidth = displayedSize.page.width
    const pageHeight = displayedSize.page.height
    const cssScale = displayedSize.css.width / pageWidth
    const targetScale = cssScale * Math.min(window.devicePixelRatio || 1, 2)
    if (displayedRaster.scale >= targetScale - 0.001) return

    let cancelled = false
    let renderTask: RenderTask | undefined
    let staging: HTMLCanvasElement | null = null
    let timeoutId = 0
    let rejectTimeout!: (reason: Error) => void
    const timeoutPromise = new Promise<never>((_, reject) => { rejectTimeout = reject })
    const cancellationMarker = Symbol('cancelled')
    let resolveCancellation!: (value: typeof cancellationMarker) => void
    const cancellationPromise = new Promise<typeof cancellationMarker>((resolve) => { resolveCancellation = resolve })
    const requestId = ++detailSequenceRef.current
    const cancelRender = () => {
      if (cancelled) return
      cancelled = true
      resolveCancellation(cancellationMarker)
      renderTask?.cancel?.()
    }
    let cancelQueuedRender: (() => void) | undefined
    const runRender = async () => {
      if (cancelled || requestId !== detailSequenceRef.current) return
      const areaRect = area.getBoundingClientRect()
      const viewportRect = {
        left: areaRect.left + area.clientLeft,
        top: areaRect.top + area.clientTop,
        right: areaRect.left + area.clientLeft + area.clientWidth,
        bottom: areaRect.top + area.clientTop + area.clientHeight,
      }
      const pageRect = layer.getBoundingClientRect()
      const crop = visiblePageCrop(pageRect, viewportRect, layer.clientWidth, layer.clientHeight, rotation, zoomPreviewScale)
      if (!crop?.width || !crop.height) {
        if (detailCancelRef.current === cancelQueuedRender) detailCancelRef.current = null
        return
      }

      const cropLeft = crop.x * pageWidth
      const cropTop = crop.y * pageHeight
      const cropWidth = crop.width * pageWidth
      const cropHeight = crop.height * pageHeight
      const availableBytes = viewerCanvasMemory.availableBytes(detailStagingCanvasKey.current)
      const maxPixels = Math.min(MAX_PDF_CANVAS_PIXELS, Math.floor(availableBytes / 8))
      if (!maxPixels) {
        if (detailCancelRef.current === cancelQueuedRender) detailCancelRef.current = null
        return
      }
      const rasterScale = pdfRasterScale(cropWidth, cropHeight, targetScale, 1, maxPixels)
      if (rasterScale <= displayedRaster.scale + 0.001) {
        if (detailCancelRef.current === cancelQueuedRender) detailCancelRef.current = null
        return
      }
      const pixelWidth = Math.ceil(cropWidth * rasterScale)
      const pixelHeight = Math.ceil(cropHeight * rasterScale)
      const canvasBytes = pixelWidth * pixelHeight * 4
      if (!canvasBytes) {
        if (detailCancelRef.current === cancelQueuedRender) detailCancelRef.current = null
        return
      }

      let timedOut = false
      timeoutId = window.setTimeout(() => {
        timedOut = true
        renderTask?.cancel?.()
        rejectTimeout(new Error('detail-render-timeout'))
      }, 20000)
      try {
        const pageRequest = pdf.getPage(page)
        const pageResult = await Promise.race([pageRequest, cancellationPromise, timeoutPromise])
        if (pageResult === cancellationMarker || cancelled || requestId !== detailSequenceRef.current) return
        const pdfPage = pageResult as PDFPageProxy

        staging = document.createElement('canvas')
        if (!viewerCanvasMemory.reserve(detailStagingCanvasKey.current, canvasBytes)) return
        staging.width = pixelWidth
        staging.height = pixelHeight
        const stagingContext = staging.getContext('2d', { alpha: false })
        if (!stagingContext) return
        const viewport = pdfPage.getViewport({ scale: rasterScale })
        renderTask = pdfPage.render({
          canvas: staging,
          canvasContext: stagingContext,
          viewport,
          transform: [1, 0, 0, 1, -cropLeft * rasterScale, -cropTop * rasterScale],
        })
        try {
          const renderResult = await Promise.race([renderTask.promise, cancellationPromise, timeoutPromise])
          if (renderResult === cancellationMarker || cancelled || timedOut) {
            await renderTask.promise.catch(() => {})
            return
          }
        } catch {
          renderTask.cancel?.()
          await renderTask.promise.catch(() => {})
          return
        }
        if (requestId !== detailSequenceRef.current) return

        target.style.visibility = 'hidden'
        clearCanvas(target)
        viewerCanvasMemory.release(detailDisplayCanvasKey.current)
        if (!viewerCanvasMemory.reserve(detailDisplayCanvasKey.current, canvasBytes)) return
        target.width = pixelWidth
        target.height = pixelHeight
        const targetContext = target.getContext('2d', { alpha: false })
        if (!targetContext) {
          clearCanvas(target)
          viewerCanvasMemory.release(detailDisplayCanvasKey.current)
          return
        }
        targetContext.drawImage(staging, 0, 0)
        target.style.left = cropLeft * cssScale + 'px'
        target.style.top = cropTop * cssScale + 'px'
        target.style.width = cropWidth * cssScale + 'px'
        target.style.height = cropHeight * cssScale + 'px'
        target.style.visibility = 'visible'
      } catch {
        // Keep the whole-page raster visible when an optional detail render fails.
      } finally {
        window.clearTimeout(timeoutId)
        if (staging) clearCanvas(staging)
        viewerCanvasMemory.release(detailStagingCanvasKey.current)
        if (detailCancelRef.current === cancelQueuedRender) detailCancelRef.current = null
      }
    }

    cancelQueuedRender = pdfPageRenderQueue.enqueue(detailQueueKey.current, runRender, cancelRender, active ? -0.5 : -1)
    detailCancelRef.current = cancelQueuedRender
    return () => {
      cancelQueuedRender?.()
      if (detailCancelRef.current === cancelQueuedRender) detailCancelRef.current = null
    }
  }, [readyKey, renderKey, detailRequest, displayedSize, displayedRaster, pdf, page, rotation, zoomPreviewScale, active])

  const applyZoomFocus = useCallback((focus: ZoomFocus) => {
    const area = scrollRef.current
    const layer = rotationLayerRef.current
    if (!area || !layer) return false
    if (!isZoomFocusCurrent(focus, paneId, page, rotation, pane.zoom)) {
      zoomFocusRef.current = null
      return false
    }
    const pageRect = layer.getBoundingClientRect()
    const point = clientPointForPagePosition(pageRect, layer.clientWidth, layer.clientHeight, rotation, zoomPreviewScale, focus.x, focus.y)
    area.scrollLeft = scrollOffsetForZoomFocus(area.scrollLeft, point.x, focus.clientX, area.scrollWidth, area.clientWidth)
    area.scrollTop = scrollOffsetForZoomFocus(area.scrollTop, point.y, focus.clientY, area.scrollHeight, area.clientHeight)
    return true
  }, [paneId, page, pane.zoom, rotation, zoomPreviewScale])

  const recordCenter = useCallback(() => {
    const element = scrollRef.current
    const layer = rotationLayerRef.current
    if (!element || !layer) return
    const bounds = element.getBoundingClientRect()
    const viewport = {
      left: bounds.left + element.clientLeft,
      top: bounds.top + element.clientTop,
      right: bounds.left + element.clientLeft + element.clientWidth,
      bottom: bounds.top + element.clientTop + element.clientHeight,
    }
    const focus = visiblePageFocus(layer.getBoundingClientRect(), viewport, layer.clientWidth, layer.clientHeight, rotation, zoomPreviewScale)
    onCenterRef.current(focus.x, focus.y)
    scheduleDetailRender()
  }, [rotation, zoomPreviewScale, scheduleDetailRender])

  useEffect(() => {
    if (readyKey !== renderKey) return
    const canvas = canvasRef.current
    if (canvas) onPageRendered(page, canvas)
  }, [readyKey, renderKey, page, active, onPageRendered])

  useLayoutEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const rasterReady = readyKey === renderKey
    const pendingFocus = zoomFocusRef.current
    if (pendingFocus) {
      if (applyZoomFocus(pendingFocus)) {
        if (rasterReady) {
          zoomFocusRef.current = null
        }
        recordCenter()
        return
      }
      if (!rasterReady) return
    }
    if (!rasterReady && !canPreviewZoom) return
    const bounds = element.getBoundingClientRect()
    const centerFocus: ZoomFocus = {
      x: pane.centerX,
      y: pane.centerY,
      clientX: bounds.left + element.clientLeft + element.clientWidth / 2,
      clientY: bounds.top + element.clientTop + element.clientHeight / 2,
      zoom: pane.zoom,
      paneId,
      page,
      rotation,
    }
    if (applyZoomFocus(centerFocus)) recordCenter()
  }, [readyKey, renderKey, page, paneId, pane.zoom, pane.centerX, pane.centerY, rotation, zoomPreviewScale, canPreviewZoom, applyZoomFocus, recordCenter])

  useEffect(() => {
    if (editingNoteId !== null) textInputRef.current?.focus()
  }, [editingNoteId])

  useEffect(() => {
    currentWorkRef.current = work
  }, [work])

  function cancelChartRecognition() {
    chartRequestRef.current += 1
    chartCancelRef.current?.()
    chartCancelRef.current = null
    chartSelectionRef.current = null
    setChartSelectionPreview(null)
    setChartRecognition(null)
  }

  function beginChartSelectionCapture(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.target instanceof Element && event.target.closest('.progress-line-popover-layer')) return
    if (chartRecognition?.stage !== 'select') {
      handlePanePointerDownCapture(event)
      return
    }
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const svg = pageSvgRef.current
    if (!svg) return
    event.preventDefault()
    event.stopPropagation()
    onActivate()
    const start = boundedPagePoint(pointFromEvent(event, svg, rotation))
    chartSelectionRef.current = { pointerId: event.pointerId, start }
    setChartSelectionPreview({ x: start.x, y: start.y, width: 0, height: 0 })
    try { svg.setPointerCapture(event.pointerId) } catch { /* Pointer capture can be unavailable in embedded browsers. */ }
  }

  function openChartRecognition(guideId: string) {
    chartCancelRef.current?.()
    chartCancelRef.current = null
    chartSelectionRef.current = null
    setChartSelectionPreview(null)
    setChartRecognition({ guideId, stage: 'select', rotation })
  }

  async function analyzeChartRegion(selection: { x: number; y: number; width: number; height: number }, guideId: string) {
    const requestId = ++chartRequestRef.current
    const analysisRotation = rotation
    let source: HTMLCanvasElement | null = null
    let oriented: HTMLCanvasElement | null = null
    let renderTask: RenderTask | undefined
    let cancelWorker: (() => void) | null = null
    const cancel = () => {
      renderTask?.cancel?.()
      cancelWorker?.()
    }
    chartCancelRef.current?.()
    chartCancelRef.current = cancel
    setChartRecognition({ guideId, stage: 'analyzing', selection, rotation: analysisRotation })
    try {
      const sourcePage = await pdf.getPage(page)
      if (requestId !== chartRequestRef.current) return
      const baseViewport = sourcePage.getViewport({ scale: 1 })
      const cropLeft = selection.x * baseViewport.width
      const cropTop = selection.y * baseViewport.height
      const cropWidth = selection.width * baseViewport.width
      const cropHeight = selection.height * baseViewport.height
      const rasterScale = Math.min(2, Math.sqrt(1_500_000 / Math.max(1, cropWidth * cropHeight)))
      const pixelWidth = Math.max(1, Math.ceil(cropWidth * rasterScale))
      const pixelHeight = Math.max(1, Math.ceil(cropHeight * rasterScale))
      source = document.createElement('canvas')
      source.width = pixelWidth
      source.height = pixelHeight
      const sourceContext = source.getContext('2d', { willReadFrequently: true })
      if (!sourceContext) throw new Error('차트 이미지를 만들 수 없습니다.')
      const viewport = sourcePage.getViewport({ scale: rasterScale })
      renderTask = sourcePage.render({
        canvas: source,
        canvasContext: sourceContext,
        viewport,
        transform: [1, 0, 0, 1, -cropLeft * rasterScale, -cropTop * rasterScale],
      })
      await renderTask.promise
      if (requestId !== chartRequestRef.current) return

      const swapped = analysisRotation === 90 || analysisRotation === 270
      oriented = document.createElement('canvas')
      oriented.width = swapped ? source.height : source.width
      oriented.height = swapped ? source.width : source.height
      const orientedContext = oriented.getContext('2d', { willReadFrequently: true })
      if (!orientedContext) throw new Error('회전한 차트 이미지를 만들 수 없습니다.')
      if (analysisRotation === 90) {
        orientedContext.translate(oriented.width, 0)
        orientedContext.rotate(Math.PI / 2)
      } else if (analysisRotation === 180) {
        orientedContext.translate(oriented.width, oriented.height)
        orientedContext.rotate(Math.PI)
      } else if (analysisRotation === 270) {
        orientedContext.translate(0, oriented.height)
        orientedContext.rotate(-Math.PI / 2)
      }
      orientedContext.drawImage(source, 0, 0)
      const imageUrl = oriented.toDataURL('image/png')
      const worker = runChartRowsWorker(orientedContext.getImageData(0, 0, oriented.width, oriented.height))
      cancelWorker = worker.cancel
      const rows = await worker.promise
      if (requestId !== chartRequestRef.current) return
      setChartRecognition({ guideId, stage: 'review', selection, imageUrl, rows, rotation: analysisRotation })
    } catch (error) {
      if (requestId !== chartRequestRef.current || error instanceof Error && error.name === 'AbortError') return
      setChartRecognition({ guideId, stage: 'error', selection, rotation: analysisRotation, error: t('차트 행을 분석하지 못했습니다. 지정 영역을 다시 선택해 주세요.') })
    } finally {
      if (source) { source.width = 0; source.height = 0 }
      if (oriented) { oriented.width = 0; oriented.height = 0 }
      if (chartRequestRef.current === requestId) chartCancelRef.current = null
    }
  }

  async function applyChartRows(result: ChartRowRecognitionResult) {
    const state = chartRecognition
    const before = currentWorkRef.current
    const guide = before.horizontalGuides?.find((item) => item.id === state?.guideId)
    if (!state?.selection || !guide || !result.rows.length || result.rows.length > 9999) return false
    const displayCrop = pageRectToDisplayRect(state.selection, state.rotation)
    const rowRanges = result.rows.map((row) => displayRectToPageRect({
      x: displayCrop.x + row.x * displayCrop.width,
      y: displayCrop.y + row.y * displayCrop.height,
      width: row.width * displayCrop.width,
      height: row.height * displayCrop.height,
    }, state.rotation))
    const nextGuide: ProgressGuide = {
      ...guide,
      linkedCounterId: result.counterId,
      counterRowOffset: 0,
      positionOffset: undefined,
      rowSpacing: undefined,
      rowSpacingStartRow: undefined,
      rowSpacingDirection: undefined,
      chartRegion: {
        ...state.selection,
        firstRow: 1,
        lastRow: rowRanges.length,
        startCounterRow: result.startCounterRow,
        repeat: false,
        direction: result.direction,
        rowRanges,
        analysisRotation: state.rotation,
        autoFollow: true,
      },
      markerProgress: guide.markerProgress,
    }
    const next = { ...before, horizontalGuides: before.horizontalGuides?.map((item) => item.id === guide.id ? nextGuide : item) ?? [nextGuide] }
    return onChartRowsApply(next, before)
  }

  useEffect(() => () => {
    chartRequestRef.current += 1
    chartCancelRef.current?.()
    chartCancelRef.current = null
  }, [])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Cancel analysis when its source coordinate frame changes.
    if (chartRecognition && chartRecognition.rotation !== rotation) cancelChartRecognition()
  }, [rotation, chartRecognition])

  useLayoutEffect(() => {
    if (!active || !regionPopoverOpen || !selectedRegionId) return
    const updatePosition = () => {
      const regionNode = regionNodesRef.current.get(selectedRegionId)
      const panel = regionPopoverRef.current
      if (!regionNode || !panel) return
      const regionRect = regionNode.getBoundingClientRect()
      const panelRect = panel.getBoundingClientRect()
      const margin = 8
      const width = panelRect.width
      const height = panelRect.height
      const viewportWidth = document.documentElement.clientWidth
      const viewportHeight = document.documentElement.clientHeight
      const fits = (left: number, top: number) => left >= margin && top >= margin && left + width <= viewportWidth - margin && top + height <= viewportHeight - margin
      let left: number
      let top: number
      if (regionRect.width >= width + margin * 2 && regionRect.height >= height + margin * 2) {
        left = regionRect.right - width - margin
        top = regionRect.top + margin
      } else {
        const candidates = [
          { left: regionRect.right + margin, top: regionRect.top },
          { left: regionRect.left - width - margin, top: regionRect.top },
          { left: regionRect.right + margin, top: regionRect.bottom - height },
          { left: regionRect.left - width - margin, top: regionRect.bottom - height },
          { left: regionRect.left, top: regionRect.bottom + margin },
          { left: regionRect.left, top: regionRect.top - height - margin },
        ]
        const available = candidates.find((candidate) => fits(candidate.left, candidate.top)) ?? candidates[0]
        left = available.left
        top = available.top
      }
      left = Math.min(Math.max(margin, left), Math.max(margin, viewportWidth - width - margin))
      top = Math.min(Math.max(margin, top), Math.max(margin, viewportHeight - height - margin))
      setRegionPopoverPosition((current) => current?.left === left && current.top === top ? current : { left, top })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    document.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      document.removeEventListener('scroll', updatePosition, true)
    }
  }, [active, displayedSize, pane.zoom, regionHighlights, regionPopoverOpen, rotation, selectedRegionId, size.height, size.width])

  useEffect(() => {
    if (!active || !regionPopoverOpen || !selectedRegionId) return
    const close = () => {
      setRegionPopoverOpen(false)
      updateSelectedRegionId(null)
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node) || regionPopoverRef.current?.contains(target)) return
      if (target instanceof Element && target.closest('[data-region-highlight-id]')) return
      close()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      const regionNode = regionNodesRef.current.get(selectedRegionId)
      close()
      regionNode?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [active, regionPopoverOpen, selectedRegionId, updateSelectedRegionId])

  useLayoutEffect(() => {
    setPendingStrokePreviews((current) => {
      const remaining = current.filter((item) => item.documentId !== work.documentId || item.pageNumber !== work.pageNumber || !work.annotations.some((annotation) => annotation.id === item.annotation.id))
      return remaining.length === current.length ? current : remaining
    })
  }, [work])

  useEffect(() => {
    onCenterRef.current = onCenter
  }, [onCenter])

  function beginRegionHighlight(event: ReactPointerEvent<SVGSVGElement>, point: Point) {
    if (!workReady || !displayedSize || (event.pointerType === 'mouse' && event.button !== 0) || !canCreateLimitedAnnotation('region-highlight')) return
    event.preventDefault()
    event.stopPropagation()
    onActivate()
    event.currentTarget.setPointerCapture(event.pointerId)
    const before = currentWorkRef.current
    regionDrawing.current = { pointerId: event.pointerId, start: boundedPagePoint(point), before }
    setRegionPreview({ id: 'draft', ...regionFromPoints(point, point), color: annotationStyle.color, opacity: annotationStyle.opacity })
    updateSelectedRegionId(null)
    setRegionPopoverOpen(false)
    updateSelectedNoteId(null)
    setEditingNoteId(null)
  }

  function beginRegionTransform(event: ReactPointerEvent<SVGElement>, region: RegionHighlight, kind: 'move' | RegionResizeHandle) {
    if (!displayedSize || !annotationLayerRef.current || (event.pointerType === 'mouse' && event.button !== 0)) return
    event.preventDefault()
    event.stopPropagation()
    onActivate()
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* Pointer events still bubble to the SVG when capture is unavailable. */ }
    regionTransform.current = {
      id: region.id,
      pointerId: event.pointerId,
      kind,
      start: pointFromEvent(event, annotationLayerRef.current, rotation),
      original: region,
      before: currentWorkRef.current,
      changed: false,
    }
  }

  function handleRegionPointerDown(event: ReactPointerEvent<SVGElement>, region: RegionHighlight, kind: 'move' | RegionResizeHandle = 'move') {
    const action = regionHighlightPointerAction(tool, true, selectedRegionId === region.id)
    if (action === 'ignore') return
    updateSelectedNoteId(null)
    setEditingNoteId(null)
    updateSelectedRegionId(region.id)
    setRegionPopoverOpen(true)
    if (action === 'move' || kind !== 'move') {
      event.stopPropagation()
      beginRegionTransform(event, region, kind)
    } else event.stopPropagation()
  }

  function moveRegionTransform(event: ReactPointerEvent<SVGSVGElement>) {
    const transform = regionTransform.current
    const layer = annotationLayerRef.current
    if (!transform || transform.pointerId !== event.pointerId || !layer || !displayedSize) return
    event.preventDefault()
    event.stopPropagation()
    const point = boundedPagePoint(pointFromEvent(event, layer, rotation))
    const dx = point.x - transform.start.x
    const dy = point.y - transform.start.y
    const original = transform.original
    const minWidth = Math.min(original.width, 8 / Math.max(displayedSize.css.width, 1))
    const minHeight = Math.min(original.height, 8 / Math.max(displayedSize.css.height, 1))
    let nextRegion: RegionHighlight
    if (transform.kind === 'move') {
      nextRegion = {
        ...original,
        x: Math.min(1 - original.width, Math.max(0, original.x + dx)),
        y: Math.min(1 - original.height, Math.max(0, original.y + dy)),
      }
    } else {
      let left = original.x
      let top = original.y
      let right = original.x + original.width
      let bottom = original.y + original.height
      if (transform.kind.includes('w')) left = Math.min(right - minWidth, Math.max(0, original.x + dx))
      else right = Math.max(left + minWidth, Math.min(1, right + dx))
      if (transform.kind.includes('n')) top = Math.min(bottom - minHeight, Math.max(0, original.y + dy))
      else bottom = Math.max(top + minHeight, Math.min(1, bottom + dy))
      nextRegion = { ...original, x: left, y: top, width: right - left, height: bottom - top }
    }
    transform.changed = !sameRegionGeometry(original, nextRegion)
    if (!transform.changed) return
    const current = currentWorkRef.current
    const next = { ...current, regionHighlights: (current.regionHighlights ?? []).map((item) => item.id === transform.id ? nextRegion : item) }
    currentWorkRef.current = next
    onWorkChangeRef.current(next, false, false, transform.before)
  }

  function finishRegionTransform(pointerId: number, cancelled = false) {
    const transform = regionTransform.current
    if (!transform || transform.pointerId !== pointerId) return
    regionTransform.current = null
    const latest = currentWorkRef.current
    if (cancelled) {
      currentWorkRef.current = transform.before
      onWorkChangeRef.current(transform.before, true, false)
    } else if (transform.changed) {
      onWorkChangeRef.current(latest, true, true, transform.before)
    }
  }

  function updateRegionPreview(event: ReactPointerEvent<SVGSVGElement>) {
    const drawing = regionDrawing.current
    if (!drawing || drawing.pointerId !== event.pointerId) return
    const point = boundedPagePoint(pointFromEvent(event, event.currentTarget, rotation))
    setRegionPreview({ id: 'draft', ...regionFromPoints(drawing.start, point), color: annotationStyle.color, opacity: annotationStyle.opacity })
  }

  function finishRegionHighlight(event: ReactPointerEvent<SVGSVGElement>, cancelled = false) {
    const drawing = regionDrawing.current
    if (!drawing || drawing.pointerId !== event.pointerId) return
    regionDrawing.current = null
    setRegionPreview(null)
    if (cancelled || !displayedSize) return
    const point = boundedPagePoint(pointFromEvent(event, event.currentTarget, rotation))
    const box = regionFromPoints(drawing.start, point)
    const isQuarterTurn = rotation === 90 || rotation === 270
    const visualWidth = (isQuarterTurn ? box.height : box.width) * (isQuarterTurn ? displayedSize.css.height : displayedSize.css.width)
    const visualHeight = (isQuarterTurn ? box.width : box.height) * (isQuarterTurn ? displayedSize.css.width : displayedSize.css.height)
    if (visualWidth < 8 || visualHeight < 8) return
    const region: RegionHighlight = { id: crypto.randomUUID(), ...box, color: annotationStyle.color, opacity: annotationStyle.opacity }
    const next = { ...drawing.before, regionHighlights: [...(drawing.before.regionHighlights ?? []), region] }
    if (onWorkChangeRef.current(next, true, true, drawing.before) === false) return
    currentWorkRef.current = next
    updateSelectedRegionId(region.id)
    setRegionPopoverOpen(true)
    onRegionHighlightToolConsumed()
  }

  function beginRegionOpacityChange(id: string) {
    if (regionStyleEditBefore.current?.id === id) return
    finishRegionOpacityChange()
    regionStyleEditBefore.current = { id, before: currentWorkRef.current }
  }

  function changeRegionStyle(id: string, change: Partial<Pick<RegionHighlight, 'color' | 'opacity'>>, grouped = false) {
    if (grouped && regionStyleEditBefore.current?.id !== id) beginRegionOpacityChange(id)
    const transaction = grouped ? regionStyleEditBefore.current : null
    const before = transaction?.before ?? currentWorkRef.current
    const existing = currentWorkRef.current.regionHighlights?.find((region) => region.id === id)
    if (!existing || (change.color === undefined || change.color === existing.color) && (change.opacity === undefined || change.opacity === existing.opacity)) return
    const next = {
      ...currentWorkRef.current,
      regionHighlights: (currentWorkRef.current.regionHighlights ?? []).map((region) => region.id === id ? { ...region, ...change } : region),
    }
    currentWorkRef.current = next
    onWorkChangeRef.current(next, !transaction, !transaction, before)
  }

  function finishRegionOpacityChange() {
    const transaction = regionStyleEditBefore.current
    if (!transaction) return
    regionStyleEditBefore.current = null
    const beforeRegion = transaction.before.regionHighlights?.find((region) => region.id === transaction.id)
    const currentRegion = currentWorkRef.current.regionHighlights?.find((region) => region.id === transaction.id)
    if (beforeRegion && currentRegion && (beforeRegion.color !== currentRegion.color || beforeRegion.opacity !== currentRegion.opacity)) {
      onWorkChangeRef.current(currentWorkRef.current, true, true, transaction.before)
    }
  }

  function deleteRegionHighlight(id: string) {
    finishRegionOpacityChange()
    const before = currentWorkRef.current
    const next = { ...before, regionHighlights: (before.regionHighlights ?? []).filter((region) => region.id !== id) }
    currentWorkRef.current = next
    onWorkChangeRef.current(next, true, true, before)
    updateSelectedRegionId(null)
    setRegionPopoverOpen(false)
  }

  function handlePanePointerDownCapture(event: ReactPointerEvent<HTMLDivElement>) {
    if (tool === 'pan' && !canStartPaneGesture(paneGestureOwnerRef.current, paneId)) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    onActivate()
  }

  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const target = event.target
    if (!(target instanceof Element) || !target.closest('.page-note')) {
      setSelectedNoteId(null)
      setEditingNoteId(null)
    }
    if (!(target instanceof Element) || !target.closest('.page-note, [data-region-highlight-id], [data-region-highlight-handle]')) {
      updateSelectedNoteId(null)
      updateSelectedRegionId(null)
    }
    if (tool !== 'pan' || (event.pointerType === 'mouse' && event.button !== 0)) return
    const area = scrollRef.current
    if (!area) return
    if (!canStartPaneGesture(paneGestureOwnerRef.current, paneId)) return
    paneGestureOwnerRef.current = paneId
    const link = target instanceof Element ? target.closest<HTMLAnchorElement>('.page-pdf-link, .page-qr-link') : null
    const href = link ? safeQrHref(link.href) : null
    if (href) linkGesturesRef.current.set(event.pointerId, { href, startX: event.clientX, startY: event.clientY, moved: false, pinched: false })
    event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const current = gesture.current
    if (!current) {
      gesture.current = { kind: 'pan', pointerId: event.pointerId, x: event.clientX, y: event.clientY, scrollLeft: area.scrollLeft, scrollTop: area.scrollTop }
    } else if (current.kind === 'pan') {
      const first = pointers.current.get(current.pointerId)
      if (!first) return
      linkGesturesRef.current.forEach((gesture) => { gesture.pinched = true })
      const midpointX = (first.x + event.clientX) / 2
      const midpointY = (first.y + event.clientY) / 2
      const layer = rotationLayerRef.current
      if (!layer) return
      const layerRect = layer.getBoundingClientRect()
      cancelDetailRender()
      gesture.current = {
        kind: 'pinch', firstId: current.pointerId, secondId: event.pointerId,
        distance: Math.max(1, Math.hypot(event.clientX - first.x, event.clientY - first.y)),
        zoom: pinchZoom.current ?? pane.zoom,
        pagePoint: pagePositionAtClientPoint(layerRect, layer.clientWidth, layer.clientHeight, rotation, zoomPreviewScale, midpointX, midpointY),
        pageWidth: layer.clientWidth,
        pageHeight: layer.clientHeight,
        layerCenterX: layerRect.left + layerRect.width / 2,
        layerCenterY: layerRect.top + layerRect.height / 2,
      }
    }
  }

  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const area = scrollRef.current
    const current = gesture.current
    const linkGesture = linkGesturesRef.current.get(event.pointerId)
    if (linkGesture && !shouldOpenLinkAfterGesture(linkGesture.startX, linkGesture.startY, event.clientX, event.clientY)) linkGesture.moved = true
    if (tool !== 'pan' || !area || !current || !pointers.current.has(event.pointerId)) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (current.kind === 'pan' && current.pointerId === event.pointerId) {
      area.scrollLeft = current.scrollLeft - (event.clientX - current.x)
      area.scrollTop = current.scrollTop - (event.clientY - current.y)
      return
    }
    if (current.kind === 'pinch') {
      const first = pointers.current.get(current.firstId)
      const second = pointers.current.get(current.secondId)
      if (!first || !second) return
      const zoom = Math.min(5, Math.max(0.5, current.zoom * Math.hypot(second.x - first.x, second.y - first.y) / current.distance))
      pinchZoom.current = zoom
      const layer = rotationLayerRef.current
      if (layer) {
        const scale = canPreviewZoom && displayedRaster ? zoom / displayedRaster.zoom : 1
        const translation = pinchPreviewTranslation(current.layerCenterX, current.layerCenterY, current.pageWidth, current.pageHeight, rotation, scale, current.pagePoint.x, current.pagePoint.y, (first.x + second.x) / 2, (first.y + second.y) / 2)
        layer.style.transform = 'translate(' + translation.x + 'px, ' + translation.y + 'px) rotate(' + rotation + 'deg) scale(' + scale + ')'
      }
    }
  }

  function pointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const current = gesture.current
    const area = scrollRef.current
    if (!pointers.current.has(event.pointerId)) return
    if (event.type === 'pointercancel') {
      pointers.current.clear()
      linkGesturesRef.current.clear()
      gesture.current = null
      pinchZoom.current = null
      zoomFocusRef.current = null
      if (paneGestureOwnerRef.current === paneId) paneGestureOwnerRef.current = null
      if (rotationLayerRef.current) rotationLayerRef.current.style.transform = 'rotate(' + rotation + 'deg) scale(' + zoomPreviewScale + ')'
      recordCenter()
      return
    }
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const linkGesture = linkGesturesRef.current.get(event.pointerId)
    if (tool === 'pan' && linkGesture && !linkGesture.moved && shouldOpenLinkAfterGesture(linkGesture.startX, linkGesture.startY, event.clientX, event.clientY, linkGesture.pinched)) {
      window.open(linkGesture.href, '_blank', 'noopener,noreferrer')
    }
    linkGesturesRef.current.delete(event.pointerId)
    if (tool === 'pan' && current?.kind === 'pinch' && area) {
      const first = pointers.current.get(current.firstId)
      const second = pointers.current.get(current.secondId)
      if (first && second) {
        const zoom = nearestZoomLevel(Math.min(5, Math.max(0.5, current.zoom * Math.hypot(second.x - first.x, second.y - first.y) / current.distance)))
        const midpointX = (first.x + second.x) / 2
        const midpointY = (first.y + second.y) / 2
        const focus: ZoomFocus = { ...current.pagePoint, clientX: midpointX, clientY: midpointY, zoom, paneId, page, rotation }
        if (zoom !== pane.zoom) {
          zoomFocusRef.current = focus
          onZoom(zoom)
        } else {
          if (rotationLayerRef.current) rotationLayerRef.current.style.transform = 'rotate(' + rotation + 'deg) scale(' + zoomPreviewScale + ')'
          zoomFocusRef.current = null
          applyZoomFocus(focus)
          recordCenter()
        }
      }
    }
    pointers.current.delete(event.pointerId)
    pinchZoom.current = null
    const remaining = [...pointers.current.entries()][0]
    if (area && remaining) {
      gesture.current = { kind: 'pan', pointerId: remaining[0], x: remaining[1].x, y: remaining[1].y, scrollLeft: area.scrollLeft, scrollTop: area.scrollTop }
    } else {
      gesture.current = null
      if (paneGestureOwnerRef.current === paneId) paneGestureOwnerRef.current = null
    }
  }

  function pointerCaptureLost(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return
    pointers.current.clear()
    linkGesturesRef.current.clear()
    gesture.current = null
    pinchZoom.current = null
    zoomFocusRef.current = null
    if (paneGestureOwnerRef.current === paneId) paneGestureOwnerRef.current = null
    if (rotationLayerRef.current) rotationLayerRef.current.style.transform = 'rotate(' + rotation + 'deg) scale(' + zoomPreviewScale + ')'
    recordCenter()
  }

  function removeStrokeListeners() {
    const listeners = strokeListenersRef.current
    if (!listeners) return
    window.removeEventListener('pointermove', listeners.move)
    window.removeEventListener('pointerup', listeners.up)
    window.removeEventListener('pointercancel', listeners.cancel)
    listeners.svg.removeEventListener('lostpointercapture', listeners.lost)
    strokeListenersRef.current = null
  }

  function scheduleStrokePreview(stroke: ActiveInkStroke) {
    if (strokePreviewFrameRef.current !== null) return
    strokePreviewFrameRef.current = requestAnimationFrame(() => {
      strokePreviewFrameRef.current = null
      if (strokeRef.current?.id === stroke.id) setDraft(stroke.points)
    })
  }

  function saveCompletedStroke(stroke: ActiveInkStroke, annotation: AnnotationRecord) {
    const latest = currentWorkRef.current
    const samePage = latest.documentId === stroke.documentId && latest.pageNumber === stroke.pageNumber
    const base = samePage ? latest : stroke.before
    if (base.annotations.some((item) => item.id === annotation.id)) {
      failedStrokeRef.current = null
      setStrokeError(false)
      return true
    }
    const next = { ...base, annotations: [...base.annotations, annotation] }
    try {
      if (onWorkChangeRef.current(next, true, true, stroke.before) === false) {
        failedStrokeRef.current = null
        setStrokeError(false)
        return true
      }
      currentWorkRef.current = next
      setPendingStrokePreviews((current) => [...current.filter((item) => item.annotation.id !== annotation.id), { documentId: stroke.documentId, pageNumber: stroke.pageNumber, annotation }].slice(-32))
      failedStrokeRef.current = null
      setStrokeError(false)
      return true
    } catch {
      failedStrokeRef.current = { work: next, before: stroke.before, annotation }
      setDraft(annotation.points)
      setStrokeError(true)
      return false
    }
  }

  function finishInkStroke(pointerId: number, finalPoint?: InkPoint) {
    const stroke = strokeRef.current
    if (!stroke || stroke.pointerId !== pointerId) return
    strokeRef.current = null
    const captureElement = strokeListenersRef.current?.svg
    removeStrokeListeners()
    try {
      if (captureElement?.hasPointerCapture(pointerId)) captureElement.releasePointerCapture(pointerId)
    } catch { /* Capture may already be released by the browser. */ }
    if (strokePreviewFrameRef.current !== null) {
      cancelAnimationFrame(strokePreviewFrameRef.current)
      strokePreviewFrameRef.current = null
    }
    const annotation = createInkAnnotation(stroke, finalPoint, stroke.pageWidth, stroke.pageHeight)
    if (saveCompletedStroke(stroke, annotation)) setDraft([])
  }

  finishInkStrokeRef.current = finishInkStroke

  function retryStrokeSave() {
    const failed = failedStrokeRef.current
    if (!failed) return
    try {
      const latest = currentWorkRef.current
      const samePage = latest.documentId === failed.work.documentId && latest.pageNumber === failed.work.pageNumber
      const base = samePage ? latest : failed.work
      const alreadySaved = samePage && latest.annotations.some((item) => item.id === failed.annotation.id)
      if (!alreadySaved) {
        const next = base.annotations.some((item) => item.id === failed.annotation.id)
          ? base
          : { ...base, annotations: [...base.annotations, failed.annotation] }
        onWorkChangeRef.current(next, true, true, samePage ? latest : failed.before)
        if (samePage) currentWorkRef.current = next
        setPendingStrokePreviews((current) => [...current.filter((item) => item.annotation.id !== failed.annotation.id), { documentId: failed.work.documentId, pageNumber: failed.work.pageNumber, annotation: failed.annotation }].slice(-32))
      }
      failedStrokeRef.current = null
      setStrokeError(false)
      setDraft([])
    } catch {
      setStrokeError(true)
    }
  }

  function beginInkStroke(event: ReactPointerEvent<SVGSVGElement>, point: Point) {
    if (strokeRef.current || failedStrokeRef.current || (tool !== 'pen' && tool !== 'line' && tool !== 'highlight')) return
    if ((tool === 'pen' || tool === 'highlight') && !canCreateLimitedAnnotation(tool)) return
    const svg = event.currentTarget
    try { svg.setPointerCapture(event.pointerId) } catch { /* Window listeners still finish the stroke if capture is unavailable. */ }
    const base = currentWorkRef.current.documentId === work.documentId && currentWorkRef.current.pageNumber === page
      ? currentWorkRef.current
      : work
    const stroke: ActiveInkStroke = {
      id: createInkId(), pointerId: event.pointerId, documentId: work.documentId, pageNumber: page,
      rotation, tool, style: { ...annotationStyle }, before: base,
      pageWidth: displayedSize?.css.width ?? 1, pageHeight: displayedSize?.css.height ?? 1,
      points: [point],
    }
    strokeRef.current = stroke
    actionStartWork.current = base
    setDraft(stroke.points)
    setStrokeError(false)
    const pointFromNativeEvent = (nativeEvent: PointerEvent) => {
      return pointFromEvent(nativeEvent, svg, stroke.rotation)
    }
    const isThisStroke = (nativeEvent: PointerEvent) => nativeEvent.pointerId === stroke.pointerId && strokeRef.current?.id === stroke.id
    const move = (nativeEvent: PointerEvent) => {
      const target = nativeEvent.target
      if (!isThisStroke(nativeEvent) || (target instanceof Node && svg.contains(target))) return
      const nextPoint = pointFromNativeEvent(nativeEvent)
      if (!nextPoint) return
      stroke.points = appendInkPoint(stroke.points, nextPoint, stroke.pageWidth, stroke.pageHeight)
      scheduleStrokePreview(stroke)
    }
    const up = (nativeEvent: PointerEvent) => {
      if (!isThisStroke(nativeEvent)) return
      const finalPoint = nativeEvent.type === 'pointerup' ? pointFromNativeEvent(nativeEvent) : undefined
      finishInkStroke(stroke.pointerId, finalPoint)
    }
    const cancel = (nativeEvent: PointerEvent) => {
      if (isThisStroke(nativeEvent)) finishInkStroke(stroke.pointerId)
    }
    const lost = (nativeEvent: PointerEvent) => {
      if (isThisStroke(nativeEvent)) finishInkStroke(stroke.pointerId)
    }
    strokeListenersRef.current = { svg, move, up, cancel, lost }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    svg.addEventListener('lostpointercapture', lost)
  }

  useLayoutEffect(() => () => {
    const stroke = strokeRef.current
    if (stroke) finishInkStrokeRef.current(stroke.pointerId)
    pointers.current.clear()
    gesture.current = null
    pinchZoom.current = null
    zoomFocusRef.current = null
  }, [pdf, page, paneId, rotation, work.documentId])

  function doubleTap(event: React.MouseEvent<HTMLDivElement>) {
    if (tool !== 'pan') return
    const layer = rotationLayerRef.current
    if (!layer) return
    if (pane.zoom === 1) {
      const point = pagePositionAtClientPoint(layer.getBoundingClientRect(), layer.clientWidth, layer.clientHeight, rotation, zoomPreviewScale, event.clientX, event.clientY)
      const focus: ZoomFocus = { ...point, clientX: event.clientX, clientY: event.clientY, zoom: 2, paneId, page, rotation }
      zoomFocusRef.current = focus
      onZoom(2, focus)
    } else {
      zoomFocusRef.current = null
      onCenter(0.5, 0.5)
      onZoom(1)
    }
  }

  function addText(point: Point) {
    if (editingNoteId !== null) finishTextEdit(editingNoteId)
    if (!canCreateLimitedAnnotation('text')) return
    const before = currentWorkRef.current
    const box = textNoteBoxAt(point)
    const id = crypto.randomUUID()
    const note: AnnotationRecord = {
      id, type: 'text', text: '',
      points: [{ x: box.x, y: box.y }],
      boxWidth: box.width, boxHeight: box.height, style: { ...annotationStyle },
    }
    if (onWorkChange({ ...before, annotations: [...before.annotations, note] }, false, false, before) === false) return
    currentWorkRef.current = { ...before, annotations: [...before.annotations, note] }
    textEditBefore.current.set(id, before)
    setTextDraft({ id, value: '' })
    updateSelectedNoteId(id)
    setEditingNoteId(id)
    setTextPreviewPoint(null)
    onTextToolConsumed()
  }

  function colorworkCellAt(event: ReactPointerEvent<HTMLCanvasElement>, grid: ColorworkGrid) {
    const point = pointFromEvent(event, event.currentTarget, 0)
    return {
      column: Math.min(grid.columns - 1, Math.max(0, Math.floor(point.x * grid.columns))),
      row: Math.min(grid.rows - 1, Math.max(0, Math.floor(point.y * grid.rows))),
    }
  }

  function drawColorworkCell(canvas: HTMLCanvasElement, grid: ColorworkGrid, column: number, row: number, cell: ColorworkCell | null) {
    const context = canvas.getContext('2d')
    const rect = canvas.getBoundingClientRect()
    if (!context || !rect.width || !rect.height) return
    const cellWidth = canvas.width / grid.columns
    const cellHeight = canvas.height / grid.rows
    const x = column * cellWidth + 0.5
    const y = row * cellHeight + 0.5
    const width = Math.max(0, cellWidth - 1)
    const height = Math.max(0, cellHeight - 1)
    context.clearRect(x, y, width, height)
    if (cell) {
      context.globalAlpha = cell.opacity
      context.fillStyle = cell.color
      context.fillRect(x, y, width, height)
      context.globalAlpha = 1
    }
  }

  function sameColorworkCell(first: ColorworkCell | null | undefined, second: ColorworkCell | null | undefined) {
    return first === second || Boolean(first && second && first.color === second.color && first.opacity === second.opacity)
  }

  function paintColorworkSegment(stroke: ColorworkStroke, target: { column: number; row: number }, grid: ColorworkGrid, canvas: HTMLCanvasElement) {
    const previous = stroke.previous ?? target
    let column = previous.column
    let row = previous.row
    const dx = Math.abs(target.column - column)
    const sx = column < target.column ? 1 : -1
    const dy = -Math.abs(target.row - row)
    const sy = row < target.row ? 1 : -1
    let error = dx + dy
    const nextCell: ColorworkCell | null = colorworkEraser ? null : { color: colorworkBrushColor, opacity: colorworkBrushOpacity }
    while (true) {
      const index = row * grid.columns + column
      const currentCell = (stroke.cells.has(index) ? stroke.cells.get(index) : grid.cells[index]) ?? null
      if (!sameColorworkCell(currentCell, nextCell)) {
        if (!stroke.originalCells.has(index)) stroke.originalCells.set(index, currentCell)
        stroke.cells.set(index, nextCell)
        stroke.changed = true
        drawColorworkCell(canvas, grid, column, row, nextCell)
      }
      if (column === target.column && row === target.row) break
      const twiceError = error * 2
      if (twiceError >= dy) { error += dy; column += sx }
      if (twiceError <= dx) { error += dx; row += sy }
    }
    stroke.previous = target
  }

  function beginColorworkStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
    const grid = work.colorworkGrid
    if (!grid || (event.pointerType === 'mouse' && event.button !== 0)) return
    event.preventDefault()
    event.stopPropagation()
    onActivate()
    const stroke: ColorworkStroke = { pointerId: event.pointerId, before: work, cells: new Map(), originalCells: new Map(), previous: null, changed: false }
    colorworkStroke.current = stroke
    event.currentTarget.setPointerCapture(event.pointerId)
    paintColorworkSegment(stroke, colorworkCellAt(event, grid), grid, event.currentTarget)
  }

  function moveColorworkStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
    const stroke = colorworkStroke.current
    const grid = work.colorworkGrid
    if (!stroke || stroke.pointerId !== event.pointerId || !grid) return
    event.preventDefault()
    event.stopPropagation()
    paintColorworkSegment(stroke, colorworkCellAt(event, grid), grid, event.currentTarget)
  }

  function finishColorworkStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
    const stroke = colorworkStroke.current
    if (!stroke || stroke.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    colorworkStroke.current = null
    if (!stroke.changed) return
    const grid = stroke.before.colorworkGrid
    if (!grid) return
    const changes = [...stroke.originalCells].flatMap(([index, before]) => {
      const after = stroke.cells.get(index) ?? null
      return sameColorworkCell(before, after) ? [] : [{ index, before, after }]
    })
    if (changes.length) {
      const cells = [...grid.cells]
      for (const change of changes) cells[change.index] = change.after
      onWorkChange({ ...stroke.before, colorworkGrid: { ...grid, cells } }, false, true, stroke.before, changes)
    }
  }

  function beginColorworkTransform(event: ReactPointerEvent<HTMLElement>, kind: ColorworkTransform['kind']) {
    const grid = work.colorworkGrid
    if (!grid || !displayedSize || (event.pointerType === 'mouse' && event.button !== 0)) return
    event.preventDefault()
    event.stopPropagation()
    onActivate()
    event.currentTarget.setPointerCapture(event.pointerId)
    const start = rotationLayerRef.current
      ? pointFromEvent(event, rotationLayerRef.current, rotation)
      : { x: 0, y: 0 }
    colorworkTransform.current = {
      pointerId: event.pointerId,
      kind,
      start,
      startClient: { x: event.clientX, y: event.clientY },
      before: grid,
      after: grid,
      beforeWork: work,
    }
  }

  function moveColorworkTransform(event: ReactPointerEvent<HTMLElement>) {
    const transform = colorworkTransform.current
    const pageSize = displayedSize?.css
    const panel = colorworkPanelRef.current
    if (!transform || transform.pointerId !== event.pointerId || !pageSize || !panel) return
    event.preventDefault()
    event.stopPropagation()
    const after = { ...transform.before }
    if (transform.kind === 'move') {
      const point = rotationLayerRef.current ? pointFromEvent(event, rotationLayerRef.current, rotation) : transform.start
      const dx = point.x - transform.start.x
      const dy = point.y - transform.start.y
      after.x = Math.min(1 - after.displayWidth, Math.max(0, transform.before.x + dx))
      after.y = Math.min(1 - after.displayHeight, Math.max(0, transform.before.y + dy))
    } else {
      Object.assign(after, resizeColorworkGridDisplay(transform.before, pageSize, {
        x: event.clientX - transform.startClient.x,
        y: event.clientY - transform.startClient.y,
      }))
    }
    transform.after = after
    panel.style.left = after.x * pageSize.width + 'px'
    panel.style.top = after.y * pageSize.height + 'px'
    panel.style.width = after.displayWidth * pageSize.width + 'px'
    panel.style.height = after.displayHeight * pageSize.height + 'px'
  }

  function finishColorworkTransform(event: ReactPointerEvent<HTMLElement>) {
    const transform = colorworkTransform.current
    if (!transform || transform.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    colorworkTransform.current = null
    if (transform.after === transform.before) return
    onWorkChange({ ...transform.beforeWork, colorworkGrid: transform.after }, true, true, transform.beforeWork)
  }

  useEffect(() => {
    const grid = work.colorworkGrid
    const canvas = colorworkCanvasRef.current
    if (!canvas) return
    if (!grid?.visible || !displayedSize) {
      clearCanvas(canvas)
      return
    }
    const canvasSize = displayedSize.css
    if (!canvasSize.width || !canvasSize.height) return
    const ratio = pdfRasterScale(canvasSize.width, canvasSize.height, 1, window.devicePixelRatio || 1, resourcePolicy.colorworkPixels)
    canvas.width = Math.max(1, Math.ceil(canvasSize.width * ratio))
    canvas.height = Math.max(1, Math.ceil(canvasSize.height * ratio))
    const context = canvas.getContext('2d')
    if (!context) return
    context.clearRect(0, 0, canvas.width, canvas.height)
    const cellWidth = canvas.width / grid.columns
    const cellHeight = canvas.height / grid.rows
    grid.cells.forEach((cell, index) => {
      if (!cell) return
      const column = index % grid.columns
      const row = Math.floor(index / grid.columns)
      context.globalAlpha = cell.opacity
      context.fillStyle = cell.color
      context.fillRect(column * cellWidth + 0.5, row * cellHeight + 0.5, Math.max(0, cellWidth - 1), Math.max(0, cellHeight - 1))
    })
    context.globalAlpha = 1
    context.beginPath()
    context.strokeStyle = 'rgba(57, 72, 94, .78)'
    context.lineWidth = Math.max(1, ratio)
    for (let column = 0; column <= grid.columns; column++) {
      const x = Math.round(column * cellWidth) + 0.5
      context.moveTo(x, 0)
      context.lineTo(x, canvas.height)
    }
    for (let row = 0; row <= grid.rows; row++) {
      const y = Math.round(row * cellHeight) + 0.5
      context.moveTo(0, y)
      context.lineTo(canvas.width, y)
    }
    context.stroke()
  }, [work.colorworkGrid, displayedSize, rotation, resourcePolicy])

  useEffect(() => {
    if (!colorworkEnabled || !createColorworkRequest || createColorworkRequest.paneId !== paneId || createColorworkRequest.pageNumber !== page) return
    if (!displayedSize || handledColorworkRequest.current === createColorworkRequest.id) return
    handledColorworkRequest.current = createColorworkRequest.id
    const pageLayer = annotationLayerRef.current
    const viewport = scrollRef.current
    if (!pageLayer || !viewport) {
      onColorworkRequestHandled(createColorworkRequest.id)
      return
    }
    const pageRect = pageLayer.getBoundingClientRect()
    const viewportRect = viewport.getBoundingClientRect()
    const left = Math.max(pageRect.left, viewportRect.left)
    const right = Math.min(pageRect.right, viewportRect.right)
    const top = Math.max(pageRect.top, viewportRect.top)
    const bottom = Math.min(pageRect.bottom, viewportRect.bottom)
    const visibleWidth = right > left ? right - left : pageRect.width
    const visibleHeight = bottom > top ? bottom - top : pageRect.height
    const center = pointFromEvent({
      clientX: right > left ? (left + right) / 2 : pageRect.left + pageRect.width / 2,
      clientY: bottom > top ? (top + bottom) / 2 : pageRect.top + pageRect.height / 2,
    }, pageLayer, rotation)
    const visiblePageSize = rotatedPageSize(displayedSize.css, rotation)
    const grid = {
      ...createColorworkGrid(createColorworkRequest.settings),
      displayWidth: Math.min(1, visibleWidth * 0.6 / visiblePageSize.width),
      displayHeight: Math.min(1, visibleHeight * 0.6 / visiblePageSize.height),
    }
    grid.x = Math.min(1 - grid.displayWidth, Math.max(0, center.x - grid.displayWidth / 2))
    grid.y = Math.min(1 - grid.displayHeight, Math.max(0, center.y - grid.displayHeight / 2))
    onActivate()
    onWorkChange({ ...work, colorworkGrid: grid }, true, true, work)
    onColorworkRequestHandled(createColorworkRequest.id)
  }, [colorworkEnabled, createColorworkRequest, displayedSize, paneId, page, rotation, work, onActivate, onWorkChange, onColorworkRequestHandled])

  function updateText(id: string, value: string) {
    const text = value.slice(0, 500)
    const current = currentWorkRef.current
    const before = textEditBefore.current.get(id) ?? current
    textEditBefore.current.set(id, before)
    const next = {
      ...current,
      annotations: current.annotations.map((annotation) => annotation.id === id
        ? { ...withTextBox(annotation, displayedSize?.page.height ?? 1), text }
        : annotation),
    }
    if (onWorkChange(next, false, false, before) === false) return
    currentWorkRef.current = next
    setTextDraft({ id, value: text })
  }

  function finishTextEdit(id: string) {
    if (suppressTextBlur.current.delete(id)) return
    const before = textEditBefore.current.get(id)
    const current = currentWorkRef.current
    const annotation = current.annotations.find((item) => item.id === id)
    if (!annotation) {
      setTextDraft((draft) => draft?.id === id ? null : draft)
      setEditingNoteId((active) => active === id ? null : active)
      return
    }
    const annotations = annotation.text?.trim()
      ? current.annotations.map((item) => item.id === id ? withTextBox(item, displayedSize?.page.height ?? 1) : item)
      : current.annotations.filter((item) => item.id !== id)
    const next = { ...current, annotations }
    if (onWorkChange(next, true, true, before ?? current) === false) return
    currentWorkRef.current = next
    textEditBefore.current.delete(id)
    setTextDraft((draft) => draft?.id === id ? null : draft)
    setEditingNoteId((active) => active === id ? null : active)
    if (!annotation.text?.trim()) updateSelectedNoteId(null)
  }

  function startTextEdit(id: string) {
    if (editingNoteId !== null && editingNoteId !== id && textEditBefore.current.has(editingNoteId)) finishTextEdit(editingNoteId)
    const current = currentWorkRef.current
    const annotation = current.annotations.find((item) => item.id === id && item.type === 'text')
    if (!annotation) return
    if (!textEditBefore.current.has(id)) textEditBefore.current.set(id, current)
    setTextDraft({ id, value: annotation.text ?? '' })
    updateSelectedNoteId(id)
    setEditingNoteId(id)
  }

  function beginTextStyleChange(id: string) {
    if (textStyleEditBefore.current?.id === id) return
    finishTextStyleChange()
    textStyleEditBefore.current = { id, before: currentWorkRef.current }
  }

  function changeTextStyle(id: string, change: Partial<AnnotationStyle>, grouped = false) {
    const current = currentWorkRef.current
    if (!current.annotations.some((annotation) => annotation.id === id && annotation.type === 'text')) return
    if (grouped && textStyleEditBefore.current?.id !== id) beginTextStyleChange(id)
    const transaction = grouped ? textStyleEditBefore.current : null
    const before = transaction?.before ?? current
    const next = {
      ...current,
      annotations: current.annotations.map((annotation) => annotation.id === id && annotation.type === 'text'
        ? { ...annotation, style: { ...annotation.style, ...change } }
        : annotation),
    }
    currentWorkRef.current = next
    onWorkChange(next, !transaction, !transaction, before)
  }

  function finishTextStyleChange(id?: string) {
    const transaction = textStyleEditBefore.current
    if (!transaction || (id && transaction.id !== id)) return
    textStyleEditBefore.current = null
    onWorkChange(currentWorkRef.current, true, true, transaction.before)
  }

  function cancelTextEdit(id: string) {
    suppressTextBlur.current.add(id)
    const before = textEditBefore.current.get(id)
    if (before) {
      currentWorkRef.current = before
      onWorkChange(before, true, false)
    }
    textEditBefore.current.delete(id)
    setTextDraft((draft) => draft?.id === id ? null : draft)
    updateSelectedNoteId(null)
    setEditingNoteId((active) => active === id ? null : active)
  }

  function beginTextTransform(event: ReactPointerEvent<HTMLElement>, annotation: AnnotationRecord, kind: 'move' | 'resize', initial?: { start: Point; original: { x: number; y: number; width: number; height: number } }) {
    if (!displayedSize) return
    event.preventDefault()
    event.stopPropagation()
    const layer = annotationLayerRef.current
    const handle = event.currentTarget.closest('.page-note')
    if (!layer || !(handle instanceof HTMLDivElement)) return
    const note = withTextBox(annotation, displayedSize.page.height)
    const box = textBox(note, displayedSize.page.height)
    handle.setPointerCapture(event.pointerId)
    textDrag.current = {
      id: annotation.id,
      pointerId: event.pointerId,
      kind,
      start: initial?.start ?? pointFromEvent(event, layer, rotation),
      original: initial?.original ?? box,
      before: currentWorkRef.current,
    }
    updateSelectedNoteId(annotation.id)
  }

  function moveTextTransform(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = textDrag.current
    const layer = annotationLayerRef.current
    if (!drag || drag.pointerId !== event.pointerId || !layer || !displayedSize) return
    const point = pointFromEvent(event, layer, rotation)
    const dx = point.x - drag.start.x
    const dy = point.y - drag.start.y
    const box = drag.kind === 'move'
      ? { ...drag.original, x: Math.min(1 - drag.original.width, Math.max(0, drag.original.x + dx)), y: Math.min(1 - drag.original.height, Math.max(0, drag.original.y + dy)) }
      : { ...drag.original, width: Math.min(1 - drag.original.x, Math.max(0.08, drag.original.width + dx)), height: Math.min(1 - drag.original.y, Math.max(0.04, drag.original.height + dy)) }
    const current = currentWorkRef.current
    const next = {
      ...current,
      annotations: current.annotations.map((annotation) => annotation.id === drag.id
        ? { ...annotation, points: [{ x: box.x, y: box.y }], boxWidth: box.width, boxHeight: box.height }
        : annotation),
    }
    currentWorkRef.current = next
    onWorkChange(next, false, false, drag.before)
  }

  function finishTextTransform(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = textDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    textDrag.current = null
    onWorkChange(currentWorkRef.current, true, true, drag.before)
  }

  function movePendingTextGesture(event: ReactPointerEvent<HTMLDivElement>) {
    const pending = pendingTextGesture.current
    if (!pending || pending.pointerId !== event.pointerId || !textNoteGestureExceededThreshold({ x: pending.clientX, y: pending.clientY }, { x: event.clientX, y: event.clientY })) {
      moveTextTransform(event)
      return
    }
    pendingTextGesture.current = null
    if (pending.wasEditing) {
      const editing = currentWorkRef.current.annotations.find((item) => item.id === pending.id && item.type === 'text')
      if (editing?.text?.trim()) textInputRef.current?.blur()
    }
    const annotation = currentWorkRef.current.annotations.find((item) => item.id === pending.id && item.type === 'text')
    if (!annotation) return
    beginTextTransform(event, annotation, 'move', { start: pending.start, original: pending.original })
    moveTextTransform(event)
  }

  function finishPendingTextGesture(event: ReactPointerEvent<HTMLDivElement>, cancelled = false) {
    const pending = pendingTextGesture.current
    if (pending?.pointerId === event.pointerId) {
      pendingTextGesture.current = null
      if (!cancelled && !pending.wasEditing) startTextEdit(pending.id)
    }
    finishTextTransform(event)
  }

  function handleTextNotePointerDown(event: ReactPointerEvent<HTMLDivElement>, annotation: AnnotationRecord) {
    event.stopPropagation()
    onActivate()
    updateSelectedNoteId(annotation.id)
    const target = event.target
    const editingTarget = target instanceof Element && Boolean(target.closest('textarea'))
    if (tool !== 'pan') {
      if (!editingTarget) startTextEdit(annotation.id)
      return
    }
    if (!displayedSize) return
    if (editingNoteId !== null && editingNoteId !== annotation.id) finishTextEdit(editingNoteId)
    const current = currentWorkRef.current
    const currentAnnotation = current.annotations.find((item) => item.id === annotation.id && item.type === 'text')
    const layer = annotationLayerRef.current
    if (!currentAnnotation || !layer) return
    const box = textBox(currentAnnotation, displayedSize.page.height)
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* The tap and drag handlers also work without capture. */ }
    pendingTextGesture.current = {
      id: annotation.id,
      pointerId: event.pointerId,
      start: pointFromEvent(event, layer, rotation),
      clientX: event.clientX,
      clientY: event.clientY,
      original: box,
      wasEditing: editingTarget,
    }
    if (shouldPreventTextNotePointerDefault(editingTarget)) event.preventDefault()
  }

  const deleteText = useCallback((id: string) => {
    if (editingNoteId === id) suppressTextBlur.current.add(id)
    const current = currentWorkRef.current
    const before = textEditBefore.current.get(id) ?? current
    const next = { ...current, annotations: current.annotations.filter((annotation) => annotation.id !== id) }
    currentWorkRef.current = next
    onWorkChange(next, true, true, before)
    textEditBefore.current.delete(id)
    updateSelectedNoteId(null)
    setEditingNoteId(null)
  }, [editingNoteId, onWorkChange, updateSelectedNoteId])

  useEffect(() => {
    if (selectedNoteId === null) return
    const noteId = selectedNoteId
    function removeSelected(event: KeyboardEvent) {
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      event.preventDefault()
      deleteText(noteId)
    }
    window.addEventListener('keydown', removeSelected)
    return () => window.removeEventListener('keydown', removeSelected)
  }, [deleteText, selectedNoteId])

  function handleSvgPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (chartRecognition?.stage === 'select') {
      event.preventDefault()
      event.stopPropagation()
      onActivate()
      const start = boundedPagePoint(pointFromEvent(event, event.currentTarget, rotation))
      chartSelectionRef.current = { pointerId: event.pointerId, start }
      setChartSelectionPreview({ x: start.x, y: start.y, width: 0, height: 0 })
      try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* Page selection remains available without pointer capture. */ }
      return
    }
    if (tool === 'pan') {
      setTextPreviewPoint(null)
      return
    }
    if (strokeRef.current && strokeRef.current.pointerId !== event.pointerId) {
      event.stopPropagation()
      return
    }
    onActivate()
    event.stopPropagation()
    const point = pointFromEvent(event, event.currentTarget, rotation)
    if (tool === 'region-highlight') {
      if (regionHighlightPointerAction(tool, false) === 'create') beginRegionHighlight(event, point)
      return
    }
    if (tool === 'text') {
      if (event.pointerType === 'mouse') event.preventDefault()
      addText(point)
      return
    }
    updateSelectedNoteId(null)
    setEditingNoteId(null)
    setTextPreviewPoint(null)
    if (tool === 'eraser') {
      try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* Erasing remains usable when capture is unavailable. */ }
      actionStartWork.current = work
      erasedIds.current = new Set(work.annotations.filter((annotation) => {
        const points = annotation.points.length === 1 ? [...annotation.points, ...annotation.points] : annotation.points
        return points.some((item, index) => index > 0 && distanceToSegment(point, points[index - 1], item, displayedSize?.css.width ?? 1, displayedSize?.css.height ?? 1) < 20)
      }).map((annotation) => annotation.id))
      return
    }
    beginInkStroke(event, point)
  }

  function handleSvgPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (chartSelectionRef.current?.pointerId === event.pointerId) {
      event.preventDefault()
      event.stopPropagation()
      setChartSelectionPreview(regionFromPoints(chartSelectionRef.current.start, pointFromEvent(event, event.currentTarget, rotation)))
      return
    }
    if (regionDrawing.current?.pointerId === event.pointerId) {
      updateRegionPreview(event)
      return
    }
    if (regionTransform.current?.pointerId === event.pointerId) {
      moveRegionTransform(event)
      return
    }
    const point = pointFromEvent(event, event.currentTarget, rotation)
    const stroke = strokeRef.current
    if (stroke?.pointerId === event.pointerId) {
      stroke.points = appendInkPoint(stroke.points, point, stroke.pageWidth, stroke.pageHeight)
      scheduleStrokePreview(stroke)
      return
    }
    if (tool === 'text' && event.pointerType === 'mouse') setTextPreviewPoint(point)
    else setTextPreviewPoint(null)
    if (tool === 'eraser') {
      const found = work.annotations.filter((annotation) => {
        const points = annotation.points
        if (annotation.type === 'text' || points.length === 1) {
          return points.some((item) => distanceToSegment(point, item, item, displayedSize?.css.width ?? 1, displayedSize?.css.height ?? 1) < 20)
        }
        return points.some((item, index) => index > 0 && distanceToSegment(point, points[index - 1], item, displayedSize?.css.width ?? 1, displayedSize?.css.height ?? 1) < 20)
      })
      found.forEach((annotation) => erasedIds.current.add(annotation.id))
      return
    }
  }

  function handleSvgPointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    event.stopPropagation()
    finishSvgPointer(event, false)
  }

  function handleSvgPointerCancel(event: ReactPointerEvent<SVGSVGElement>) {
    event.stopPropagation()
    finishSvgPointer(event, true)
  }

  function finishSvgPointer(event: ReactPointerEvent<SVGSVGElement>, cancelled: boolean) {
    const chartSelection = chartSelectionRef.current
    if (chartSelection?.pointerId === event.pointerId) {
      chartSelectionRef.current = null
      const selection = cancelled ? null : regionFromPoints(chartSelection.start, pointFromEvent(event, event.currentTarget, rotation))
      setChartSelectionPreview(null)
      event.preventDefault()
      event.stopPropagation()
      if (selection && selection.width >= 0.01 && selection.height >= 0.01 && chartRecognition?.guideId) {
        const guideId = chartRecognition.guideId
        void analyzeChartRegion(selection, guideId)
      } else if (!cancelled) {
        setChartRecognition((current) => current ? { ...current, stage: 'select' } : current)
      }
      return
    }
    if (regionDrawing.current?.pointerId === event.pointerId) {
      finishRegionHighlight(event, cancelled)
      return
    }
    if (regionTransform.current?.pointerId === event.pointerId) {
      finishRegionTransform(event.pointerId, cancelled)
      return
    }
    const stroke = strokeRef.current
    if (stroke?.pointerId === event.pointerId) {
      const finalPoint = cancelled ? undefined : pointFromEvent(event, event.currentTarget, stroke.rotation)
      finishInkStroke(event.pointerId, finalPoint)
      return
    }
    if (tool === 'eraser') {
      if (!cancelled && erasedIds.current.size) onWorkChange({ ...work, annotations: work.annotations.filter((annotation) => !erasedIds.current.has(annotation.id)) }, true, true, actionStartWork.current)
      erasedIds.current.clear()
      return
    }
  }

  const pageSize = displayedSize?.page
  const cssSize = displayedSize?.css
  const rotatedCssSize = cssSize ? rotatedPageSize(cssSize, rotation) : null
  const guidePageSize = pageSize ? rotatedPageSize(pageSize, rotation) : null
  const guideLayerStyle = cssSize && rotatedCssSize ? {
    left: (cssSize.width - rotatedCssSize.width) / 2,
    top: (cssSize.height - rotatedCssSize.height) / 2,
    width: rotatedCssSize.width,
    height: rotatedCssSize.height,
    transform: 'rotate(' + -rotation + 'deg)',
  } : undefined
  const pageWrapStyle = rotatedCssSize ? {
    width: Math.max(size.width - 24, rotatedCssSize.width * zoomPreviewScale) + 24,
    height: Math.max(size.height - 24, rotatedCssSize.height * zoomPreviewScale) + 24,
  } : undefined
  const colorworkColumnCellWidth = colorworkGrid && cssSize ? colorworkGrid.displayWidth * cssSize.width / colorworkGrid.columns : 0
  const colorworkRowCellHeight = colorworkGrid && cssSize ? Math.max(1, (colorworkGrid.displayHeight * cssSize.height - 26) / colorworkGrid.rows) : 0
  const colorworkColumnFontSize = Math.min(10, Math.max(1, colorworkColumnCellWidth * 0.72))
  const colorworkRowFontSize = Math.min(10, Math.max(1, colorworkRowCellHeight * 0.72))
  const horizontalGuides = guidesFor(work, 'horizontal')
  const displayGuide = (guide: ProgressGuide) => {
    const screenPosition = guide.rotationPositions?.[String(rotation) as '0' | '90' | '180' | '270']
    const oriented = screenPosition ? { ...guide, ...screenPosition } : guide
    if (!guide.linkedCounterId) return oriented
    const counter = counters.find((item) => item.id === guide.linkedCounterId)
    if (!counter) return oriented
    const row = counter.kind === 'simple' ? counter.value : counter.currentRow ?? 1
    return { ...oriented, ...guideGeometryForRotation(guide, row, rotation) }
  }
  const visibleHorizontalGuides = horizontalGuides.map(displayGuide)
  const focusGuides = active ? visibleHorizontalGuides.filter((guide) => !guide.role && guide.focus?.enabled) : []
  const focusBandRects = focusGuides.map((guide) => {
    const focus = guide.focus!
    const region = guide.chartRegion
    const displayRegion = region ? pageRectToDisplayRect(region, rotation) : undefined
    const spacing = focusRowSpacing(region, focus.rowSpacing, rotation)
    const half = Math.max(0.002, focusBandHeightRatio(focus, spacing) / 2)
    const top = Math.max(0, guide.position - half)
    const bottom = Math.min(1, guide.position + half)
    const x = focus.scope === 'region' && displayRegion ? displayRegion.x : 0
    const width = focus.scope === 'region' && displayRegion ? displayRegion.width : 1
    return displayRectToPageRect({ x, y: top, width, height: Math.max(0, bottom - top) }, rotation)
  })
  const focusAxis = rotation === 90 || rotation === 270 ? 'x' : 'y'
  const focusIntervals = focusBandRects.map((rect) => focusAxis === 'x' ? [rect.x, rect.x + rect.width] as const : [rect.y, rect.y + rect.height] as const).sort((first, second) => first[0] - second[0])
  const mergedFocusIntervals: [number, number][] = []
  for (const [start, end] of focusIntervals) {
    const previous = mergedFocusIntervals[mergedFocusIntervals.length - 1]
    if (previous && start <= previous[1]) previous[1] = Math.max(previous[1], end)
    else mergedFocusIntervals.push([start, end])
  }
  const fallbackMaskStops = ['#000 0%']
  let maskCursor = 0
  for (const [start, end] of mergedFocusIntervals) {
    const startPercent = start * 100
    const endPercent = end * 100
    if (startPercent > maskCursor) fallbackMaskStops.push('#000 ' + maskCursor + '%', 'transparent ' + startPercent + '%')
    else fallbackMaskStops.push('transparent ' + startPercent + '%')
    fallbackMaskStops.push('transparent ' + endPercent + '%', '#000 ' + endPercent + '%')
    maskCursor = endPercent
  }
  if (maskCursor < 100) fallbackMaskStops.push('#000 100%')
  const fallbackRegions = focusGuides.filter((guide) => guide.focus?.scope === 'region' && guide.chartRegion).map((guide) => guide.chartRegion!)
  const fallbackClipPath = focusGuides.some((guide) => guide.focus?.scope === 'page') || !fallbackRegions.length ? undefined : (() => {
    const left = Math.min(...fallbackRegions.map((region) => region.x))
    const top = Math.min(...fallbackRegions.map((region) => region.y))
    const right = Math.max(...fallbackRegions.map((region) => region.x + region.width))
    const bottom = Math.max(...fallbackRegions.map((region) => region.y + region.height))
    return 'inset(' + top * 100 + '% ' + (1 - right) * 100 + '% ' + (1 - bottom) * 100 + '% ' + left * 100 + '%)'
  })()
  const focusDimAmount = Math.max(...focusGuides.map((guide) => focusDimOpacity(guide.focus!)))
  const activeDraft = strokeRef.current?.documentId === work.documentId && strokeRef.current.pageNumber === page ? strokeRef.current : null
  const failedDraft = failedStrokeRef.current?.work.documentId === work.documentId && failedStrokeRef.current.work.pageNumber === page ? failedStrokeRef.current.annotation : null
  const draftType = activeDraft?.tool ?? (failedDraft?.type === 'pen' || failedDraft?.type === 'line' || failedDraft?.type === 'highlight' ? failedDraft.type : 'pen')
  const currentDraft: AnnotationRecord | null = draft.length && (activeDraft || failedDraft) ? {
    id: 'draft',
    type: draftType,
    points: draft,
    style: activeDraft?.style ?? failedDraft?.style ?? annotationStyle,
  } : null
  const visiblePendingStrokePreviews = pendingStrokePreviews.filter((item) => item.documentId === work.documentId && item.pageNumber === page)
  const regionHandleRadius = pageSize && cssSize ? 22 * pageSize.width / Math.max(cssSize.width, 1) : 8
  const selectedRegionHandles = active && tool === 'pan' && selectedRegion ? (() => {
    const left = selectedRegion.x
    const right = selectedRegion.x + selectedRegion.width
    const top = selectedRegion.y
    const bottom = selectedRegion.y + selectedRegion.height
    const offsetX = pageSize && selectedRegion.width * pageSize.width < regionHandleRadius * 2 ? regionHandleRadius : 0
    const offsetY = pageSize && selectedRegion.height * pageSize.height < regionHandleRadius * 2 ? regionHandleRadius : 0
    return [
      { handle: 'nw' as const, x: left, y: top, hitX: left - offsetX, hitY: top - offsetY },
      { handle: 'ne' as const, x: right, y: top, hitX: right + offsetX, hitY: top - offsetY },
      { handle: 'sw' as const, x: left, y: bottom, hitX: left - offsetX, hitY: bottom + offsetY },
      { handle: 'se' as const, x: right, y: bottom, hitX: right + offsetX, hitY: bottom + offsetY },
    ]
  })() : []

  return (
    <>
    <div className={'pdf-pane ' + (active ? 'is-active' : '')}>
      <div className="pane-label">{active ? t('현재 작업 영역') : t('보조 영역')}</div>
      {recognitionError && <div className="pdf-recognition-retry" role="status"><span>{t('페이지 링크를 인식하지 못했습니다. 다시 시도해 주세요.')}</span><button type="button" onClick={onRetryRecognition}>{t('다시 시도')}</button></div>}
      {strokeError && <div className="ink-save-error" role="alert"><span>{t("필기를 반영하지 못했습니다.")}</span><button type="button" onClick={retryStrokeSave}>{t("다시 시도")}</button></div>}
      <div className={'pdf-scroll-area' + (splitView && pane.zoom <= 1 ? ' is-fit-zoom' : '')} ref={scrollRef} onScroll={recordCenter} onPointerDownCapture={beginChartSelectionCapture} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onLostPointerCapture={pointerCaptureLost} onDoubleClick={doubleTap}>
        <div className="pdf-page-wrap" style={pageWrapStyle}>
          <div ref={rotationLayerRef} className="pdf-rotation-content" style={cssSize ? { width: cssSize.width, height: cssSize.height, transform: 'rotate(' + rotation + 'deg) scale(' + zoomPreviewScale + ')' } : undefined}>
          <div className="pdf-image-layer" style={cssSize ? { width: cssSize.width, height: cssSize.height } : undefined}>
            <canvas ref={canvasRef} aria-label={t('PDF {page}페이지', { page: formatNumber(page) })} />
            <canvas ref={detailCanvasRef} className="pdf-detail-canvas" width={0} height={0} style={{ left: 0, top: 0, width: 0, height: 0, visibility: 'hidden' }} aria-hidden="true" />
            {focusGuides.length > 0 && <div className="pdf-focus-dim-fallback" aria-hidden="true" style={{ background: 'rgba(19,31,49,' + focusDimAmount + ')', maskImage: 'linear-gradient(to ' + (focusAxis === 'x' ? 'right' : 'bottom') + ', ' + fallbackMaskStops.join(', ') + ')', WebkitMaskImage: 'linear-gradient(to ' + (focusAxis === 'x' ? 'right' : 'bottom') + ', ' + fallbackMaskStops.join(', ') + ')', clipPath: fallbackClipPath }} />}
            {pageSize && cssSize && <>
            <svg
                ref={pageSvgRef}
                className={'pdf-svg-overlay ' + (tool === 'pan' ? 'pan-mode' : tool === 'text' ? 'text-mode' : 'draw-mode') + (chartRecognition?.stage === 'select' ? ' chart-row-selecting' : '')}
                viewBox={'0 0 ' + pageSize.width + ' ' + pageSize.height}
                preserveAspectRatio="none"
              onPointerDown={handleSvgPointerDown}
              onPointerMove={handleSvgPointerMove}
              onPointerLeave={() => setTextPreviewPoint(null)}
              onPointerUp={handleSvgPointerUp}
              onPointerCancel={handleSvgPointerCancel}
            >
              {tool !== 'pan' && <rect x="0" y="0" width={pageSize.width} height={pageSize.height} fill="transparent" pointerEvents="all" />}
              {regionHighlights.map((region) => {
                return <rect
                  key={'region-' + region.id}
                  ref={(node) => { if (node) regionNodesRef.current.set(region.id, node); else regionNodesRef.current.delete(region.id) }}
                  className="region-highlight-shape"
                  data-region-highlight-id={region.id}
                  role="button"
                  aria-label={t('구간 강조 영역')}
                  tabIndex={tool === 'pan' ? 0 : -1}
                  aria-pressed={selectedRegionId === region.id}
                  x={region.x * pageSize.width}
                  y={region.y * pageSize.height}
                  width={region.width * pageSize.width}
                  height={region.height * pageSize.height}
                  fill={region.color}
                  fillOpacity={region.opacity}
                  stroke="none"
                  strokeWidth={0}
                  style={{ mixBlendMode: 'multiply', pointerEvents: tool === 'pan' || tool === 'region-highlight' ? 'all' : 'none', touchAction: 'none', cursor: tool === 'region-highlight' ? 'move' : 'pointer' }}
                  onPointerDown={(event) => handleRegionPointerDown(event, region)}
                  onKeyDown={(event) => {
                    if (tool !== 'pan' || (event.key !== 'Enter' && event.key !== ' ')) return
                    event.preventDefault()
                    updateSelectedRegionId(region.id)
                    setRegionPopoverOpen(true)
                    onActivate()
                  }}
                />
              })}
              {regionPreview && <rect
                x={regionPreview.x * pageSize.width}
                y={regionPreview.y * pageSize.height}
                width={regionPreview.width * pageSize.width}
                height={regionPreview.height * pageSize.height}
                fill={regionPreview.color}
                fillOpacity={regionPreview.opacity}
                stroke={regionPreview.color}
                strokeWidth={0.5}
                strokeDasharray="6 4"
                style={{ pointerEvents: 'none' }}
              />}
              {work.annotations.filter((annotation) => annotation.type !== 'text').map((annotation) =>
                <path key={annotation.id} d={annotationPath(annotation, pageSize.width, pageSize.height)} fill="none" stroke={annotation.style.color} strokeWidth={annotation.style.thickness} strokeOpacity={annotation.style.opacity} strokeLinecap="round" strokeLinejoin="round" style={{ mixBlendMode: annotation.type === 'highlight' ? 'multiply' : 'normal', pointerEvents: tool === 'text' ? 'auto' : 'none' }} />,
              )}
              {visiblePendingStrokePreviews.map(({ annotation }) => <path key={'pending-' + annotation.id} d={annotationPath(annotation, pageSize.width, pageSize.height)} fill="none" stroke={annotation.style.color} strokeWidth={annotation.style.thickness} strokeOpacity={annotation.style.opacity} strokeLinecap="round" strokeLinejoin="round" style={{ mixBlendMode: annotation.type === 'highlight' ? 'multiply' : 'normal', pointerEvents: 'none' }} />)}
              {currentDraft && <path d={annotationPath(currentDraft, pageSize.width, pageSize.height)} fill="none" stroke={currentDraft.style.color} strokeWidth={currentDraft.style.thickness} strokeOpacity={currentDraft.style.opacity} strokeLinecap="round" strokeLinejoin="round" style={{ mixBlendMode: currentDraft.type === 'highlight' ? 'multiply' : 'normal', pointerEvents: 'none' }} />}
              {selectedRegion && active && tool === 'pan' && <rect
                x={selectedRegion.x * pageSize.width}
                y={selectedRegion.y * pageSize.height}
                width={selectedRegion.width * pageSize.width}
                height={selectedRegion.height * pageSize.height}
                fill="transparent"
                stroke="var(--color-primary)"
                strokeWidth={cssSize ? pageSize.width / Math.max(cssSize.width, 1) * 0.75 : 0.75}
                strokeDasharray={cssSize ? pageSize.width / Math.max(cssSize.width, 1) * 4 + ' ' + pageSize.width / Math.max(cssSize.width, 1) * 3 : undefined}
                style={{ pointerEvents: 'none' }}
              />}
              {selectedRegionHandles.map(({ handle, hitX, hitY }) => <circle
                key={handle}
                className="region-highlight-handle-hit"
                data-region-highlight-id={selectedRegion!.id}
                data-region-highlight-handle={handle}
                cx={hitX * pageSize.width}
                cy={hitY * pageSize.height}
                r={regionHandleRadius}
                fill="transparent"
                aria-label={t('구간 강조 영역') + ' · ' + t('크기 조절')}
                style={{ pointerEvents: 'all', touchAction: 'none', cursor: handle + '-resize' }}
                onPointerDown={(event) => handleRegionPointerDown(event, selectedRegion!, handle)}
              ><title>{t('구간 강조 영역')} · {t('크기 조절')}</title></circle>)}
              {selectedRegionHandles.map(({ handle, x, y }) => <circle
                key={'marker-' + handle}
                className="region-highlight-handle-marker"
                cx={x * pageSize.width}
                cy={y * pageSize.height}
                r={Math.max(4, 4 * pageSize.width / Math.max(cssSize?.width ?? 1, 1))}
                fill="var(--color-surface)"
                stroke="var(--color-primary)"
                strokeWidth={cssSize ? pageSize.width / Math.max(cssSize.width, 1) * 1.5 : 1.5}
                style={{ pointerEvents: 'none' }}
              />)}
              {chartRecognition?.stage === 'select' && <rect x="0" y="0" width={pageSize.width} height={pageSize.height} fill="transparent" pointerEvents="all" />}
              {chartSelectionPreview && <rect className="chart-row-selection-preview" x={chartSelectionPreview.x * pageSize.width} y={chartSelectionPreview.y * pageSize.height} width={chartSelectionPreview.width * pageSize.width} height={chartSelectionPreview.height * pageSize.height} />}
            </svg>
            <div className="annotation-layer" ref={annotationLayerRef} style={{ width: cssSize.width, height: cssSize.height }}>
              {tool === 'text' && textPreviewPoint && (() => {
                const box = textNoteBoxAt(textPreviewPoint)
                return <div className="note-preview" aria-hidden="true" style={{ left: box.x * cssSize.width, top: box.y * cssSize.height, width: box.width * cssSize.width, height: box.height * cssSize.height, fontSize: annotationStyle.fontSize * cssSize.width / pageSize.width, transform: 'rotate(' + textNoteCounterRotation(rotation) + 'deg)' }}>{t("텍스트 입력")}</div>
              })()}
              {work.annotations.filter((annotation) => annotation.type === 'text').map((annotation) => {
                const box = textBox(annotation, pageSize.height)
                const selected = annotation.id === selectedNoteId
                const editing = editingNoteId === annotation.id
                const fontSize = annotation.style.fontSize * cssSize.width / pageSize.width
                return <div
                  key={annotation.id}
                  className={'page-note ' + (selected ? 'selected' : '') + (editing ? ' editing' : '')}
                  role="group"
                  aria-label={t("페이지 노트")}
                  style={{ left: box.x * cssSize.width, top: box.y * cssSize.height, width: box.width * cssSize.width, height: box.height * cssSize.height, color: annotation.style.color, fontSize, transform: 'rotate(' + textNoteCounterRotation(rotation) + 'deg)' }}
                  onPointerDown={(event) => handleTextNotePointerDown(event, annotation)}
                  onPointerMove={movePendingTextGesture}
                  onPointerUp={(event) => finishPendingTextGesture(event)}
                  onPointerCancel={(event) => finishPendingTextGesture(event, true)}
                >
                  {selected && <button type="button" className="note-delete-button" aria-label={t("텍스트 객체 삭제")} title={t("삭제")} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation() }} onClick={() => deleteText(annotation.id)}><Trash2 size={13} /></button>}
                  {editing
                    ? <textarea
                      ref={textInputRef}
                      aria-label={t("페이지 노트 내용")}
                      autoFocus
                      maxLength={500}
                      placeholder={t("여기에 텍스트 입력")}
                      value={textDraft?.id === annotation.id ? textDraft.value : annotation.text ?? ''}
                      onFocus={() => {
                        suppressTextBlur.current.delete(annotation.id)
                        if (!textEditBefore.current.has(annotation.id)) textEditBefore.current.set(annotation.id, work)
                      }}
                      onChange={(event) => updateText(annotation.id, event.currentTarget.value)}
                      onBlur={() => finishTextEdit(annotation.id)}
                      onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); cancelTextEdit(annotation.id); event.currentTarget.blur() } }}
                      style={{ opacity: annotation.style.opacity }}
                    />
                    : <div className="note-display" style={{ opacity: annotation.style.opacity }}>{annotation.text}</div>}
                  {editing && <button type="button" className="note-resize-handle" aria-label={t("노트 크기 조절")} title={t("크기 조절")} onPointerDown={(event) => beginTextTransform(event, annotation, 'resize')} />}
                </div>
              })}
              {active && textStylePortalTarget && (() => {
                const annotation = work.annotations.find((item) => item.id === selectedNoteId && item.type === 'text' && item.text?.trim())
                if (!annotation) return null
                return createPortal(<div
                  className="text-style-toolbar viewer-mini-settings-panel"
                  role="toolbar"
                  aria-label={t("선택한 텍스트 설정")}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <section className="viewer-mini-settings-section annotation-style-section">
                    <strong>{t("필기 스타일")}</strong>
                    <div className="text-style-color" title={t("글자 색상")}>
                      <span>{t("색상")}</span>
                      <ColorPresetButtons
                        label={t("텍스트 색상")}
                        className="annotation-color-presets text-style-color-presets"
                        presets={ANNOTATION_COLOR_PRESETS}
                        includeCurrentColor={false}
                        value={annotation.style.color}
                        onChange={(color) => changeTextStyle(annotation.id, { color })}
                      />
                    </div>
                    <label className="text-style-size" title={t("글자 크기")}>
                      <span>{t("글자 크기")}</span>
                      <input
                        aria-label={t("텍스트 글자 크기")}
                        type="number"
                        min="10"
                        max="48"
                        step="1"
                        value={fontSizeDraft?.id === annotation.id ? fontSizeDraft.value : String(annotation.style.fontSize)}
                        onFocus={() => {
                          beginTextStyleChange(annotation.id)
                          setFontSizeDraft({ id: annotation.id, value: String(annotation.style.fontSize) })
                        }}
                        onChange={(event) => {
                          const value = event.currentTarget.value
                          setFontSizeDraft({ id: annotation.id, value })
                          const fontSize = Number(value)
                          if (Number.isInteger(fontSize) && fontSize >= 10 && fontSize <= 48) changeTextStyle(annotation.id, { fontSize }, true)
                        }}
                        onBlur={(event) => {
                          const value = Number(event.currentTarget.value)
                          if (Number.isFinite(value)) changeTextStyle(annotation.id, { fontSize: Math.min(48, Math.max(10, Math.round(value))) }, true)
                          setFontSizeDraft(null)
                          finishTextStyleChange(annotation.id)
                        }}
                        onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
                      />
                      <input
                        aria-label={t("텍스트 글자 크기 조절")}
                        type="range"
                        min="10"
                        max="48"
                        value={annotation.style.fontSize}
                        style={{ '--range-progress': `${((annotation.style.fontSize - 10) / 38) * 100}%` } as CSSProperties}
                        onPointerDown={() => beginTextStyleChange(annotation.id)}
                        onPointerUp={() => finishTextStyleChange(annotation.id)}
                        onPointerCancel={() => finishTextStyleChange(annotation.id)}
                        onFocus={() => beginTextStyleChange(annotation.id)}
                        onBlur={() => finishTextStyleChange(annotation.id)}
                        onKeyDown={() => beginTextStyleChange(annotation.id)}
                        onKeyUp={() => finishTextStyleChange(annotation.id)}
                        onChange={(event) => changeTextStyle(annotation.id, { fontSize: Number(event.currentTarget.value) }, true)}
                      />
                    </label>
                    <label className="text-style-opacity" title={t("글자 투명도")}>
                      <span>{t("투명도 ")}{Math.round(annotation.style.opacity * 100)}%</span>
                      <input
                        aria-label={t("텍스트 투명도")}
                        type="range"
                        min="0"
                        max="100"
                        value={Math.round(annotation.style.opacity * 100)}
                        style={{ '--range-progress': `${Math.round(annotation.style.opacity * 100)}%` } as CSSProperties}
                        onPointerDown={() => beginTextStyleChange(annotation.id)}
                        onPointerUp={() => finishTextStyleChange(annotation.id)}
                        onPointerCancel={() => finishTextStyleChange(annotation.id)}
                        onFocus={() => beginTextStyleChange(annotation.id)}
                        onBlur={() => finishTextStyleChange(annotation.id)}
                        onKeyDown={() => beginTextStyleChange(annotation.id)}
                        onKeyUp={() => finishTextStyleChange(annotation.id)}
                        onChange={(event) => changeTextStyle(annotation.id, { opacity: Number(event.currentTarget.value) / 100 }, true)}
                      />
                    </label>
                  </section>
                </div>, textStylePortalTarget)
              })()}
              {tool === 'pan' && pageLinks?.map((link, index) => <a
                key={'pdf-' + index}
                className="page-pdf-link"
                aria-label={t('웹 링크 새 탭 열기 {count}', { count: formatNumber(index + 1) })}
                title={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                style={{ left: link.x * cssSize.width, top: link.y * cssSize.height, width: link.width * cssSize.width, height: link.height * cssSize.height }}
                onClick={(event: ReactMouseEvent<HTMLAnchorElement>) => {
                  event.preventDefault()
                  if (event.detail === 0) {
                    const href = safeQrHref(link.href)
                    if (href) window.open(href, '_blank', 'noopener,noreferrer')
                  }
                }}
              />)}
              {tool === 'pan' && qrLinks?.filter((link) => !(pageLinks ?? []).some((pageLink) => regionsOverlap(pageLink, link))).map((link, index) => <a
                key={index}
                className="page-qr-link"
                aria-label={t('QR 링크 열기 {count}', { count: formatNumber(index + 1) })}
                title={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                style={{ left: link.x * cssSize.width, top: link.y * cssSize.height, width: link.width * cssSize.width, height: link.height * cssSize.height }}
                onClick={(event: ReactMouseEvent<HTMLAnchorElement>) => {
                  event.preventDefault()
                  if (event.detail === 0) {
                    const href = safeQrHref(link.href)
                    if (href) window.open(href, '_blank', 'noopener,noreferrer')
                  }
                }}
              />)}
            </div>
            {colorworkGrid && <div
              ref={colorworkPanelRef}
              className="page-colorwork-panel"
              role="group"
              aria-label={t("컬러워크 모눈 패널")}
              style={{ left: colorworkGrid.x * cssSize.width, top: colorworkGrid.y * cssSize.height, width: colorworkGrid.displayWidth * cssSize.width, height: colorworkGrid.displayHeight * cssSize.height, transform: rotation ? 'rotate(' + -rotation + 'deg)' : undefined, transformOrigin: 'center' }}
            >
              <div className="colorwork-column-numbers colorwork-column-numbers-top" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${colorworkGrid.columns}, minmax(0, 1fr))`, fontSize: colorworkColumnFontSize }}>
                {Array.from({ length: colorworkGrid.columns }, (_, index) => {
                  const stitchNumber = colorworkGrid.columns - index
                  const scale = Math.min(1, colorworkColumnCellWidth / (colorworkColumnFontSize * 0.6 * String(stitchNumber).length))
                  return <span key={stitchNumber} style={{ transform: `scaleX(${scale})` }}>{stitchNumber}</span>
                })}
              </div>
              <div className="colorwork-row-numbers colorwork-row-numbers-left" aria-hidden="true" style={{ gridTemplateRows: `repeat(${colorworkGrid.rows}, minmax(0, 1fr))`, fontSize: colorworkRowFontSize }}>
                {Array.from({ length: colorworkGrid.rows }, (_, index) => <span key={colorworkGrid.rows - index}>{colorworkGrid.rows - index}</span>)}
              </div>
              <div className="colorwork-row-numbers colorwork-row-numbers-right" aria-hidden="true" style={{ gridTemplateRows: `repeat(${colorworkGrid.rows}, minmax(0, 1fr))`, fontSize: colorworkRowFontSize }}>
                {Array.from({ length: colorworkGrid.rows }, (_, index) => <span key={colorworkGrid.rows - index}>{colorworkGrid.rows - index}</span>)}
              </div>
              <div className="colorwork-column-numbers colorwork-column-numbers-bottom" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${colorworkGrid.columns}, minmax(0, 1fr))`, fontSize: colorworkColumnFontSize }}>
                {Array.from({ length: colorworkGrid.columns }, (_, index) => {
                  const stitchNumber = colorworkGrid.columns - index
                  const scale = Math.min(1, colorworkColumnCellWidth / (colorworkColumnFontSize * 0.6 * String(stitchNumber).length))
                  return <span key={stitchNumber} style={{ transform: `scaleX(${scale})` }}>{stitchNumber}</span>
                })}
              </div>
              <div
                className="page-colorwork-header"
                title={t("끌어서 컬러워크 모눈 위치 이동")}
                onPointerDown={(event) => beginColorworkTransform(event, 'move')}
                onPointerMove={moveColorworkTransform}
                onPointerUp={finishColorworkTransform}
                onPointerCancel={finishColorworkTransform}
                onLostPointerCapture={finishColorworkTransform}
              >
                <strong>{colorworkGrid.columns}{t("코 × ")}{colorworkGrid.rows}{t("단")}</strong>
                <span>{colorworkGrid.chartWidthCm} × {colorworkGrid.chartHeightCm}cm</span>
                <button type="button" className="note-delete-button colorwork-delete-button" aria-label={t("컬러워크 삭제")} title={t("컬러워크 삭제")} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation() }} onClick={() => onWorkChange({ ...work, colorworkGrid: undefined }, true, true, work)}><Trash2 size={13} /></button>
              </div>
              <canvas
                ref={colorworkCanvasRef}
                className="page-colorwork-canvas"
                role="img"
                aria-label={t('{columns}코 {rows}단 컬러워크 모눈. 클릭하거나 드래그하여 칠합니다.', { columns: formatNumber(colorworkGrid.columns), rows: formatNumber(colorworkGrid.rows) })}
                onPointerDown={beginColorworkStroke}
                onPointerMove={moveColorworkStroke}
                onPointerUp={finishColorworkStroke}
                onPointerCancel={finishColorworkStroke}
                onLostPointerCapture={finishColorworkStroke}
              />
              <button type="button" className="colorwork-resize-both" aria-label={t("컬러워크 비율 유지하며 크기 조절")} title={t("드래그해 비율을 유지하며 크기 조절")} onPointerDown={(event) => beginColorworkTransform(event, 'resize')} onPointerMove={moveColorworkTransform} onPointerUp={finishColorworkTransform} onPointerCancel={finishColorworkTransform} onLostPointerCapture={finishColorworkTransform} />
            </div>}
            {guidePageSize && rotatedCssSize && lineSettings.horizontal.visible && <div className="pdf-guide-layer" style={guideLayerStyle}>
              <ProgressLineOverlay
                key={work.documentId + ':' + page + ':' + paneId}
                width={guidePageSize.width}
                height={guidePageSize.height}
                cssWidth={rotatedCssSize.width}
                cssHeight={rotatedCssSize.height}
                renderedZoom={displayedRaster?.zoom ?? pane.zoom}
                previewScale={zoomPreviewScale}
                work={work}
                counters={counters}
                rotation={rotation}
                active={active}
                disabled={!workReady}
                defaultColor={lineSettings.horizontal.color}
                defaultOpacity={lineSettings.horizontal.opacity}
                defaultThickness={lineSettings.horizontal.thickness}
                onActivate={onActivate}
                onWorkChange={onWorkChange}
                onRecognizeChart={openChartRecognition}
              />
            </div>}
            </>}
          </div>
          </div>
        </div>
        {!workReady && pageWorkLoadError && <div className="pane-error" role="alert">{pageWorkLoadError}<button type="button" onClick={onRetryPageWork}>{t("다시 시도")}</button></div>}
        {!workReady && !pageWorkLoadError && <div className="pane-loading"><BrandLoading kind="page-work" requestId={paneId + ':' + page + ':page-work'} layout="pane" /></div>}
        {workReady && renderError?.key !== renderKey && readyKey !== renderKey && <div className={'pane-loading' + (displayedRaster?.pdf === pdf && displayedRaster.page === page ? ' pane-loading-refresh' : '')}><BrandLoading kind="pdf" requestId={paneId + ':' + page + ':' + renderKey} layout={displayedRaster?.pdf === pdf && displayedRaster.page === page ? 'overlay' : 'pane'} /></div>}
        {workReady && renderError?.key === renderKey && <div className="pane-error" role="alert">{renderError.message}<button type="button" onClick={() => { setRenderError(null); setRetry((current) => current + 1) }}>{t("다시 시도")}</button></div>}
        {chartRecognition?.stage === 'select' && <div className="chart-row-select-hint" role="status"><span>{t('차트 영역을 드래그해 지정하세요.')}</span><button type="button" onClick={cancelChartRecognition}>{t('취소')}</button></div>}
        {chartRecognition?.stage === 'analyzing' && <div className="chart-row-select-hint" role="status"><span>{t('차트 행을 분석하고 있습니다…')}</span><button type="button" onClick={cancelChartRecognition}>{t('취소')}</button></div>}
      </div>
    </div>
    {chartRecognition && (chartRecognition.stage === 'review' || chartRecognition.stage === 'error') && <ChartRowRecognitionDialog
      imageUrl={chartRecognition.imageUrl ?? ''}
      initialRows={chartRecognition.rows ?? []}
      counters={counters}
      initialCounterId={mainCounterId || work.horizontalGuides?.find((guide) => guide.id === chartRecognition.guideId)?.linkedCounterId || ''}
      initialCounterRow={(() => {
        const counterId = mainCounterId || work.horizontalGuides?.find((guide) => guide.id === chartRecognition.guideId)?.linkedCounterId
        const counter = counters.find((item) => item.id === counterId)
        return counter ? counter.kind === 'simple' ? counter.value : counter.currentRow ?? 1 : counters.find((item) => item.kind === 'simple' && item.unit === 'row' && !item.linkedToId)?.value ?? 1
      })()}
      error={chartRecognition.stage === 'error' ? chartRecognition.error : undefined}
      onRetry={() => { if (chartRecognition.selection) void analyzeChartRegion(chartRecognition.selection, chartRecognition.guideId) }}
      onCancel={cancelChartRecognition}
      onApply={async (result) => {
        const saved = await applyChartRows(result)
        if (saved) cancelChartRecognition()
        return saved
      }}
    />}
    {active && regionPopoverOpen && selectedRegion && typeof document !== 'undefined' && createPortal(
      <div
        ref={regionPopoverRef}
        className="region-highlight-popover"
        role="group"
        aria-label={t('구간 강조 설정')}
        style={{ left: regionPopoverPosition?.left ?? -10000, top: regionPopoverPosition?.top ?? -10000, visibility: regionPopoverPosition ? 'visible' : 'hidden' }}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <strong>{t('구간 강조 설정')}</strong>
        <ColorPresetButtons
          label={t('구간 강조 색상')}
          className="annotation-color-presets region-highlight-color-presets"
          presets={ANNOTATION_COLOR_PRESETS}
          includeCurrentColor={false}
          value={selectedRegion.color}
          onChange={(color) => {
            finishRegionOpacityChange()
            changeRegionStyle(selectedRegion.id, { color })
          }}
        />
        <label className="region-highlight-opacity-label">
          <span>{t('투명도')} {Math.round(selectedRegion.opacity * 100)}%</span>
          <input
            type="range"
            min="10"
            max="100"
            step="1"
            value={Math.round(selectedRegion.opacity * 100)}
            style={{ '--range-progress': `${((Math.round(selectedRegion.opacity * 100) - 10) / 90) * 100}%` } as CSSProperties}
            aria-label={t('구간 강조 투명도')}
            onPointerDown={() => beginRegionOpacityChange(selectedRegion.id)}
            onPointerUp={() => finishRegionOpacityChange()}
            onPointerCancel={() => finishRegionOpacityChange()}
            onFocus={() => beginRegionOpacityChange(selectedRegion.id)}
            onBlur={() => finishRegionOpacityChange()}
            onKeyDown={() => beginRegionOpacityChange(selectedRegion.id)}
            onKeyUp={() => finishRegionOpacityChange()}
            onChange={(event) => changeRegionStyle(selectedRegion.id, { opacity: Number(event.currentTarget.value) / 100 }, true)}
          />
        </label>
        <button type="button" className="region-highlight-delete" onClick={() => deleteRegionHighlight(selectedRegion.id)}><Trash2 size={16} />{t('삭제')}</button>
      </div>,
      document.body,
    )}
    </>
  )
}
