import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Ellipsis, Palette } from 'lucide-react'
import { pageRectToDisplayRect } from './focusGeometry'
import type { CounterSnapshot, PageRotation, PageWorkRecord, ProgressGuide, ProgressGuideScreenPosition } from './types'
import { ColorPresetButtons } from './ColorPresetButtons'
import { PROGRESS_LINE_COLOR_PRESETS } from './designTokens'
import { useDismissiblePopover } from './useDismissiblePopover'

const minimumLength = 0.2

type Action = 'marker' | 'start' | 'end' | 'body'
type Drag = {
  id: string
  action: Action
  pointerId: number
  startX: number
  startY: number
  moved: boolean
  axis: 'x' | 'y' | null
  base: ProgressGuide
  work: PageWorkRecord
  historyBefore: PageWorkRecord
  previousPreview: ProgressGuide | null
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

function rangeValue(field: 'opacity' | 'thickness', value: number) {
  return field === 'opacity' ? Math.round(value * 100) / 100 : Math.round(value)
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

export function ProgressLineOverlay({ width, height, cssWidth, cssHeight, work, counters, rotation, active, disabled, defaultColor, defaultOpacity, defaultThickness, onActivate, onWorkChange }: {
  width: number
  height: number
  cssWidth: number
  cssHeight: number
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
}) {
  const svgId = useId().replace(/:/g, '')
  const dragRef = useRef<Drag | null>(null)
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const menuPanelRef = useRef<HTMLDivElement | null>(null)
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null)
  const [previewGuide, setPreviewGuide] = useState<ProgressGuide | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [menuGuideId, setMenuGuideId] = useState<string | null>(null)
  const [styleGuideId, setStyleGuideId] = useState<string | null>(null)
  const [styleMenuAnchor, setStyleMenuAnchor] = useState<{ x: number; y: number } | null>(null)
  const [connectingGuideId, setConnectingGuideId] = useState<string | null>(null)
  const [connectingCounterId, setConnectingCounterId] = useState('')
  const [calibration, setCalibration] = useState<Calibration | null>(null)
  const [deletedGuide, setDeletedGuide] = useState<ProgressGuide | null>(null)
  const [notice, setNotice] = useState('')
  const [styleDraft, setStyleDraft] = useState<{ id: string; field: 'opacity' | 'thickness'; value: number } | null>(null)
  const styleBeforeRef = useRef<{ work: PageWorkRecord; guideId: string; field: 'opacity' | 'thickness'; value: number } | null>(null)
  const styleRangeChangedRef = useRef(false)
  const guides = work.horizontalGuides ?? []
  const primary = guides.find((guide) => guide.role === 'primary')
  const references = guides.filter((guide) => guide.role === 'reference').slice(0, 2)
  const sourceGuides = [...(primary ? [primary] : []), ...references]
  const sx = width / Math.max(cssWidth, 1)
  const sy = height / Math.max(cssHeight, 1)
  const hitX = 22 * sx
  const hitY = 22 * sy
  const displayedGuides = sourceGuides.map((guide) => {
    const preview = previewGuide?.id === guide.id ? previewGuide : guide
    const displayed = guideForDisplay(preview, rotation)
    return styleDraft?.id === guide.id ? { ...displayed, [styleDraft.field]: styleDraft.value } : displayed
  })
  const currentCalibrationCounter = calibration ? counters.find((counter) => counter.id === calibration.counterId) : undefined

  useDismissiblePopover(menuGuideId !== null, menuPanelRef, menuTriggerRef, () => {
    setStyleGuideId(null)
    setMenuGuideId(null)
    setStyleMenuAnchor(null)
  })

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

  function begin(event: ReactPointerEvent<SVGSVGElement>) {
    if (disabled) return
    const target = (event.target as SVGElement).closest<SVGElement>('[data-guide-id]')
    const id = target?.dataset.guideId
    const guide = displayedGuides.find((item) => item.id === id)
    if (!target || !guide || calibration && calibration.guideId !== guide.id) return
    if (!active) onActivate()
    event.preventDefault()
    event.stopPropagation()
    const original = work.horizontalGuides?.find((item) => item.id === guide.id)
    if (!original) return
    const pos = point(event, event.currentTarget)
    const action = target.dataset.progressAction === 'start' || target.dataset.progressAction === 'end' || target.dataset.progressAction === 'marker'
      ? target.dataset.progressAction
      : 'body'
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* Local pointer movement still works without capture. */ }
    const workingWork = previewGuide?.id === guide.id
      ? { ...work, horizontalGuides: work.horizontalGuides?.map((item) => item.id === guide.id ? previewGuide : item) }
      : work
    dragRef.current = {
      id: guide.id,
      action,
      pointerId: event.pointerId,
      startX: pos.x,
      startY: pos.y,
      moved: false,
      axis: null,
      base: guide,
      work: workingWork,
      historyBefore: calibration?.beforeWork ?? work,
      previousPreview: previewGuide,
    }
    setSelectedId(guide.id)
    setMenuGuideId(null)
    setStyleGuideId(null)
    setStyleMenuAnchor(null)
    setConnectingGuideId(null)
  }

  function dragChanges(drag: Drag, x: number, y: number): Partial<ProgressGuide> | null {
    const start = drag.base.xStartRatio ?? 0.15
    const end = drag.base.xEndRatio ?? 0.85
    if (!drag.axis) return null
    if (drag.action === 'marker') {
      return { markerProgress: clamp((x - start) / Math.max(0.001, end - start), 0, 1) }
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
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    const pos = point(event, event.currentTarget)
    const rect = event.currentTarget.getBoundingClientRect()
    const dx = (pos.x - drag.startX) * rect.width
    const dy = (pos.y - drag.startY) * rect.height
    if (!drag.moved && Math.hypot(dx, dy) >= 8) {
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
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    if (cancelled) {
      setPreviewGuide(drag.previousPreview)
      dragRef.current = null
      return
    }
    const pos = point(event, event.currentTarget)
    if (!drag.moved) {
      setSelectedId(drag.id)
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

  function startLine() {
    const guide: ProgressGuide = { id: crypto.randomUUID(), position: 0.5, role: 'primary', xStartRatio: 0.175, xEndRatio: 0.825 }
    onWorkChange({ ...work, progressMigration: 'complete', horizontalGuides: [...guides, guide] }, true, true, work)
    setSelectedId(guide.id)
  }

  function updateGuide(id: string, changes: Partial<ProgressGuide>, before = work, shown?: ProgressGuide) {
    const next = updateGuideWork(before, id, changes, rotation, counters, shown)
    if (next === before) return
    onWorkChange(next, true, true, before)
  }

  function addMarker(guide: ProgressGuide) {
    updateGuide(guide.id, { markerProgress: guide.markerProgress === undefined ? 0.5 : undefined })
    setMenuGuideId(null)
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
    setSelectedId(reference.id)
    setMenuGuideId(null)
  }

  function removeGuide(guide: ProgressGuide) {
    setDeletedGuide(guide)
    onWorkChange({ ...work, horizontalGuides: guides.filter((item) => item.id !== guide.id) }, true, true, work)
    setMenuGuideId(null)
    setSelectedId(guide.id === selectedId ? null : selectedId)
    setNotice('진행선을 삭제했습니다.')
  }

  function undoDelete() {
    if (!deletedGuide || guides.some((guide) => guide.id === deletedGuide.id)) return
    onWorkChange({ ...work, horizontalGuides: [...guides, deletedGuide] }, true, true, work)
    setSelectedId(deletedGuide.id)
    setDeletedGuide(null)
    setNotice('진행선을 복구했습니다.')
  }

  function startCalibration(guide: ProgressGuide, counterId = connectingCounterId) {
    const counter = counters.find((item) => item.id === counterId)
    if (!counter) return
    setCalibration({ guideId: guide.id, counterId: counter.id, counterRow: counterRow(counter), rotation, phase: 'current', beforeWork: work })
    setSelectedId(guide.id)
    setPreviewGuide(null)
    setMenuGuideId(null)
    setConnectingGuideId(null)
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

  function updateFocus(guide: ProgressGuide, enabled: boolean, strength = guide.focus?.strength ?? 'medium') {
    updateGuide(guide.id, { focus: { enabled, strength, range: guide.focus?.range ?? 0, scope: guide.focus?.scope ?? (guide.chartRegion ? 'region' : 'page'), rowSpacing: guide.focus?.rowSpacing ?? guide.rowSpacing ?? 0.03 } })
  }

  function beginStyleRange(event: ReactPointerEvent<HTMLInputElement>, guide: ProgressGuide, field: 'opacity' | 'thickness') {
    event.stopPropagation()
    const fallback = field === 'opacity' ? defaultOpacity : guideThickness(guide, defaultThickness)
    styleBeforeRef.current = { work, guideId: guide.id, field, value: rangeValue(field, guide[field] ?? fallback) }
    styleRangeChangedRef.current = false
  }

  function changeStyleRange(guide: ProgressGuide, field: 'opacity' | 'thickness', value: number) {
    const before = styleBeforeRef.current
    if (!before || before.guideId !== guide.id || before.field !== field) return
    styleRangeChangedRef.current = true
    setStyleDraft({ id: guide.id, field, value })
  }

  function finishStyleRange(event: ReactPointerEvent<HTMLInputElement>, guide: ProgressGuide, field: 'opacity' | 'thickness') {
    event.stopPropagation()
    const before = styleBeforeRef.current
    if (!before || before.guideId !== guide.id || before.field !== field) return
    const inputValue = Number(event.currentTarget.value)
    const value = field === 'opacity' ? inputValue / 100 : inputValue
    const changed = styleRangeChangedRef.current
    styleBeforeRef.current = null
    styleRangeChangedRef.current = false
    setStyleDraft(null)
    if (!changed || value === before.value) return
    const shown = guideForDisplay(guide, rotation)
    const next = updateGuideWork(before.work, guide.id, { [field]: value }, rotation, counters, shown)
    onWorkChange(next, true, true, before.work)
  }

  function cancelStyleRange(event: ReactPointerEvent<HTMLInputElement>) {
    event.stopPropagation()
    styleBeforeRef.current = null
    styleRangeChangedRef.current = false
    setStyleDraft(null)
  }

  function renderStyleRange(guide: ProgressGuide, field: 'opacity' | 'thickness', label: string) {
    const fallback = field === 'opacity' ? defaultOpacity : guideThickness(guide, defaultThickness)
    const value = styleDraft?.id === guide.id && styleDraft.field === field
      ? styleDraft.value
      : guide[field] ?? fallback
    const inputValue = field === 'opacity' ? Math.round(value * 100) : Math.round(value)
    return <label>{label}<input
      type="range"
      min={field === 'opacity' ? 30 : 1}
      max={field === 'opacity' ? 100 : 12}
      step="1"
      aria-label={field === 'opacity' ? '진행선 투명도' : '진행선 두께'}
      value={inputValue}
      onPointerDown={(event) => beginStyleRange(event, guide, field)}
      onChange={(event) => {
        const nextValue = Number(event.currentTarget.value)
        changeStyleRange(guide, field, field === 'opacity' ? nextValue / 100 : nextValue)
      }}
      onPointerUp={(event) => finishStyleRange(event, guide, field)}
      onPointerCancel={cancelStyleRange}
      onLostPointerCapture={(event) => finishStyleRange(event, guide, field)}
      onFocus={(event) => { if (!styleBeforeRef.current) beginStyleRange(event as unknown as ReactPointerEvent<HTMLInputElement>, guide, field) }}
      onBlur={(event) => finishStyleRange(event as unknown as ReactPointerEvent<HTMLInputElement>, guide, field)}
      onKeyDown={() => {
        if (!styleBeforeRef.current) {
          styleBeforeRef.current = { work, guideId: guide.id, field, value: rangeValue(field, guide[field] ?? fallback) }
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
    <svg viewBox={'0 0 ' + width + ' ' + height} preserveAspectRatio="none" aria-label="진행선 조작" onPointerDown={begin} onPointerMove={move} onPointerUp={finish} onPointerCancel={(event) => finish(event, true)} onLostPointerCapture={(event) => finish(event, true)}>
      {focusGuides.map((guide) => {
        const focus = guide.focus!
        const spacing = guide.rowSpacing ?? focus.rowSpacing ?? 0.03
        const half = Math.min(0.5, spacing * (focus.range * 2 + 1) / 2)
        const top = Math.max(0, guide.position - half)
        const bottom = Math.min(1, guide.position + half)
        const region = guide.chartRegion ? pageRectToDisplayRect(guide.chartRegion, rotation) : undefined
        const x = focus.scope === 'region' && region ? region.x * width : 0
        const bandWidth = focus.scope === 'region' && region ? region.width * width : width
        const maskId = 'progress-focus-' + svgId + '-' + guide.id.replace(/[^a-zA-Z0-9_-]/g, '')
        const dim = focus.strength === 'high' ? 0.32 : focus.strength === 'low' ? 0.15 : 0.22
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
        return <g pointerEvents="none"><line x1={start * width} x2={end * width} y1={y} y2={y} stroke={guide.color ?? defaultColor} strokeWidth={Math.max(2, defaultThickness * sx)} strokeOpacity="0.28" strokeDasharray="10 8" /><text x={start * width + 8} y={Math.max(12, y - 6)} fill={guide.color ?? defaultColor} fontSize={Math.max(10, width / 100)}>현재 단</text></g>
      })()}
      {calibrationPreviewPositions.map(({ step, unclamped }) => {
        const guide = displayedGuides.find((item) => item.id === calibration?.guideId)
        if (!guide) return null
        const y = clamp(unclamped, 0, 1) * height
        const start = guide.xStartRatio ?? 0.15
        const end = guide.xEndRatio ?? 0.85
        const label = step === 0 ? '현재' : '+' + step
        return <g key={step} pointerEvents="none" opacity={step === 0 ? 0.36 : 0.24}>
          <line x1={start * width} x2={end * width} y1={y} y2={y} stroke={guide.color ?? defaultColor} strokeWidth={Math.max(2, defaultThickness * sx)} strokeDasharray="10 8" />
          <text x={start * width + 8} y={Math.max(12, y - 6)} fill={guide.color ?? defaultColor} fontSize={Math.max(10, width / 100)}>{label}{unclamped < 0 || unclamped > 1 ? ' · 경계' : ''}</text>
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
        const stroke = guide.thickness === undefined
          ? guide.role === 'reference' ? Math.max(1, defaultThickness * sx * 0.5) : Math.max(2, defaultThickness * sx)
          : Math.max(0.5, guide.thickness * sx)
        return <g key={guide.id}>
          <line x1={x1} x2={x2} y1={y} y2={y} stroke={color} strokeWidth={stroke} strokeOpacity={guide.opacity ?? (guide.role === 'reference' ? Math.min(defaultOpacity, 0.45) : defaultOpacity)} strokeLinecap="round" pointerEvents="none" />
          <line data-guide-id={guide.id} data-progress-action="body" x1={x1} x2={x2} y1={y} y2={y} stroke="transparent" strokeWidth={Math.max(stroke, 44 * sy)} pointerEvents={disabled ? 'none' : 'stroke'} />
          {markerX !== null && <g>
            <ellipse data-guide-id={guide.id} data-progress-action="marker" cx={markerX} cy={y} rx={hitX} ry={hitY} fill="transparent" pointerEvents={disabled ? 'none' : 'all'} />
            <circle cx={markerX} cy={y} r={Math.max(6, 6 * sx)} fill={color} stroke="white" strokeWidth={Math.max(2, 2 * sx)} pointerEvents="none" />
            <path d={'M ' + (markerX - 5 * sx) + ' ' + (y + 8 * sy) + ' L ' + (markerX + 5 * sx) + ' ' + (y + 8 * sy) + ' L ' + markerX + ' ' + (y + 15 * sy) + ' Z'} fill={color} pointerEvents="none" />
          </g>}
          {selected && <g>
            <ellipse data-guide-id={guide.id} data-progress-action="start" cx={x1} cy={y} rx={hitX} ry={hitY} fill="transparent" pointerEvents={disabled ? 'none' : 'all'} />
            <ellipse data-guide-id={guide.id} data-progress-action="end" cx={x2} cy={y} rx={hitX} ry={hitY} fill="transparent" pointerEvents={disabled ? 'none' : 'all'} />
            <circle cx={x1} cy={y} r={Math.max(6, 6 * sx)} fill="white" stroke={color} strokeWidth={Math.max(2, 2 * sx)} pointerEvents="none" />
            <circle cx={x2} cy={y} r={Math.max(6, 6 * sx)} fill="white" stroke={color} strokeWidth={Math.max(2, 2 * sx)} pointerEvents="none" />
          </g>}
        </g>
      })}
    </svg>
    {!primary && <button type="button" className="progress-start-button" disabled={disabled} onPointerDown={(event) => event.stopPropagation()} onClick={startLine}>진행선 시작</button>}
    {displayedGuides.map((guide) => <div
      key={'menu-' + guide.id}
      className="progress-line-actions"
      style={{ left: clamp((guide.xEndRatio ?? 0.85) * cssWidth + 4, 4, Math.max(4, cssWidth - 84)), top: guide.position * cssHeight }}
    >
      <button
        ref={styleGuideId === guide.id ? menuTriggerRef : undefined}
        type="button"
        className="progress-line-menu-trigger"
        aria-label={guide.role === 'primary' ? '진행선 표시 스타일' : '참고선 표시 스타일'}
        title="표시 스타일"
        onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); if (!active) onActivate() }}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          const overlay = overlayRef.current?.getBoundingClientRect()
          if (styleGuideId === guide.id) {
            setStyleGuideId(null)
            setMenuGuideId(null)
            setStyleMenuAnchor(null)
            return
          }
          menuTriggerRef.current = event.currentTarget
          setSelectedId(guide.id)
          setConnectingGuideId(null)
          setMenuGuideId(guide.id)
          setStyleGuideId(guide.id)
          setStyleMenuAnchor({ x: rect.left + rect.width / 2 - (overlay?.left ?? 0), y: rect.top + rect.height / 2 - (overlay?.top ?? 0) })
        }}
      ><Palette size={17} /></button>
      <button
        ref={menuGuideId === guide.id && styleGuideId !== guide.id ? menuTriggerRef : undefined}
        type="button"
        className="progress-line-menu-trigger"
        aria-label={guide.role === 'primary' ? '진행선 옵션' : '참고선 옵션'}
        title={guide.role === 'primary' ? '진행선 옵션' : '참고선 옵션'}
        onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); if (!active) onActivate() }}
        onClick={(event) => {
          menuTriggerRef.current = event.currentTarget
          setSelectedId(guide.id)
          setConnectingGuideId(null)
          setStyleMenuAnchor(null)
          if (menuGuideId === guide.id && styleGuideId !== guide.id) {
            setMenuGuideId(null)
            setStyleGuideId(null)
          } else {
            setMenuGuideId(guide.id)
            setStyleGuideId(null)
          }
        }}
      ><Ellipsis size={19} /></button>
    </div>)}
    {menuGuideId && displayedGuides.find((guide) => guide.id === menuGuideId) && (() => {
      const guide = displayedGuides.find((item) => item.id === menuGuideId)!
      const menuGuide = guides.find((item) => item.id === menuGuideId) ?? guide
      const connectedCounter = counters.find((counter) => counter.id === guide.linkedCounterId)
      const stylePanelOpen = styleGuideId === menuGuideId && styleMenuAnchor !== null
      const anchorLeft = styleMenuAnchor ? styleMenuAnchor.x + 14 : 0
      const left = stylePanelOpen
        ? clamp(anchorLeft + 226 <= cssWidth - 6 ? anchorLeft : styleMenuAnchor.x - 240, 6, Math.max(6, cssWidth - 226))
        : clamp((guide.xEndRatio ?? 0.85) * cssWidth, 6, Math.max(6, cssWidth - 226))
      const top = stylePanelOpen
        ? clamp(styleMenuAnchor.y - 18, 6, Math.max(6, cssHeight - 360))
        : clamp(guide.position * cssHeight + 28, 6, Math.max(6, cssHeight - 360))
      return <div ref={menuPanelRef} className="progress-line-menu" role="menu" style={{ left, top }} onPointerDown={(event) => event.stopPropagation()}>
        {styleGuideId === menuGuideId ? <>
          <strong>표시 스타일</strong>
          <ColorPresetButtons label="진행선 색상" className="progress-color-presets" value={guide.color ?? defaultColor} presets={PROGRESS_LINE_COLOR_PRESETS} onChange={(color) => updateGuide(menuGuideId, { color })} />
          {renderStyleRange(menuGuide, 'thickness', '두께')}
          {renderStyleRange(menuGuide, 'opacity', '투명도')}
          <button type="button" role="menuitem" onClick={() => { setStyleGuideId(null); setMenuGuideId(null); setStyleMenuAnchor(null) }}>닫기</button>
        </> : <>
          {guide.role === 'primary' && <>
            <button type="button" role="menuitem" onClick={() => addMarker(menuGuide)}>{guide.markerProgress === undefined ? '마커 표시' : '마커 지우기'}</button>
            {connectingGuideId === guide.id ? <div className="progress-connect-options">
              <select aria-label="연결할 카운터" value={connectingCounterId} onChange={(event) => setConnectingCounterId(event.currentTarget.value)}>
                <option value="">카운터 선택</option>
                {counters.map((counter) => <option key={counter.id} value={counter.id}>{counter.name} · {counterRow(counter)}단</option>)}
              </select>
              <button type="button" role="menuitem" disabled={!connectingCounterId} onClick={() => startCalibration(menuGuide)}>{connectedCounter ? '간격 다시 맞추기' : '두 위치 맞추기'}</button>
              {connectedCounter && <button type="button" role="menuitem" onClick={() => {
                updateGuide(menuGuide.id, { linkedCounterId: undefined, counterRowOffset: undefined, positionOffset: undefined, name: undefined, color: undefined, chartRegion: undefined, rowSpacing: undefined, rowSpacingStartRow: undefined, rowSpacingDirection: undefined })
                setConnectingGuideId(null)
                setMenuGuideId(null)
              }}>카운터 연결 해제</button>}
            </div> : <button type="button" role="menuitem" onClick={() => { setConnectingGuideId(guide.id); setConnectingCounterId(guide.linkedCounterId ?? counters[0]?.id ?? '') }}>카운터와 연결</button>}
            {guide.linkedCounterId && <button type="button" role="menuitem" onClick={() => startCalibration(menuGuide, menuGuide.linkedCounterId)}>단 간격 다시 맞추기</button>}
            <button type="button" role="menuitem" onClick={() => updateFocus(menuGuide, !(menuGuide.focus?.enabled ?? false))}>{menuGuide.focus?.enabled ? '집중 보기 끄기' : '집중 보기 켜기'}</button>
            {menuGuide.focus?.enabled && <label className="progress-focus-strength">집중 강도<select value={menuGuide.focus.strength} onChange={(event) => updateFocus(menuGuide, true, event.currentTarget.value as 'low' | 'medium' | 'high')}><option value="low">약하게</option><option value="medium">보통</option><option value="high">강하게</option></select></label>}
          </>}
          {guide.role === 'primary' && <button type="button" role="menuitem" disabled={references.length >= 2} onClick={addReference}>참고선 추가{references.length ? ' · ' + references.length + '/2' : ''}</button>}
          <button type="button" role="menuitem" className="progress-delete-action" onClick={() => removeGuide(menuGuide)}>삭제</button>
        </>}
      </div>
    })()}
    {calibration && <div className="progress-calibration-prompt" role="status" onPointerDown={(event) => event.stopPropagation()}>
      <span>{calibration.phase === 'current' ? '현재 단 가운데에 선을 맞춰 주세요.' : calibration.phase === 'next' ? '같은 선을 바로 다음 단 가운데로 옮겨 주세요.' : '예상 위치를 확인하고 연결해 주세요.'}</span>
      {calibration.phase === 'current' && <button type="button" onClick={saveCalibrationCurrent}>다음 단 위치</button>}
      {calibration.phase === 'next' && <button type="button" onClick={previewCalibration}>예상 위치 보기</button>}
      {calibration.phase === 'preview' && <>
        <button type="button" onClick={retryCalibration}>다시 맞추기</button>
        <button type="button" onClick={confirmCalibration}>연결하기</button>
      </>}
      <button type="button" className="progress-calibration-cancel" onClick={cancelCalibration}>취소</button>
    </div>}
    {deletedGuide && notice === '진행선을 삭제했습니다.' && <div className="progress-line-notice" role="status"><span>{notice}</span><button type="button" onClick={undoDelete}>실행 취소</button><button type="button" aria-label="알림 닫기" onClick={() => { setNotice(''); setDeletedGuide(null) }}>×</button></div>}
    {notice && notice !== '진행선을 삭제했습니다.' && !calibration && <div className="progress-line-notice" role="status">{notice}</div>}
  </div>
}
