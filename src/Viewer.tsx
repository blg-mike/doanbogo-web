import { useCallback, useEffect, useRef, useState, type FormEvent as ReactFormEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type UIEvent as ReactUIEvent } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Bookmark, Check, ChevronDown, ChevronUp, Columns2, Eraser, Eye, EyeOff, Grid3X3, Hash, Highlighter, Link2, Maximize2, Minus, MousePointer2, Pencil, Plus, Redo2, RotateCw, SlidersHorizontal, Type, Undo2, X } from 'lucide-react'
import BrandLoading from './BrandLoading'
import yyLogo from './assets/yy-logo.png'
import { cancelThumbnailRenders, PdfPage, PdfThumbnail, setThumbnailRenderingPaused, waitForThumbnailQueueIdle } from './PdfPage'
import { getDocument, getPageRecognition, getPageWork, getPageWorks, getPages, getViewer, markOpened, renameDocument, savePageWork, saveViewer, saveViewerAndPageWorks, setPageFlag, setPagesFlag } from './storage'
import { pdfPageRenderQueue } from './pdfPageRenderQueue'
import { openPdf, pdfErrorMessage } from './pdf'
import KnittingReport from './KnittingReport'
import type { AnnotationSettings, AnnotationStyle, AnnotationTool, ColorworkCreateRequest, ColorworkSettings, CounterHistoryEntry, CounterSnapshot, DocumentRecord, PageRecord, PageRotation, PageWorkRecord, PaneId, PaneSnapshot, ProgressChartRegion, ProgressFocusSettings, ProgressGuide, ProgressSettings, ViewerSnapshot } from './types'
import { defaultColorworkSettings, getColorworkDimensions, resizeColorworkGrid } from './colorwork'
import { MAX_COUNTER_HISTORY, MAX_COUNTER_ROW, advanceLinkedCounters, guidePositionForRow, normalizeCounterSnapshots, progressGuideForCounter, setCounterGroupRow } from './smartCounter'
import CounterPanel from './CounterPanel'
import type { PdfQrLink } from './qr'
import { withRecentPdfLinks } from './pdfRecognitionState'
import { applyColorworkCellChanges, type ColorworkCellChange } from './colorworkHistory'
import { PageWorkPersistence } from './pageWorkPersistence'
import { enqueuePdfRecognition, pausePdfRecognitionForReport, releasePdfRecognitionViewer, resumePdfRecognitionFromReport, subscribePdfRecognition, updatePdfRecognitionPageVisibility } from './pdfRecognition'
import { getViewerResourcePolicy } from './pdfRenderResources'
import { displayRectToPageRect, guidePositionForRotation, pageRectToDisplayRect, formatFocusSpacingPercent, parseFocusSpacingPercent } from './focusGeometry'
import { canHidePageSelection, compactPageThumbnails, completePageList, nextVisiblePageAfterHide, visiblePageRange } from './pageManagement'

type Size = { width: number; height: number }
type WorkAction = { before?: PageWorkRecord; after?: PageWorkRecord; cellChanges?: ColorworkCellChange[] }
type PageHistory = { actions: WorkAction[]; cursor: number; byteCosts: number[] }
const MAX_CACHED_PAGE_WORKS = getViewerResourcePolicy().cachedPageWorks
const MAX_PAGE_HISTORY_ACTIONS = 30
const MAX_PAGE_HISTORY_BYTES = getViewerResourcePolicy().tablet ? 8 * 1024 * 1024 : 32 * 1024 * 1024
type ThumbnailSelection = { pages: number[]; anchor: number; lastPage: number }
type ThumbnailTouchGesture = {
  pointerId: number
  pageNumber: number
  startX: number
  startY: number
  startScrollLeft: number
  clientX: number
  clientY: number
  button: HTMLButtonElement
  mode: 'pending' | 'scroll' | 'select'
  timer: number
  edgeTimer?: number
}

function createCounterSession(documentId: string) { return { documentId, visible: false } }

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
const viewerSaveErrorMessage = '뷰어 위치를 저장하지 못했습니다. 저장 공간을 확인하고 다시 시도해 주세요.'
const pageWorkSaveErrorMessage = '페이지 작업을 저장하지 못했습니다. 저장 공간을 확인하고 다시 시도해 주세요.'
let zoomHintShownInSession = false

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

function estimatePageWorkBytes(work: PageWorkRecord) {
  const gridBytes = (work.colorworkGrid?.cells.length ?? 0) * 8
  const annotationBytes = work.annotations.reduce((sum, annotation) => sum + annotation.points.length * 16 + (annotation.text?.length ?? 0) * 2 + 96, 0)
  const guideBytes = ((work.horizontalGuides?.length ?? 0) + (work.verticalGuides?.length ?? 0)) * 32
  return gridBytes + annotationBytes + guideBytes + 256
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
    documentId, pageNumber, horizontalPosition: 0.5, verticalPosition: 0.5, annotations: [],
    horizontalGuides: [{ id: 'legacy-horizontal', position: 0.5 }],
    verticalGuides: [{ id: 'legacy-vertical', position: 0.5 }],
  }
}

function ProgressSettingsDialog({ settings, work, counters, rotation, autoPanGuideId, onAutoPanChange, onCounterGuideMove, onSettingsChange, onWorkChange, onClose }: {
  settings: ProgressSettings
  work: PageWorkRecord
  counters: CounterSnapshot[]
  rotation: PageRotation
  autoPanGuideId: string | null
  onAutoPanChange: (id: string | null) => void
  onCounterGuideMove: (counterId: string, row: number) => void
  onSettingsChange: (settings: ProgressSettings) => void
  onWorkChange: (work: PageWorkRecord, before: PageWorkRecord, immediate?: boolean, recordHistory?: boolean) => void
  onClose: () => void
}) {
  const guideEditBefore = useRef<PageWorkRecord | null>(null)
  const [counterRowDrafts, setCounterRowDrafts] = useState<Record<string, string>>({})
  const [focusSpacingDrafts, setFocusSpacingDrafts] = useState<Record<string, string>>({})
  const [connection, setConnection] = useState<{ guideId: string; counterId: string; region: ProgressChartRegion; positions: string; step: 1 | 2 | 3 } | null>(null)

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
    if (autoPanGuideId === id) onAutoPanChange(null)
  }

  function updateGuide(axis: 'horizontal' | 'vertical', id: string, change: Partial<ProgressGuide>) {
    const key = axis === 'horizontal' ? 'horizontalGuides' : 'verticalGuides'
    onWorkChange({ ...work, [key]: guides(axis).map((guide) => guide.id === id ? { ...guide, ...change } : guide) }, work)
  }

  function updateFocus(guide: ProgressGuide, change: Partial<ProgressFocusSettings>) {
    const current: ProgressFocusSettings = guide.focus ?? { enabled: false, strength: 'low', range: 0, scope: guide.chartRegion ? 'region' : 'page', rowSpacing: 0.03 }
    if (change.rowSpacing !== undefined && (!Number.isFinite(change.rowSpacing) || change.rowSpacing <= 0 || change.rowSpacing > 0.5)) return
    updateGuide('horizontal', guide.id, { focus: { ...current, ...change } })
  }

  function moveLinkedGuide(guide: ProgressGuide) {
    if (!guide.linkedCounterId) return
    const counter = counters.find((item) => item.id === guide.linkedCounterId)
    const row = Number(counterRowDrafts[guide.id] ?? (counter?.kind === 'simple' ? counter.value : counter?.currentRow ?? 1))
    if (!Number.isSafeInteger(row) || row < 1 || row > MAX_COUNTER_ROW) return
    if (window.confirm((counter?.name ?? '카운터') + '의 현재 단을 ' + row + '단으로 이동할까요?')) onCounterGuideMove(guide.linkedCounterId, row)
  }

  function disconnectGuide(guide: ProgressGuide) {
    updateGuide('horizontal', guide.id, { linkedCounterId: undefined, chartRegion: undefined, name: undefined, color: undefined, focus: guide.focus ? { ...guide.focus, scope: 'page' } : undefined })
    if (autoPanGuideId === guide.id) onAutoPanChange(null)
  }

  function openConnection(guide?: ProgressGuide) {
    const existing = guide ?? guides('horizontal')[0]
    if (!existing) return
    const storedRegion = existing.chartRegion
    const region = storedRegion
      ? { ...storedRegion, ...pageRectToDisplayRect(storedRegion, rotation) }
      : { x: 0.1, y: 0.1, width: 0.8, height: 0.8, firstRow: 1, lastRow: 20, startCounterRow: 1, repeat: true, direction: 'top-to-bottom' as const }
    setConnection({ guideId: existing.id, counterId: existing.linkedCounterId ?? counters[0]?.id ?? '', region, positions: region.rowPositions?.map((value) => String(Math.round(value * 100))).join(', ') ?? '', step: 1 })
  }

  function saveConnection() {
    if (!connection) return
    const guide = guides('horizontal').find((item) => item.id === connection.guideId)
    const counter = counters.find((item) => item.id === connection.counterId)
    if (!guide || !counter) return
    const rowCount = connection.region.lastRow - connection.region.firstRow + 1
    const positionEntries = connection.positions.split(',').map((value) => value.trim())
    const rowPositions = positionEntries.length === rowCount && positionEntries.every((value) => value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100)
      ? positionEntries.map((value) => Number(value) / 100)
      : []
    const displayedRegion = { ...connection.region, ...(rowPositions.length ? { rowPositions } : { rowPositions: undefined }) }
    const pageRegion = { ...displayedRegion, ...displayRectToPageRect(displayedRegion, rotation), rowLayout: { top: connection.region.y, height: connection.region.height } }
    const linkedGuide = { ...guide, linkedCounterId: counter.id, name: counter.name, color: counter.color, chartRegion: pageRegion }
    const currentRow = counter.kind === 'simple' ? counter.value : counter.currentRow ?? 1
    const position = guidePositionForRow({ ...linkedGuide, chartRegion: displayedRegion }, currentRow)
    const horizontalGuides = guides('horizontal').map((item) => item.id === guide.id ? { ...linkedGuide, position } : item)
    onWorkChange({ ...work, horizontalGuides, horizontalPosition: position }, work)
    setConnection(null)
  }

  const connectionGuide = connection ? guides('horizontal').find((guide) => guide.id === connection.guideId) : undefined
  const connectionCounter = connection ? counters.find((counter) => counter.id === connection.counterId) : undefined
  const connectionPosition = connection && connectionGuide && connectionCounter ? guidePositionForRow({ ...connectionGuide, chartRegion: connection.region }, connectionCounter.kind === 'simple' ? connectionCounter.value : connectionCounter.currentRow ?? 1) : undefined
  const linkedGuides = guides('horizontal').filter((guide) => guide.linkedCounterId)

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
                <input id={'guide-position-' + axis + '-' + guide.id} aria-label={name + ' ' + (index + 1) + ' 위치'} type="range" min="0" max="100" disabled={Boolean(guide.linkedCounterId)} value={Math.round(guide.position * 100)} onPointerDown={beginGuideEdit} onPointerUp={finishGuideEdit} onPointerCancel={finishGuideEdit} onKeyDown={beginGuideEdit} onKeyUp={finishGuideEdit} onBlur={finishGuideEdit} onChange={(event) => changeGuide(axis, guide.id, Number(event.currentTarget.value) / 100)} />
                <button type="button" className="icon-button" aria-label={name + ' ' + (index + 1) + ' 삭제'} onClick={() => removeGuide(axis, guide.id)}><X size={15} /></button>
                {axis === 'horizontal' && guide.linkedCounterId && <div className="guide-counter-move"><label>이동할 단<input aria-label={(guide.name ?? '연결 진행선') + ' 이동할 단'} type="number" min="1" max={MAX_COUNTER_ROW} value={counterRowDrafts[guide.id] ?? String((() => { const counter = counters.find((item) => item.id === guide.linkedCounterId); return counter?.kind === 'simple' ? counter.value : counter?.currentRow ?? 1 })())} onChange={(event) => setCounterRowDrafts((current) => ({ ...current, [guide.id]: event.currentTarget.value }))} /></label><button type="button" className="secondary-button" onClick={() => moveLinkedGuide(guide)}>단 이동 확인</button><button type="button" className="text-button" onClick={() => disconnectGuide(guide)}>연결 해제</button></div>}
                {axis === 'horizontal' && <details className="guide-focus-settings"><summary>집중 보기{guide.focus?.enabled ? ' 사용 중' : ''}</summary><label><input type="checkbox" checked={guide.focus?.enabled === true} onChange={(event) => updateFocus(guide, { enabled: event.currentTarget.checked })} />이 진행선으로 집중 보기</label><div className="guide-focus-fields"><label>블러 강도<select value={guide.focus?.strength ?? 'low'} onChange={(event) => updateFocus(guide, { strength: event.currentTarget.value as ProgressFocusSettings['strength'] })}><option value="low">약</option><option value="medium">중</option><option value="high">강</option></select></label><label>선명한 범위<select value={guide.focus?.range ?? 0} onChange={(event) => updateFocus(guide, { range: Number(event.currentTarget.value) as 0 | 1 | 2 })}><option value={0}>현재 줄만</option><option value={1}>위아래 1줄</option><option value={2}>위아래 2줄</option></select></label><label>적용 범위<select value={guide.focus?.scope ?? (guide.chartRegion ? 'region' : 'page')} onChange={(event) => updateFocus(guide, { scope: event.currentTarget.value as ProgressFocusSettings['scope'] })}><option value="page">현재 페이지 전체</option><option value="region" disabled={!guide.chartRegion}>지정 차트 영역</option></select></label>{!guide.chartRegion && <label>줄 간격(도안 높이 %)<input type="number" min="0.5" max="50" step="0.5" value={focusSpacingDrafts[guide.id] ?? formatFocusSpacingPercent(guide.focus?.rowSpacing ?? 0.03)} onFocus={(event) => setFocusSpacingDrafts((current) => ({ ...current, [guide.id]: event.currentTarget.value }))} onChange={(event) => { const value = event.currentTarget.value; setFocusSpacingDrafts((current) => ({ ...current, [guide.id]: value })); const rowSpacing = parseFocusSpacingPercent(value); if (rowSpacing !== null) updateFocus(guide, { rowSpacing }) }} onBlur={() => setFocusSpacingDrafts((current) => { const next = { ...current }; delete next[guide.id]; return next })} /></label>}</div></details>}
                {axis === 'horizontal' && guide.linkedCounterId && <span className="guide-linked-name" style={{ color: guide.color }}>{guide.name ?? counters.find((counter) => counter.id === guide.linkedCounterId)?.name ?? '연결 카운터'}</span>}
              </div>)}</div>
              <button type="button" className="secondary-button guide-add-setting" disabled={axisGuides.length >= 10} onClick={() => addGuide(axis)}><Plus size={15} />{name} 추가</button>
            </fieldset>
          })}
          <section className="progress-connection-settings"><h3><Link2 size={16} />카운터에 연결</h3><p>단수와 차트 줄을 연결하면 카운터 완료에 따라 진행선이 이동합니다.</p><label>자동 화면 이동 기준<select value={autoPanGuideId ?? ''} onChange={(event) => onAutoPanChange(event.currentTarget.value || null)}><option value="">사용 안 함</option>{linkedGuides.map((guide) => <option key={guide.id} value={guide.id}>{guide.name ?? counters.find((counter) => counter.id === guide.linkedCounterId)?.name ?? '연결 진행선'}</option>)}</select></label><button type="button" className="secondary-button guide-connect-start" disabled={!guides('horizontal').length || !counters.length} onClick={() => openConnection()}><Link2 size={15} />3단계 연결 설정</button>
            {connection && <div className="guide-connection-wizard"><strong>{connection.step}/3 · {connection.step === 1 ? '카운터와 가로선 선택' : connection.step === 2 ? '차트 영역 지정' : '현재 줄 확인'}</strong>{connection.step === 1 && <><label>연결할 가로선<select value={connection.guideId} onChange={(event) => setConnection((current) => current ? { ...current, guideId: event.currentTarget.value } : current)}>{guides('horizontal').map((guide, index) => <option key={guide.id} value={guide.id}>{guide.name ?? '가로선 ' + (index + 1)}</option>)}</select></label><label>카운터<select value={connection.counterId} onChange={(event) => setConnection((current) => current ? { ...current, counterId: event.currentTarget.value } : current)}>{counters.map((counter) => <option key={counter.id} value={counter.id}>{counter.name} · 현재 {counter.kind === 'simple' ? counter.value : counter.currentRow ?? 1}단</option>)}</select></label><button type="button" className="primary-button" disabled={!connection.counterId} onClick={() => setConnection((current) => current ? { ...current, step: 2 } : current)}>다음</button></>}{connection.step === 2 && <><div className="guide-region-grid">{([['x', '왼쪽'], ['y', '위쪽'], ['width', '너비'], ['height', '높이']] as const).map(([key, label]) => <label key={key}>{label} (%)<input type="number" min="0" max="100" step="1" value={Math.round(connection.region[key] * 100)} onChange={(event) => setConnection((current) => current ? { ...current, region: { ...current.region, [key]: Number(event.currentTarget.value) / 100 } } : current)} /></label>)}</div><div className="guide-region-grid"><label>첫 차트 단<input type="number" min="1" max={MAX_COUNTER_ROW} value={connection.region.firstRow} onChange={(event) => setConnection((current) => current ? { ...current, region: { ...current.region, firstRow: Number(event.currentTarget.value) } } : current)} /></label><label>마지막 차트 단<input type="number" min={connection.region.firstRow} max={MAX_COUNTER_ROW} value={connection.region.lastRow} onChange={(event) => setConnection((current) => current ? { ...current, region: { ...current.region, lastRow: Number(event.currentTarget.value) } } : current)} /></label><label>연결 시작 단<input type="number" min="1" max={MAX_COUNTER_ROW} value={connection.region.startCounterRow} onChange={(event) => setConnection((current) => current ? { ...current, region: { ...current.region, startCounterRow: Number(event.currentTarget.value) } } : current)} /></label></div><label><input type="checkbox" checked={connection.region.repeat} onChange={(event) => setConnection((current) => current ? { ...current, region: { ...current.region, repeat: event.currentTarget.checked } } : current)} />마지막 단 뒤 첫 줄로 반복</label><label>진행 방향<select value={connection.region.direction} onChange={(event) => setConnection((current) => current ? { ...current, region: { ...current.region, direction: event.currentTarget.value as ProgressChartRegion['direction'] } } : current)}><option value="top-to-bottom">위에서 아래로</option><option value="bottom-to-top">아래에서 위로</option></select></label><label>불규칙한 줄 위치 보정(페이지 위 기준 %, 쉼표 구분)<input value={connection.positions} onChange={(event) => setConnection((current) => current ? { ...current, positions: event.currentTarget.value } : current)} placeholder="예: 12, 18, 23, 31" /></label><p className="guide-wizard-hint">줄 수와 위치 개수가 다르면 균등 간격을 사용합니다.</p><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setConnection((current) => current ? { ...current, step: 1 } : current)}>이전</button><button type="button" className="primary-button" disabled={!Number.isFinite(connection.region.x) || !Number.isFinite(connection.region.y) || !Number.isFinite(connection.region.width) || !Number.isFinite(connection.region.height) || connection.region.x < 0 || connection.region.y < 0 || connection.region.width <= 0 || connection.region.height <= 0 || connection.region.x + connection.region.width > 1 || connection.region.y + connection.region.height > 1 || !Number.isSafeInteger(connection.region.firstRow) || !Number.isSafeInteger(connection.region.lastRow) || !Number.isSafeInteger(connection.region.startCounterRow) || connection.region.firstRow < 1 || connection.region.lastRow < connection.region.firstRow || connection.region.lastRow > MAX_COUNTER_ROW || connection.region.startCounterRow < 1 || connection.region.startCounterRow > MAX_COUNTER_ROW} onClick={() => setConnection((current) => current ? { ...current, step: 3 } : current)}>다음</button></div></>}{connection.step === 3 && <><p>{connectionCounter?.name} · 현재 {connectionCounter?.kind === 'simple' ? connectionCounter.value : connectionCounter?.currentRow ?? 1}단</p><p>예상 진행선 위치: {connectionPosition === undefined ? '확인할 수 없음' : Math.round(connectionPosition * 100) + '%'} · {connection.region.direction === 'top-to-bottom' ? '위에서 아래' : '아래에서 위'} 방향</p><p>연결하면 카운터의 이름과 색을 따릅니다. 위치 보정은 카운터 숫자를 바꾸지 않습니다.</p><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setConnection((current) => current ? { ...current, step: 2 } : current)}>이전</button><button type="button" className="primary-button" onClick={saveConnection}>연결 완료</button></div></>}</div>}
          </section>
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
  const tabletResourcePolicy = getViewerResourcePolicy().tablet
  const reportMode = searchParams.get('report') === '1'
  const [showZoomHint, setShowZoomHint] = useState(() => {
    if (tabletResourcePolicy || zoomHintShownInSession) return false
    try {
      return !window.localStorage.getItem('doanbogo:pc-zoom-hint:v1')
    } catch { return true }
  })
  const areaRef = useRef<HTMLDivElement>(null)
  const thumbnailRailRef = useRef<HTMLDivElement>(null)
  const thumbnailMouseDragRef = useRef<{ pointerId: number; startX: number; scrollLeft: number; dragging: boolean } | null>(null)
  const counterActionQueueRef = useRef<Promise<void>>(Promise.resolve())
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
  const displayDocumentName = documentName.replace(/\.pdf$/i, '')
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
  const [pages, setPages] = useState<PageRecord[]>([])
  const pageVisibilityActionRef = useRef(false)
  const [pageVisibilitySaving, setPageVisibilitySaving] = useState(false)
  const [thumbnailUi, setThumbnailUi] = useState<{ documentId: string; error: string; selection: ThumbnailSelection | null }>(() => ({ documentId: id, error: '', selection: null }))
  const pageVisibilityError = thumbnailUi.documentId === id ? thumbnailUi.error : ''
  const thumbnailSelection = thumbnailUi.documentId === id ? thumbnailUi.selection : null
  const thumbnailTouchGestureRef = useRef<ThumbnailTouchGesture | null>(null)
  const suppressThumbnailClickRef = useRef(false)
  const [thumbnailCollapsed, setThumbnailCollapsed] = useState(() => tabletResourcePolicy)
  const thumbnailContentId = 'viewer-thumbnails-' + id.replace(/[^a-zA-Z0-9_-]/g, '-')
  const [pageWorks, setPageWorks] = useState<Record<number, PageWorkRecord>>({})
  const [histories, setHistories] = useState<Record<number, PageHistory>>({})
  const [tool, setTool] = useState<AnnotationTool>('pan')
  const [colorworkRequest, setColorworkRequest] = useState<ColorworkCreateRequest | null>(null)
  const [colorworkDialog, setColorworkDialog] = useState(false)
  const [colorworkBrushColor, setColorworkBrushColor] = useState('#F1C40F')
  const [colorworkBrushOpacity, setColorworkBrushOpacity] = useState(0.25)
  const [colorworkEraser, setColorworkEraser] = useState(false)
  const [progressDialog, setProgressDialog] = useState(false)
  const [pdfLinksByPage, setPdfLinksByPage] = useState<Record<number, PdfQrLink[]>>({})
  const pdfLinkPagesRef = useRef(new Map<number, true>())
  const recognitionLoadPendingRef = useRef(new Set<string>())
  const [qrLinksByPage, setQrLinksByPage] = useState<Record<number, PdfQrLink[]>>({})
  const qrLinksRef = useRef(new Map<number, PdfQrLink[]>())
  const recognitionRecordRef = useRef<Pick<DocumentRecord, 'id' | 'pageCount' | 'pdf'> | null>(null)
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
      const storedSnapshot = await getViewer(id, record.pageCount)
      const restored = initializedDocumentRef.current === id && snapshotRef.current ? snapshotRef.current : storedSnapshot
      restored.primary.page = clamp(restored.primary.page, 1, record.pageCount)
      restored.secondary.page = clamp(restored.secondary.page, 1, record.pageCount)
      const opened = await openPdf(record.pdf)
      if (disposed || viewerLifecycleRef.current === 'suspending' || viewerLifecycleRef.current === 'suspended') {
        await opened.dispose()
        return
      }
      recognitionPdf = opened.document
      recognitionRecordRef.current = { id, pageCount: record.pageCount, pdf: record.pdf }
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
      setSnapshot(restored)
      snapshotRef.current = restored
      setPdf(opened.document)
      const recognitionRecord = { id, pageCount: record.pageCount, pdf: record.pdf }
      enqueuePdfRecognition(recognitionRecord, opened.document)
      setLoadedId(id)
      initializedDocumentRef.current = id
      setLoadError(null)
      await markOpened(id)
      setPages(await getPages(id))
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
        setLoadError({ id, message: error instanceof Error ? error.message : pdfErrorMessage(error) })
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
  const selectedThumbnailPages = thumbnailSelection?.pages ?? []
  const selectedThumbnailSet = new Set(selectedThumbnailPages)
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
    loadingWork = getPageWork(id, page).then((loaded) => {
      if (workDocumentIdRef.current !== id) return loaded
      const current = workRef.current[page]
      if (current) {
        touchPageWork(page)
        return current
      }
      workRef.current = { ...workRef.current, [page]: loaded }
      touchPageWork(page)
      setPageWorks(workRef.current)
      return loaded
    }).finally(() => {
      if (pageWorkLoadRef.current.get(page) === loadingWork) pageWorkLoadRef.current.delete(page)
    })
    pageWorkLoadRef.current.set(page, loadingWork)
    return loadingWork
  }, [id, touchPageWork])

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

  function commitCounterTransaction(nextCounters: CounterSnapshot[], label: string, actualRow = 0, restoreGuides?: CounterHistoryEntry['guides'], saveHistory = true, autoPanY?: number) {
    const operation = counterActionQueueRef.current.then(async () => {
      const current = snapshotRef.current
      if (!current) return
      if (saveTimer.current !== undefined) window.clearTimeout(saveTimer.current)
      saveTimer.current = undefined
      const provisional = { ...current, counters: nextCounters, ...(autoPanY === undefined ? {} : { [current.activePane]: { ...current[current.activePane], centerY: autoPanY } }) }
      snapshotRef.current = provisional
      setSnapshot(provisional)
      try {
        await pageWorkPersistence.flushAll()
        const works = await getPageWorks(id)
        const counterById = new Map(nextCounters.map((counter) => [counter.id, counter]))
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
            const updateGuides = (guides: ProgressGuide[]) => guides.map((guide) => {
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
              if (!counter) return guide
              const updated = progressGuideForCounter(guide, counter)
              return updated.position === guide.position && updated.name === guide.name && updated.color === guide.color ? guide : updated
            })
            nextHorizontal = updateGuides(horizontalGuides)
            nextVertical = updateGuides(verticalGuides)
          }
          const changed = nextHorizontal.some((guide, index) => guide !== horizontalGuides[index]) || nextVertical.some((guide, index) => guide !== verticalGuides[index])
          if (!changed) continue
          beforeGuides.push({ pageNumber: work.pageNumber, horizontalGuides: horizontalGuides.map((guide) => ({ ...guide })), verticalGuides: verticalGuides.map((guide) => ({ ...guide })) })
          updatedWorks.push({ ...work, horizontalGuides: nextHorizontal, verticalGuides: nextVertical })
        }
        let counterHistory = current.counterHistory ?? []
        if (saveHistory) {
          const entry: CounterHistoryEntry = { id: crypto.randomUUID(), label, counters: normalizeCounterSnapshots(current.counters), guides: beforeGuides, actualRow, savedAt: Date.now() }
          counterHistory = [...counterHistory, entry].slice(-MAX_COUNTER_HISTORY)
        } else if (restoreGuides) {
          counterHistory = counterHistory.slice(0, -1)
        }
        const autoPanGuideStillLinked = current.counterGuideAutoPanId
          ? works.some((work) => [...(work.horizontalGuides ?? []), ...(work.verticalGuides ?? [])].some((guide) => guide.id === current.counterGuideAutoPanId && Boolean(guide.linkedCounterId && counterById.has(guide.linkedCounterId))))
          : false
        const nextSnapshot = { ...provisional, counterHistory, ...(current.counterGuideAutoPanId && !autoPanGuideStillLinked ? { counterGuideAutoPanId: null } : {}) }
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
      } catch (error) {
        console.warn('[PDF] Counter state could not be saved.', error)
        setSuspendError('카운터와 진행선을 저장하지 못했습니다. 저장 공간을 확인하고 다시 시도해 주세요.')
      }
    })
    counterActionQueueRef.current = operation.catch(() => {})
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
    commitCounterTransaction(nextCounters, label)
  }

  function advanceCounterGroup(counterId: string) {
    const current = snapshotRef.current
    if (!current) return
    const base = normalizeCounterSnapshots(current.counters).find((counter) => counter.id === counterId)
    if (!base || base.kind !== 'simple' || base.unit !== 'row' || base.linkedToId || base.value >= MAX_COUNTER_ROW) return
    const nextCounters = advanceLinkedCounters(normalizeCounterSnapshots(current.counters), counterId, base.value)
    const activePage = current[current.activePane].page
    const activeWork = workRef.current[activePage]
    const activeRotation = current[current.activePane].rotations?.[activePage] ?? activeWork?.rotation ?? 0
    const linkedGuide = [...(activeWork?.horizontalGuides ?? []), ...(activeWork?.verticalGuides ?? [])].find((guide) => guide.id === current.counterGuideAutoPanId && guide.linkedCounterId)
    const linkedCounter = linkedGuide ? nextCounters.find((counter) => counter.id === linkedGuide.linkedCounterId) : undefined
    const linkedRow = linkedCounter?.kind === 'simple' ? linkedCounter.value : linkedCounter?.currentRow ?? 1
    const autoPanY = linkedGuide && linkedCounter ? guidePositionForRotation(linkedGuide, linkedRow, activeRotation) : undefined
    commitCounterTransaction(nextCounters, base.name + ' · ' + base.value + '단 완료', base.value, undefined, true, autoPanY)
  }

  function moveCounterFromGuide(counterId: string, row: number) {
    const current = snapshotRef.current
    if (!current) return
    const currentCounters = normalizeCounterSnapshots(current.counters)
    const counter = currentCounters.find((item) => item.id === counterId)
    if (!counter) return
    let next: CounterSnapshot[]
    if (counter.linkedToId) {
      next = setCounterGroupRow(currentCounters, counter.linkedToId, row)
    } else if (counter.kind === 'simple' && counter.unit === 'row') {
      next = setCounterGroupRow(currentCounters, counter.id, row)
    } else if (counter.kind === 'pattern') {
      const start = counter.startRow ?? 1
      const length = counter.repeatLength ?? 1
      const patternRow = row < start ? 1 : ((row - start) % length) + 1
      next = currentCounters.map((item) => item.id === counter.id ? { ...item, currentRow: row, patternRow, value: patternRow } : item)
    } else if (counter.kind === 'task') {
      const taskRecords = (counter.taskRecords ?? []).filter((item) => item.row < row)
      const completedCount = taskRecords.filter((item) => item.status === 'done').length
      const first = counter.firstTaskRow ?? 1
      const interval = counter.interval ?? 1
      const nextTaskRow = first + Math.max(0, Math.ceil((row - first) / interval)) * interval
      next = currentCounters.map((item) => item.id === counter.id ? { ...item, currentRow: row, taskRecords, completedCount, value: completedCount, nextTaskRow } : item)
    } else {
      next = currentCounters.map((item) => item.id === counter.id ? { ...item, value: row } : item)
    }
    commitCounterTransaction(next, counter.name + ' 진행선을 ' + row + '단으로 이동', row)
  }

  function setCounterValue(counterId: string, value: number) {
    const current = snapshotRef.current
    if (!current) return
    const currentCounters = normalizeCounterSnapshots(current.counters)
    const selected = currentCounters.find((counter) => counter.id === counterId)
    const bounded = Math.max(0, Math.min(MAX_COUNTER_ROW, Math.trunc(value)))
    const next = selected?.kind === 'simple' && selected.unit === 'row' && !selected.linkedToId
      ? setCounterGroupRow(currentCounters, counterId, Math.max(1, bounded))
      : currentCounters.map((counter) => counter.id !== counterId ? counter : counter.kind === 'simple'
        ? { ...counter, value: bounded }
        : counter.kind === 'pattern' ? { ...counter, currentRow: Math.max(1, bounded) }
        : { ...counter, value: bounded, completedCount: bounded })
    const edited = next.find((counter) => counter.id === counterId)
    commitCounterTransaction(next, (edited?.name ?? '카운터') + ' 숫자 보정', edited?.kind === 'simple' ? edited.value : edited?.currentRow ?? 0)
  }

  function undoCounterAction() {
    const current = snapshotRef.current
    const history = current?.counterHistory ?? []
    const latest = history.at(-1)
    if (!current || !latest) return
    commitCounterTransaction(latest.counters, latest.label + ' 되돌리기', latest.actualRow, latest.guides, false)
  }

  function rewindCounter(baseId: string, targetRow: number) {
    const current = snapshotRef.current
    const counters = normalizeCounterSnapshots(current?.counters)
    const base = counters.find((counter) => counter.id === baseId)
    if (!current || !base || base.kind !== 'simple' || targetRow < 1 || targetRow > base.value) return
    const checkpoint = [...(current.counterHistory ?? [])].reverse().find((entry) => entry.actualRow === targetRow && entry.label.endsWith('단 완료'))
    let next = checkpoint ? checkpoint.counters : counters.map((counter) => {
      if (counter.id === baseId) return { ...counter, value: targetRow }
      if (counter.linkedToId !== baseId) return counter
      if (counter.kind === 'pattern') {
        const distance = Math.max(0, base.value - targetRow)
        const length = counter.repeatLength ?? 1
        const row = ((counter.patternRow ?? 1) - 1 - distance % length + length) % length + 1
        return { ...counter, currentRow: targetRow, patternRow: row, value: row }
      }
      if (counter.kind === 'task') {
        const records = (counter.taskRecords ?? []).filter((record) => record.row < targetRow)
        const completedCount = records.filter((record) => record.status === 'done').length
        const first = counter.firstTaskRow ?? 1
        const interval = counter.interval ?? 1
        const missed = Math.max(0, Math.ceil((targetRow - first) / interval))
        return { ...counter, currentRow: targetRow, completedCount, value: completedCount, taskRecords: records, nextTaskRow: Math.min(MAX_COUNTER_ROW, first + missed * interval) }
      }
      if (counter.kind === 'simple') return { ...counter, value: Math.max(0, counter.value - (base.value - targetRow)) }
      return counter
    })
    next = normalizeCounterSnapshots(next)
    commitCounterTransaction(next, checkpoint ? '단 되돌아가기' : '단 되돌아가기 · 예상 복원', targetRow, checkpoint?.guides)
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

  async function hidePage(pageNumber: number) {
    try {
      await applyPageVisibility([pageNumber], true)
    } catch (error) {
      setPageVisibilityError(error instanceof Error ? error.message : '페이지를 숨기지 못했습니다.')
    }
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

  function selectThumbnail(page: number) {
    if (!snapshot || hiddenNumbers.has(page)) return
    if (reportMode) setSearchParams({})
    mutateSnapshot((current) => ({ ...current, activePane: current.activePane, [current.activePane]: { ...current[current.activePane], page } }), true)
  }

  function updateThumbnailRange(gesture: ThumbnailTouchGesture) {
    const target = document.elementFromPoint(gesture.clientX, gesture.clientY)?.closest<HTMLElement>('.page-thumbnail[data-page-number]')
    const pageNumber = Number(target?.dataset.pageNumber)
    if (!Number.isInteger(pageNumber) || hiddenNumbers.has(pageNumber) || !pdf) return
    const visiblePages = Array.from({ length: pdf.numPages }, (_, index) => index + 1).filter((page) => !hiddenNumbers.has(page))
    const selectedPages = visiblePageRange(visiblePages, gesture.pageNumber, pageNumber)
    if (selectedPages.length) setThumbnailSelection({ pages: selectedPages, anchor: gesture.pageNumber, lastPage: pageNumber })
  }

  function beginThumbnailMouseDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse' || event.button !== 0 || event.ctrlKey || event.shiftKey || pageVisibilitySaving) return
    if ((event.target as HTMLElement).closest('.thumbnail-hide-button')) return
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
    if (event.pointerType !== 'touch' || hiddenNumbers.has(pageNumber) || pageVisibilitySaving || !thumbnailRailRef.current) return
    const gesture: ThumbnailTouchGesture = {
      pointerId: event.pointerId,
      pageNumber,
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
    gesture.timer = window.setTimeout(() => {
      if (thumbnailTouchGestureRef.current !== gesture || gesture.mode !== 'pending') return
      gesture.mode = 'select'
      setThumbnailSelection({ pages: [pageNumber], anchor: pageNumber, lastPage: pageNumber })
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
      gesture.mode = 'scroll'
    }
    if (gesture.mode === 'scroll') {
      if (rail && Math.abs(deltaX) > Math.abs(deltaY)) {
        event.preventDefault()
        rail.scrollLeft = gesture.startScrollLeft - deltaX
      }
      return
    }
    if (gesture.mode !== 'select' || !rail) return
    event.preventDefault()
    updateThumbnailRange(gesture)
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
    }
    if (gesture.button.hasPointerCapture(event.pointerId)) gesture.button.releasePointerCapture(event.pointerId)
  }

  function toggleThumbnailAccordion() {
    if (!thumbnailCollapsed) {
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
    if (pageVisibilitySaving) return
    setPageVisibilityError('')
    if (hiddenNumbers.has(pageNumber)) {
      void restoreHiddenPage(pageNumber)
      return
    }
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
      setPageVisibilityError(error instanceof Error ? error.message : '페이지를 숨기지 못했습니다.')
    }
  }

  async function restoreHiddenPage(pageNumber: number) {
    await restoreHiddenPages([pageNumber])
  }

  async function restoreHiddenPages(pageNumbers: number[]) {
    if (pageVisibilitySaving) return
    try {
      await applyPageVisibility(pageNumbers, false)
      setThumbnailSelection(null)
    } catch (error) {
      setPageVisibilityError(error instanceof Error ? error.message : '페이지를 복구하지 못했습니다.')
    }
  }

  async function toggleBookmark() {
    if (!snapshot) return
    await setPageFlag(id, activePage, 'bookmarked', !isBookmarked)
    setPages(await getPages(id))
  }

  async function applyPageVisibility(pageNumbers: number[], hidden: boolean) {
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

      const nextPages = completePageList(id, pdf.numPages, pages).map((page) => requestedPages.has(page.pageNumber) ? { ...page, hidden } : page)
      await setPagesFlag(id, requested, 'hidden', hidden)
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
    const style = tool === 'pen' || tool === 'line' || tool === 'highlight' || tool === 'text' ? annotationSettings[tool] : annotationSettings.pen
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
      onCounterGuideMove={moveCounterFromGuide}
      onZoom={(zoom) => changePane(paneId, (current) => ({ ...current, zoom }), true)}
      onColorworkRequestHandled={finishColorworkRequest}
      onTextToolConsumed={() => setTool('pan')}
      pageLinks={pdfLinksByPage[pane.page]}
      qrLinks={qrLinksByPage[pane.page]}
      onPageRendered={onPageRendered}
    />
  }

  const displayedRatio = splitPreview ?? ratio
  const pageRecords = pages.reduce((map, page) => map.set(page.pageNumber, page), new Map<number, PageRecord>())

  if (loadError?.id === id) return <main className="viewer-state"><div className="viewer-error-icon"><X size={22} /></div><h1>PDF를 열지 못했습니다</h1><p>{loadError.message}</p><button className="primary-button" onClick={requestPdfResume}>다시 시도</button><button className="secondary-button" onClick={() => navigate('/')}>도안 목록으로</button></main>
  if (suspended || loading || loadedId !== id) return <BrandLoading kind="pdf" requestId={'pdf:' + id + ':' + pdfOpenCycle} layout="screen" messageOverride={suspendError || undefined} />
  if (!pdf || !snapshot) return null

  return (
    <main className={'viewer-shell' + (reportMode ? ' report-mode' : '')}>
      {suspendError && <div className="viewer-save-warning" role="alert"><span>{suspendError}</span><button type="button" aria-label="저장 알림 닫기" onClick={() => setSuspendError('')}><X size={14} /></button></div>}
      {showZoomHint && !reportMode && <aside className="viewer-zoom-hint" role="status"><span>마우스 휠로 확대 · 이동 도구에서 드래그로 이동</span><button type="button" aria-label="확대·이동 안내 닫기" onClick={() => setShowZoomHint(false)}><X size={15} /></button></aside>}
      <header className="viewer-header">
        <div className="viewer-brand"><img src={yyLogo} alt="도안보고 로고" /><small>YY공동제작</small></div>
        <button className="viewer-back" aria-label="도안 목록으로" onClick={() => navigate('/')}><ArrowLeft size={20} /><span>내 도안</span></button>
        <div className="viewer-title"><div className="viewer-title-name"><strong title={displayDocumentName}>{displayDocumentName}</strong><button type="button" className="viewer-title-edit" aria-label="PDF 이름 변경" title="PDF 이름 변경" onClick={() => { setRenameDraft(displayDocumentName); setRenameError(''); setRenameDialog(true) }}><Pencil size={14} /></button></div><span>{reportMode ? '뜨개보고서' : snapshot[snapshot.activePane].page + ' / ' + pdf.numPages + ' 페이지'}</span></div>
        <div className="viewer-header-actions">
          {!reportMode && <>
            <button className={'viewer-action ' + (snapshot.split ? 'selected' : '')} onClick={toggleSplit}><Columns2 size={18} /><span>{snapshot.split ? '한 영역 보기' : '두 영역 보기'}</span></button>
            <button className={'viewer-action ' + (isBookmarked ? 'selected' : '')} type="button" aria-label={isBookmarked ? '북마크 해제' : '북마크'} title={isBookmarked ? '북마크 해제' : '북마크'} aria-pressed={isBookmarked} onClick={() => void toggleBookmark()}><Bookmark size={17} fill={isBookmarked ? 'currentColor' : 'none'} /><span>북마크</span></button>
          </>}
          {reportMode && <button className="viewer-action" onClick={() => setSearchParams({})}><ArrowLeft size={16} /><span>도안으로 돌아가기</span></button>}
        </div>
      </header>
      <section className={'pdf-work-area' + (reportMode ? ' report-work-area' : '')}>
        <div className={'pdf-document-area ' + (reportMode ? '' : snapshot.split ? (orientation === 'wide' ? 'split-wide' : 'split-tall') : 'single-pane')} ref={areaRef}>
        {reportMode ? <KnittingReport documentId={id} fileName={documentName} pageCount={pdf.numPages} onBack={() => setSearchParams({})} /> : snapshot.split ? <>
          <div className="split-section" style={orientation === 'wide' ? { flex: '0 0 ' + splitBasis(displayedRatio) } : { width: '100%', flex: '0 0 ' + splitBasis(displayedRatio) }}>{renderPane('primary', snapshot.primary, snapshot.activePane === 'primary')}</div>
          <button className={'split-divider ' + orientation} aria-label="영역 크기 조정" onPointerDown={beginDivider} onPointerMove={moveDivider} onPointerUp={finishDivider} onPointerCancel={finishDivider} onLostPointerCapture={finishDivider}><span /></button>
          <div className="split-section split-section-secondary" style={orientation === 'wide' ? { flex: '0 0 ' + splitBasis(1 - displayedRatio) } : { width: '100%', flex: '0 0 ' + splitBasis(1 - displayedRatio) }}>{renderPane('secondary', snapshot.secondary, snapshot.activePane === 'secondary')}</div>
        </> : renderPane(snapshot.activePane, snapshot[snapshot.activePane], true)}
        </div>
        {!reportMode && counterPanelVisible && <CounterPanel snapshot={snapshot} counters={counters} onChange={updateCounterPanel} onAdvance={advanceCounterGroup} onUndo={undoCounterAction} onRewind={rewindCounter} onCounterValue={setCounterValue} />}
      </section>
      <section className={'viewer-footer' + (thumbnailCollapsed ? ' thumbnail-collapsed' : '')}>
        <button
          type="button"
          className="thumbnail-accordion-button"
          aria-expanded={!thumbnailCollapsed}
          aria-controls={thumbnailContentId}
          aria-label={thumbnailCollapsed ? '썸네일 펼치기' : '썸네일 접기'}
          title={thumbnailCollapsed ? '썸네일 펼치기' : '썸네일 접기'}
          onClick={toggleThumbnailAccordion}
        >
          {thumbnailCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
        <div id={thumbnailContentId} className="thumbnail-content" hidden={thumbnailCollapsed}>
        {!thumbnailCollapsed && <>
        <div className="page-thumbnail-strip" aria-label="모든 페이지 썸네일" ref={thumbnailRailRef} onScroll={handleThumbnailScroll}
          onWheel={(event) => {
            if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return
            const rail = event.currentTarget
            const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rail.clientWidth : 1)
            rail.scrollLeft += delta
          }}
          onPointerDown={beginThumbnailMouseDrag} onPointerMove={moveThumbnailMouseDrag}
          onPointerUp={finishThumbnailMouseDrag} onPointerCancel={finishThumbnailMouseDrag} onLostPointerCapture={finishThumbnailMouseDrag}
          onDragStart={(event) => event.preventDefault()}
          onClickCapture={(event) => {
            if (!suppressThumbnailClickRef.current) return
            suppressThumbnailClickRef.current = false
            event.preventDefault()
            event.stopPropagation()
          }}
        >
          {compactPageThumbnails(pdf.numPages, hiddenNumbers).map((item) => {
            if (item.type === 'hidden-run') {
              const pageNumbers = Array.from({ length: item.lastPage - item.firstPage + 1 }, (_, index) => item.firstPage + index)
              const hiddenCount = pageNumbers.length
              return <div className="page-thumbnail-entry" key={'hidden-' + item.firstPage}>
                <button
                  type="button"
                  className="hidden-thumbnail-run-button"
                  aria-label={item.firstPage === item.lastPage ? item.firstPage + '페이지 숨김, 클릭하여 복구' : item.firstPage + '–' + item.lastPage + '페이지 숨김, 클릭하여 복구'}
                  title={hiddenCount + '개 숨긴 페이지 복구'}
                  disabled={pageVisibilitySaving}
                  onClick={() => void restoreHiddenPages(pageNumbers)}
                ><span aria-hidden="true">•••</span></button>
              </div>
            }

            const page = item.pageNumber
            const state = pageRecords.get(page)
            const active = snapshot[snapshot.activePane].page === page
            const selected = selectedThumbnailSet.has(page)
            return <div className="page-thumbnail-entry" key={page}>
              <PdfThumbnail
                pdf={pdf} pageNumber={page} active={active} hidden={false} bookmarked={Boolean(state?.bookmarked)} selected={selected}
                disabled={pageVisibilitySaving} root={thumbnailRailRef}
                onSelect={(event) => handleThumbnailSelect(page, event)}
                onPointerDown={(event) => beginThumbnailTouch(page, event)}
                onPointerMove={moveThumbnailTouch}
                onPointerUp={finishThumbnailTouch}
                onPointerCancel={(event) => finishThumbnailTouch(event, true)}
                onLostPointerCapture={(event) => finishThumbnailTouch(event, true)}
              />
              {selected && thumbnailSelection?.lastPage === page && <button
                type="button"
                className="thumbnail-hide-button"
                aria-label={'선택한 ' + selectedThumbnailPages.length + '개 페이지 숨김'}
                title={hideSelectionWouldRemoveLastPage ? '최소 한 페이지는 표시 상태로 남아야 합니다.' : '선택한 페이지 숨김'}
                disabled={pageVisibilitySaving || hideSelectionWouldRemoveLastPage}
                onClick={() => void hideSelectedThumbnails()}
              ><EyeOff size={13} /><span>{pageVisibilitySaving ? '저장 중' : '숨김'}</span></button>}
            </div>
          })}
          <button className={'report-thumbnail' + (reportMode ? ' active' : '')} aria-label="뜨개보고서 열기" aria-current={reportMode ? 'page' : undefined} onClick={() => setSearchParams({ report: '1' })}>
            <span className="report-thumbnail-icon">+<i>7</i></span><strong>뜨개보고서</strong><small>보고서 보기</small>
          </button>
        </div>
        {(selectedThumbnailPages.length > 0 || pageVisibilityError) && <div className="thumbnail-selection-feedback">
          {selectedThumbnailPages.length > 0 && <span>{selectedThumbnailPages.length}개 페이지 선택</span>}
          {hideSelectionWouldRemoveLastPage && <span role="status">최소 한 페이지는 표시 상태로 남아야 합니다.</span>}
          {pageVisibilityError && <span role="alert">{pageVisibilityError}</span>}
        </div>}
        </>}
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
                <label title="색칠 색상"><input aria-label="컬러워크 색상" type="color" value={colorworkBrushColor} onClick={() => { if (colorworkEraser) setColorworkEraser(false) }} onChange={(event) => setColorworkBrushColor(event.currentTarget.value)} /></label>
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
            {!activeColorworkGrid?.visible && <>
              <span className="control-separator" />
              <button className="viewer-tool" aria-label="진행선 설정" title="가로·세로 진행선 설정" disabled={!pageWorks[activePage]} onClick={() => setProgressDialog(true)}><SlidersHorizontal size={17} /><span>진행선</span></button>
            </>}
            <span className="control-separator" />
            <button className="viewer-tool compact-tool" aria-label="실행 취소" title="실행 취소" disabled={!canUndo} onClick={() => undoRedo('undo')}><Undo2 size={17} /></button>
            <button className="viewer-tool compact-tool" aria-label="다시 실행" title="다시 실행" disabled={!canRedo} onClick={() => undoRedo('redo')}><Redo2 size={17} /></button>
          </div>
          <div className="viewer-page-controls" role="group" aria-label="PDF 페이지 조작">
            <span className="viewer-page-target">{snapshot.split ? (orientation === 'wide' ? (snapshot.activePane === 'primary' ? '왼쪽' : '오른쪽') : (snapshot.activePane === 'primary' ? '위쪽' : '아래쪽')) + ' · ' : ''}{activePage}페이지</span>
            <button type="button" className="viewer-page-control-button" aria-label={activePage + '페이지 숨기기'} title={pdf.numPages - hiddenNumbers.size > 1 ? activePage + '페이지 숨기기' : '최소 한 페이지는 표시 상태로 남아야 합니다.'} disabled={!pageWorks[activePage] || pageVisibilitySaving || pdf.numPages - hiddenNumbers.size <= 1} onClick={() => { void hidePage(activePage) }}><EyeOff size={17} /></button>
            <button type="button" className="viewer-page-control-button" aria-label="시계 방향 90도 회전" title={'90도 회전 · 현재 ' + activeRotation + '도'} disabled={!pageWorks[activePage]} onClick={() => rotatePage(snapshot.activePane, activePage)}><RotateCw size={17} /></button>
            <button type="button" className="viewer-page-control-button" aria-label="축소" title="25% 축소" disabled={activeZoom <= 1} onClick={() => changePane(snapshot.activePane, (pane) => ({ ...pane, zoom: Math.max(1, Math.round((pane.zoom - 0.25) * 100) / 100) }), true)}><Minus size={17} /></button>
            <span className="viewer-page-zoom" aria-label={'확대 배율 ' + Math.round(activeZoom * 100) + '%'}>{Math.round(activeZoom * 100)}%</span>
            <button type="button" className="viewer-page-control-button" aria-label="확대" title="25% 확대" disabled={activeZoom >= 5} onClick={() => changePane(snapshot.activePane, (pane) => ({ ...pane, zoom: Math.min(5, Math.round((pane.zoom + 0.25) * 100) / 100) }), true)}><Plus size={17} /></button>
            <button type="button" className="viewer-page-control-button" aria-label="화면 맞춤" title="100% 확대와 페이지 중앙으로 맞춤" onClick={() => changePane(snapshot.activePane, (pane) => ({ ...pane, zoom: 1, centerX: 0.5, centerY: 0.5 }), true)}><Maximize2 size={16} /></button>
          </div>
          <div className="viewer-navigation">
            <button className={'viewer-tool ' + (counterPanelVisible ? 'active' : '')} type="button" aria-label="숫자 카운터" title="숫자 카운터" aria-pressed={counterPanelVisible} onClick={() => setSavedCounterSession({ documentId: id, visible: !counterPanelVisible })}><Hash size={17} /><span>카운터</span></button>
            <span className="control-separator" />
            <button className="text-control" disabled={activePage <= 1} onClick={() => stepPage(-1)}>이전</button>
            <label className="page-jump"><input key={activePage} aria-label="페이지 번호 입력" type="number" min="1" max={pdf.numPages} defaultValue={activePage} onBlur={(event) => jumpToPage(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === 'Enter') { jumpToPage(event.currentTarget.value); event.currentTarget.blur() } }} /><span>/ {pdf.numPages}</span></label>
            <button className="text-control" disabled={activePage >= pdf.numPages && hiddenNumbers.size === 0} onClick={() => stepPage(1)}>{activePage >= pdf.numPages ? '보고서' : '다음'}</button>
          </div>
        </section>}
      </section>
      {renameDialog && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRenameDialog(false) }}><section className="modal-card" role="dialog" aria-modal="true" aria-label="PDF 이름 변경"><div className="modal-heading"><h2>PDF 이름 변경</h2><button className="icon-button" aria-label="닫기" onClick={() => setRenameDialog(false)}><X size={20} /></button></div><form className="modal-form" onSubmit={(event) => void saveDocumentName(event)}><label htmlFor="viewer-pdf-name">PDF 이름</label><input id="viewer-pdf-name" autoFocus required maxLength={120} value={renameDraft} onChange={(event) => setRenameDraft(event.currentTarget.value)} />{renameError && <p className="rename-error" role="alert">{renameError}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setRenameDialog(false)}>취소</button><button className="primary-button" type="submit"><Check size={17} />저장</button></div></form></section></div>}
      {progressDialog && <ProgressSettingsDialog
        settings={progressSettings}
        work={activeWork}
        counters={counters}
        rotation={activeRotation}
        autoPanGuideId={snapshot.counterGuideAutoPanId ?? null}
        onAutoPanChange={(guideId) => mutateSnapshot((current) => ({ ...current, counterGuideAutoPanId: guideId }), true)}
        onCounterGuideMove={moveCounterFromGuide}
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
    </main>
  )
}
