import { formatNumber, t, translateMessage, type LocaleKey } from './locales/index'
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDown, ArrowUp, ChevronRight, Palette, Plus, Trash2, X } from 'lucide-react'
import { focusBandHeightRatio, focusDimOpacity, guideGeometryForRotation, pageRectToDisplayRect } from './focusGeometry'
import type { CounterSnapshot, PageRotation, PageWorkRecord, ProgressGuide, ProgressGuideScreenPosition } from './types'
import { ColorPresetButtons } from './ColorPresetButtons'
import { DESIGN_SYSTEM_COLORS, PROGRESS_LINE_COLOR_PRESETS } from './designTokens'
import { useDismissiblePopover } from './useDismissiblePopover'
import { keepProgressLinePopoverOpenDuringZoom, progressGuideMoveExceededThreshold, progressGuidePositionAfterNudge, progressLinePopoverPageAnchor, progressLinePopoverPlacement, progressLinePopoverScreenPoint, progressLineStrokeWidth, progressMarkerGeometry, progressMarkerOpacity, progressMarkerProgressFromPointer } from './progressLines'
const minimumLength = 0.2
type StyleField = 'opacity' | 'thickness' | 'dimOpacity' | 'bandHeightRatio'

type Action = 'marker' | 'start' | 'end' | 'body'
type ProgressPopoverAnchor = { xRatio: number; yOffset: number }
type Drag = {
  id: string
  action: Action
  pointerId: number
  startX: number
  startY: number
  markerGrabOffset: number
  moved: boolean
  axis: 'x' | 'y' | null
  base: ProgressGuide
  work: PageWorkRecord
  historyBefore: PageWorkRecord
  previousPreview: ProgressGuide | null
  startClientX: number
  startClientY: number
  focusTarget: SVGElement
  longPressed: boolean
}
type Calibration = {
  guideId: string
  counterId: string
  counterRow: number
  rotation: PageRotation
  phase: 'current' | 'next' | 'preview'
  firstPosition?: number
  secondPosition?: number
  spacing?: number
  direction?: 'up' | 'down'
  beforeWork: PageWorkRecord
}

function clamp(value: number, low: number, high: number) {
  return Math.min(high, Math.max(low, value))
}

function counterRow(counter: CounterSnapshot | undefined) {
  return counter ? counter.kind === 'simple' ? counter.value : counter.currentRow ?? 1 : 1
}

function guideThickness(guide: ProgressGuide, defaultThickness: number) {
  return guide.thickness ?? (guide.role === 'reference' ? defaultThickness * 0.5 : Math.max(2, defaultThickness))
}

function guideStrokeWidth(guide: ProgressGuide, pageWidth: number, cssWidth: number, renderedZoom: number, defaultThickness: number) {
  return guide.thickness === undefined
    ? guide.role === 'reference'
      ? Math.max(1, progressLineStrokeWidth(defaultThickness * 0.5, pageWidth, cssWidth, renderedZoom))
      : Math.max(2, progressLineStrokeWidth(defaultThickness, pageWidth, cssWidth, renderedZoom))
    : Math.max(0.5, progressLineStrokeWidth(guide.thickness, pageWidth, cssWidth, renderedZoom))
}

function ignoreProgressLineZoomDismiss(target: Element, event: PointerEvent) {
  const isZoomControl = target.closest('.viewer-footer-zoom-controls, .viewer-mobile-zoom-trigger, .viewer-zoom-menu') !== null
  const isPdfPage = target.closest('.pdf-scroll-area') !== null
  return keepProgressLinePopoverOpenDuringZoom(event.pointerType, isZoomControl, isPdfPage)
}

function styleValue(field: StyleField, guide: ProgressGuide, defaultOpacity: number, defaultThickness: number) {
  if (field === 'opacity') return guide.opacity ?? (guide.role === 'reference' ? Math.min(defaultOpacity, 0.45) : defaultOpacity)
  if (field === 'thickness') return guideThickness(guide, defaultThickness)
  if (field === 'dimOpacity') return guide.focus ? focusDimOpacity(guide.focus) : 0.22
  const spacing = guide.rowSpacing ?? guide.focus?.rowSpacing ?? 0.03
  return guide.focus ? focusBandHeightRatio(guide.focus, spacing) : 0.03
}

function styleInputValue(field: StyleField, value: number) {
  return field === 'thickness' ? Math.round(value) : Math.round(value * 100)
}

function styleStoredValue(field: StyleField, value: number) {
  return field === 'thickness' ? value : value / 100
}

function initialFocusSettings(guide: ProgressGuide) {
  return {
    enabled: false,
    strength: 'medium' as const,
    range: 0 as const,
    scope: guide.chartRegion ? 'region' as const : 'page' as const,
    rowSpacing: guide.rowSpacing ?? 0.03,
    dimOpacity: 0.22,
    bandHeightRatio: 0.03,
  }
}

function guideForDisplay(guide: ProgressGuide, rotation: PageRotation): ProgressGuide {
  const screenPosition = guide.rotationPositions?.[String(rotation) as '0' | '90' | '180' | '270']
  return screenPosition ? { ...guide, ...screenPosition } : guide
}

function updateGuideWork(work: PageWorkRecord, guideId: string, changes: Partial<ProgressGuide>, rotation: PageRotation, counters: CounterSnapshot[], shown?: ProgressGuide): PageWorkRecord {
  const guides = work.horizontalGuides ?? []
  const original = guides.find((guide) => guide.id === guideId)
  if (!original) return work
  const visible = shown ?? guideForDisplay(original, rotation)
  const { position, xStartRatio, xEndRatio, rowSpacing, rowSpacingStartRow, rowSpacingDirection, positionOffset, ...metadata } = changes
  const spacingValue = Object.hasOwn(changes, 'rowSpacing') ? rowSpacing : visible.rowSpacing
  const spacingStartValue = Object.hasOwn(changes, 'rowSpacingStartRow') ? rowSpacingStartRow : visible.rowSpacingStartRow
  const spacingDirectionValue = Object.hasOwn(changes, 'rowSpacingDirection') ? rowSpacingDirection : visible.rowSpacingDirection
  const positionOffsetValue = Object.hasOwn(changes, 'positionOffset') ? positionOffset : visible.positionOffset
  const screenPosition: ProgressGuideScreenPosition = {
    position: position ?? visible.position,
    xStartRatio: xStartRatio ?? visible.xStartRatio ?? 0.15,
    xEndRatio: xEndRatio ?? visible.xEndRatio ?? 0.85,
    ...(spacingValue === undefined ? {} : { rowSpacing: spacingValue }),
    ...(spacingStartValue === undefined ? {} : { rowSpacingStartRow: spacingStartValue }),
    ...(spacingDirectionValue === undefined ? {} : { rowSpacingDirection: spacingDirectionValue }),
    ...(positionOffsetValue === undefined ? {} : { positionOffset: positionOffsetValue }),
  }
  const nextGuide: ProgressGuide = { ...original, ...metadata }
  if (Object.hasOwn(changes, 'rowSpacing')) nextGuide.rowSpacing = rowSpacing
  if (Object.hasOwn(changes, 'rowSpacingStartRow')) nextGuide.rowSpacingStartRow = rowSpacingStartRow
  if (Object.hasOwn(changes, 'rowSpacingDirection')) nextGuide.rowSpacingDirection = rowSpacingDirection
  if (Object.hasOwn(changes, 'positionOffset')) nextGuide.positionOffset = positionOffset
  if (!Object.hasOwn(changes, 'chartRegion') && original.chartRegion?.rowRanges?.length && (position !== undefined || xStartRatio !== undefined || xEndRatio !== undefined)) {
    nextGuide.chartRegion = { ...original.chartRegion, autoFollow: false }
  }
  if (Object.hasOwn(changes, 'rowSpacing') && rowSpacing === undefined && nextGuide.rotationPositions) {
    nextGuide.rotationPositions = Object.fromEntries(Object.entries(nextGuide.rotationPositions).map(([key, entry]) => [key, entry ? { ...entry, rowSpacing: undefined, rowSpacingStartRow: undefined, rowSpacingDirection: undefined, positionOffset: undefined } : entry])) as ProgressGuide['rotationPositions']
  }
  if (position !== undefined && nextGuide.linkedCounterId) {
    const linked = counters.find((counter) => counter.id === nextGuide.linkedCounterId)
    const effectiveRow = counterRow(linked) - (nextGuide.counterRowOffset ?? 0)
    if (nextGuide.chartRegion) {
      const offset = clamp((visible.positionOffset ?? original.positionOffset ?? 0) + position - visible.position, -1, 1)
      screenPosition.positionOffset = offset
      if (rotation === 0) nextGuide.positionOffset = offset
    } else if (screenPosition.rowSpacing !== undefined) {
      screenPosition.rowSpacingStartRow = effectiveRow
      if (rotation === 0) nextGuide.rowSpacingStartRow = effectiveRow
    }
  }
  const rotationKey = String(rotation) as '0' | '90' | '180' | '270'
  nextGuide.rotationPositions = { ...original.rotationPositions, [rotationKey]: screenPosition }
  if (rotation === 0) Object.assign(nextGuide, screenPosition)
  return {
    ...work,
    horizontalPosition: rotation === 0 ? nextGuide.position : work.horizontalPosition,
    horizontalGuides: guides.map((guide) => guide.id === guideId ? nextGuide : guide),
  }
}

export function ProgressLineOverlay({ width, height, cssWidth, cssHeight, renderedZoom, previewScale, work, counters, rotation, active, disabled, defaultColor, defaultOpacity, defaultThickness, onActivate, onWorkChange }: {
  width: number
  height: number
  cssWidth: number
  cssHeight: number
  renderedZoom: number
  previewScale: number
  work: PageWorkRecord
  counters: CounterSnapshot[]
  rotation: PageRotation
  active: boolean
  disabled: boolean
  defaultColor: string
  defaultOpacity: number
  defaultThickness: number
  onActivate: () => void
  onWorkChange: (work: PageWorkRecord, immediate: boolean, recordHistory?: boolean, historyBefore?: PageWorkRecord) => void
  onRecognizeChart: (guideId: string) => void
}) {
  const svgId = useId().replace(/:/g, '')
  const dragRef = useRef<Drag | null>(null)
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const menuPanelRef = useRef<HTMLDivElement | null>(null)
  const menuTriggerRef = useRef<(Element & { focus?: () => void }) | null>(null)
  const deleteCancelRef = useRef<HTMLButtonElement | null>(null)
  const deleteCandidateRef = useRef<{ id: string; pointerId: number; startClientX: number; startClientY: number; moved: boolean } | null>(null)
  const longPressTimerRef = useRef<number | undefined>(undefined)
  const [previewGuide, setPreviewGuide] = useState<ProgressGuide | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  function selectGuide(id: string | null) {
    setSelectedId(id)
  }
  const [menuGuideId, setMenuGuideId] = useState<string | null>(null)
  const [styleGuideId, setStyleGuideId] = useState<string | null>(null)
  const [deleteMode, setDeleteMode] = useState(false)
  const [styleMenuAnchor, setStyleMenuAnchor] = useState<ProgressPopoverAnchor | null>(null)
  const [popoverPortalTarget, setPopoverPortalTarget] = useState<Element | null>(null)
  const popoverPositionScheduleRef = useRef<(() => void) | null>(null)
  const popoverLayoutRef = useRef<{ guide: ProgressGuide; anchor: ProgressPopoverAnchor } | null>(null)
  const [calibration, setCalibration] = useState<Calibration | null>(null)
  const [calibrationPortalTarget, setCalibrationPortalTarget] = useState<Element | null>(null)
  const [deletedGuide, setDeletedGuide] = useState<ProgressGuide | null>(null)
  const [notice, setNotice] = useState('')
  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => {
      setNotice('')
      setDeletedGuide(null)
    }, 5000)
    return () => window.clearTimeout(timeout)
  }, [notice])
  const [styleDraft, setStyleDraft] = useState<{ id: string; field: StyleField; value: number } | null>(null)
  const styleBeforeRef = useRef<{ work: PageWorkRecord; guideId: string; field: StyleField; value: number } | null>(null)
  const styleRangeChangedRef = useRef(false)
  const guides = work.horizontalGuides ?? []
  const primary = guides.find((guide) => guide.role === 'primary')
  const references = guides.filter((guide) => guide.role === 'reference').slice(0, 2)
  const sourceGuides = [...(primary ? [primary] : []), ...references]
  const sx = width / Math.max(cssWidth, 1)
  const sy = height / Math.max(cssHeight, 1)
  const hitX = 22 * sx / Math.max(previewScale, 0.0001)
  const hitY = 22 * sy / Math.max(previewScale, 0.0001)
  const displayedGuides = sourceGuides.map((guide) => {
    const preview = previewGuide?.id === guide.id ? previewGuide : guide
    const displayed = guideForDisplay(preview, rotation)
    const linked = preview.linkedCounterId ? counters.find((counter) => counter.id === preview.linkedCounterId) : undefined
    const row = counterRow(linked)
    const geometry = preview.chartRegion?.rowRanges?.length ? guideGeometryForRotation(preview, row, rotation) : null
    const withGeometry = geometry ? { ...displayed, ...geometry } : displayed
    if (styleDraft?.id !== guide.id) return withGeometry
    if (styleDraft.field === 'dimOpacity' || styleDraft.field === 'bandHeightRatio') {
      return { ...withGeometry, focus: { ...(withGeometry.focus ?? initialFocusSettings(withGeometry)), [styleDraft.field]: styleDraft.value } }
    }
    return { ...withGeometry, [styleDraft.field]: styleDraft.value }
  })
  const currentCalibrationCounter = calibration ? counters.find((counter) => counter.id === calibration.counterId) : undefined
  const popoverGuide = displayedGuides.find((guide) => guide.id === menuGuideId)

  useLayoutEffect(() => {
    popoverLayoutRef.current = popoverGuide && styleMenuAnchor ? { guide: popoverGuide, anchor: styleMenuAnchor } : null
    popoverPositionScheduleRef.current?.()
  }, [popoverGuide, styleMenuAnchor])

  useLayoutEffect(() => {
    if (!menuGuideId || !popoverPortalTarget) return
    const panel = menuPanelRef.current
    const menu = panel?.querySelector<HTMLElement>('.progress-line-menu')
    const controls = panel?.querySelector<HTMLElement>('.progress-line-nudge-controls')
    const scrollArea = popoverPortalTarget.querySelector<HTMLElement>('.pdf-scroll-area')
    if (!panel || !menu || !controls || !scrollArea) return

    let frame = 0
    const updatePosition = () => {
      frame = 0
      const layout = popoverLayoutRef.current
      const overlay = overlayRef.current
      const svg = overlay?.querySelector('svg')
      if (!layout || !svg || !panel.isConnected || !menu.isConnected) return
      const paneRect = popoverPortalTarget.getBoundingClientRect()
      const scrollRect = scrollArea.getBoundingClientRect()
      const visualViewport = window.visualViewport
      const bounds = {
        left: Math.max(paneRect.left, scrollRect.left, visualViewport?.offsetLeft ?? 0),
        top: Math.max(paneRect.top, scrollRect.top, visualViewport?.offsetTop ?? 0),
        right: Math.min(paneRect.right, scrollRect.right, (visualViewport?.offsetLeft ?? 0) + (visualViewport?.width ?? document.documentElement.clientWidth)),
        bottom: Math.min(paneRect.bottom, scrollRect.bottom, (visualViewport?.offsetTop ?? 0) + (visualViewport?.height ?? document.documentElement.clientHeight)),
      }
      const availableWidth = bounds.right - bounds.left - 16
      const availableHeight = bounds.bottom - bounds.top - 16
      if (availableWidth <= 0 || availableHeight <= 0) {
        menu.style.visibility = 'hidden'
        controls.querySelectorAll<HTMLElement>('button').forEach((button) => { button.style.visibility = 'hidden' })
        return
      }
      menu.style.visibility = ''
      menu.style.width = Math.min(244, availableWidth) + 'px'
      menu.style.maxHeight = Math.min(430, availableHeight) + 'px'
      const matrix = svg.getScreenCTM()
      if (!matrix) return
      const pageAnchor = progressLinePopoverPageAnchor(layout.anchor.xRatio, layout.anchor.yOffset, layout.guide.position)
      const anchor = progressLinePopoverScreenPoint(pageAnchor, width, height, matrix)
      const lineCenter = progressLinePopoverScreenPoint({ x: ((layout.guide.xStartRatio ?? 0.15) + (layout.guide.xEndRatio ?? 0.85)) / 2, y: layout.guide.position }, width, height, matrix)
      const stroke = guideStrokeWidth(layout.guide, width, cssWidth, renderedZoom, defaultThickness)
      const gap = stroke * previewScale + 8
      const controlHeight = 88 + gap
      const controlBounds = { left: lineCenter.x - 22, right: lineCenter.x + 22, top: lineCenter.y - controlHeight / 2, bottom: lineCenter.y + controlHeight / 2 }
      const panelRect = panel.getBoundingClientRect()
      controls.style.left = lineCenter.x - panelRect.left + 'px'
      controls.style.top = lineCenter.y - panelRect.top + 'px'
      controls.style.gap = gap + 'px'
      const menuRect = menu.getBoundingClientRect()
      const placement = progressLinePopoverPlacement(anchor, { width: menuRect.width, height: menuRect.height }, bounds, controlBounds)
      menu.style.left = placement.left - panelRect.left + 'px'
      menu.style.top = placement.top - panelRect.top + 'px'
      const placedMenuRect = menu.getBoundingClientRect()
      controls.querySelectorAll<HTMLElement>('button').forEach((button) => {
        const rect = button.getBoundingClientRect()
        const overlaps = rect.left < placedMenuRect.right && rect.right > placedMenuRect.left && rect.top < placedMenuRect.bottom && rect.bottom > placedMenuRect.top
        const outside = rect.left < bounds.left || rect.right > bounds.right || rect.top < bounds.top || rect.bottom > bounds.bottom
        button.style.visibility = overlaps || outside ? 'hidden' : ''
      })
    }
    const schedule = () => {
      if (frame) return
      frame = window.requestAnimationFrame(updatePosition)
    }
    popoverPositionScheduleRef.current = schedule
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    observer?.observe(popoverPortalTarget)
    observer?.observe(scrollArea)
    observer?.observe(menu)
    const visualViewport = window.visualViewport
    window.addEventListener('resize', schedule)
    document.addEventListener('scroll', schedule, true)
    scrollArea.addEventListener('pointermove', schedule, { passive: true })
    visualViewport?.addEventListener('resize', schedule)
    visualViewport?.addEventListener('scroll', schedule)
    updatePosition()
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      popoverPositionScheduleRef.current = null
      observer?.disconnect()
      window.removeEventListener('resize', schedule)
      document.removeEventListener('scroll', schedule, true)
      scrollArea.removeEventListener('pointermove', schedule)
      visualViewport?.removeEventListener('resize', schedule)
      visualViewport?.removeEventListener('scroll', schedule)
    }
  }, [cssHeight, cssWidth, defaultThickness, height, menuGuideId, popoverPortalTarget, previewScale, renderedZoom, width])

  useEffect(() => () => {
    if (longPressTimerRef.current !== undefined) window.clearTimeout(longPressTimerRef.current)
  }, [])

  function openGuideMenu(guide: ProgressGuide, clientX: number, clientY: number, trigger: HTMLElement | SVGElement, showStyle = false) {
    const overlay = overlayRef.current
    const svg = overlay?.querySelector('svg')
    if (!overlay || !svg) return
    const position = point({ clientX, clientY }, svg)
    menuTriggerRef.current = trigger
    selectGuide(guide.id)
    setMenuGuideId(guide.id)
    setStyleGuideId(showStyle ? guide.id : null)
    setStyleMenuAnchor({ xRatio: position.x, yOffset: position.y - guide.position })
    setPopoverPortalTarget(overlay.closest('.pdf-pane'))
  }

  function openStyleMenuFromKeyboard(event: ReactKeyboardEvent<SVGElement>, guide: ProgressGuide) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    event.stopPropagation()
    if (deleteMode) {
      setDeleteMode(false)
      removeGuide(guide)
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    openGuideMenu(guide, rect.left + rect.width / 2, rect.top + rect.height / 2, event.currentTarget)
  }

  useEffect(() => {
    if (!deleteMode) return
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      deleteCandidateRef.current = null
      setDeleteMode(false)
      menuTriggerRef.current?.focus?.()
    }
    window.addEventListener('keydown', cancelOnEscape)
    return () => window.removeEventListener('keydown', cancelOnEscape)
  }, [deleteMode])

  useEffect(() => {
    if (deleteMode) deleteCancelRef.current?.focus()
  }, [deleteMode])

  useEffect(() => {
    if (!active) {
      deleteCandidateRef.current = null
      // oxlint-disable-next-line react/set-state-in-effect -- Leave this pane's temporary delete mode when it is no longer active.
      setDeleteMode(false)
      if (menuGuideId !== null) {
        // oxlint-disable-next-line react/set-state-in-effect -- Close the other pane's popup when its page loses ownership.
        setMenuGuideId(null)
        setStyleGuideId(null)
        setStyleMenuAnchor(null)
        setPopoverPortalTarget(null)
      }
    }
  }, [active, menuGuideId])

  useDismissiblePopover(menuGuideId !== null, menuPanelRef, menuTriggerRef, () => {
    setStyleGuideId(null)
    setMenuGuideId(null)
    setStyleMenuAnchor(null)
    setPopoverPortalTarget(null)
  }, true, ignoreProgressLineZoomDismiss)

  useEffect(() => {
    if (!calibration) return
    if (!active || rotation !== calibration.rotation || work !== calibration.beforeWork || counterRow(currentCalibrationCounter) !== calibration.counterRow) {
      // oxlint-disable-next-line react/set-state-in-effect -- Cancel a pinned gesture when its Viewer target changes.
      setCalibration(null)
      setPreviewGuide(null)
      setNotice('대상 페이지, 보기 또는 카운터가 바뀌어 연결 설정을 취소했습니다.')
    }
  }, [active, calibration, currentCalibrationCounter, rotation, work])

  function point(event: { clientX: number; clientY: number }, svg: SVGSVGElement) {
    const rect = svg.getBoundingClientRect()
    return {
      x: clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1),
      y: clamp((event.clientY - rect.top) / Math.max(1, rect.height), 0, 1),
    }
  }

  function clearLongPressTimer() {
    if (longPressTimerRef.current === undefined) return
    window.clearTimeout(longPressTimerRef.current)
    longPressTimerRef.current = undefined
  }

  function begin(event: ReactPointerEvent<SVGSVGElement>) {
    if (disabled) return
    const target = (event.target as SVGElement).closest<SVGElement>('[data-guide-id]')
    const id = target?.dataset.guideId
    const guide = displayedGuides.find((item) => item.id === id)
    if (!target || !guide || calibration && calibration.guideId !== guide.id) return
    event.preventDefault()
    event.stopPropagation()
    if (deleteMode) {
      try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* Pointer capture can fail after browser cancellation. */ }
      deleteCandidateRef.current = { id: guide.id, pointerId: event.pointerId, startClientX: event.clientX, startClientY: event.clientY, moved: false }
      return
    }
    if (!active) onActivate()
    const original = work.horizontalGuides?.find((item) => item.id === guide.id)
    if (!original) return
    const pos = point(event, event.currentTarget)
    const action = target.dataset.progressAction === 'start' || target.dataset.progressAction === 'end' || target.dataset.progressAction === 'marker'
      ? target.dataset.progressAction
      : 'body'
    const markerStart = guide.xStartRatio ?? 0.15
    const markerEnd = guide.xEndRatio ?? 0.85
    const markerX = markerStart + (markerEnd - markerStart) * (guide.markerProgress ?? 0.5)
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* Local pointer movement still works without capture. */ }
    const workingWork = previewGuide?.id === guide.id
      ? { ...work, horizontalGuides: work.horizontalGuides?.map((item) => item.id === guide.id ? previewGuide : item) }
      : work
    const focusTarget = target as SVGElement
    dragRef.current = {
      id: guide.id,
      action,
      pointerId: event.pointerId,
      startX: pos.x,
      startY: pos.y,
      markerGrabOffset: action === 'marker' ? pos.x - markerX : 0,
      moved: false,
      axis: null,
      base: guide,
      work: workingWork,
      historyBefore: calibration?.beforeWork ?? work,
      previousPreview: previewGuide,
      startClientX: event.clientX,
      startClientY: event.clientY,
      focusTarget,
      longPressed: false,
    }
    selectGuide(guide.id)
    setMenuGuideId(null)
    setStyleGuideId(null)
    setStyleMenuAnchor(null)
    clearLongPressTimer()
    const pointerId = event.pointerId
    longPressTimerRef.current = window.setTimeout(() => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== pointerId || drag.moved) return
      drag.longPressed = true
      openGuideMenu(guide, drag.startClientX, drag.startClientY, drag.focusTarget, true)
    }, 450)
  }

  function dragChanges(drag: Drag, x: number, y: number): Partial<ProgressGuide> | null {
    const start = drag.base.xStartRatio ?? 0.15
    const end = drag.base.xEndRatio ?? 0.85
    if (!drag.axis) return null
    if (drag.action === 'marker') {
      return { markerProgress: progressMarkerProgressFromPointer(x, start, end, drag.markerGrabOffset) }
    }
    if (drag.action === 'start') return { xStartRatio: clamp(x, 0, end - minimumLength) }
    if (drag.action === 'end') return { xEndRatio: clamp(x, start + minimumLength, 1) }
    if (drag.axis === 'x') {
      const dx = x - drag.startX
      const bounded = clamp(start + dx, 0, 1 - (end - start))
      return { xStartRatio: bounded, xEndRatio: bounded + (end - start) }
    }
    return { position: clamp(drag.base.position + y - drag.startY, 0, 1) }
  }

  function move(event: ReactPointerEvent<SVGSVGElement>) {
    if (deleteCandidateRef.current?.pointerId === event.pointerId) {
      event.preventDefault()
      event.stopPropagation()
      if (progressGuideMoveExceededThreshold(deleteCandidateRef.current.startClientX, deleteCandidateRef.current.startClientY, event.clientX, event.clientY)) {
        deleteCandidateRef.current.moved = true
      }
      return
    }
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    const pos = point(event, event.currentTarget)
    const rect = event.currentTarget.getBoundingClientRect()
    const dx = (pos.x - drag.startX) * rect.width
    const dy = (pos.y - drag.startY) * rect.height
    if (drag.longPressed) return
    if (!drag.moved && progressGuideMoveExceededThreshold(drag.startClientX, drag.startClientY, event.clientX, event.clientY)) {
      clearLongPressTimer()
      drag.moved = true
      drag.axis = drag.action === 'body' ? Math.abs(dx) > Math.abs(dy) ? 'x' : 'y' : 'x'
    }
    if (!drag.moved) return
    const changes = dragChanges(drag, pos.x, pos.y)
    if (!changes) return
    const next = updateGuideWork(drag.work, drag.id, changes, rotation, counters, drag.base)
    setPreviewGuide(next.horizontalGuides?.find((guide) => guide.id === drag.id) ?? null)
  }

  function finish(event: ReactPointerEvent<SVGSVGElement>, cancelled = false) {
    const deleteCandidate = deleteCandidateRef.current
    if (deleteCandidate?.pointerId === event.pointerId) {
      event.preventDefault()
      event.stopPropagation()
      deleteCandidateRef.current = null
      if (!cancelled && !deleteCandidate.moved) {
        const target = guides.find((guide) => guide.id === deleteCandidate.id)
        if (target) {
          setDeleteMode(false)
          removeGuide(target)
        }
      }
      return
    }
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    clearLongPressTimer()
    event.preventDefault()
    event.stopPropagation()
    if (cancelled) {
      setPreviewGuide(drag.previousPreview)
      dragRef.current = null
      return
    }
    if (drag.longPressed) {
      dragRef.current = null
      return
    }
    const pos = point(event, event.currentTarget)
    if (!drag.moved) {
      openGuideMenu(drag.base, event.clientX, event.clientY, drag.focusTarget)
      dragRef.current = null
      return
    }
    const changes = dragChanges(drag, pos.x, pos.y)
    if (changes) {
      const next = updateGuideWork(drag.work, drag.id, changes, rotation, counters, drag.base)
      const nextGuide = next.horizontalGuides?.find((guide) => guide.id === drag.id) ?? null
      if (calibration?.guideId === drag.id) setPreviewGuide(nextGuide)
      else {
        onWorkChange(next, true, true, drag.historyBefore)
        setPreviewGuide(null)
      }
    }
    dragRef.current = null
  }

  function updateGuide(id: string, changes: Partial<ProgressGuide>, before = work, shown?: ProgressGuide) {
    const next = updateGuideWork(before, id, changes, rotation, counters, shown)
    if (next === before) return
    onWorkChange(next, true, true, before)
  }

  function nudgeGuide(guide: ProgressGuide, direction: 'up' | 'down') {
    const stroke = guideStrokeWidth(guide, width, cssWidth, renderedZoom, defaultThickness)
    updateGuide(guide.id, { position: progressGuidePositionAfterNudge(guide.position, stroke, height, direction) }, work, guide)
  }

  function addMarker(guide: ProgressGuide) {
    updateGuide(guide.id, { markerProgress: guide.markerProgress === undefined ? 0.5 : undefined })
    setMenuGuideId(null)
    setStyleMenuAnchor(null)
    menuTriggerRef.current?.focus?.()
  }

  function addReference() {
    if (!primary || references.length >= 2) return
    const shown = displayedGuides.find((guide) => guide.id === primary.id) ?? guideForDisplay(primary, rotation)
    const reference: ProgressGuide = {
      ...primary,
      id: crypto.randomUUID(),
      role: 'reference',
      position: shown.position,
      linkedCounterId: undefined,
      counterRowOffset: undefined,
      positionOffset: undefined,
      chartRegion: undefined,
      markerProgress: undefined,
      opacity: Math.min(primary.opacity ?? defaultOpacity, 0.45),
      thickness: primary.thickness === undefined ? undefined : Math.max(1, Math.round(primary.thickness * 0.5)),
      rowSpacing: undefined,
      rowSpacingStartRow: undefined,
      rowSpacingDirection: undefined,
      rotationPositions: { ...primary.rotationPositions, [String(rotation) as '0' | '90' | '180' | '270']: { position: shown.position, xStartRatio: shown.xStartRatio ?? 0.15, xEndRatio: shown.xEndRatio ?? 0.85 } },
      focus: { enabled: false, strength: 'medium', range: 0, scope: 'page', rowSpacing: primary.rowSpacing ?? 0.03 },
    }
    onWorkChange({ ...work, horizontalGuides: [...guides, reference] }, true, true, work)
    selectGuide(reference.id)
    setMenuGuideId(null)
    setStyleMenuAnchor(null)
  }

  function removeGuide(guide: ProgressGuide) {
    setDeletedGuide(guide)
    onWorkChange({ ...work, horizontalGuides: guides.filter((item) => item.id !== guide.id) }, true, true, work)
    setMenuGuideId(null)
    selectGuide(guide.id === selectedId ? null : selectedId)
    setNotice('진행선을 삭제했습니다.')
  }

  function undoDelete() {
    if (!deletedGuide || guides.some((guide) => guide.id === deletedGuide.id)) return
    onWorkChange({ ...work, horizontalGuides: [...guides, deletedGuide] }, true, true, work)
    selectGuide(deletedGuide.id)
    setDeletedGuide(null)
    setNotice('진행선을 복구했습니다.')
  }

  function startCalibration(guide: ProgressGuide, counterId: string) {
    const counter = counters.find((item) => item.id === counterId)
    if (!counter) return
    setCalibrationPortalTarget(overlayRef.current?.closest('.viewer-shell') ?? null)
    setCalibration({ guideId: guide.id, counterId: counter.id, counterRow: counterRow(counter), rotation, phase: 'current', beforeWork: work })
    selectGuide(guide.id)
    setPreviewGuide(null)
    setMenuGuideId(null)
    setNotice('')
  }

  function cancelCalibration() {
    setCalibration(null)
    setPreviewGuide(null)
    setNotice('진행선 연결 설정을 취소했습니다.')
  }

  function calibrationGuide() {
    if (!calibration) return undefined
    const guide = displayedGuides.find((item) => item.id === calibration.guideId)
    return guide
  }

  function saveCalibrationCurrent() {
    const guide = calibrationGuide()
    if (!calibration || !guide) return
    setCalibration({ ...calibration, phase: 'next', firstPosition: guide.position })
  }

  function previewCalibration() {
    const guide = calibrationGuide()
    if (!calibration || !guide || calibration.firstPosition === undefined) return
    const spacing = Math.abs(guide.position - calibration.firstPosition)
    if (spacing < 0.002) {
      setNotice('두 위치가 너무 가까워요. 다음 단 위치로 더 움직여 주세요.')
      return
    }
    setNotice('')
    setCalibration({
      ...calibration,
      phase: 'preview',
      secondPosition: guide.position,
      spacing,
      direction: guide.position > calibration.firstPosition ? 'down' : 'up',
    })
  }

  function retryCalibration() {
    if (!calibration) return
    setCalibration({ ...calibration, phase: 'current', firstPosition: undefined, secondPosition: undefined, spacing: undefined, direction: undefined })
    setNotice('현재 단부터 다시 맞춰 주세요.')
  }

  function confirmCalibration() {
    if (!calibration || calibration.firstPosition === undefined || calibration.spacing === undefined || !calibration.direction) return
    const counter = counters.find((item) => item.id === calibration.counterId)
    const guide = guides.find((item) => item.id === calibration.guideId)
    if (!counter || !guide || work !== calibration.beforeWork || counterRow(counter) !== calibration.counterRow || rotation !== calibration.rotation) {
      cancelCalibration()
      return
    }
    const shown = guideForDisplay(guide, rotation)
    const next = updateGuideWork(calibration.beforeWork, guide.id, {
      position: calibration.firstPosition,
      rowSpacing: calibration.spacing,
      rowSpacingStartRow: calibration.counterRow,
      rowSpacingDirection: calibration.direction,
      linkedCounterId: counter.id,
      counterRowOffset: 0,
      positionOffset: 0,
      chartRegion: undefined,
      markerProgress: undefined,
      name: counter.name,
      color: counter.color,
    }, rotation, counters, shown)
    onWorkChange(next, true, true, calibration.beforeWork)
    setPreviewGuide(null)
    setCalibration(null)
    setNotice('카운터와 진행선을 연결했습니다.')
  }

  function updateFocus(guide: ProgressGuide, enabled: boolean) {
    const focus = guide.focus ?? initialFocusSettings(guide)
    updateGuide(guide.id, { focus: { ...focus, enabled } })
  }

  function beginStyleRange(event: ReactPointerEvent<HTMLInputElement>, guide: ProgressGuide, field: StyleField) {
    event.stopPropagation()
    styleBeforeRef.current = { work, guideId: guide.id, field, value: styleValue(field, guide, defaultOpacity, defaultThickness) }
    styleRangeChangedRef.current = false
  }

  function changeStyleRange(guide: ProgressGuide, field: StyleField, value: number) {
    const before = styleBeforeRef.current
    if (!before || before.guideId !== guide.id || before.field !== field) return
    styleRangeChangedRef.current = true
    setStyleDraft({ id: guide.id, field, value })
  }

  function finishStyleRange(event: ReactPointerEvent<HTMLInputElement>, guide: ProgressGuide, field: StyleField) {
    event.stopPropagation()
    const before = styleBeforeRef.current
    if (!before || before.guideId !== guide.id || before.field !== field) return
    const value = styleStoredValue(field, Number(event.currentTarget.value))
    const changed = styleRangeChangedRef.current
    styleBeforeRef.current = null
    styleRangeChangedRef.current = false
    setStyleDraft(null)
    if (!changed || value === before.value) return
    const originalGuide = before.work.horizontalGuides?.find((item) => item.id === guide.id) ?? guide
    const changes: Partial<ProgressGuide> = field === 'dimOpacity' || field === 'bandHeightRatio'
      ? { focus: { ...(originalGuide.focus ?? initialFocusSettings(originalGuide)), [field]: value } }
      : { [field]: value }
    const shown = guideForDisplay(originalGuide, rotation)
    const next = updateGuideWork(before.work, guide.id, changes, rotation, counters, shown)
    onWorkChange(next, true, true, before.work)
  }

  function cancelStyleRange(event: ReactPointerEvent<HTMLInputElement>) {
    event.stopPropagation()
    styleBeforeRef.current = null
    styleRangeChangedRef.current = false
    setStyleDraft(null)
  }

  function renderStyleRange(guide: ProgressGuide, field: StyleField, label: LocaleKey, disabled = false) {
    const value = styleDraft?.id === guide.id && styleDraft.field === field
      ? styleDraft.value
      : styleValue(field, guide, defaultOpacity, defaultThickness)
    const inputValue = styleInputValue(field, value)
    const min = field === 'thickness' ? 1 : field === 'opacity' ? 30 : field === 'dimOpacity' ? 0 : 1
    const max = field === 'thickness' ? 36 : field === 'opacity' ? 100 : field === 'dimOpacity' ? 80 : 30
    const ariaLabel: LocaleKey = field === 'opacity' ? '진행선 투명도' : field === 'thickness' ? '진행선 두께' : field === 'dimOpacity' ? '집중 강도' : '집중선 두께'
    return <label>{t(label)}<input
      type="range"
      min={min}
      max={max}
      step="1"
      aria-label={t(ariaLabel)}
      value={inputValue}
      style={{ '--range-progress': `${((inputValue - min) / (max - min)) * 100}%` } as CSSProperties}
      disabled={disabled}
      onPointerDown={(event) => beginStyleRange(event, guide, field)}
      onChange={(event) => {
        const nextValue = Number(event.currentTarget.value)
        changeStyleRange(guide, field, styleStoredValue(field, nextValue))
      }}
      onPointerUp={(event) => finishStyleRange(event, guide, field)}
      onPointerCancel={cancelStyleRange}
      onLostPointerCapture={(event) => finishStyleRange(event, guide, field)}
      onFocus={(event) => { if (!styleBeforeRef.current) beginStyleRange(event as unknown as ReactPointerEvent<HTMLInputElement>, guide, field) }}
      onBlur={(event) => finishStyleRange(event as unknown as ReactPointerEvent<HTMLInputElement>, guide, field)}
      onKeyDown={() => {
        if (!styleBeforeRef.current) {
          styleBeforeRef.current = { work, guideId: guide.id, field, value: styleValue(field, guide, defaultOpacity, defaultThickness) }
          styleRangeChangedRef.current = false
        }
      }}
      onKeyUp={(event) => finishStyleRange(event as unknown as ReactPointerEvent<HTMLInputElement>, guide, field)}
    /></label>
  }

  const focusGuides = active ? displayedGuides.filter((guide) => guide.focus?.enabled) : []
  const calibrationFirstPosition = calibration?.firstPosition
  const calibrationPreviewPositions = calibration?.phase === 'preview' && calibration.firstPosition !== undefined && calibration.spacing !== undefined && calibration.direction
    ? [0, 1, 2, 3].map((step) => ({
        step,
        unclamped: calibration.firstPosition! + (calibration.direction === 'down' ? 1 : -1) * calibration.spacing! * step,
      }))
    : []

  return <div ref={overlayRef} className="progress-line-overlay">
    <svg viewBox={'0 0 ' + width + ' ' + height} preserveAspectRatio="none" aria-label={t("진행선 조작")} onPointerDown={begin} onPointerMove={move} onPointerUp={finish} onPointerCancel={(event) => finish(event, true)} onLostPointerCapture={(event) => finish(event, true)}>
      {focusGuides.map((guide) => {
        const focus = guide.focus!
        const spacing = guide.rowSpacing ?? focus.rowSpacing ?? 0.03
        const half = Math.min(0.5, focusBandHeightRatio(focus, spacing) / 2)
        const top = Math.max(0, guide.position - half)
        const bottom = Math.min(1, guide.position + half)
        const region = guide.chartRegion ? pageRectToDisplayRect(guide.chartRegion, rotation) : undefined
        const x = focus.scope === 'region' && region ? region.x * width : 0
        const bandWidth = focus.scope === 'region' && region ? region.width * width : width
        const maskId = 'progress-focus-' + svgId + '-' + guide.id.replace(/[^a-zA-Z0-9_-]/g, '')
        const dim = focusDimOpacity(focus)
        return <g key={maskId}>
          <defs><mask id={maskId}><rect width={width} height={height} fill="white" /><rect x={x} y={top * height} width={bandWidth} height={Math.max(0, bottom - top) * height} fill="black" /></mask></defs>
          <rect width={width} height={height} fill={'rgba(19,31,49,' + dim + ')'} mask={'url(#' + maskId + ')'} pointerEvents="none" />
        </g>
      })}
      {calibrationFirstPosition !== undefined && calibration?.phase !== 'preview' && (() => {
        const guide = displayedGuides.find((item) => item.id === calibration?.guideId)
        if (!guide) return null
        const start = guide.xStartRatio ?? 0.15
        const end = guide.xEndRatio ?? 0.85
        const y = calibrationFirstPosition * height
        return <g pointerEvents="none"><line x1={start * width} x2={end * width} y1={y} y2={y} stroke={guide.color ?? defaultColor} strokeWidth={Math.max(2, progressLineStrokeWidth(defaultThickness, width, cssWidth, renderedZoom))} strokeOpacity="0.28" strokeDasharray="10 8" /><text x={start * width + 8} y={Math.max(12, y - 6)} fill={guide.color ?? defaultColor} fontSize={Math.max(10, width / 100)}>{t("현재 단")}</text></g>
      })()}
      {calibrationPreviewPositions.map(({ step, unclamped }) => {
        const guide = displayedGuides.find((item) => item.id === calibration?.guideId)
        if (!guide) return null
        const y = clamp(unclamped, 0, 1) * height
        const start = guide.xStartRatio ?? 0.15
        const end = guide.xEndRatio ?? 0.85
        const label = step === 0 ? t('현재') : '+' + formatNumber(step)
        return <g key={step} pointerEvents="none" opacity={step === 0 ? 0.36 : 0.24}>
          <line x1={start * width} x2={end * width} y1={y} y2={y} stroke={guide.color ?? defaultColor} strokeWidth={Math.max(2, progressLineStrokeWidth(defaultThickness, width, cssWidth, renderedZoom))} strokeDasharray="10 8" />
          <text x={start * width + 8} y={Math.max(12, y - 6)} fill={guide.color ?? defaultColor} fontSize={Math.max(10, width / 100)}>{label}{unclamped < 0 || unclamped > 1 ? t(' · 경계') : ''}</text>
        </g>
      })}
      {displayedGuides.map((guide) => {
        const start = guide.xStartRatio ?? 0.15
        const end = guide.xEndRatio ?? 0.85
        const y = guide.position * height
        const x1 = start * width
        const x2 = end * width
        const color = guide.color ?? defaultColor
        const selected = selectedId === guide.id
        const markerX = guide.markerProgress === undefined ? null : (start + (end - start) * guide.markerProgress) * width
        const stroke = guideStrokeWidth(guide, width, cssWidth, renderedZoom, defaultThickness)
        const markerGeometry = progressMarkerGeometry(y, stroke, sy / Math.max(previewScale, 0.0001))
        const lineOpacity = guide.opacity ?? (guide.role === 'reference' ? Math.min(defaultOpacity, 0.45) : defaultOpacity)
        return <g key={guide.id}>
          <line x1={x1} x2={x2} y1={y} y2={y} stroke={color} strokeWidth={stroke} strokeOpacity={lineOpacity} strokeLinecap="round" pointerEvents="none" />
          <line data-guide-id={guide.id} data-progress-action="body" x1={x1} x2={x2} y1={y} y2={y} stroke="transparent" strokeWidth={Math.max(stroke, 44 * sy)} pointerEvents={disabled ? 'none' : 'stroke'} role="button" tabIndex={disabled ? -1 : 0} aria-label={guide.role === 'primary' ? t('진행선 메뉴') : t('참고선 메뉴')} aria-pressed={selected} onKeyDown={(event) => openStyleMenuFromKeyboard(event, guide)} />
          {markerX !== null && <g>
            <ellipse data-guide-id={guide.id} data-progress-action="marker" cx={markerX} cy={y} rx={hitX} ry={Math.max(hitY, (markerGeometry.bottom - markerGeometry.top) / 2)} fill="transparent" pointerEvents={disabled ? 'none' : 'all'} role="button" tabIndex={disabled ? -1 : 0} aria-label={guide.role === 'primary' ? t('진행선 메뉴') : t('참고선 메뉴')} aria-pressed={selected} onKeyDown={(event) => openStyleMenuFromKeyboard(event, guide)} />
            <g opacity={progressMarkerOpacity(lineOpacity)} pointerEvents="none">
              <line x1={markerX} x2={markerX} y1={markerGeometry.top} y2={markerGeometry.bottom} stroke="#fff" strokeWidth={4} vectorEffect="non-scaling-stroke" />
              <line x1={markerX} x2={markerX} y1={markerGeometry.top} y2={markerGeometry.bottom} stroke={DESIGN_SYSTEM_COLORS.primary} strokeWidth={2} vectorEffect="non-scaling-stroke" />
            </g>
          </g>}
          {selected && <g>
            <ellipse data-guide-id={guide.id} data-progress-action="start" cx={x1} cy={y} rx={hitX} ry={hitY} fill="transparent" pointerEvents={disabled ? 'none' : 'all'} role="button" tabIndex={disabled ? -1 : 0} aria-label={guide.role === 'primary' ? t('진행선 메뉴') : t('참고선 메뉴')} aria-pressed={selected} onKeyDown={(event) => openStyleMenuFromKeyboard(event, guide)} />
            <ellipse data-guide-id={guide.id} data-progress-action="end" cx={x2} cy={y} rx={hitX} ry={hitY} fill="transparent" pointerEvents={disabled ? 'none' : 'all'} role="button" tabIndex={disabled ? -1 : 0} aria-label={guide.role === 'primary' ? t('진행선 메뉴') : t('참고선 메뉴')} aria-pressed={selected} onKeyDown={(event) => openStyleMenuFromKeyboard(event, guide)} />
          </g>}
        </g>
      })}
    </svg>
    {menuGuideId && displayedGuides.find((guide) => guide.id === menuGuideId) && (() => {
      const guide = displayedGuides.find((item) => item.id === menuGuideId)!
      const menuGuide = guides.find((item) => item.id === menuGuideId) ?? guide
      const linkedCounterId = guide.linkedCounterId
      const stylePanelOpen = styleGuideId === menuGuideId && styleMenuAnchor !== null
      const popup = <div ref={menuPanelRef} className="progress-line-popover-layer" onPointerDown={(event) => event.stopPropagation()} onPointerMove={(event) => event.stopPropagation()} onPointerUp={(event) => event.stopPropagation()} onPointerCancel={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
        <div className="progress-line-nudge-controls" style={{ left: 0, top: 0, gap: 8 }}>
          <button type="button" aria-label={t('위로 이동')} title={t('위로 이동')} disabled={disabled || guide.position <= 0} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); nudgeGuide(guide, 'up') }}><ArrowUp size={18} aria-hidden="true" /></button>
          <button type="button" aria-label={t('아래로 이동')} title={t('아래로 이동')} disabled={disabled || guide.position >= 1} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); nudgeGuide(guide, 'down') }}><ArrowDown size={18} aria-hidden="true" /></button>
        </div>
        <div className={'progress-line-menu' + (stylePanelOpen ? ' progress-line-style-menu' : '')} role="menu" style={{ left: 0, top: 0, width: 244, maxHeight: 430 }} onPointerDown={(event) => event.stopPropagation()}>
        {styleGuideId === menuGuideId ? <>
          <div className="progress-line-style-header"><strong>{t(guide.role === 'primary' ? "진행선 스타일" : "참고선 스타일")}</strong><button type="button" aria-label={t("닫기")} title={t("닫기")} onClick={() => { setStyleGuideId(null); setMenuGuideId(null); setStyleMenuAnchor(null); menuTriggerRef.current?.focus?.() }}><X size={17} /></button></div>
          <ColorPresetButtons label={t("진행선 색상")} className="progress-color-presets" value={guide.color ?? defaultColor} presets={PROGRESS_LINE_COLOR_PRESETS} includeCurrentColor={false} onChange={(color) => updateGuide(menuGuideId, { color })} />
          {renderStyleRange(menuGuide, 'thickness', '두께')}
          {renderStyleRange(menuGuide, 'opacity', '투명도')}
          {guide.role === 'primary' && <>
            <label className="progress-focus-toggle"><input type="checkbox" checked={Boolean(menuGuide.focus?.enabled)} onChange={(event) => updateFocus(menuGuide, event.currentTarget.checked)} />{t('집중선')}</label>
            <div className="progress-focus-ranges">
              {renderStyleRange(menuGuide, 'dimOpacity', '집중 강도', !menuGuide.focus?.enabled)}
              {renderStyleRange(menuGuide, 'bandHeightRatio', '집중선 두께', !menuGuide.focus?.enabled)}
            </div>
          </>}
          {guide.role === 'primary' && <>
            {linkedCounterId && <button type="button" role="menuitem" onClick={() => startCalibration(menuGuide, linkedCounterId)}>{t("단 간격 다시 맞추기")}</button>}
            {guide.chartRegion?.rowRanges?.length && guide.chartRegion.autoFollow === false && <button type="button" role="menuitem" onClick={() => {
              updateGuide(menuGuide.id, { chartRegion: { ...menuGuide.chartRegion!, autoFollow: true }, counterRowOffset: 0, positionOffset: undefined })
              setMenuGuideId(null)
            }}>{t('자동 따라가기 재개')}</button>}
          </>}
        </> : <>
          <button type="button" role="menuitemcheckbox" aria-checked={guide.markerProgress !== undefined} onClick={() => addMarker(menuGuide)}>
            <span className="progress-menu-marker-icon" aria-hidden="true" />
            <span>{t('마커 표시')}</span>
            <span className={'progress-menu-switch' + (guide.markerProgress !== undefined ? ' is-on' : '')} aria-hidden="true"><span /></span>
          </button>
          <button type="button" role="menuitem" onClick={() => setStyleGuideId(guide.id)}>
            <Palette className="progress-menu-icon" size={16} aria-hidden="true" />
            <span>{t(guide.role === 'primary' ? '진행선 스타일' : '참고선 스타일')}</span>
            <span className="progress-menu-color" style={{ backgroundColor: guide.color ?? defaultColor }} aria-hidden="true" />
            <ChevronRight size={15} aria-hidden="true" />
          </button>
          {guide.role === 'primary' && <button type="button" role="menuitem" disabled={references.length >= 2} onClick={addReference}>
            <Plus className="progress-menu-icon" size={16} aria-hidden="true" />
            <span>{t('진행선 추가')}</span>
          </button>}
          <button type="button" role="menuitem" className="progress-delete-action" onClick={() => {
            setMenuGuideId(null)
            setStyleGuideId(null)
            setDeleteMode(true)
          }}><Trash2 className="progress-menu-icon" size={16} aria-hidden="true" /><span>{t('진행선 삭제')}</span></button>
        </>}
        </div>
      </div>
      return popoverPortalTarget ? createPortal(popup, popoverPortalTarget) : null
    })()}
    {calibration && calibrationPortalTarget && createPortal(<div className="progress-calibration-prompt" role="status" onPointerDown={(event) => event.stopPropagation()}>
      <span>{calibration.phase === 'current' ? t('현재 단 가운데에 선을 맞춰 주세요.') : calibration.phase === 'next' ? t('같은 선을 바로 다음 단 가운데로 옮겨 주세요.') : t('예상 위치를 확인하고 연결해 주세요.')}</span>
      {calibration.phase === 'current' && <button type="button" onClick={saveCalibrationCurrent}>{t("다음 단 위치")}</button>}
      {calibration.phase === 'next' && <button type="button" onClick={previewCalibration}>{t("예상 위치 보기")}</button>}
      {calibration.phase === 'preview' && <>
        <button type="button" onClick={retryCalibration}>{t("다시 맞추기")}</button>
        <button type="button" onClick={confirmCalibration}>{t("연결하기")}</button>
      </>}
      <button type="button" className="progress-calibration-cancel" onClick={cancelCalibration}>{t("취소")}</button>
    </div>, calibrationPortalTarget)}
    {deleteMode && <div className="progress-line-notice progress-line-delete-prompt" role="status" onPointerDown={(event) => event.stopPropagation()}><span>{t('삭제할 진행선을 선택하세요.')}</span><button ref={deleteCancelRef} type="button" onClick={() => { deleteCandidateRef.current = null; setDeleteMode(false); menuTriggerRef.current?.focus?.() }}>{t('취소')}</button></div>}
    {deletedGuide && notice === '진행선을 삭제했습니다.' && <div className="progress-line-notice" role="status" onPointerDown={(event) => event.stopPropagation()}><span>{translateMessage(notice)}</span><button type="button" onClick={undoDelete}>{t("실행 취소")}</button><button type="button" aria-label={t("알림 닫기")} onClick={() => { setNotice(''); setDeletedGuide(null) }}>×</button></div>}
    {notice && notice !== '진행선을 삭제했습니다.' && !calibration && <div className="progress-line-notice" role="status" onPointerDown={(event) => event.stopPropagation()}>{translateMessage(notice)}</div>}
  </div>
}
