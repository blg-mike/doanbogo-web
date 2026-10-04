import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist'
import { Minus, Plus, RotateCw, Trash2 } from 'lucide-react'
import type { AnnotationRecord, AnnotationStyle, AnnotationTool, ColorworkCell, ColorworkCreateRequest, ColorworkGrid, PageRotation, PageWorkRecord, PaneId, PaneSnapshot, ProgressGuide, ProgressSettings } from './types'
import { createColorworkGrid } from './colorwork'
import { textNoteBoxAt } from './textNote'
import type { PdfQrLink } from './qr'
import { inverseRotatePoint, rotatedPageSize } from './pageGeometry'
import { acquireThumbnailCache, pdfRasterScale } from './pdfRenderResources'

type Point = { x: number; y: number }
type Size = { width: number; height: number }
type ColorworkTransform = {
  pointerId: number
  kind: 'move' | 'width' | 'height' | 'both'
  start: Point
  before: ColorworkGrid
  after: ColorworkGrid
  beforeWork: PageWorkRecord
}
type ColorworkStroke = {
  pointerId: number
  before: PageWorkRecord
  cells: ColorworkGrid['cells']
  previous: { column: number; row: number } | null
  changed: boolean
}

interface ThumbnailJob {
  cancelled: boolean
  queued: boolean
  preempted: boolean
  run: () => Promise<void>
  cancel: () => void
  preempt: () => void
}

const thumbnailQueue: ThumbnailJob[] = []
let activeThumbnails = 0
let activePageRenders = 0
let runningThumbnail: ThumbnailJob | null = null
const failedImageCounts = new WeakMap<PDFPageProxy, number>()

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
  while (activePageRenders === 0 && activeThumbnails < 1 && thumbnailQueue.length) {
    const job = thumbnailQueue.shift()!
    job.queued = false
    if (job.cancelled) continue
    activeThumbnails++
    runningThumbnail = job
    void job.run().finally(() => {
      activeThumbnails--
      if (runningThumbnail === job) runningThumbnail = null
      if (job.preempted && !job.cancelled) {
        job.preempted = false
        enqueueThumbnail(job)
      }
      pumpThumbnails()
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

function copyCanvas(target: HTMLCanvasElement, source: HTMLCanvasElement) {
  target.width = source.width
  target.height = source.height
  target.getContext('2d', { alpha: false })?.drawImage(source, 0, 0)
}

export function PdfThumbnail({ pdf, pageNumber, active, hidden, bookmarked, selected, disabled, root, onSelect }: {
  pdf: PDFDocumentProxy
  pageNumber: number
  active: boolean
  hidden: boolean
  bookmarked: boolean
  selected?: boolean
  disabled?: boolean
  root: RefObject<HTMLDivElement | null>
  onSelect: () => void
}) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  const [visible, setVisible] = useState(false)
  const [ready, setReady] = useState(false)
  const observerTargetRef = useRef<HTMLSpanElement>(null)
  const cacheSessionRef = useRef<ReturnType<typeof acquireThumbnailCache> | null>(null)

  useEffect(() => {
    const target = observerTargetRef.current
    if (!target) return
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { root: root.current, rootMargin: '80px 160px' })
    observer.observe(target)
    return () => observer.disconnect()
  }, [root])

  useEffect(() => {
    const session = acquireThumbnailCache(pdf)
    cacheSessionRef.current = session
    return () => {
      session.release()
      if (cacheSessionRef.current === session) cacheSessionRef.current = null
    }
  }, [pdf])

  useEffect(() => {
    if (!canvas) return
    if (!visible) {
      clearCanvas(canvas)
      return
    }
    const cache = cacheSessionRef.current?.cache
    const cached = cache?.get(pageNumber)
    if (cached) {
      copyCanvas(canvas, cached)
      setReady(true)
      return () => clearCanvas(canvas)
    }
    setReady(false)
    let renderTask: RenderTask | undefined
    const job: ThumbnailJob = {
      cancelled: false,
      queued: false,
      preempted: false,
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
          const cachedCanvas = document.createElement('canvas')
          cachedCanvas.width = canvas.width
          cachedCanvas.height = canvas.height
          cachedCanvas.getContext('2d', { alpha: false })?.drawImage(canvas, 0, 0)
          cacheSessionRef.current?.cache.set(pageNumber, cachedCanvas)
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
    enqueueThumbnail(job)
    return () => {
      job.cancel()
      removeQueuedThumbnail(job)
      clearCanvas(canvas)
    }
  }, [canvas, pageNumber, pdf, visible])

  return (
    <button
      className={'page-thumbnail ' + (active ? 'active' : '') + (hidden ? ' hidden' : '') + (selected ? ' selected' : '')}
      aria-label={pageNumber + '페이지 썸네일' + (hidden ? ', 숨김' : '') + (bookmarked ? ', 북마크' : '') + (selected ? ', 선택됨' : '')}
      aria-current={active ? 'page' : undefined}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
    >
      <span className="page-thumbnail-image">
        <canvas ref={setCanvas} width={0} height={0} aria-hidden="true" />
        {!ready && <span className="thumbnail-placeholder">{pageNumber}</span>}
        {hidden && <span className="thumbnail-badge">숨김</span>}
        {selected && <span className="thumbnail-selection-mark">✓</span>}
        {bookmarked && <span className="thumbnail-bookmark">★</span>}
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
  return inverseRotatePoint({
    x: Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(rect.width, 1))),
    y: Math.min(1, Math.max(0, (event.clientY - rect.top) / Math.max(rect.height, 1))),
  }, rotation)
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

export function PdfPage({ pdf, page, paneId, pane, rotation, active, tool, lineSettings, annotationStyle, work, workReady, colorworkBrushColor, colorworkBrushOpacity, colorworkEraser, createColorworkRequest, pageLinks, qrLinks, onPageRendered, onActivate, onWorkChange, onZoom, onRotate, onCenter, onColorworkRequestHandled, onTextToolConsumed }: {
  pdf: PDFDocumentProxy
  page: number
  paneId: PaneId
  pane: PaneSnapshot
  rotation: PageRotation
  active: boolean
  tool: AnnotationTool
  lineSettings: ProgressSettings
  annotationStyle: AnnotationStyle
  work: PageWorkRecord
  workReady: boolean
  colorworkBrushColor: string
  colorworkBrushOpacity: number
  colorworkEraser: boolean
  createColorworkRequest: ColorworkCreateRequest | null
  pageLinks: PdfQrLink[] | undefined
  qrLinks: PdfQrLink[] | undefined
  onPageRendered: (pageNumber: number, canvas: HTMLCanvasElement) => void
  onActivate: () => void
  onWorkChange: (work: PageWorkRecord, immediate: boolean, recordHistory?: boolean, historyBefore?: PageWorkRecord) => void
  onZoom: (zoom: number) => void
  onRotate: () => void
  onCenter: (x: number, y: number) => void
  onColorworkRequestHandled: (id: string) => void
  onTextToolConsumed: () => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const rotationLayerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const annotationLayerRef = useRef<HTMLDivElement>(null)
  const textInputRef = useRef<HTMLTextAreaElement>(null)
  const textStyleToolbarRef = useRef<HTMLDivElement>(null)
  const colorworkPanelRef = useRef<HTMLDivElement>(null)
  const colorworkCanvasRef = useRef<HTMLCanvasElement>(null)
  const handledColorworkRequest = useRef<string | null>(null)
  const colorworkTransform = useRef<ColorworkTransform | null>(null)
  const colorworkStroke = useRef<ColorworkStroke | null>(null)
  const centerRef = useRef({ x: pane.centerX, y: pane.centerY })
  const renderSequence = useRef(0)
  const lastRenderPage = useRef<{ page: number; rotation: PageRotation } | null>(null)
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })
  const [displayedSize, setDisplayedSize] = useState<{ page: Size; css: Size } | null>(null)
  const [displayedRaster, setDisplayedRaster] = useState<{ pdf: PDFDocumentProxy; page: number } | null>(null)
  const [readyKey, setReadyKey] = useState('')
  const [renderError, setRenderError] = useState<{ key: string; message: string } | null>(null)
  const [retry, setRetry] = useState(0)
  const [pinchZoom, setPinchZoom] = useState<number | null>(null)
  const [draft, setDraft] = useState<Point[]>([])
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<
    | { kind: 'pan'; pointerId: number; x: number; y: number; scrollLeft: number; scrollTop: number }
    | { kind: 'pinch'; firstId: number; secondId: number; distance: number; zoom: number; centerX: number; centerY: number }
    | null
  >(null)
  const drawPointer = useRef<number | null>(null)
  const lineDrag = useRef<{ axis: 'horizontal' | 'vertical'; id: string; pointerId: number } | null>(null)
  const erasedIds = useRef(new Set<string>())
  const actionStartWork = useRef(work)
  const textDrag = useRef<{ id: string; pointerId: number; kind: 'move' | 'resize'; start: Point; original: { x: number; y: number; width: number; height: number }; before: PageWorkRecord } | null>(null)
  const textEditBefore = useRef(new Map<string, PageWorkRecord>())
  const textStyleEditBefore = useRef<{ id: string; before: PageWorkRecord } | null>(null)
  const suppressTextBlur = useRef(new Set<string>())
  const currentWorkRef = useRef(work)
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [textPreviewPoint, setTextPreviewPoint] = useState<Point | null>(null)
  const [textToolbarPosition, setTextToolbarPosition] = useState<Point | null>(null)
  const [fontSizeDraft, setFontSizeDraft] = useState<{ id: string; value: string } | null>(null)
  const renderKey = [page, pane.zoom, rotation, size.width, size.height].join(':')
  const colorworkGrid = work.colorworkGrid?.visible ? work.colorworkGrid : null

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

  useEffect(() => {
    if (!size.width || !size.height) return
    const sequence = ++renderSequence.current
    let cancelled = false
    let timedOut = false
    let renderTask: ReturnType<PDFDocumentProxy['getPage']> extends Promise<infer P> ? P extends { render: (...args: never[]) => infer R } ? R : never : never
    let timeoutId = 0
    let debounceId = 0
    let finishDebounce: (() => void) | undefined
    let cancelPending: (() => void) | undefined
    let staging: HTMLCanvasElement | null = null
    let releasePriority: (() => void) | undefined
    const previousRenderPage = lastRenderPage.current
    const renderImmediately = !previousRenderPage || previousRenderPage.page !== page || previousRenderPage.rotation !== rotation
    lastRenderPage.current = { page, rotation }
    void (async () => {
      try {
        if (!renderImmediately) {
          await new Promise<void>((resolve) => {
            finishDebounce = resolve
            debounceId = window.setTimeout(resolve, 150)
          })
        }
        if (cancelled || sequence !== renderSequence.current) return
        releasePriority = prioritizePdfPageRender()
        const cancelledRender = Symbol('cancelled')
        const cancellationPromise = new Promise<typeof cancelledRender>((resolve) => {
          cancelPending = () => resolve(cancelledRender)
        })
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = window.setTimeout(() => {
            timedOut = true
            reject(new Error('PDF 페이지 표시가 20초 안에 끝나지 않았습니다. 다시 시도해 주세요.'))
            renderTask?.cancel?.()
          }, 20000)
        })
        const pageResult = await Promise.race([pdf.getPage(page), timeoutPromise, cancellationPromise])
        if (pageResult === cancelledRender || cancelled) return
        const pdfPage = pageResult
        const base = pdfPage.getViewport({ scale: 1 })
        const fitSize = rotatedPageSize(base, rotation)
        const fit = Math.min(Math.max(1, size.width - 24) / fitSize.width, Math.max(1, size.height - 24) / fitSize.height)
        const cssScale = Math.max(0.1, fit * pane.zoom)
        const rasterScale = pdfRasterScale(base.width, base.height, cssScale, window.devicePixelRatio || 1)
        const viewport = pdfPage.getViewport({ scale: rasterScale })
        staging = document.createElement('canvas')
        staging.width = Math.ceil(viewport.width)
        staging.height = Math.ceil(viewport.height)
        const context = staging.getContext('2d', { alpha: false })
        if (!context) throw new Error('이 브라우저에서 PDF 화면을 만들 수 없습니다.')
        renderTask = pdfPage.render({ canvas: staging, canvasContext: context, viewport }) as typeof renderTask
        await Promise.race([renderTask.promise, timeoutPromise, cancellationPromise])
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
        const targetContext = target?.getContext('2d', { alpha: false })
        if (!target || !targetContext) throw new Error('PDF 화면을 표시할 수 없습니다.')
        target.width = staging.width
        target.height = staging.height
        target.style.width = base.width * cssScale + 'px'
        target.style.height = base.height * cssScale + 'px'
        targetContext.drawImage(staging, 0, 0)
        const css = { width: base.width * cssScale, height: base.height * cssScale }
        setDisplayedSize({ page: { width: base.width, height: base.height }, css })
        setDisplayedRaster({ pdf, page })
        setReadyKey(renderKey)
      } catch (cause) {
        if (!cancelled && sequence === renderSequence.current && (timedOut || !(cause instanceof Error && cause.name === 'RenderingCancelledException'))) {
          setRenderError({ key: renderKey, message: timedOut ? 'PDF 페이지 표시가 20초 안에 끝나지 않았습니다. 다시 시도해 주세요.' : cause instanceof Error ? cause.message : 'PDF 페이지를 표시하지 못했습니다.' })
        }
      } finally {
        window.clearTimeout(timeoutId)
        if (staging) clearCanvas(staging)
        releasePriority?.()
      }
    })()
    return () => {
      cancelled = true
      window.clearTimeout(debounceId)
      finishDebounce?.()
      window.clearTimeout(timeoutId)
      cancelPending?.()
      renderTask?.cancel?.()
    }
  }, [pdf, page, pane.zoom, rotation, size.width, size.height, retry, renderKey])

  useEffect(() => {
    if (readyKey !== renderKey) return
    const canvas = canvasRef.current
    if (canvas) onPageRendered(page, canvas)
  }, [pageLinks, qrLinks, readyKey, renderKey, page, active, onPageRendered])

  useEffect(() => {
    const element = scrollRef.current
    if (!element || readyKey !== renderKey) return
    const frame = requestAnimationFrame(() => {
      element.scrollLeft = Math.max(0, centerRef.current.x * element.scrollWidth - element.clientWidth / 2)
      element.scrollTop = Math.max(0, centerRef.current.y * element.scrollHeight - element.clientHeight / 2)
    })
    return () => cancelAnimationFrame(frame)
  }, [readyKey, renderKey, page, pane.zoom])

  useEffect(() => {
    centerRef.current = { x: pane.centerX, y: pane.centerY }
  }, [page, pane.zoom, pane.centerX, pane.centerY])

  useEffect(() => {
    if (editingNoteId !== null) textInputRef.current?.focus()
  }, [editingNoteId])

  useEffect(() => {
    currentWorkRef.current = work
  }, [work])

  useLayoutEffect(() => {
    const layer = annotationLayerRef.current
    const note = layer?.querySelector('.page-note.selected')
    const toolbar = textStyleToolbarRef.current
    if (!active || !layer || !note || !toolbar || !displayedSize) {
      setTextToolbarPosition(null)
      return
    }
    const layerRect = layer.getBoundingClientRect()
    const noteRect = note.getBoundingClientRect()
    const toolbarRect = toolbar.getBoundingClientRect()
    const left = Math.min(Math.max(0, noteRect.left - layerRect.left), Math.max(0, layerRect.width - toolbarRect.width))
    let top = noteRect.top - layerRect.top - toolbarRect.height - 8
    if (top < 0) top = noteRect.bottom - layerRect.top + 8
    top = Math.min(Math.max(0, top), Math.max(0, layerRect.height - toolbarRect.height))
    setTextToolbarPosition({ x: left, y: top })
  }, [active, selectedNoteId, displayedSize, work])

  function recordCenter() {
    const element = scrollRef.current
    if (!element) return
    const x = element.scrollWidth > element.clientWidth ? (element.scrollLeft + element.clientWidth / 2) / element.scrollWidth : 0.5
    const y = element.scrollHeight > element.clientHeight ? (element.scrollTop + element.clientHeight / 2) / element.scrollHeight : 0.5
    centerRef.current = { x, y }
    onCenter(x, y)
  }

  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const target = event.target
    if (!(target instanceof Element) || !target.closest('.page-note')) {
      setSelectedNoteId(null)
      setEditingNoteId(null)
    }
    if (tool !== 'pan' || (event.pointerType === 'mouse' && event.button !== 0)) return
    const area = scrollRef.current
    if (!area) return
    event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const current = gesture.current
    if (!current) {
      gesture.current = { kind: 'pan', pointerId: event.pointerId, x: event.clientX, y: event.clientY, scrollLeft: area.scrollLeft, scrollTop: area.scrollTop }
    } else if (current.kind === 'pan') {
      const first = pointers.current.get(current.pointerId)
      if (!first) return
      const rect = area.getBoundingClientRect()
      const midpointX = (first.x + event.clientX) / 2
      const midpointY = (first.y + event.clientY) / 2
      gesture.current = {
        kind: 'pinch', firstId: current.pointerId, secondId: event.pointerId,
        distance: Math.max(1, Math.hypot(event.clientX - first.x, event.clientY - first.y)),
        zoom: pinchZoom ?? pane.zoom,
        centerX: Math.min(1, Math.max(0, (area.scrollLeft + midpointX - rect.left) / Math.max(area.scrollWidth, 1))),
        centerY: Math.min(1, Math.max(0, (area.scrollTop + midpointY - rect.top) / Math.max(area.scrollHeight, 1))),
      }
    }
  }

  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const area = scrollRef.current
    const current = gesture.current
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
      setPinchZoom(Math.min(5, Math.max(1, current.zoom * Math.hypot(second.x - first.x, second.y - first.y) / current.distance)))
    }
  }

  function pointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const current = gesture.current
    const area = scrollRef.current
    if (!pointers.current.has(event.pointerId)) return
    if (tool === 'pan' && current?.kind === 'pinch' && area && pinchZoom !== null) {
      centerRef.current = { x: current.centerX, y: current.centerY }
      onCenter(current.centerX, current.centerY)
      onZoom(pinchZoom)
    }
    pointers.current.delete(event.pointerId)
    setPinchZoom(null)
    const remaining = [...pointers.current.entries()][0]
    if (area && remaining) {
      gesture.current = { kind: 'pan', pointerId: remaining[0], x: remaining[1].x, y: remaining[1].y, scrollLeft: area.scrollLeft, scrollTop: area.scrollTop }
    } else gesture.current = null
  }

  function doubleTap(event: React.MouseEvent<HTMLDivElement>) {
    if (tool !== 'pan') return
    const area = scrollRef.current
    if (!area) return
    if (pane.zoom === 1) {
      const rect = area.getBoundingClientRect()
      const x = Math.min(1, Math.max(0, (area.scrollLeft + event.clientX - rect.left) / Math.max(area.scrollWidth, 1)))
      const y = Math.min(1, Math.max(0, (area.scrollTop + event.clientY - rect.top) / Math.max(area.scrollHeight, 1)))
      centerRef.current = { x, y }
      onCenter(x, y)
      onZoom(2)
    } else {
      centerRef.current = { x: 0.5, y: 0.5 }
      onCenter(0.5, 0.5)
      onZoom(1)
    }
  }

  function updateGuide(axis: 'horizontal' | 'vertical', id: string, value: number, immediate: boolean) {
    const position = Math.min(1, Math.max(0, value))
    const key = axis === 'horizontal' ? 'horizontalGuides' : 'verticalGuides'
    const legacyKey = axis === 'horizontal' ? 'horizontalPosition' : 'verticalPosition'
    onWorkChange({
      ...work,
      [key]: guidesFor(work, axis).map((guide) => guide.id === id ? { ...guide, position } : guide),
      [legacyKey]: position,
    }, immediate, immediate, actionStartWork.current)
  }

  function addGuide(axis: 'horizontal' | 'vertical') {
    const guides = guidesFor(work, axis)
    if (guides.length >= 10) return
    const guide = { id: crypto.randomUUID(), position: 0.5 }
    const key = axis === 'horizontal' ? 'horizontalGuides' : 'verticalGuides'
    onActivate()
    onWorkChange({ ...work, [key]: [...guides, guide] }, true, true, work)
  }

  function removeGuide(axis: 'horizontal' | 'vertical') {
    const guides = guidesFor(work, axis)
    if (!guides.length) return
    const key = axis === 'horizontal' ? 'horizontalGuides' : 'verticalGuides'
    onActivate()
    onWorkChange({ ...work, [key]: guides.slice(0, -1) }, true, true, work)
  }

  function addText(point: Point) {
    if (editingNoteId !== null) finishTextEdit(editingNoteId)
    const before = currentWorkRef.current
    const box = textNoteBoxAt(point)
    const id = crypto.randomUUID()
    const note: AnnotationRecord = {
      id, type: 'text', text: '',
      points: [{ x: box.x, y: box.y }],
      boxWidth: box.width, boxHeight: box.height, style: { ...annotationStyle },
    }
    textEditBefore.current.set(id, before)
    setSelectedNoteId(id)
    setEditingNoteId(id)
    setTextPreviewPoint(null)
    onWorkChange({ ...before, annotations: [...before.annotations, note] }, false, false, before)
    onTextToolConsumed()
  }

  function colorworkCellAt(event: ReactPointerEvent<HTMLCanvasElement>, grid: ColorworkGrid) {
    const point = rotationLayerRef.current
      ? pointFromEvent(event, rotationLayerRef.current, rotation)
      : pointFromEvent(event, event.currentTarget, rotation)
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

  function paintColorworkSegment(stroke: ColorworkStroke, target: { column: number; row: number }, grid: ColorworkGrid, canvas: HTMLCanvasElement) {
    const previous = stroke.previous ?? target
    let column = previous.column
    let row = previous.row
    const dx = Math.abs(target.column - column)
    const sx = column < target.column ? 1 : -1
    const dy = -Math.abs(target.row - row)
    const sy = row < target.row ? 1 : -1
    let error = dx + dy
    while (true) {
      const index = row * grid.columns + column
      const nextCell: ColorworkCell | null = colorworkEraser ? null : { color: colorworkBrushColor, opacity: colorworkBrushOpacity }
      const currentCell = stroke.cells[index]
      if (JSON.stringify(currentCell) !== JSON.stringify(nextCell)) {
        stroke.cells[index] = nextCell
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
    const stroke: ColorworkStroke = { pointerId: event.pointerId, before: work, cells: [...grid.cells], previous: null, changed: false }
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
    onWorkChange({ ...stroke.before, colorworkGrid: { ...grid, cells: stroke.cells } }, true, true, stroke.before)
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
    const point = rotationLayerRef.current
      ? pointFromEvent(event, rotationLayerRef.current, rotation)
      : transform.start
    const dx = point.x - transform.start.x
    const dy = point.y - transform.start.y
    const after = { ...transform.before }
    if (transform.kind === 'move') {
      after.x = Math.min(1 - after.displayWidth, Math.max(0, transform.before.x + dx))
      after.y = Math.min(1 - after.displayHeight, Math.max(0, transform.before.y + dy))
    } else {
      const width = transform.before.displayWidth * pageSize.width
      const height = transform.before.displayHeight * pageSize.height
      const scaleDelta = transform.kind === 'width'
        ? dx / width
        : transform.kind === 'height'
          ? dy / height
          : (dx * width + dy * height) / (width * width + height * height)
      const minimumScale = Math.max(Math.min(120, pageSize.width) / width, Math.min(100, pageSize.height) / height)
      const maximumScale = Math.min((1 - after.x) * pageSize.width / width, (1 - after.y) * pageSize.height / height)
      const scale = Math.min(maximumScale, Math.max(Math.min(minimumScale, maximumScale), 1 + scaleDelta))
      after.displayWidth = transform.before.displayWidth * scale
      after.displayHeight = transform.before.displayHeight * scale
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
    if (!grid?.visible || !canvas || !displayedSize) return
    if (!displayedSize.css.width || !displayedSize.css.height) return
    const ratio = pdfRasterScale(displayedSize.css.width, displayedSize.css.height, 1, window.devicePixelRatio || 1)
    canvas.width = Math.max(1, Math.ceil(displayedSize.css.width * ratio))
    canvas.height = Math.max(1, Math.ceil(displayedSize.css.height * ratio))
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
  }, [work.colorworkGrid, displayedSize])

  useEffect(() => {
    if (!createColorworkRequest || createColorworkRequest.paneId !== paneId || createColorworkRequest.pageNumber !== page) return
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
  }, [createColorworkRequest, displayedSize, paneId, page, rotation, work, onActivate, onWorkChange, onColorworkRequestHandled])

  function updateText(id: string, value: string) {
    const current = currentWorkRef.current
    const before = textEditBefore.current.get(id) ?? current
    textEditBefore.current.set(id, before)
    const next = {
      ...current,
      annotations: current.annotations.map((annotation) => annotation.id === id
        ? { ...withTextBox(annotation, displayedSize?.page.height ?? 1), text: value.slice(0, 500) }
        : annotation),
    }
    currentWorkRef.current = next
    onWorkChange(next, false, false, before)
  }

  function finishTextEdit(id: string) {
    if (suppressTextBlur.current.delete(id)) return
    const before = textEditBefore.current.get(id)
    const current = currentWorkRef.current
    const annotation = current.annotations.find((item) => item.id === id)
    if (!annotation) {
      setEditingNoteId((active) => active === id ? null : active)
      return
    }
    const annotations = annotation.text?.trim()
      ? current.annotations.map((item) => item.id === id ? withTextBox(item, displayedSize?.page.height ?? 1) : item)
      : current.annotations.filter((item) => item.id !== id)
    const next = { ...current, annotations }
    currentWorkRef.current = next
    onWorkChange(next, true, true, before ?? current)
    textEditBefore.current.delete(id)
    setEditingNoteId((active) => active === id ? null : active)
    if (!annotation.text?.trim()) setSelectedNoteId((active) => active === id ? null : active)
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
    setSelectedNoteId((active) => active === id ? null : active)
    setEditingNoteId((active) => active === id ? null : active)
  }

  function beginTextTransform(event: ReactPointerEvent<HTMLElement>, annotation: AnnotationRecord, kind: 'move' | 'resize') {
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
      start: pointFromEvent(event, layer, rotation),
      original: box,
      before: work,
    }
    setSelectedNoteId(annotation.id)
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
    onWorkChange({
      ...work,
      annotations: work.annotations.map((annotation) => annotation.id === drag.id
        ? { ...annotation, points: [{ x: box.x, y: box.y }], boxWidth: box.width, boxHeight: box.height }
        : annotation),
    }, false, false, drag.before)
  }

  function finishTextTransform(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = textDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    textDrag.current = null
    onWorkChange(work, true, true, drag.before)
  }

  const deleteText = useCallback((id: string) => {
    if (editingNoteId === id) suppressTextBlur.current.add(id)
    const current = currentWorkRef.current
    const before = textEditBefore.current.get(id) ?? current
    const next = { ...current, annotations: current.annotations.filter((annotation) => annotation.id !== id) }
    currentWorkRef.current = next
    onWorkChange(next, true, true, before)
    textEditBefore.current.delete(id)
    setSelectedNoteId(null)
    setEditingNoteId(null)
  }, [editingNoteId, onWorkChange])

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
    if (tool === 'pan') {
      setTextPreviewPoint(null)
      return
    }
    onActivate()
    event.stopPropagation()
    const point = pointFromEvent(event, event.currentTarget, rotation)
    if (tool === 'text') {
      if (event.pointerType === 'mouse') event.preventDefault()
      addText(point)
      return
    }
    setSelectedNoteId(null)
    setEditingNoteId(null)
    setTextPreviewPoint(null)
    event.currentTarget.setPointerCapture(event.pointerId)
    if (tool === 'eraser') {
      actionStartWork.current = work
      erasedIds.current = new Set(work.annotations.filter((annotation) => {
        const points = annotation.points.length === 1 ? [...annotation.points, ...annotation.points] : annotation.points
        return points.some((item, index) => index > 0 && distanceToSegment(point, points[index - 1], item, displayedSize?.css.width ?? 1, displayedSize?.css.height ?? 1) < 20)
      }).map((annotation) => annotation.id))
      return
    }
    actionStartWork.current = work
    drawPointer.current = event.pointerId
    setDraft([point])
  }

  function handleSvgPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const point = pointFromEvent(event, event.currentTarget, rotation)
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
    if (drawPointer.current !== event.pointerId) return
    setDraft((current) => {
      const last = current.at(-1)
      if (last && distanceToSegment(point, last, last, displayedSize?.css.width ?? 1, displayedSize?.css.height ?? 1) < 1.5) return current
      return tool === 'line' ? [current[0], point] : [...current, point]
    })
  }

  function handleSvgPointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    event.stopPropagation()
    if (tool === 'eraser') {
      if (erasedIds.current.size) onWorkChange({ ...work, annotations: work.annotations.filter((annotation) => !erasedIds.current.has(annotation.id)) }, true, true, actionStartWork.current)
      erasedIds.current.clear()
      return
    }
    if (drawPointer.current !== event.pointerId) return
    drawPointer.current = null
    const points = draft
    setDraft([])
    if (!points.length) return
    const annotation: AnnotationRecord = {
      id: crypto.randomUUID(),
      type: tool === 'pen' || tool === 'line' || tool === 'highlight' ? tool : 'pen',
      points: tool === 'line' ? [points[0], points.at(-1)!] : points,
      style: { ...annotationStyle },
    }
    onWorkChange({ ...work, annotations: [...work.annotations, annotation] }, true, true, actionStartWork.current)
  }

  function handleGuidePointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    const target = event.target as SVGElement
    const axis = target.dataset.progress as 'horizontal' | 'vertical' | undefined
    const id = target.dataset.guideId
    if (!axis || !id || tool === 'text') return
    event.preventDefault()
    event.stopPropagation()
    setSelectedNoteId(null)
    setEditingNoteId(null)
    onActivate()
    event.currentTarget.setPointerCapture(event.pointerId)
    lineDrag.current = { axis, id, pointerId: event.pointerId }
    actionStartWork.current = work
  }

  function handleGuidePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const drag = lineDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const point = pointFromEvent(event, event.currentTarget, 0)
    updateGuide(drag.axis, drag.id, drag.axis === 'horizontal' ? point.y : point.x, false)
  }

  function handleGuidePointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    const drag = lineDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    const point = pointFromEvent(event, event.currentTarget, 0)
    updateGuide(drag.axis, drag.id, drag.axis === 'horizontal' ? point.y : point.x, true)
    lineDrag.current = null
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
    width: Math.max(size.width - 24, rotatedCssSize.width) + 24,
    height: Math.max(size.height - 24, rotatedCssSize.height) + 24,
  } : undefined
  const colorworkColumnCellWidth = colorworkGrid && cssSize ? colorworkGrid.displayWidth * cssSize.width / colorworkGrid.columns : 0
  const colorworkRowCellHeight = colorworkGrid && cssSize ? Math.max(1, (colorworkGrid.displayHeight * cssSize.height - 26) / colorworkGrid.rows) : 0
  const colorworkColumnFontSize = Math.min(10, Math.max(1, colorworkColumnCellWidth * 0.72))
  const colorworkRowFontSize = Math.min(10, Math.max(1, colorworkRowCellHeight * 0.72))
  const horizontalGuides = guidesFor(work, 'horizontal')
  const verticalGuides = guidesFor(work, 'vertical')
  const currentDraft: AnnotationRecord | null = draft.length ? {
    id: 'draft', type: tool === 'line' || tool === 'highlight' || tool === 'pen' ? tool : 'pen', points: draft, style: annotationStyle,
  } : null

  return (
    <div className={'pdf-pane ' + (active ? 'is-active' : '')} onPointerDown={onActivate}>
      <div className="pane-label">{active ? '현재 작업 영역' : '보조 영역'}</div>
      <div className="pdf-scroll-area" ref={scrollRef} onScroll={recordCenter} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onDoubleClick={doubleTap}>
        <div className="pdf-page-wrap" style={pageWrapStyle}>
          <div ref={rotationLayerRef} className="pdf-rotation-content" style={cssSize ? { width: cssSize.width, height: cssSize.height, transform: 'rotate(' + rotation + 'deg)' } : undefined}>
          <div className="pdf-image-layer" style={cssSize ? { width: cssSize.width, height: cssSize.height } : undefined}>
            <canvas ref={canvasRef} aria-label={'PDF ' + page + '페이지'} />
            {pageSize && cssSize && <>
            <svg
                className={'pdf-svg-overlay ' + (tool === 'pan' ? 'pan-mode' : tool === 'text' ? 'text-mode' : 'draw-mode')}
                viewBox={'0 0 ' + pageSize.width + ' ' + pageSize.height}
                preserveAspectRatio="none"
              onPointerDown={handleSvgPointerDown}
              onPointerMove={handleSvgPointerMove}
              onPointerLeave={() => setTextPreviewPoint(null)}
              onPointerUp={handleSvgPointerUp}
              onPointerCancel={handleSvgPointerUp}
            >
              {tool !== 'pan' && <rect x="0" y="0" width={pageSize.width} height={pageSize.height} fill="transparent" pointerEvents="all" />}
              {work.annotations.filter((annotation) => annotation.type !== 'text').map((annotation) =>
                <path key={annotation.id} d={annotationPath(annotation, pageSize.width, pageSize.height)} fill="none" stroke={annotation.style.color} strokeWidth={annotation.style.thickness} strokeOpacity={annotation.style.opacity} strokeLinecap="round" strokeLinejoin="round" style={{ mixBlendMode: annotation.type === 'highlight' ? 'multiply' : 'normal', pointerEvents: tool === 'text' ? 'auto' : 'none' }} />,
              )}
              {currentDraft && <path d={annotationPath(currentDraft, pageSize.width, pageSize.height)} fill="none" stroke={currentDraft.style.color} strokeWidth={currentDraft.style.thickness} strokeOpacity={currentDraft.style.opacity} strokeLinecap="round" strokeLinejoin="round" style={{ mixBlendMode: currentDraft.type === 'highlight' ? 'multiply' : 'normal', pointerEvents: 'none' }} />}
            </svg>
            <div className="annotation-layer" ref={annotationLayerRef} style={{ width: cssSize.width, height: cssSize.height }}>
              {tool === 'text' && textPreviewPoint && (() => {
                const box = textNoteBoxAt(textPreviewPoint)
                return <div className="note-preview" aria-hidden="true" style={{ left: box.x * cssSize.width, top: box.y * cssSize.height, width: box.width * cssSize.width, height: box.height * cssSize.height, fontSize: annotationStyle.fontSize * cssSize.width / pageSize.width }}>텍스트 입력</div>
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
                  aria-label="페이지 노트"
                  style={{ left: box.x * cssSize.width, top: box.y * cssSize.height, width: box.width * cssSize.width, height: box.height * cssSize.height, color: annotation.style.color, fontSize }}
                  onPointerDown={(event) => {
                    event.stopPropagation()
                    onActivate()
                    setSelectedNoteId(annotation.id)
                    if (event.target instanceof Element && event.target.closest('textarea')) return
                    if (tool === 'text') {
                      if (!textEditBefore.current.has(annotation.id)) textEditBefore.current.set(annotation.id, currentWorkRef.current)
                      setEditingNoteId(annotation.id)
                    } else {
                      setEditingNoteId(null)
                      if (tool === 'pan') beginTextTransform(event, annotation, 'move')
                    }
                  }}
                  onPointerMove={moveTextTransform}
                  onPointerUp={finishTextTransform}
                  onPointerCancel={finishTextTransform}
                >
                  {selected && <button type="button" className="note-delete-button" aria-label="텍스트 객체 삭제" title="삭제" onPointerDown={(event) => { event.preventDefault(); event.stopPropagation() }} onClick={() => deleteText(annotation.id)}><Trash2 size={13} /></button>}
                  {editing
                    ? <textarea
                      ref={textInputRef}
                      aria-label="페이지 노트 내용"
                      autoFocus
                      maxLength={500}
                      placeholder="여기에 텍스트 입력"
                      value={annotation.text ?? ''}
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
                  {editing && <button type="button" className="note-resize-handle" aria-label="노트 크기 조절" title="크기 조절" onPointerDown={(event) => beginTextTransform(event, annotation, 'resize')} />}
                </div>
              })}
              {active && (() => {
                const annotation = work.annotations.find((item) => item.id === selectedNoteId && item.type === 'text' && item.text?.trim())
                if (!annotation) return null
                return <div
                  ref={textStyleToolbarRef}
                  className="text-style-toolbar"
                  role="toolbar"
                  aria-label="선택한 텍스트 설정"
                  style={textToolbarPosition ? { left: textToolbarPosition.x, top: textToolbarPosition.y } : { left: 0, top: 0, visibility: 'hidden' }}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <label className="text-style-size" title="글자 크기">
                    <span>크기</span>
                    <input
                      aria-label="텍스트 글자 크기"
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
                      aria-label="텍스트 글자 크기 조절"
                      type="range"
                      min="10"
                      max="48"
                      value={annotation.style.fontSize}
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
                  <label className="text-style-color" title="글자 색상">
                    <span>색상</span>
                    <input aria-label="텍스트 색상" type="color" value={annotation.style.color} onChange={(event) => changeTextStyle(annotation.id, { color: event.currentTarget.value })} />
                  </label>
                  <label className="text-style-opacity" title="글자 투명도">
                    <span>투명도 {Math.round(annotation.style.opacity * 100)}%</span>
                    <input
                      aria-label="텍스트 투명도"
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round(annotation.style.opacity * 100)}
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
                </div>
              })()}
              {tool === 'pan' && pageLinks?.map((link, index) => <a
                key={'pdf-' + index}
                className="page-pdf-link"
                aria-label={'웹 링크 새 탭 열기 ' + (index + 1)}
                title={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                style={{ left: link.x * cssSize.width, top: link.y * cssSize.height, width: link.width * cssSize.width, height: link.height * cssSize.height }}
                onPointerDown={(event) => event.stopPropagation()}
              />)}
              {pageLinks !== undefined && qrLinks?.filter((link) => !pageLinks.some((pageLink) => regionsOverlap(pageLink, link))).map((link, index) => <a
                key={index}
                className="page-qr-link"
                aria-label={'QR 링크 열기 ' + (index + 1)}
                title={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                style={{ left: link.x * cssSize.width, top: link.y * cssSize.height, width: link.width * cssSize.width, height: link.height * cssSize.height }}
                onPointerDown={(event) => event.stopPropagation()}
              />)}
            </div>
            {colorworkGrid && <div
              ref={colorworkPanelRef}
              className="page-colorwork-panel"
              role="group"
              aria-label="컬러워크 모눈 패널"
              style={{ left: colorworkGrid.x * cssSize.width, top: colorworkGrid.y * cssSize.height, width: colorworkGrid.displayWidth * cssSize.width, height: colorworkGrid.displayHeight * cssSize.height }}
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
                title="끌어서 컬러워크 모눈 위치 이동"
                onPointerDown={(event) => beginColorworkTransform(event, 'move')}
                onPointerMove={moveColorworkTransform}
                onPointerUp={finishColorworkTransform}
                onPointerCancel={finishColorworkTransform}
              >
                <strong>{colorworkGrid.columns}코 × {colorworkGrid.rows}단</strong>
                <span>{colorworkGrid.chartWidthCm} × {colorworkGrid.chartHeightCm}cm</span>
                <button type="button" className="note-delete-button colorwork-delete-button" aria-label="컬러워크 삭제" title="컬러워크 삭제" onPointerDown={(event) => { event.preventDefault(); event.stopPropagation() }} onClick={() => onWorkChange({ ...work, colorworkGrid: undefined }, true, true, work)}><Trash2 size={13} /></button>
              </div>
              <canvas
                ref={colorworkCanvasRef}
                className="page-colorwork-canvas"
                role="img"
                aria-label={colorworkGrid.columns + '코 ' + colorworkGrid.rows + '단 컬러워크 모눈. 클릭하거나 드래그하여 칠합니다.'}
                onPointerDown={beginColorworkStroke}
                onPointerMove={moveColorworkStroke}
                onPointerUp={finishColorworkStroke}
                onPointerCancel={finishColorworkStroke}
                onLostPointerCapture={finishColorworkStroke}
              />
              <button type="button" className="colorwork-resize-x" aria-label="컬러워크 비율 유지하며 크기 조절" onPointerDown={(event) => beginColorworkTransform(event, 'width')} onPointerMove={moveColorworkTransform} onPointerUp={finishColorworkTransform} onPointerCancel={finishColorworkTransform} />
              <button type="button" className="colorwork-resize-y" aria-label="컬러워크 비율 유지하며 크기 조절" onPointerDown={(event) => beginColorworkTransform(event, 'height')} onPointerMove={moveColorworkTransform} onPointerUp={finishColorworkTransform} onPointerCancel={finishColorworkTransform} />
              <button type="button" className="colorwork-resize-both" aria-label="컬러워크 비율 유지하며 크기 조절" onPointerDown={(event) => beginColorworkTransform(event, 'both')} onPointerMove={moveColorworkTransform} onPointerUp={finishColorworkTransform} onPointerCancel={finishColorworkTransform} />
            </div>}
            {guidePageSize && <div className="pdf-guide-layer" style={guideLayerStyle}>
              <svg
                className="pdf-guide-svg"
                viewBox={'0 0 ' + guidePageSize.width + ' ' + guidePageSize.height}
                preserveAspectRatio="none"
                onPointerDown={handleGuidePointerDown}
                onPointerMove={handleGuidePointerMove}
                onPointerUp={handleGuidePointerUp}
                onPointerCancel={handleGuidePointerUp}
                onLostPointerCapture={handleGuidePointerUp}
                aria-label="진행선"
              >
                {lineSettings.horizontal.visible && horizontalGuides.map((guide) => <g key={guide.id}>
                  <line x1="0" x2={guidePageSize.width} y1={guide.position * guidePageSize.height} y2={guide.position * guidePageSize.height} stroke={lineSettings.horizontal.color} strokeWidth={lineSettings.horizontal.thickness} strokeOpacity={lineSettings.horizontal.opacity} pointerEvents="none" />
                  <line data-progress="horizontal" data-guide-id={guide.id} x1="0" x2={guidePageSize.width} y1={guide.position * guidePageSize.height} y2={guide.position * guidePageSize.height} stroke="transparent" strokeWidth="24" pointerEvents={tool === 'text' ? 'none' : 'stroke'} />
                </g>)}
                {lineSettings.vertical.visible && verticalGuides.map((guide) => <g key={guide.id}>
                  <line x1={guide.position * guidePageSize.width} x2={guide.position * guidePageSize.width} y1="0" y2={guidePageSize.height} stroke={lineSettings.vertical.color} strokeWidth={lineSettings.vertical.thickness} strokeOpacity={lineSettings.vertical.opacity} pointerEvents="none" />
                  <line data-progress="vertical" data-guide-id={guide.id} x1={guide.position * guidePageSize.width} x2={guide.position * guidePageSize.width} y1="0" y2={guidePageSize.height} stroke="transparent" strokeWidth="24" pointerEvents={tool === 'text' ? 'none' : 'stroke'} />
                </g>)}
              </svg>
              <button type="button" className="guide-remove-button guide-remove-horizontal" aria-label="마지막 가로선 삭제" title={horizontalGuides.length ? '마지막 가로선 삭제' : '삭제할 가로선 없음'} disabled={!horizontalGuides.length} onPointerDown={(event) => event.stopPropagation()} onClick={() => removeGuide('horizontal')}><Minus size={15} /></button>
              <button type="button" className="guide-remove-button guide-remove-vertical" aria-label="마지막 세로선 삭제" title={verticalGuides.length ? '마지막 세로선 삭제' : '삭제할 세로선 없음'} disabled={!verticalGuides.length} onPointerDown={(event) => event.stopPropagation()} onClick={() => removeGuide('vertical')}><Minus size={15} /></button>
              <button type="button" className="guide-add-button guide-add-vertical" aria-label="세로선 추가" title={verticalGuides.length >= 10 ? '세로선 최대 10개' : '세로선 추가'} disabled={verticalGuides.length >= 10} onPointerDown={(event) => event.stopPropagation()} onClick={() => addGuide('vertical')}><Plus size={15} /></button>
              <button type="button" className="guide-add-button guide-add-horizontal" aria-label="가로선 추가" title={horizontalGuides.length >= 10 ? '가로선 최대 10개' : '가로선 추가'} disabled={horizontalGuides.length >= 10} onPointerDown={(event) => event.stopPropagation()} onClick={() => addGuide('horizontal')}><Plus size={15} /></button>
            </div>}
            </>}
          </div>
          </div>
        </div>
        {readyKey !== renderKey && renderError?.key !== renderKey && <div className={'pane-loading' + (displayedRaster?.pdf === pdf && displayedRaster.page === page ? ' pane-loading-refresh' : '')}><span>PDF 페이지를 준비하고 있어요…</span></div>}
        {renderError?.key === renderKey && <div className="pane-error">{renderError.message}<button onClick={() => { setRenderError(null); setRetry((current) => current + 1) }}>다시 시도</button></div>}
        {!workReady && <div className="page-work-loading">페이지 작업을 불러오는 중…</div>}
      </div>
      <div className="pdf-view-controls" role="group" aria-label="PDF 확대 및 회전" onPointerDown={(event) => event.stopPropagation()}>
        <button type="button" className="pdf-rotate-button" aria-label="페이지 시계방향 90도 회전" title={'90도 회전 · 현재 ' + rotation + '도'} disabled={!workReady} onClick={onRotate}><RotateCw size={17} /></button>
        <div className="pdf-zoom-row">
          <button type="button" className="zoom-button" aria-label="축소" disabled={pane.zoom <= 1} onClick={() => onZoom(Math.max(1, Math.round((pane.zoom - 0.25) * 100) / 100))}><Minus size={16} /></button>
          <span className="zoom-value">{Math.round(pane.zoom * 100)}%</span>
          <button type="button" className="zoom-button" aria-label="확대" disabled={pane.zoom >= 5} onClick={() => onZoom(Math.min(5, Math.round((pane.zoom + 0.25) * 100) / 100))}><Plus size={16} /></button>
        </div>
      </div>
    </div>
  )
}
