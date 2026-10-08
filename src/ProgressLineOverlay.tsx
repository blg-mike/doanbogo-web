import { useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { guidePositionForRotation, pageRectToDisplayRect } from './focusGeometry'
import type { CounterSnapshot, PageRotation, PageWorkRecord, ProgressGuide } from './types'

const presets = [
  { name: '분홍', color: '#ed3f8a' }, { name: '빨강', color: '#f05252' }, { name: '파랑', color: '#3487f5' },
  { name: '초록', color: '#31ad7b' }, { name: '보라', color: '#9257e8' }, { name: '회색', color: '#75808e' },
]
const minimumLength = 0.2

type Action = 'activate' | 'place-marker' | 'marker' | 'start' | 'end' | 'body'
type Drag = {
  id: string
  action: Action
  pointerId: number
  startX: number
  startY: number
  pointX: number
  pointY: number
  base: ProgressGuide
  before: PageWorkRecord
  moved: boolean
  axis: 'x' | 'y' | null
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
  const [adjustingId, setAdjustingId] = useState<string | null>(null)
  const [menuGuideId, setMenuGuideId] = useState<string | null>(null)
  const [styleGuideId, setStyleGuideId] = useState<string | null>(null)
  const [spacingGuideId, setSpacingGuideId] = useState<string | null>(null)
  const [spacingFirst, setSpacingFirst] = useState<{ y: number; row: number } | null>(null)
  const [deletedGuide, setDeletedGuide] = useState<ProgressGuide | null>(null)
  const [notice, setNotice] = useState('')
  const guides = work.horizontalGuides ?? []
  const primary = guides.find((guide) => guide.role === 'primary')
  const displayGuide = (guide: ProgressGuide) => {
    const oriented = guide.rotationPositions?.[String(rotation) as '0' | '90' | '180' | '270']
    const rotated = oriented ? { ...guide, ...oriented } : guide
    const counter = guide.linkedCounterId ? counters.find((item) => item.id === guide.linkedCounterId) : undefined
    const row = counter?.kind === 'simple' ? counter.value : counter?.currentRow ?? 1
    return counter ? { ...rotated, position: guidePositionForRotation(guide, row, rotation) } : rotated
  }
  const references = guides.filter((guide) => guide.role === 'reference').slice(0, 2)
  const displayedGuides = [...(primary ? [primary] : []), ...references].map(displayGuide)
  const sx = width / Math.max(cssWidth, 1)
  const sy = height / Math.max(cssHeight, 1)
  const hitX = 22 * sx
  const hitY = 22 * sy

  function updateGuide(id: string, changes: Partial<ProgressGuide>, immediate: boolean, historyBefore: PageWorkRecord) {
    const original = (work.horizontalGuides ?? []).find((guide) => guide.id === id)
    if (!original) return
    const shown = displayedGuides.find((guide) => guide.id === id) ?? original
    const { position, xStartRatio, xEndRatio, rowSpacing, rowSpacingStartRow, rowSpacingDirection, ...metadata } = changes
    const screenPosition = {
      position: position ?? shown.position,
      xStartRatio: xStartRatio ?? shown.xStartRatio ?? 0.15,
      xEndRatio: xEndRatio ?? shown.xEndRatio ?? 0.85,
      ...((rowSpacing ?? shown.rowSpacing) === undefined ? {} : { rowSpacing: rowSpacing ?? shown.rowSpacing }),
      ...((rowSpacingStartRow ?? shown.rowSpacingStartRow) === undefined ? {} : { rowSpacingStartRow: rowSpacingStartRow ?? shown.rowSpacingStartRow }),
      ...((rowSpacingDirection ?? shown.rowSpacingDirection) === undefined ? {} : { rowSpacingDirection: rowSpacingDirection ?? shown.rowSpacingDirection }),
    }
    const nextGuide: ProgressGuide = {
      ...original,
      ...metadata,
      rotationPositions: { ...original.rotationPositions, [String(rotation) as '0' | '90' | '180' | '270']: screenPosition },
      ...(rotation === 0 ? screenPosition : {}),
    }
    if (position !== undefined && original.linkedCounterId) {
      const counter = counters.find((item) => item.id === original.linkedCounterId)
      const row = counter?.kind === 'simple' ? counter.value : counter?.currentRow ?? 1
      if (rotation === 0) {
        nextGuide.chartRegion = undefined
        nextGuide.rowSpacingStartRow = row
      }
      nextGuide.rotationPositions = { ...nextGuide.rotationPositions, [String(rotation) as '0' | '90' | '180' | '270']: { ...screenPosition, rowSpacingStartRow: row } }
    }
    const nextGuides = (work.horizontalGuides ?? []).map((guide) => guide.id === id ? nextGuide : guide)
    onWorkChange({ ...work, horizontalGuides: nextGuides, horizontalPosition: nextGuide.position }, immediate, immediate, historyBefore)
  }

  function point(event: { clientX: number; clientY: number }, svg: SVGSVGElement) {
    const rect = svg.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width))),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / Math.max(1, rect.height))),
    }
  }

  function begin(event: ReactPointerEvent<SVGSVGElement>) {
    if (!active) onActivate()
    if (disabled) return
    event.preventDefault()
    event.stopPropagation()
    const svg = event.currentTarget
    const pos = point(event, svg)
    if (spacingGuideId) {
        const guide = guides.find((item) => item.id === spacingGuideId)
        const shown = displayedGuides.find((item) => item.id === spacingGuideId)
      if (!guide || !shown) return
      const counter = counters.find((item) => item.id === guide.linkedCounterId)
      const row = counter?.kind === 'simple' ? counter.value : counter?.currentRow ?? 1
      if (!spacingFirst) {
        setSpacingFirst({ y: pos.y, row })
        setNotice('다음 단 위치를 탭하세요.')
      } else {
        const spacing = Math.abs(pos.y - spacingFirst.y)
        if (spacing >= 0.002) updateGuide(guide.id, {
          position: spacingFirst.y,
          rowSpacing: spacing,
          rowSpacingStartRow: spacingFirst.row,
          rowSpacingDirection: pos.y > spacingFirst.y ? 'down' : 'up',
          chartRegion: undefined,
        }, true, work)
        setSpacingGuideId(null)
        setSpacingFirst(null)
        setNotice(spacing >= 0.002 ? '단 간격을 저장했습니다.' : '두 위치가 너무 가까워 간격을 저장하지 않았습니다.')
      }
      return
    }

    const target = (event.target as SVGElement).closest<SVGElement>('[data-guide-id]')
    const id = target?.dataset.guideId
    const guide = displayedGuides.find((item) => item.id === id)
    if (!guide) return
    const targetAction = target?.dataset.progressAction
    const adjusting = adjustingId === guide.id
    const action: Action = targetAction === 'start' || targetAction === 'end' || targetAction === 'marker'
      ? targetAction
      : adjusting ? 'body' : guide.markerProgress === undefined ? 'activate' : 'place-marker'
    try { svg.setPointerCapture(event.pointerId) } catch { /* Pointer movement stays local if capture is unavailable. */ }
    dragRef.current = {
      id: guide.id, action, pointerId: event.pointerId, startX: pos.x, startY: pos.y, pointX: pos.x, pointY: pos.y,
      base: guide, before: work, moved: false, axis: null,
    }
  }

  function applyDrag(drag: Drag, x: number, y: number, final: boolean) {
    const start = drag.base.xStartRatio ?? 0.15
    const end = drag.base.xEndRatio ?? 0.85
    if (drag.action === 'activate' || drag.action === 'place-marker') {
      if (!final || drag.moved) return
      if (drag.base.role === 'reference') {
        setAdjustingId(drag.id)
        return
      }
      const markerProgress = Math.min(1, Math.max(0, (x - start) / Math.max(0.001, end - start)))
      updateGuide(drag.id, { markerProgress }, true, drag.before)
      return
    }
    if (drag.action === 'marker') {
      const markerProgress = Math.min(1, Math.max(0, (x - start) / Math.max(0.001, end - start)))
      updateGuide(drag.id, { markerProgress }, final, drag.before)
      return
    }
    if (drag.action === 'start') {
      const xStartRatio = Math.min(end - minimumLength, Math.max(0, x))
      updateGuide(drag.id, { xStartRatio }, final, drag.before)
      return
    }
    if (drag.action === 'end') {
      const xEndRatio = Math.max(start + minimumLength, Math.min(1, x))
      updateGuide(drag.id, { xEndRatio }, final, drag.before)
      return
    }
    const axis = drag.axis
    if (!axis) return
    if (axis === 'x') {
      const dx = x - drag.startX
      const bounded = Math.min(1 - (end - start), Math.max(0, start + dx))
      updateGuide(drag.id, { xStartRatio: bounded, xEndRatio: bounded + (end - start) }, final, drag.before)
    } else {
      updateGuide(drag.id, { position: Math.min(1, Math.max(0, drag.base.position + y - drag.startY)) }, final, drag.before)
    }
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
      drag.axis = drag.action === 'body' ? (Math.abs(dx) > Math.abs(dy) ? 'x' : 'y') : 'x'
    }
    drag.pointX = pos.x
    drag.pointY = pos.y
    if (drag.moved && drag.action !== 'activate' && drag.action !== 'place-marker') applyDrag(drag, pos.x, pos.y, false)
  }

  function finish(event: ReactPointerEvent<SVGSVGElement>, cancelled = false) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    if (cancelled) onWorkChange(drag.before, true, false)
    else {
      const pos = point(event, event.currentTarget)
      if (drag.moved && drag.action !== 'activate' && drag.action !== 'place-marker') applyDrag(drag, pos.x, pos.y, true)
      else applyDrag(drag, pos.x, pos.y, true)
    }
    dragRef.current = null
  }

  function addReference() {
    if (!primary || references.length >= 2) return
    const reference: ProgressGuide = {
      ...primary, id: crypto.randomUUID(), role: 'reference', linkedCounterId: undefined, chartRegion: undefined,
      markerProgress: undefined, opacity: Math.min(primary.opacity ?? defaultOpacity, 0.45), rowSpacing: undefined, rowSpacingStartRow: undefined, rowSpacingDirection: undefined,
      focus: { enabled: false, strength: 'medium', range: 0, scope: 'page', rowSpacing: primary.rowSpacing ?? 0.03 },
    }
    onWorkChange({ ...work, horizontalGuides: [...guides, reference] }, true, true, work)
    setMenuGuideId(null)
  }

  function removeGuide(guide: ProgressGuide) {
    setDeletedGuide(guide)
    onWorkChange({ ...work, horizontalGuides: guides.filter((item) => item.id !== guide.id) }, true, true, work)
    setMenuGuideId(null)
    setAdjustingId(null)
    setNotice('진행선을 삭제했습니다.')
  }

  function undoDelete() {
    if (!deletedGuide || guides.some((guide) => guide.id === deletedGuide.id)) return
    onWorkChange({ ...work, horizontalGuides: [...guides, deletedGuide] }, true, true, work)
    setDeletedGuide(null)
    setNotice('진행선을 복구했습니다.')
  }

  function startSpacing(guide: ProgressGuide) {
    setSpacingGuideId(guide.id)
    setSpacingFirst(null)
    setMenuGuideId(null)
    setNotice('현재 뜨는 단의 위치를 탭하세요.')
  }

  function cancelSpacing() {
    setSpacingGuideId(null)
    setSpacingFirst(null)
    setNotice('단 간격 설정을 취소했습니다.')
  }

  function updateFocus(guide: ProgressGuide, enabled: boolean, strength = guide.focus?.strength ?? 'medium') {
    updateGuide(guide.id, { focus: { enabled, strength, range: guide.focus?.range ?? 0, scope: guide.focus?.scope ?? (guide.chartRegion ? 'region' : 'page'), rowSpacing: guide.focus?.rowSpacing ?? guide.rowSpacing ?? 0.03 } }, true, work)
  }

  const focusGuides = active ? displayedGuides.filter((guide) => guide.focus?.enabled) : []

  return <div className="progress-line-overlay" onPointerDown={(event) => { if (!active) onActivate(); event.stopPropagation() }}>
    <svg viewBox={'0 0 ' + width + ' ' + height} preserveAspectRatio="none" aria-label="진행선 조작" onPointerDown={begin} onPointerMove={move} onPointerUp={finish} onPointerCancel={(event) => finish(event, true)} onLostPointerCapture={(event) => finish(event, true)}>
      {focusGuides.map((guide) => {
        const focus = guide.focus!
        const spacing = guide.rowSpacing ?? focus.rowSpacing ?? 0.03
        const half = Math.min(0.5, spacing * (focus.range * 2 + 1) / 2)
        const region = guide.chartRegion ? pageRectToDisplayRect(guide.chartRegion, rotation) : undefined
        const x = focus.scope === 'region' && region ? region.x * width : 0
        const bandWidth = focus.scope === 'region' && region ? region.width * width : width
        const maskId = 'progress-focus-' + svgId + '-' + guide.id.replace(/[^a-zA-Z0-9_-]/g, '')
        const dim = focus.strength === 'high' ? 0.32 : focus.strength === 'low' ? 0.15 : 0.22
        return <g key={maskId} className="progress-focus-dim">
          <defs><mask id={maskId}><rect width={width} height={height} fill="white" /><rect x={x} y={Math.max(0, (guide.position - half) * height)} width={bandWidth} height={Math.min(height, 2 * half * height)} fill="black" style={{ transition: 'y 150ms ease' }} /></mask></defs>
          <rect width={width} height={height} fill={'rgba(19,31,49,' + dim + ')'} mask={'url(#' + maskId + ')'} pointerEvents="none" />
        </g>
      })}
      {displayedGuides.map((guide) => {
        const start = guide.xStartRatio ?? 0.15
        const end = guide.xEndRatio ?? 0.85
        const y = guide.position * height
        const x1 = start * width
        const x2 = end * width
        const color = guide.color ?? defaultColor
        const adjusted = adjustingId === guide.id
        const markerX = guide.markerProgress === undefined ? null : (start + (end - start) * guide.markerProgress) * width
        const stroke = guide.role === 'reference' ? Math.max(1, defaultThickness * sx * 0.5) : Math.max(2, defaultThickness * sx)
        return <g key={guide.id}>
          <line x1={x1} x2={x2} y1={y} y2={y} stroke={color} strokeWidth={stroke} strokeOpacity={guide.opacity ?? (guide.role === 'reference' ? Math.min(defaultOpacity, 0.45) : defaultOpacity)} strokeLinecap="round" pointerEvents="none" />
          <line data-guide-id={guide.id} data-progress-action="line" x1={x1} x2={x2} y1={y} y2={y} stroke="transparent" strokeWidth={Math.max(stroke, 44 * sy)} pointerEvents={disabled ? 'none' : 'stroke'} />
          {markerX !== null && <g>
            <ellipse data-guide-id={guide.id} data-progress-action="marker" cx={markerX} cy={y} rx={hitX} ry={hitY} fill="transparent" pointerEvents={disabled ? 'none' : 'all'} />
            <circle cx={markerX} cy={y} r={Math.max(6, 6 * sx)} fill={color} stroke="white" strokeWidth={Math.max(2, 2 * sx)} pointerEvents="none" />
            <path d={'M ' + (markerX - 5 * sx) + ' ' + (y + 8 * sy) + ' L ' + (markerX + 5 * sx) + ' ' + (y + 8 * sy) + ' L ' + markerX + ' ' + (y + 15 * sy) + ' Z'} fill={color} pointerEvents="none" />
          </g>}
          {adjusted && <g>
            <ellipse data-guide-id={guide.id} data-progress-action="start" cx={x1} cy={y} rx={hitX} ry={hitY} fill="transparent" pointerEvents={disabled ? 'none' : 'all'} />
            <ellipse data-guide-id={guide.id} data-progress-action="end" cx={x2} cy={y} rx={hitX} ry={hitY} fill="transparent" pointerEvents={disabled ? 'none' : 'all'} />
            <circle cx={x1} cy={y} r={Math.max(6, 6 * sx)} fill="white" stroke={color} strokeWidth={Math.max(2, 2 * sx)} pointerEvents="none" />
            <circle cx={x2} cy={y} r={Math.max(6, 6 * sx)} fill="white" stroke={color} strokeWidth={Math.max(2, 2 * sx)} pointerEvents="none" />
          </g>}
        </g>
      })}
      {spacingGuideId && <rect x="0" y="0" width={width} height={height} fill="transparent" pointerEvents="all" />}
    </svg>
    {spacingGuideId && <div className="progress-spacing-prompt" role="status"><span>{spacingFirst ? '다음 단 위치를 탭하세요.' : '현재 뜨는 단의 위치를 탭하세요.'}</span><button type="button" onClick={cancelSpacing}>취소</button></div>}
    {!primary && <button type="button" className="progress-start-button" onClick={() => {
      const guide: ProgressGuide = { id: crypto.randomUUID(), position: 0.5, role: 'primary', xStartRatio: 0.175, xEndRatio: 0.825 }
      onWorkChange({ ...work, horizontalGuides: [...guides, guide] }, true, true, work)
    }}>진행선 시작</button>}
    {displayedGuides.map((guide) => ((guide.markerProgress !== undefined || guide.role === 'reference') && adjustingId !== guide.id) && <button key={'menu-' + guide.id} type="button" className="progress-line-menu-trigger" style={{ left: (guide.xEndRatio ?? 0.85) * 100 + '%', top: guide.position * 100 + '%' }} aria-label={guide.role === 'primary' ? '진행선 메뉴' : '참고선 메뉴'} onClick={() => setMenuGuideId(menuGuideId === guide.id ? null : guide.id)}>⋯</button>)}
    {displayedGuides.find((guide) => guide.id === adjustingId) && <div className="progress-adjust-controls" style={{ top: Math.max(0, (displayedGuides.find((guide) => guide.id === adjustingId)?.position ?? 0.5) * 100 - 7) + '%' }}><button type="button" onClick={() => setAdjustingId(null)}>완료</button><button type="button" aria-label="진행선 옵션" onClick={() => setMenuGuideId(menuGuideId === adjustingId ? null : adjustingId)}>⋯</button></div>}
    {menuGuideId && <div className="progress-line-menu" role="menu" style={{ left: Math.max(6, Math.min(cssWidth - 226, (displayedGuides.find((guide) => guide.id === menuGuideId)?.xEndRatio ?? 0.85) * cssWidth)) + 'px', top: Math.max(6, Math.min(Math.max(6, cssHeight - 300), (displayedGuides.find((guide) => guide.id === menuGuideId)?.position ?? 0.5) * cssHeight + 28)) + 'px' }}>
      {styleGuideId === menuGuideId ? <>
        <strong>표시 스타일</strong><div className="progress-color-presets">{presets.map((preset) => <button key={preset.color} type="button" aria-label={preset.name} title={preset.name} style={{ background: preset.color }} onClick={() => updateGuide(menuGuideId, { color: preset.color }, true, work)} />)}</div>
        <label>투명도 <input type="range" min="30" max="100" value={Math.round((guides.find((guide) => guide.id === menuGuideId)?.opacity ?? 0.8) * 100)} onChange={(event) => updateGuide(menuGuideId, { opacity: Number(event.currentTarget.value) / 100 }, true, work)} /></label>
        <button type="button" onClick={() => setStyleGuideId(null)}>뒤로</button>
      </> : <>
        {adjustingId !== menuGuideId && <button type="button" role="menuitem" onClick={() => { setAdjustingId(menuGuideId); setMenuGuideId(null) }}>진행선 조정</button>}
        <button type="button" role="menuitem" onClick={() => setStyleGuideId(menuGuideId)}>표시 스타일</button>
        {menuGuideId === primary?.id && <>
        {primary.markerProgress !== undefined && <button type="button" role="menuitem" onClick={() => updateGuide(primary.id, { markerProgress: undefined }, true, work)}>마커 지우기</button>}
        <button type="button" role="menuitem" onClick={() => startSpacing(primary)}>단 간격 다시 맞추기</button>
        <label className="progress-focus-toggle"><input type="checkbox" checked={Boolean(primary.focus?.enabled)} onChange={(event) => updateFocus(primary, event.currentTarget.checked)} />집중 보기</label>
        {primary.focus?.enabled && <label>강도<select value={primary.focus.strength} onChange={(event) => updateFocus(primary, true, event.currentTarget.value as 'low' | 'medium' | 'high')}><option value="low">약하게</option><option value="medium">보통</option><option value="high">강하게</option></select></label>}
        </>}
        <button type="button" role="menuitem" disabled={references.length >= 2} onClick={addReference}>참고선 추가{references.length ? ' · ' + references.length + '/2' : ''}</button>
        <button type="button" role="menuitem" className="progress-delete-action" onClick={() => { const guide = guides.find((item) => item.id === menuGuideId); if (guide) removeGuide(guide) }}>삭제</button>
      </>}
    </div>}
    {deletedGuide && notice === '진행선을 삭제했습니다.' && <div className="progress-line-notice" role="status"><span>{notice}</span><button type="button" onClick={undoDelete}>실행 취소</button><button type="button" aria-label="알림 닫기" onClick={() => { setNotice(''); setDeletedGuide(null) }}>×</button></div>}
    {notice && notice !== '진행선을 삭제했습니다.' && <div className="progress-line-notice" role="status">{notice}</div>}
  </div>
}
