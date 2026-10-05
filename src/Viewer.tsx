import { useCallback, useEffect, useRef, useState, type FormEvent as ReactFormEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type UIEvent as ReactUIEvent } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Bookmark, Check, ChevronDown, ChevronUp, Columns2, Eraser, Eye, EyeOff, Grid3X3, Hash, Highlighter, Minus, MousePointer2, Pencil, Plus, Redo2, RotateCw, Settings2, SlidersHorizontal, Type, Undo2, X } from 'lucide-react'
import BrandLoading from './BrandLoading'
import yyLogo from './assets/yy-logo.png'
import { cancelThumbnailRenders, PdfPage, PdfThumbnail, setThumbnailRenderingPaused, waitForThumbnailQueueIdle } from './PdfPage'
import { getDocument, getPageRecognition, getPageWork, getPages, getViewer, markOpened, renameDocument, savePageWork, saveViewer, setPageFlag, setPagesFlag } from './storage'
import { pdfPageRenderQueue } from './pdfPageRenderQueue'
import { openPdf, pdfErrorMessage } from './pdf'
import KnittingReport from './KnittingReport'
import type { AnnotationSettings, AnnotationStyle, AnnotationTool, ColorworkCreateRequest, ColorworkSettings, CounterSnapshot, CounterTaskRule, DocumentRecord, PageRecord, PageRotation, PageWorkRecord, PaneId, PaneSnapshot, ProgressSettings, ViewerSnapshot } from './types'
import { defaultColorworkSettings, getColorworkDimensions, resizeColorworkGrid } from './colorwork'
import { clampCounterValue, counterValueFromInput } from './counter'
import { MAX_COUNTER_ROW, MAX_COUNTER_TASK_RULES, counterPatternState, counterTaskProgress, counterTaskKey, createCounterTaskRule, dueCounterTasks, normalizeCounterSnapshots, setCounterTaskOccurrences } from './smartCounter'
import type { PdfQrLink } from './qr'
import { withRecentPdfLinks } from './pdfRecognitionState'
import { applyColorworkCellChanges, type ColorworkCellChange } from './colorworkHistory'
import { PageWorkPersistence } from './pageWorkPersistence'
import { enqueuePdfRecognition, releasePdfRecognitionViewer, subscribePdfRecognition, updatePdfRecognitionPageVisibility } from './pdfRecognition'
import { getViewerResourcePolicy } from './pdfRenderResources'
import { canHidePageSelection, compactPageThumbnails, completePageList, nextVisiblePageAfterHide, visiblePageRange } from './pageManagement'

type Size = { width: number; height: number }
type WorkAction = { before?: PageWorkRecord; after?: PageWorkRecord; cellChanges?: ColorworkCellChange[] }
type PageHistory = { actions: WorkAction[]; cursor: number; byteCosts: number[] }
type CounterSessionState = { documentId: string; visible: boolean; activeIndex: number; expanded: boolean; editingIndex: number | null; draft: string; popoverPosition: CounterPopoverPosition | null; dismissedAlertKey: string | null; advanceConfirmation: boolean; historyExpanded: boolean }
type CounterPopoverPosition = { x: number; y: number }
type CounterPopoverDrag = { pointerId: number; offsetX: number; offsetY: number; width: number; height: number }
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

function createCounterSession(documentId: string): CounterSessionState {
  return { documentId, visible: false, activeIndex: 0, expanded: false, editingIndex: null, draft: '', popoverPosition: null, dismissedAlertKey: null, advanceConfirmation: false, historyExpanded: false }
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
const viewerSaveErrorMessage = '뷰어 위치를 저장하지 못했습니다. 저장 공간을 확인하고 다시 시도해 주세요.'
const pageWorkSaveErrorMessage = '페이지 작업을 저장하지 못했습니다. 저장 공간을 확인하고 다시 시도해 주세요.'

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

function CounterSettingsDialog({ initial, index, onClose, onSave }: {
  initial: CounterSnapshot
  index: number
  onClose: () => void
  onSave: (counter: CounterSnapshot) => void
}) {
  const [draft, setDraft] = useState<CounterSnapshot>({ ...initial, taskRules: initial.taskRules.map((rule) => ({ ...rule })), taskOccurrences: initial.taskOccurrences.map((item) => ({ ...item })) })
  const patternState = counterPatternState(draft)

  function update(change: Partial<CounterSnapshot>) {
    setDraft((current) => ({ ...current, ...change }))
  }

  function changeMode(mode: CounterSnapshot['mode']) {
    setDraft((current) => ({
      ...current,
      mode,
      value: mode === 'repeat' ? Math.max(1, current.value) : Math.min(99, current.value),
    }))
  }

  function updateRule(ruleId: string, change: Partial<CounterTaskRule>) {
    setDraft((current) => ({ ...current, taskRules: current.taskRules.map((rule) => rule.id === ruleId ? { ...rule, ...change } : rule) }))
  }

  function removeRule(ruleId: string) {
    setDraft((current) => ({
      ...current,
      taskRules: current.taskRules.filter((rule) => rule.id !== ruleId),
      taskOccurrences: current.taskOccurrences.filter((item) => item.ruleId !== ruleId),
    }))
  }

  function save(event: ReactFormEvent<HTMLFormElement>) {
    event.preventDefault()
    const unchangedRuleIds = new Set(draft.taskRules.filter((rule) => {
      const previous = initial.taskRules.find((item) => item.id === rule.id)
      return previous && previous.kind === rule.kind && previous.interval === rule.interval && previous.total === rule.total
    }).map((rule) => rule.id))
    onSave({
      ...draft,
      repeatName: draft.repeatName.trim() || '무늬',
      taskOccurrences: draft.taskOccurrences.filter((item) => unchangedRuleIds.has(item.ruleId)),
    })
  }

  const preview = patternState.kind === 'before'
    ? '전체 ' + draft.value + '단 · ' + draft.startRow + '단부터 시작'
    : patternState.kind === 'complete'
      ? '전체 ' + draft.value + '단 · 반복 완료'
      : '전체 ' + draft.value + '단 → ' + draft.repeatName + ' ' + patternState.patternRow + '단 · ' + patternState.repeatNumber + '회차'

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <form className="modal-card counter-settings-modal" role="dialog" aria-modal="true" aria-label={'카운터 ' + (index + 1) + ' 설정'} onSubmit={save}>
        <div className="modal-heading"><div><p className="eyebrow">SMART COUNTER</p><h2>카운터 {index + 1} 설정</h2></div><button type="button" className="icon-button" aria-label="닫기" onClick={onClose}><X size={20} /></button></div>
        <div className="counter-settings-body">
          <div className="counter-mode-switch" aria-label="카운터 유형">
            <button type="button" className={draft.mode === 'simple' ? 'selected' : ''} aria-pressed={draft.mode === 'simple'} onClick={() => changeMode('simple')}>단순 카운터</button>
            <button type="button" className={draft.mode === 'repeat' ? 'selected' : ''} aria-pressed={draft.mode === 'repeat'} onClick={() => changeMode('repeat')}>반복 카운터</button>
          </div>
          {draft.mode === 'repeat' && <>
            <label className="counter-settings-field">반복 이름<input required maxLength={100} value={draft.repeatName} onChange={(event) => update({ repeatName: event.currentTarget.value })} /></label>
            <div className="counter-settings-grid">
              <label className="counter-settings-field">시작 단<input required type="number" min="1" max={MAX_COUNTER_ROW} value={draft.startRow} onChange={(event) => update({ startRow: Number(event.currentTarget.value) })} /></label>
              <label className="counter-settings-field">반복 길이<input required type="number" min="1" max={MAX_COUNTER_ROW} value={draft.repeatLength} onChange={(event) => update({ repeatLength: Number(event.currentTarget.value) })} /></label>
            </div>
            <div className="counter-repeat-limit">
              <strong>반복 횟수</strong>
              <label><input type="radio" name="counter-repeat-limit" checked={draft.repeatCount === null} onChange={() => update({ repeatCount: null })} />계속 반복</label>
              <label><input type="radio" name="counter-repeat-limit" checked={draft.repeatCount !== null} onChange={() => update({ repeatCount: draft.repeatCount ?? 1 })} />횟수 지정</label>
              <input aria-label="반복 횟수 지정" required type="number" min="1" max={MAX_COUNTER_ROW} disabled={draft.repeatCount === null} value={draft.repeatCount ?? 1} onChange={(event) => update({ repeatCount: Number(event.currentTarget.value) })} />
            </div>
            <div className="counter-settings-preview"><strong>미리보기</strong><span>{preview}</span></div>
            <section className="counter-task-settings" aria-label="줄임 늘림 알림 설정">
              <div className="counter-task-settings-heading"><strong>줄임·늘림 알림</strong><span>{draft.taskRules.length}/{MAX_COUNTER_TASK_RULES}</span></div>
              {draft.taskRules.map((rule, ruleIndex) => <div className="counter-task-setting" key={rule.id}>
                <label>작업<select aria-label={'알림 ' + (ruleIndex + 1) + ' 작업'} value={rule.kind} onChange={(event) => updateRule(rule.id, { kind: event.currentTarget.value as CounterTaskRule['kind'] })}>
                  <option value="decrease">줄임</option><option value="increase">늘림</option>
                </select></label>
                <label>간격<input aria-label={'알림 ' + (ruleIndex + 1) + ' 간격'} required type="number" min="1" max={MAX_COUNTER_ROW} value={rule.interval} onChange={(event) => updateRule(rule.id, { interval: Number(event.currentTarget.value) })} /><span>단마다</span></label>
                <label>횟수<input aria-label={'알림 ' + (ruleIndex + 1) + ' 횟수'} required type="number" min="1" max={MAX_COUNTER_ROW} value={rule.total} onChange={(event) => updateRule(rule.id, { total: Number(event.currentTarget.value) })} /></label>
                <button type="button" className="icon-button" aria-label={'알림 ' + (ruleIndex + 1) + ' 삭제'} onClick={() => removeRule(rule.id)}><X size={16} /></button>
              </div>)}
              <button type="button" className="secondary-button counter-task-add" disabled={draft.taskRules.length >= MAX_COUNTER_TASK_RULES} onClick={() => update({ taskRules: [...draft.taskRules, createCounterTaskRule()] })}><Plus size={15} />줄임·늘림 알림 추가</button>
              <p>간격은 전체 단수 기준입니다. 예: 6단마다 8회면 6·12·18단에 알림이 표시됩니다.</p>
            </section>
          </>}
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>취소</button><button type="submit" className="primary-button"><Check size={17} />설정 저장</button></div>
        </div>
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
  const areaRef = useRef<HTMLDivElement>(null)
  const thumbnailRailRef = useRef<HTMLDivElement>(null)
  const counterPopoverAreaRef = useRef<HTMLElement>(null)
  const counterPopoverRef = useRef<HTMLElement>(null)
  const counterPopoverDragRef = useRef<CounterPopoverDrag | null>(null)
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
  const { visible: counterPanelVisible, activeIndex: activeCounterIndex, expanded: countersExpanded, editingIndex: editingCounterIndex, draft: counterDraft, popoverPosition: counterPopoverPosition } = counterSession
  const counters = normalizeCounterSnapshots(snapshot?.counters)
  const activeCounter = counters[activeCounterIndex]
  const currentDueTasks = dueCounterTasks(activeCounter)
  const pendingDueTasks = currentDueTasks.filter((task) => task.status === undefined)
  const currentDueKey = activeCounterIndex + ':' + currentDueTasks.map((task) => counterTaskKey(task.rule.id, task.occurrence)).join('|')
  const missedCounterTasks = activeCounter.taskOccurrences.filter((item) => item.status === 'missed').flatMap((item) => {
    const rule = activeCounter.taskRules.find((candidate) => candidate.id === item.ruleId)
    return rule ? [{ rule, occurrence: item.occurrence }] : []
  })
  const counterInputRef = useRef<HTMLInputElement>(null)
  const cancelCounterBlur = useRef(false)
  const [counterSettingsOpen, setCounterSettingsOpen] = useState(false)
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
    if (editingCounterIndex === null) return
    counterInputRef.current?.focus()
    counterInputRef.current?.select()
  }, [editingCounterIndex])

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
    if (viewerLifecycleRef.current !== 'active' || hasPdfLinks && hasQrLinks || recognitionLoadPendingRef.current.has(scanKey)) return
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
  }, [id])

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
      enqueuePdfRecognition({ id, pageCount: record.pageCount, pdf: record.pdf }, opened.document)
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

  function updateCounterSession(change: (current: CounterSessionState) => CounterSessionState) {
    setSavedCounterSession((current) => change(current.documentId === id ? current : createCounterSession(id)))
  }

  function updateCounter(index: number, change: (current: CounterSnapshot) => CounterSnapshot, immediate = true) {
    const current = snapshotRef.current
    if (!current) return
    const nextCounters = normalizeCounterSnapshots(current.counters)
    nextCounters[index] = change(nextCounters[index])
    pushSnapshot({ ...current, counters: nextCounters }, immediate)
  }

  function adjustCounter(index: number, amount: number) {
    updateCounter(index, (counter) => ({
      ...counter,
      value: counter.mode === 'repeat'
        ? clampCounterValue(counter.value + amount, 1, MAX_COUNTER_ROW)
        : clampCounterValue(counter.value + amount),
    }), false)
    updateCounterSession((current) => ({ ...current, advanceConfirmation: false, dismissedAlertKey: null }))
  }

  function commitCounterEdit(index: number, rawValue: string) {
    updateCounter(index, (counter) => ({
      ...counter,
      value: counterValueFromInput(rawValue, counter.value, counter.mode === 'repeat' ? 1 : 0, counter.mode === 'repeat' ? MAX_COUNTER_ROW : 99),
    }))
    updateCounterSession((current) => ({ ...current, editingIndex: null, advanceConfirmation: false, dismissedAlertKey: null }))
  }

  function advanceCounter(index: number, status?: 'done' | 'missed') {
    const currentCounter = normalizeCounterSnapshots(snapshotRef.current?.counters)[index]
    const dueTasks = dueCounterTasks(currentCounter)
    updateCounter(index, (counter) => {
      const tasksToMark = status === 'missed' ? dueTasks.filter((task) => task.status === undefined) : dueTasks
      const withTasks = status ? setCounterTaskOccurrences(counter, tasksToMark, status) : counter
      const maximum = counter.mode === 'repeat' ? MAX_COUNTER_ROW : 99
      return { ...withTasks, value: Math.min(maximum, counter.value + 1) }
    })
    updateCounterSession((current) => ({ ...current, advanceConfirmation: false, dismissedAlertKey: null }))
  }

  function requestCounterAdvance(index: number) {
    const counter = normalizeCounterSnapshots(snapshotRef.current?.counters)[index]
    if (counter.value >= (counter.mode === 'repeat' ? MAX_COUNTER_ROW : 99)) return
    if (dueCounterTasks(counter).some((task) => task.status === undefined)) {
      updateCounterSession((current) => ({ ...current, advanceConfirmation: true }))
      return
    }
    advanceCounter(index)
  }

  function markCurrentCounterTasksDone(index: number) {
    const counter = normalizeCounterSnapshots(snapshotRef.current?.counters)[index]
    const tasks = dueCounterTasks(counter).filter((task) => task.status !== 'done')
    if (tasks.length) updateCounter(index, (current) => setCounterTaskOccurrences(current, tasks, 'done'))
  }

  function clearCurrentCounterTaskCompletion(index: number) {
    const counter = normalizeCounterSnapshots(snapshotRef.current?.counters)[index]
    const tasks = dueCounterTasks(counter).filter((task) => task.status === 'done')
    if (tasks.length) updateCounter(index, (current) => setCounterTaskOccurrences(current, tasks))
  }

  function markMissedCounterTaskDone(index: number, rule: CounterTaskRule, occurrence: number) {
    updateCounter(index, (counter) => setCounterTaskOccurrences(counter, [{ rule, occurrence }], 'done'))
  }

  function beginCounterPopoverDrag(event: ReactPointerEvent<HTMLElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const panel = counterPopoverRef.current
    const area = counterPopoverAreaRef.current
    if (!panel || !area) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const panelBounds = panel.getBoundingClientRect()
    const areaBounds = area.getBoundingClientRect()
    counterPopoverDragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - panelBounds.left,
      offsetY: event.clientY - panelBounds.top,
      width: panelBounds.width,
      height: panelBounds.height,
    }
    updateCounterSession((current) => ({ ...current, popoverPosition: { x: panelBounds.left - areaBounds.left, y: panelBounds.top - areaBounds.top } }))
  }

  function moveCounterPopover(event: ReactPointerEvent<HTMLElement>) {
    const drag = counterPopoverDragRef.current
    const area = counterPopoverAreaRef.current
    if (!drag || drag.pointerId !== event.pointerId || !area) return
    event.preventDefault()
    event.stopPropagation()
    const bounds = area.getBoundingClientRect()
    const x = clamp(event.clientX - bounds.left - drag.offsetX, 8, Math.max(8, bounds.width - drag.width - 8))
    const y = clamp(event.clientY - bounds.top - drag.offsetY, 8, Math.max(8, bounds.height - drag.height - 8))
    updateCounterSession((current) => ({ ...current, popoverPosition: { x, y } }))
  }

  function finishCounterPopoverDrag(event: ReactPointerEvent<HTMLElement>) {
    if (counterPopoverDragRef.current?.pointerId === event.pointerId) counterPopoverDragRef.current = null
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

  async function selectThumbnail(page: number) {
    if (!snapshot || hiddenNumbers.has(page)) return
    await ensurePageWork(page)
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
    <main className="viewer-shell">
      {suspendError && <div className="viewer-save-warning" role="alert"><span>{suspendError}</span><button type="button" aria-label="저장 알림 닫기" onClick={() => setSuspendError('')}><X size={14} /></button></div>}
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
      <section ref={counterPopoverAreaRef} className={'pdf-work-area' + (reportMode ? ' report-work-area' : '')}>
        <div className={'pdf-document-area ' + (reportMode ? '' : snapshot.split ? (orientation === 'wide' ? 'split-wide' : 'split-tall') : 'single-pane')} ref={areaRef}>
        {reportMode ? <KnittingReport documentId={id} fileName={documentName} /> : snapshot.split ? <>
          <div className="split-section" style={orientation === 'wide' ? { flex: '0 0 ' + splitBasis(displayedRatio) } : { width: '100%', flex: '0 0 ' + splitBasis(displayedRatio) }}>{renderPane('primary', snapshot.primary, snapshot.activePane === 'primary')}</div>
          <button className={'split-divider ' + orientation} aria-label="영역 크기 조정" onPointerDown={beginDivider} onPointerMove={moveDivider} onPointerUp={finishDivider} onPointerCancel={finishDivider} onLostPointerCapture={finishDivider}><span /></button>
          <div className="split-section split-section-secondary" style={orientation === 'wide' ? { flex: '0 0 ' + splitBasis(1 - displayedRatio) } : { width: '100%', flex: '0 0 ' + splitBasis(1 - displayedRatio) }}>{renderPane('secondary', snapshot.secondary, snapshot.activePane === 'secondary')}</div>
        </> : renderPane(snapshot.activePane, snapshot[snapshot.activePane], true)}
        </div>
        {!reportMode && counterPanelVisible && <aside
          ref={counterPopoverRef}
          id="viewer-number-counters"
          className="number-counter-panel"
          aria-label="숫자 카운터"
          style={counterPopoverPosition ? { left: counterPopoverPosition.x, top: counterPopoverPosition.y, right: 'auto' } : undefined}
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <header className="number-counter-header" title="드래그해 위치 이동" onPointerDown={beginCounterPopoverDrag} onPointerMove={moveCounterPopover} onPointerUp={finishCounterPopoverDrag} onPointerCancel={finishCounterPopoverDrag} onLostPointerCapture={finishCounterPopoverDrag}>
            <strong>{activeCounter.mode === 'repeat' ? activeCounter.repeatName : '카운터 ' + (activeCounterIndex + 1)}</strong>
            <span>{activeCounter.mode === 'repeat' ? '반복 카운터' : '단순 카운터'}</span>
            <button type="button" className="number-counter-settings-button" aria-label={'카운터 ' + (activeCounterIndex + 1) + ' 설정'} title="카운터 설정" onPointerDown={(event) => event.stopPropagation()} onClick={() => setCounterSettingsOpen(true)}><Settings2 size={16} /></button>
          </header>
          <button type="button" className="number-counter-list-toggle" aria-expanded={countersExpanded} onClick={() => updateCounterSession((current) => ({ ...current, expanded: !current.expanded }))}>
            <span>카운터 목록</span>{countersExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
          {countersExpanded && <div className="number-counter-list" aria-label="카운터 5개">
            {counters.map((counter, index) => {
              const state = counter.mode === 'repeat' ? counterPatternState(counter) : null
              const detail = counter.mode === 'simple' ? '단순 · ' + counter.value : state?.kind === 'active' ? counter.repeatName + ' ' + state.patternRow + ' / ' + counter.repeatLength + '단 · ' + state.repeatNumber + '회차' : state?.kind === 'complete' ? '반복 완료' : counter.repeatName + ' · 시작 전'
              return <button type="button" key={index} className={'number-counter-list-item' + (index === activeCounterIndex ? ' active' : '')} aria-pressed={index === activeCounterIndex} onClick={() => updateCounterSession((current) => ({ ...current, activeIndex: index, expanded: false, editingIndex: null, advanceConfirmation: false, dismissedAlertKey: null, historyExpanded: false }))}>
                <strong>{counter.mode === 'repeat' ? counter.repeatName : '카운터 ' + (index + 1)}</strong><span>{counter.mode === 'repeat' ? '전체 ' + counter.value + '단 · ' + detail : detail}</span>
              </button>
            })}
          </div>}
          <div className="number-counter-summary">
            {activeCounter.mode === 'repeat' ? <>
              <strong className="number-counter-total">전체 {activeCounter.value}단</strong>
              {(() => {
                const state = counterPatternState(activeCounter)
                if (state.kind === 'before') return <p>{activeCounter.repeatName} · {activeCounter.startRow}단부터 시작</p>
                if (state.kind === 'complete') return <p>{activeCounter.repeatName} · 반복 완료</p>
                return <p>{activeCounter.repeatName} {state.patternRow} / {activeCounter.repeatLength}단 · {state.repeatNumber}회차{activeCounter.repeatCount === null ? '' : ' / ' + activeCounter.repeatCount + '회'}</p>
              })()}
              {activeCounter.taskRules.map((rule) => {
                const progress = counterTaskProgress(activeCounter, rule)
                const label = rule.kind === 'decrease' ? '줄임' : '늘림'
                return <p className="number-counter-task-progress" key={rule.id}>{label} {progress.completed}회 완료 / {rule.total}회 · {progress.remaining}회 남음{progress.missed > 0 ? ' · 미완료 ' + progress.missed + '회' : ''}</p>
              })}
            </> : <strong className="number-counter-total">카운터 {activeCounter.value}</strong>}
          </div>
          <div className="number-counter-row">
            <button type="button" className="number-counter-step" aria-label={'카운터 ' + (activeCounterIndex + 1) + ' 감소'} disabled={activeCounter.value <= (activeCounter.mode === 'repeat' ? 1 : 0)} onClick={() => adjustCounter(activeCounterIndex, -1)}>−</button>
            {editingCounterIndex === activeCounterIndex
              ? <input
                ref={counterInputRef}
                className="number-counter-input"
                aria-label={'카운터 ' + (activeCounterIndex + 1) + ' 숫자 입력'}
                type="number"
                inputMode="numeric"
                min={activeCounter.mode === 'repeat' ? 1 : 0}
                max={activeCounter.mode === 'repeat' ? MAX_COUNTER_ROW : 99}
                step="1"
                value={counterDraft}
                onChange={(event) => updateCounterSession((current) => ({ ...current, draft: event.currentTarget.value }))}
                onBlur={(event) => {
                  if (cancelCounterBlur.current) {
                    cancelCounterBlur.current = false
                    updateCounterSession((current) => ({ ...current, editingIndex: null }))
                    return
                  }
                  commitCounterEdit(activeCounterIndex, event.currentTarget.value)
                }}
                onKeyDown={(event) => {
                  event.stopPropagation()
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    commitCounterEdit(activeCounterIndex, event.currentTarget.value)
                    event.currentTarget.blur()
                  } else if (event.key === 'Escape') {
                    event.preventDefault()
                    cancelCounterBlur.current = true
                    event.currentTarget.blur()
                    updateCounterSession((current) => ({ ...current, editingIndex: null }))
                  }
                }}
              />
              : <button type="button" className="number-counter-value" aria-label={'카운터 ' + (activeCounterIndex + 1) + ' 숫자 직접 입력'} onClick={() => updateCounterSession((current) => ({ ...current, draft: String(activeCounter.value), editingIndex: activeCounterIndex }))}>{activeCounter.value}</button>}
            <button type="button" className="number-counter-step" aria-label={activeCounter.mode === 'repeat' ? '현재 단 완료 후 다음 단' : '카운터 증가'} title={activeCounter.mode === 'repeat' ? '이 단 완료' : '증가'} disabled={activeCounter.value >= (activeCounter.mode === 'repeat' ? MAX_COUNTER_ROW : 99)} onClick={() => activeCounter.mode === 'repeat' ? requestCounterAdvance(activeCounterIndex) : adjustCounter(activeCounterIndex, 1)}>+</button>
          </div>
          {currentDueTasks.length > 0 && counterSession.dismissedAlertKey !== currentDueKey && <section className="number-counter-alert" aria-label="이번 단 작업 알림">
            <div className="number-counter-alert-heading"><strong>이번 단은 {Array.from(new Set(currentDueTasks.map((task) => task.rule.kind === 'decrease' ? '줄임' : '늘림'))).join('·')}단</strong><button type="button" aria-label="알림 닫기" onClick={() => updateCounterSession((current) => ({ ...current, dismissedAlertKey: currentDueKey }))}><X size={16} /></button></div>
            {currentDueTasks.map((task) => {
              const progress = counterTaskProgress(activeCounter, task.rule)
              const label = task.rule.kind === 'decrease' ? '줄임' : '늘림'
              return <p key={task.rule.id}>{label} {progress.completed}회 완료 / 총 {task.rule.total}회 · {progress.remaining}회 남음{task.status === 'done' ? ' · 이번 단 완료' : task.status === 'missed' ? ' · 미완료' : ''}</p>
            })}
            <label className="number-counter-task-complete"><input type="checkbox" checked={currentDueTasks.every((task) => task.status === 'done')} onChange={(event) => event.currentTarget.checked ? markCurrentCounterTasksDone(activeCounterIndex) : clearCurrentCounterTaskCompletion(activeCounterIndex)} />이번 작업 완료</label>
          </section>}
          {currentDueTasks.length > 0 && counterSession.dismissedAlertKey === currentDueKey && <button type="button" className="number-counter-alert-reopen" onClick={() => updateCounterSession((current) => ({ ...current, dismissedAlertKey: null }))}>이번 단 작업 다시 보기</button>}
          {missedCounterTasks.length > 0 && <section className="number-counter-missed">
            <button type="button" className="number-counter-missed-toggle" aria-expanded={counterSession.historyExpanded} onClick={() => updateCounterSession((current) => ({ ...current, historyExpanded: !current.historyExpanded }))}>미완료 기록 {missedCounterTasks.length}개{counterSession.historyExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
            {counterSession.historyExpanded && missedCounterTasks.map((item) => <div className="number-counter-missed-item" key={counterTaskKey(item.rule.id, item.occurrence)}>
              <span>{item.rule.kind === 'decrease' ? '줄임' : '늘림'} {item.occurrence}회차 · {item.rule.interval}단 간격</span><button type="button" onClick={() => markMissedCounterTaskDone(activeCounterIndex, item.rule, item.occurrence)}>완료 처리</button>
            </div>)}
          </section>}
          {counterSession.advanceConfirmation && pendingDueTasks.length > 0 && <section className="number-counter-advance-confirm" role="alertdialog" aria-label="미완료 작업 확인">
            <p>이번 단 작업을 완료로 표시하지 않았습니다. 다음 단으로 이동할까요?</p>
            <button type="button" className="primary-button" onClick={() => advanceCounter(activeCounterIndex, 'done')}>완료 후 다음 단</button>
            <button type="button" className="secondary-button" onClick={() => advanceCounter(activeCounterIndex, 'missed')}>미완료로 다음 단</button>
            <button type="button" className="number-counter-cancel" onClick={() => updateCounterSession((current) => ({ ...current, advanceConfirmation: false }))}>취소</button>
          </section>}
        </aside>}
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
        <div className="page-thumbnail-strip" aria-label="모든 페이지 썸네일" ref={thumbnailRailRef} onScroll={handleThumbnailScroll}>
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
          </div>
          <div className="viewer-navigation">
            <button className={'viewer-tool ' + (counterPanelVisible ? 'active' : '')} type="button" aria-label="숫자 카운터" title="숫자 카운터" aria-pressed={counterPanelVisible} onClick={() => updateCounterSession((current) => ({ ...current, visible: !current.visible }))}><Hash size={17} /><span>카운터</span></button>
            <span className="control-separator" />
            <button className="text-control" disabled={activePage <= 1} onClick={() => stepPage(-1)}>이전</button>
            <label className="page-jump"><input key={activePage} aria-label="페이지 번호 입력" type="number" min="1" max={pdf.numPages} defaultValue={activePage} onBlur={(event) => jumpToPage(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === 'Enter') { jumpToPage(event.currentTarget.value); event.currentTarget.blur() } }} /><span>/ {pdf.numPages}</span></label>
            <button className="text-control" disabled={activePage >= pdf.numPages && hiddenNumbers.size === 0} onClick={() => stepPage(1)}>{activePage >= pdf.numPages ? '보고서' : '다음'}</button>
          </div>
        </section>}
      </section>
      {counterSettingsOpen && <CounterSettingsDialog
        key={activeCounterIndex}
        initial={activeCounter}
        index={activeCounterIndex}
        onClose={() => setCounterSettingsOpen(false)}
        onSave={(counter) => {
          updateCounter(activeCounterIndex, () => counter)
          updateCounterSession((current) => ({ ...current, advanceConfirmation: false, dismissedAlertKey: null }))
          setCounterSettingsOpen(false)
        }}
      />}
      {renameDialog && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRenameDialog(false) }}><section className="modal-card" role="dialog" aria-modal="true" aria-label="PDF 이름 변경"><div className="modal-heading"><h2>PDF 이름 변경</h2><button className="icon-button" aria-label="닫기" onClick={() => setRenameDialog(false)}><X size={20} /></button></div><form className="modal-form" onSubmit={(event) => void saveDocumentName(event)}><label htmlFor="viewer-pdf-name">PDF 이름</label><input id="viewer-pdf-name" autoFocus required maxLength={120} value={renameDraft} onChange={(event) => setRenameDraft(event.currentTarget.value)} />{renameError && <p className="rename-error" role="alert">{renameError}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setRenameDialog(false)}>취소</button><button className="primary-button" type="submit"><Check size={17} />저장</button></div></form></section></div>}
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
    </main>
  )
}
