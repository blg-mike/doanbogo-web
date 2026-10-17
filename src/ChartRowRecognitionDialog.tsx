import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Plus, Trash2, X } from 'lucide-react'
import { formatNumber, t } from './locales/index'
import type { CounterSnapshot } from './types'
import type { DetectedChartRow } from './chartRowDetection'

export interface EditableChartRow extends DetectedChartRow {
  id: string
}

export interface ChartRowRecognitionResult {
  rows: DetectedChartRow[]
  direction: 'top-to-bottom' | 'bottom-to-top'
  counterId: string
  startCounterRow: number
}

type DragState = { pointerId: number; rowId: string; action: 'move' | 'start' | 'end'; startX: number; startY: number; before: EditableChartRow }

export function ChartRowRecognitionDialog({ imageUrl, initialRows, counters, initialCounterId, initialCounterRow, error, onRetry, onCancel, onApply }: {
  imageUrl: string
  initialRows: DetectedChartRow[]
  counters: CounterSnapshot[]
  initialCounterId: string
  initialCounterRow: number
  error?: string
  onRetry: () => void
  onCancel: () => void
  onApply: (result: ChartRowRecognitionResult) => Promise<boolean>
}) {
  const rowCounters = counters.filter((counter) => counter.kind === 'simple' && counter.unit === 'row' && !counter.linkedToId)
  const [rows, setRows] = useState<EditableChartRow[]>(() => initialRows.map((row) => ({ ...row, id: crypto.randomUUID() })))
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null)
  const [direction, setDirection] = useState<'top-to-bottom' | 'bottom-to-top'>('bottom-to-top')
  const [counterId, setCounterId] = useState(rowCounters.some((counter) => counter.id === initialCounterId) ? initialCounterId : rowCounters[0]?.id ?? '')
  const [startCounterRow, setStartCounterRow] = useState(String(initialCounterRow))
  const [selectedId, setSelectedId] = useState<string | null>(rows[0]?.id ?? null)
  const [addingRow, setAddingRow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const dragRef = useRef<DragState | null>(null)
  const orderedRows = [...rows].sort((first, second) => first.y - second.y)
  if (direction === 'bottom-to-top') orderedRows.reverse()
  const selectedIndex = orderedRows.findIndex((row) => row.id === selectedId)
  const selected = rows.find((row) => row.id === selectedId)
  const step = rows.length ? Math.min(...rows.map((row) => row.height)) : 0.025

  function previewPoint(event: ReactPointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width))),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / Math.max(1, rect.height))),
    }
  }

  function handlePointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    event.preventDefault()
    event.stopPropagation()
    const point = previewPoint(event)
    if (addingRow) {
      const height = Math.min(0.12, Math.max(0.006, step || 0.025))
      const row: EditableChartRow = { id: crypto.randomUUID(), x: 0.05, y: Math.min(1 - height, Math.max(0, point.y - height / 2)), width: 0.9, height }
      setRows((current) => [...current, row])
      setSelectedId(row.id)
      setAddingRow(false)
      return
    }
    const target = (event.target as SVGElement).closest<SVGElement>('[data-chart-row-id]')
    const row = rows.find((item) => item.id === target?.dataset.chartRowId)
    const action = target?.dataset.chartRowAction as DragState['action'] | undefined
    if (!row || !action) return
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* Pointer capture can be unavailable in embedded browsers. */ }
    dragRef.current = { pointerId: event.pointerId, rowId: row.id, action, startX: point.x, startY: point.y, before: row }
    setSelectedId(row.id)
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const point = previewPoint(event)
    const dx = point.x - drag.startX
    const dy = point.y - drag.startY
    setRows((current) => current.map((row) => {
      if (row.id !== drag.rowId) return row
      if (drag.action === 'move') return { ...drag.before, y: Math.min(1 - drag.before.height, Math.max(0, drag.before.y + dy)) }
      if (drag.action === 'start') {
        const right = drag.before.x + drag.before.width
        const left = Math.min(right - 0.025, Math.max(0, drag.before.x + dx))
        return { ...drag.before, x: left, width: right - left }
      }
      const right = Math.max(drag.before.x + 0.025, Math.min(1, drag.before.x + drag.before.width + dx))
      return { ...drag.before, width: right - drag.before.x }
    }))
  }

  function handlePointerEnd(event: ReactPointerEvent<SVGSVGElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
  }

  function selectAdjacent(directionDelta: number) {
    if (!orderedRows.length) return
    const index = Math.min(orderedRows.length - 1, Math.max(0, (selectedIndex < 0 ? 0 : selectedIndex) + directionDelta))
    setSelectedId(orderedRows[index].id)
  }

  async function apply() {
    const startRow = Number(startCounterRow)
    if (!counterId || !Number.isInteger(startRow) || startRow < 1 || startRow > 9999 || !orderedRows.length) return
    setSaving(true)
    setSaveError('')
    try {
      const saved = await onApply({
        rows: orderedRows.map(({ id: _id, ...row }) => row),
        direction,
        counterId,
        startCounterRow: startRow,
      })
      if (!saved) setSaveError(t('저장하지 못했습니다. 저장 공간을 확인한 뒤 다시 시도해 주세요.'))
    } catch {
      setSaveError(t('저장하지 못했습니다. 저장 공간을 확인한 뒤 다시 시도해 주세요.'))
    } finally {
      setSaving(false)
    }
  }

  return createPortal(<div className="chart-row-dialog-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget && !saving) onCancel() }}>
    <section className="chart-row-dialog" role="dialog" aria-modal="true" aria-label={t('차트 행 인식')}>
      <header className="chart-row-dialog-header">
        <div><h2>{t('차트 행 인식')}</h2><p>{t('인식 결과를 확인하고 행의 중심과 양끝을 드래그해 보정하세요.')}</p></div>
        <button type="button" className="icon-button" aria-label={t('닫기')} disabled={saving} onClick={onCancel}><X size={20} /></button>
      </header>
      {error ? <div className="chart-row-error" role="alert"><p>{error}</p><button type="button" className="secondary-button" onClick={onRetry}>{t('다시 분석')}</button></div> : <>
        <div className="chart-row-preview" data-adding-row={addingRow ? 'true' : undefined} style={imageSize ? { width: `min(100%, calc(48dvh * ${imageSize.width / imageSize.height}))`, aspectRatio: `${imageSize.width} / ${imageSize.height}` } : undefined}>
          <img src={imageUrl} alt={t('지정한 차트 영역 원본')} draggable={false} onLoad={(event) => setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} />
          <svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-label={t('차트 행 미리보기')} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerEnd} onPointerCancel={handlePointerEnd} onLostPointerCapture={handlePointerEnd}>
            {rows.map((row) => {
              const chosen = row.id === selectedId
              const y = row.y + row.height / 2
              const displayNumber = orderedRows.findIndex((item) => item.id === row.id) + 1
              return <g key={row.id} className={chosen ? 'chart-row-preview-item is-selected' : 'chart-row-preview-item'}>
                <line className="chart-row-hit-target" data-chart-row-id={row.id} data-chart-row-action="move" x1={row.x} x2={row.x + row.width} y1={y} y2={y} />
                <line x1={row.x} x2={row.x + row.width} y1={y} y2={y} className="chart-row-line" pointerEvents="none" />
                <text x={row.x + 0.006} y={Math.max(0.035, y - 0.018)} fontSize="0.035" className="chart-row-number" pointerEvents="none">{formatNumber(displayNumber)}</text>
                {chosen && <>
                  <circle className="chart-row-hit-target" data-chart-row-id={row.id} data-chart-row-action="start" cx={row.x} cy={y} r="0.025" />
                  <circle className="chart-row-handle" cx={row.x} cy={y} r="0.025" pointerEvents="none" />
                  <circle className="chart-row-hit-target" data-chart-row-id={row.id} data-chart-row-action="end" cx={row.x + row.width} cy={y} r="0.025" />
                  <circle className="chart-row-handle" cx={row.x + row.width} cy={y} r="0.025" pointerEvents="none" />
                </>}
              </g>
            })}
          </svg>
        </div>
        <div className="chart-row-controls">
          <div className="chart-row-navigation">
            <button type="button" className="secondary-button" aria-label={t('이전 행')} disabled={saving || selectedIndex <= 0} onClick={() => selectAdjacent(-1)}><ChevronLeft size={18} />{t('이전 행')}</button>
            <span>{orderedRows.length ? t('행 {number}', { number: formatNumber(Math.max(0, selectedIndex) + 1) }) + ' / ' + formatNumber(orderedRows.length) : t('인식된 행이 없습니다.')}</span>
            <button type="button" className="secondary-button" aria-label={t('다음 행')} disabled={saving || selectedIndex < 0 || selectedIndex >= orderedRows.length - 1} onClick={() => selectAdjacent(1)}>{t('다음 행')}<ChevronRight size={18} /></button>
          </div>
          <div className="chart-row-actions">
            <button type="button" className={addingRow ? 'secondary-button is-selected' : 'secondary-button'} disabled={saving} onClick={() => setAddingRow((current) => !current)}><Plus size={17} />{t('행 추가')}</button>
            <button type="button" className="secondary-button" disabled={saving || !selected} onClick={() => {
              if (!selected) return
              setRows((current) => current.filter((row) => row.id !== selected.id))
              const next = orderedRows.find((row) => row.id !== selected.id)
              setSelectedId(next?.id ?? null)
            }}><Trash2 size={16} />{t('행 삭제')}</button>
            <label>{t('행 방향')}<select value={direction} disabled={saving} onChange={(event) => setDirection(event.currentTarget.value as typeof direction)}><option value="bottom-to-top">{t('아래에서 위로')}</option><option value="top-to-bottom">{t('위에서 아래로')}</option></select></label>
          </div>
          <div className="chart-row-counter-settings">
            <label>{t('연결할 메인 카운터')}<select value={counterId} disabled={saving || !rowCounters.length} onChange={(event) => {
              const nextId = event.currentTarget.value
              setCounterId(nextId)
              const counter = rowCounters.find((item) => item.id === nextId)
              if (counter) setStartCounterRow(String(counter.value))
            }}>{rowCounters.map((counter) => <option key={counter.id} value={counter.id}>{counter.name}</option>)}</select></label>
            <label>{t('첫 카운터 단')}<input type="number" min="1" max="9999" step="1" value={startCounterRow} disabled={saving} onChange={(event) => setStartCounterRow(event.currentTarget.value)} /></label>
          </div>
        </div>
      </>}
      {saveError && <p className="chart-row-save-error" role="alert">{saveError}</p>}
      <footer className="chart-row-dialog-footer">
        <button type="button" className="secondary-button" disabled={saving} onClick={onCancel}>{t('취소')}</button>
        {!error && <button type="button" className="primary-button" disabled={saving || !rows.length || !counterId || !Number.isInteger(Number(startCounterRow)) || Number(startCounterRow) < 1 || Number(startCounterRow) > 9999} onClick={() => void apply()}>{saving ? t('저장 중…') : t('적용')}</button>}
      </footer>
    </section>
  </div>, document.body)
}
