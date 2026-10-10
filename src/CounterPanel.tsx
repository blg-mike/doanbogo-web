import { useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { Bell, Check, ChevronDown, ChevronRight, ChevronUp, Pin, PinOff, Plus, RotateCcw, Settings, Settings2, Trash2, Vibrate, Volume2, X } from 'lucide-react'
import type { CounterKind, CounterSnapshot, CounterTaskKind, CounterUnit, ViewerSnapshot } from './types'
import { MAX_COUNTER_ROW, MAX_COUNTERS_PER_TYPE, counterAlertState, createCounter, counterSideForRow, counterTaskProgress, findCounterRewindCheckpoint, maxCountersForType, nextPatternAlertRow, patternRowAfterCompletion, taskSchedule } from './smartCounter'
import { ColorPresetButtons } from './ColorPresetButtons'
import { useDismissiblePopover } from './useDismissiblePopover'

const kinds: CounterKind[] = ['simple', 'pattern', 'task']
const kindLabels: Record<CounterKind, string> = { simple: '자유 카운터', pattern: '무늬 카운터', task: '줄임·늘림 카운터' }
const unitLabels: Record<CounterUnit, string> = { row: '단', stitch: '코', round: '회' }
const taskLabels: Record<CounterTaskKind, string> = { decrease: '줄임', increase: '늘림' }

function counterCurrentRow(counter: CounterSnapshot) {
  return counter.kind === 'simple' ? counter.value : counter.currentRow ?? 1
}

function updateCounterValue(counter: CounterSnapshot, value: number): CounterSnapshot {
  const bounded = Math.max(0, Math.min(MAX_COUNTER_ROW, Math.trunc(value)))
  if (counter.kind === 'simple') return { ...counter, value: bounded }
  if (counter.kind === 'pattern') return { ...counter, currentRow: bounded, value: counter.patternRow ?? 1 }
  return { ...counter, currentRow: bounded }
}

function advanceStandalone(counter: CounterSnapshot): CounterSnapshot {
  const currentRow = counterCurrentRow(counter)
  if (counter.kind === 'simple') return { ...counter, value: Math.min(MAX_COUNTER_ROW, counter.value + 1) }
  if (counter.kind === 'pattern') {
    const row = patternRowAfterCompletion(counter, currentRow)
    return { ...counter, currentRow: Math.min(MAX_COUNTER_ROW, currentRow + 1), patternRow: row, value: row }
  }
  const due = currentRow === counter.nextTaskRow && (counter.completedCount ?? 0) < (counter.total ?? 0)
  const completedCount = (counter.completedCount ?? 0) + (due ? 1 : 0)
  return {
    ...counter,
    currentRow: Math.min(MAX_COUNTER_ROW, currentRow + 1),
    completedCount,
    value: completedCount,
    nextTaskRow: due && completedCount < (counter.total ?? 0) ? currentRow + (counter.interval ?? 1) : counter.nextTaskRow,
    taskRecords: due ? [...(counter.taskRecords ?? []), { row: currentRow, status: 'done' as const }].slice(-MAX_COUNTER_ROW) : counter.taskRecords,
  }
}

function CounterEditor({ counter, counters, onClose, onSave }: {
  counter: CounterSnapshot
  counters: CounterSnapshot[]
  onClose: () => void
  onSave: (updated: CounterSnapshot[], label: string) => void
}) {
  const [draft, setDraft] = useState<CounterSnapshot>({ ...counter, taskRecords: counter.taskRecords?.map((item) => ({ ...item })), instructions: counter.instructions?.map((item) => ({ ...item })) })
  const [selectedMembers, setSelectedMembers] = useState(() => new Set(counters.filter((item) => item.linkedToId === counter.id).map((item) => item.id)))
  const [linkedToId, setLinkedToId] = useState(counter.linkedToId ?? '')
  const [advanced, setAdvanced] = useState(false)
  const rowBases = counters.filter((item) => item.id !== counter.id && item.kind === 'simple' && item.unit === 'row' && !item.linkedToId)
  const isRowBase = draft.kind === 'simple' && draft.unit === 'row' && !draft.linkedToId

  function set<K extends keyof CounterSnapshot>(key: K, value: CounterSnapshot[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const updatedDraft = { ...draft, name: draft.name.trim() || kindLabels[draft.kind] }
    let next = counters.map((item) => item.id === draft.id ? updatedDraft : item)
    if (isRowBase) {
      next = next.map((item) => item.id !== draft.id && (item.linkedToId === draft.id || selectedMembers.has(item.id))
        ? selectedMembers.has(item.id) ? { ...item, linkedToId: draft.id } : { ...item, linkedToId: undefined }
        : item)
    } else {
      next = next.map((item) => item.id === draft.id ? { ...item, linkedToId: linkedToId || undefined } : item)
    }
    onSave(next, '카운터 설정 변경')
  }

  function updateInstruction(id: string, change: Partial<NonNullable<CounterSnapshot['instructions']>[number]>) {
    set('instructions', (draft.instructions ?? []).map((item) => item.id === id ? { ...item, ...change } : item))
  }

  function addInstruction() {
    set('instructions', [...(draft.instructions ?? []), { id: crypto.randomUUID(), row: 1, message: '' }])
  }

  return <div className="modal-backdrop counter-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <form className="modal-card counter-settings-modal counter-editor" role="dialog" aria-modal="true" aria-label={kindLabels[counter.kind] + ' 설정'} onSubmit={save}>
      <div className="modal-heading"><div><p className="eyebrow">COUNTER SETTINGS</p><h2>{kindLabels[counter.kind]} 설정</h2></div><button type="button" className="icon-button" aria-label="닫기" onClick={onClose}><X size={20} /></button></div>
      <div className="counter-settings-body">
        <label className="counter-settings-field">이름<input required maxLength={100} value={draft.name} onChange={(event) => set('name', event.currentTarget.value)} /></label>
        <label className="counter-settings-field">표시 색상<ColorPresetButtons label="카운터 색상" className="counter-color-presets" value={draft.color} onChange={(color) => set('color', color)} /></label>
        {draft.kind === 'simple' && <>
          <label className="counter-settings-field">현재 숫자<input type="number" min="0" max={MAX_COUNTER_ROW} value={draft.value} onChange={(event) => set('value', Number(event.currentTarget.value))} /></label>
          <label className="counter-settings-field">단위<select value={draft.unit ?? 'row'} onChange={(event) => set('unit', event.currentTarget.value as CounterUnit)}><option value="row">단</option><option value="stitch">코</option><option value="round">회</option></select></label>
        </>}
        {draft.kind === 'pattern' && <>
          <label className="counter-settings-field">반복 단수<input required type="number" min="1" max={MAX_COUNTER_ROW} value={draft.repeatLength ?? 1} onChange={(event) => set('repeatLength', Number(event.currentTarget.value))} /></label>
          <label className="counter-settings-field">첫 무늬단<input required type="number" min="1" max={MAX_COUNTER_ROW} value={draft.startRow ?? 1} onChange={(event) => set('startRow', Number(event.currentTarget.value))} /></label>
          <div className="counter-settings-checks"><label><input type="checkbox" checked={draft.patternAlertEnabled !== false} onChange={(event) => set('patternAlertEnabled', event.currentTarget.checked)} />무늬단에서 알려주기</label><label><input type="checkbox" checked={draft.patternPreviewEnabled === true} onChange={(event) => set('patternPreviewEnabled', event.currentTarget.checked)} />1단 전에 미리 알리기</label></div>
          <button type="button" className="secondary-button counter-advanced-toggle" aria-expanded={advanced} onClick={() => setAdvanced((open) => !open)}>{advanced ? '추가 설정 접기' : '추가 설정 펼치기'}{advanced ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button>
          {advanced && <>
            <div className="counter-settings-grid">
              <label className="counter-settings-field">현재 단<input type="number" min="1" max={MAX_COUNTER_ROW} value={draft.currentRow ?? 1} onChange={(event) => set('currentRow', Number(event.currentTarget.value))} /></label>
              <label className="counter-settings-field">현재 무늬 단<input type="number" min="1" max={draft.repeatLength ?? 1} value={draft.patternRow ?? 1} onChange={(event) => set('patternRow', Number(event.currentTarget.value))} /></label>
            </div>
            <div className="counter-settings-grid">
              <label className="counter-settings-field">반복 번호 시작<input type="number" min="1" max={MAX_COUNTER_ROW} placeholder="입력 시 표시" value={draft.repeatStartNumber ?? ''} onChange={(event) => set('repeatStartNumber', event.currentTarget.value ? Number(event.currentTarget.value) : undefined)} /></label>
            </div>
            <label className="counter-settings-field">총 반복 횟수<input type="number" min="1" max={MAX_COUNTER_ROW} placeholder="계속 반복" value={draft.repeatCount ?? ''} onChange={(event) => set('repeatCount', event.currentTarget.value ? Number(event.currentTarget.value) : null)} /></label>
            <section className="counter-task-settings" aria-label="무늬 교차 안내">
              <div className="counter-task-settings-heading"><strong>교차·무늬 안내</strong></div>
              {(draft.instructions ?? []).map((item) => <div className="counter-instruction-row" key={item.id}>
                <label>무늬 단<input type="number" min="1" max={draft.repeatLength ?? MAX_COUNTER_ROW} value={item.row} onChange={(event) => updateInstruction(item.id, { row: Number(event.currentTarget.value) })} /></label>
                <label>안내 문구<input maxLength={2000} value={item.message} onChange={(event) => updateInstruction(item.id, { message: event.currentTarget.value })} placeholder="예: 왼쪽으로 교차" /></label>
                <button type="button" className="icon-button" aria-label="안내 삭제" onClick={() => set('instructions', (draft.instructions ?? []).filter((candidate) => candidate.id !== item.id))}><Trash2 size={15} /></button>
              </div>)}
              <button type="button" className="secondary-button counter-task-add" onClick={addInstruction}><Plus size={15} />교차 안내 추가</button>
            </section>
          </>}
        </>}
        {draft.kind === 'task' && <>
          <label className="counter-settings-field">작업<select value={draft.taskKind ?? 'decrease'} onChange={(event) => set('taskKind', event.currentTarget.value as CounterTaskKind)}><option value="decrease">줄임</option><option value="increase">늘림</option></select></label>
          <div className="counter-settings-grid">
            <label className="counter-settings-field">첫 작업 단<input type="number" min="1" max={MAX_COUNTER_ROW} value={draft.firstTaskRow ?? 4} onChange={(event) => { const firstTaskRow = Number(event.currentTarget.value); setDraft((current) => ({ ...current, firstTaskRow, nextTaskRow: firstTaskRow })) }} /></label>
            <label className="counter-settings-field">이후 간격<input type="number" min="1" max={MAX_COUNTER_ROW} value={draft.interval ?? 6} onChange={(event) => set('interval', Number(event.currentTarget.value))} /></label>
          </div>
          <label className="counter-settings-field">총 횟수<input type="number" min="1" max={MAX_COUNTER_ROW} value={draft.total ?? 4} onChange={(event) => set('total', Number(event.currentTarget.value))} /></label>
          <p className="counter-schedule-preview">예정 단: {taskSchedule(draft, 8).join(' → ') || '일정 완료'}{(draft.total ?? 0) > 8 ? ' …' : ''}</p>
          <button type="button" className="secondary-button counter-advanced-toggle" aria-expanded={advanced} onClick={() => setAdvanced((open) => !open)}>{advanced ? '추가 설정 접기' : '추가 설정 펼치기'}{advanced ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button>
          {advanced && <div className="counter-settings-grid">
            <label className="counter-settings-field">현재 단<input type="number" min="1" max={MAX_COUNTER_ROW} value={draft.currentRow ?? 1} onChange={(event) => set('currentRow', Number(event.currentTarget.value))} /></label>
            <label className="counter-settings-field">완료한 횟수<input type="number" min="0" max={draft.total ?? MAX_COUNTER_ROW} value={draft.completedCount ?? 0} onChange={(event) => { const completedCount = Number(event.currentTarget.value); setDraft((current) => ({ ...current, completedCount, value: completedCount })) }} /></label>
            <label className="counter-settings-field">다음 작업 단<input type="number" min="1" max={MAX_COUNTER_ROW} value={draft.nextTaskRow ?? draft.firstTaskRow ?? 1} onChange={(event) => set('nextTaskRow', Number(event.currentTarget.value))} /></label>
          </div>}
        </>}
        {draft.kind === 'simple' && draft.unit === 'row' && !draft.linkedToId && <section className="counter-link-editor"><strong>이 단 완료와 함께 진행</strong><span>현재 숫자는 유지되고 다음 완료부터 적용됩니다.</span>{counters.filter((item) => item.id !== draft.id && (!item.linkedToId || item.linkedToId === draft.id) && (!counters.some((child) => child.linkedToId === item.id) || item.linkedToId === draft.id)).map((item) => <label key={item.id}><input type="checkbox" checked={selectedMembers.has(item.id)} onChange={(event) => setSelectedMembers((current) => { const next = new Set(current); if (event.currentTarget.checked) next.add(item.id); else next.delete(item.id); return next })} />{item.name} · {kindLabels[item.kind]}</label>)}</section>}
        {!(draft.kind === 'simple' && draft.unit === 'row' && !draft.linkedToId) && <label className="counter-settings-field">함께 진행할 기준 단<select value={linkedToId} onChange={(event) => setLinkedToId(event.currentTarget.value)}><option value="">연동 안 함</option>{rowBases.map((base) => <option key={base.id} value={base.id}>{base.name} · 현재 {base.value}단</option>)}</select></label>}
        {draft.linkedToId && <p className="counter-link-note">현재 단 {draft.currentRow ?? 1} · 기준 카운터와 함께 진행합니다.</p>}
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>취소</button><button type="submit" className="primary-button"><Check size={17} />저장</button></div>
      </div>
    </form>
  </div>
}

function sideForGoal(goalRow: number, finalSide: 'rs' | 'ws', row: number) {
  return Math.abs(goalRow - row) % 2 === 0 ? finalSide : finalSide === 'rs' ? 'ws' : 'rs'
}

function CounterSettings({ snapshot, counters, onClose, onSave }: {
  snapshot: ViewerSnapshot
  counters: CounterSnapshot[]
  onClose: () => void
  onSave: (next: CounterSnapshot[], changes: Partial<ViewerSnapshot>, label: string) => void
}) {
  const [workingCounters, setWorkingCounters] = useState(counters)
  const baseCounters = workingCounters.filter((counter) => counter.kind === 'simple' && counter.unit === 'row' && !counter.linkedToId)
  const initialBase = baseCounters.find((counter) => counter.id === snapshot.counterMainId) ?? baseCounters[0]
  const [mainId, setMainId] = useState(initialBase?.id ?? '')
  const [goalRow, setGoalRow] = useState(initialBase?.goalRow ? String(initialBase.goalRow) : '')
  const [firstSide, setFirstSide] = useState<'rs' | 'ws'>(initialBase?.firstSide ?? 'rs')
  const [goalFinalSide, setGoalFinalSide] = useState<'rs' | 'ws'>(initialBase?.goalFinalSide ?? 'rs')
  const [goalAlert, setGoalAlert] = useState(initialBase?.goalAlertEnabled !== false)
  const [sound, setSound] = useState(snapshot.counterSoundEnabled === true)
  const [vibration, setVibration] = useState(snapshot.counterVibrationEnabled === true)
  const [preview, setPreview] = useState(snapshot.counterPreviewEnabled === true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  function selectMain(id: string) {
    const selected = workingCounters.find((counter) => counter.id === id && counter.kind === 'simple' && counter.unit === 'row')
    if (!selected || selected.kind !== 'simple') return
    setMainId(id)
    setGoalRow(selected.goalRow ? String(selected.goalRow) : '')
    setFirstSide(selected.firstSide ?? 'rs')
    setGoalFinalSide(selected.goalFinalSide ?? 'rs')
    setGoalAlert(selected.goalAlertEnabled !== false)
  }

  function changeFirstSide(side: 'rs' | 'ws') {
    setFirstSide(side)
    const target = Number(goalRow)
    if (Number.isSafeInteger(target) && target > 0) setGoalFinalSide(sideForGoal(target, side, 1))
  }

  function changeGoalSide(side: 'rs' | 'ws') {
    setGoalFinalSide(side)
    const target = Number(goalRow)
    if (Number.isSafeInteger(target) && target > 0) setFirstSide(sideForGoal(target, side, 1))
  }

  function updateCounter(id: string, change: Partial<CounterSnapshot>, label: string) {
    setWorkingCounters((current) => current.map((counter) => counter.id === id ? { ...counter, ...change } : counter))
    if (label.includes('삭제')) setEditingId(null)
  }

  function removeCounter(counter: CounterSnapshot) {
    const next = workingCounters.filter((item) => item.id !== counter.id).map((item) => item.linkedToId === counter.id ? { ...item, linkedToId: undefined } : item)
    setWorkingCounters(next)
    if (counter.id === mainId) {
      const replacement = next.find((item) => item.kind === 'simple' && item.unit === 'row' && !item.linkedToId)
      selectMain(replacement?.id ?? '')
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const selected = workingCounters.find((counter) => counter.id === mainId)
    if (!selected || selected.kind !== 'simple' || selected.unit !== 'row') {
      setError('메인 단 카운터를 선택해 주세요.')
      return
    }
    const parsedGoal = goalRow.trim() ? Number(goalRow) : null
    if (parsedGoal !== null && (!Number.isSafeInteger(parsedGoal) || parsedGoal < 1 || parsedGoal > MAX_COUNTER_ROW)) {
      setError('목표 단은 1~' + MAX_COUNTER_ROW + ' 사이의 정수로 입력해 주세요.')
      return
    }
    if (parsedGoal !== null && parsedGoal < selected.value) {
      setError('목표 단은 현재 단(' + selected.value + '단) 이상으로 설정해 주세요.')
      return
    }
    const next = workingCounters.map((counter) => counter.id !== mainId || counter.kind !== 'simple' ? counter : {
      ...counter,
      goalRow: parsedGoal,
      goalFinalSide: parsedGoal === null ? undefined : goalFinalSide,
      firstSide,
      goalAlertEnabled: goalAlert,
      goalCompleted: parsedGoal !== null && parsedGoal === counter.goalRow ? counter.goalCompleted === true : false,
    })
    onSave(next, {
      counterMainId: mainId,
      counterSoundEnabled: sound,
      counterVibrationEnabled: vibration,
      counterPreviewEnabled: preview,
      counterAlertAcknowledged: '',
    }, '카운터 설정 변경')
    onClose()
  }

  const activeEditor = workingCounters.find((counter) => counter.id === editingId)
  return <div className="modal-backdrop counter-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <form className="modal-card counter-settings-modal counter-global-settings" role="dialog" aria-modal="true" aria-label="카운터 설정" onSubmit={save}>
      <div className="modal-heading"><div><p className="eyebrow">COUNTER SETTINGS</p><h2>카운터 설정</h2></div><button type="button" className="icon-button" aria-label="닫기" onClick={onClose}><X size={20} /></button></div>
      <div className="counter-settings-body">
        <section className="counter-global-section"><h3>메인 카운터</h3>
          <label className="counter-settings-field">현재 작업<select value={mainId} onChange={(event) => selectMain(event.currentTarget.value)}>{baseCounters.map((counter) => <option key={counter.id} value={counter.id}>{counter.name} · 현재 {counter.value}단</option>)}</select></label>
          <label className="counter-settings-field">목표 단 <span className="counter-field-hint">선택 항목</span><input type="number" min="1" max={MAX_COUNTER_ROW} value={goalRow} onChange={(event) => { setGoalRow(event.currentTarget.value); const target = Number(event.currentTarget.value); if (Number.isSafeInteger(target) && target > 0) setGoalFinalSide(sideForGoal(target, firstSide, 1)) }} placeholder="목표 없이 계속 뜨기" /></label>
          {goalRow && <div className="counter-settings-choice"><span>목표 마지막 면</span>{(['rs', 'ws'] as const).map((side) => <button type="button" key={side} className={goalFinalSide === side ? 'selected' : ''} onClick={() => changeGoalSide(side)}>{side.toUpperCase()}</button>)}</div>}
          <div className="counter-settings-choice"><span>첫 단 면</span>{(['rs', 'ws'] as const).map((side) => <button type="button" key={side} className={firstSide === side ? 'selected' : ''} onClick={() => changeFirstSide(side)}>{side.toUpperCase()}</button>)}</div>
          {goalRow && <label className="counter-settings-toggle"><input type="checkbox" checked={goalAlert} onChange={(event) => setGoalAlert(event.currentTarget.checked)} /><Bell size={16} />목표 단 완료 시 알려주기</label>}
        </section>
        <section className="counter-global-section"><h3>알림</h3>
          <label className="counter-settings-toggle"><input type="checkbox" checked={sound} onChange={(event) => setSound(event.currentTarget.checked)} /><Volume2 size={16} />단 완료·작업 알림 소리</label>
          <label className="counter-settings-toggle"><input type="checkbox" checked={vibration} onChange={(event) => setVibration(event.currentTarget.checked)} /><Vibrate size={16} />진동 알림</label>
          <label className="counter-settings-toggle"><input type="checkbox" checked={preview} onChange={(event) => setPreview(event.currentTarget.checked)} /><Bell size={16} />1단 전 미리 알리기</label>
        </section>
        <section className="counter-global-section"><h3>보조 카운터 <span>종류별 최대 5개</span></h3>
          {workingCounters.map((counter) => <div className="counter-manage-row" key={counter.id}>
            <button type="button" className={'counter-manage-main' + (counter.id === mainId ? ' selected' : '')} onClick={() => { if (counter.kind === 'simple' && counter.unit === 'row' && !counter.linkedToId) selectMain(counter.id) }} aria-label={counter.kind === 'simple' && counter.unit === 'row' && !counter.linkedToId ? '메인 카운터로 선택' : counter.name}>
              {counter.id === mainId ? <Check size={15} /> : <span className="counter-manage-kind-dot" style={{ background: counter.color }} />}
              <span><strong>{counter.name}</strong><small>{kindLabels[counter.kind]} · {counter.kind === 'simple' ? counter.value + unitLabels[counter.unit ?? 'row'] : counter.kind === 'task' ? (counter.completedCount ?? 0) + '/' + (counter.total ?? 0) + '회' : (counter.patternRow ?? 1) + '/' + (counter.repeatLength ?? 1) + '단'}</small></span>
            </button>
            <button type="button" className="icon-button" aria-label={counter.pinned ? '고정 해제' : '상단 고정'} onClick={() => updateCounter(counter.id, { pinned: !counter.pinned }, '고정 변경')}>{counter.pinned ? <PinOff size={15} /> : <Pin size={15} />}</button>
            <button type="button" className="icon-button" aria-label={counter.name + ' 수정'} onClick={() => setEditingId(counter.id)}><Settings2 size={15} /></button>
            <button type="button" className="icon-button" aria-label={counter.name + ' 삭제'} title={counter.id === mainId && baseCounters.length <= 1 ? '메인 카운터는 하나 이상 필요합니다' : '삭제'} disabled={counter.id === mainId && baseCounters.length <= 1} onClick={() => removeCounter(counter)}><Trash2 size={15} /></button>
          </div>)}
          {!workingCounters.length && <p className="counter-settings-note">아직 추가한 카운터가 없습니다.</p>}
        </section>
        {error && <p className="counter-storage-error" role="alert">{error}</p>}
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>취소</button><button type="submit" className="primary-button"><Check size={16} />저장</button></div>
      </div>
    </form>
    {activeEditor && <div className="counter-editor-layer"><CounterEditor counter={activeEditor} counters={workingCounters} onClose={() => setEditingId(null)} onSave={(next) => { setWorkingCounters(next); setEditingId(null) }} /></div>}
  </div>
}

export default function CounterPanel({
  snapshot, counters, onChange, onAdvance, onUndo, onRewind, onCounterValue, onSettingsSave, onSnapshotUpdate, onClose,
}: {
  snapshot: ViewerSnapshot
  counters: CounterSnapshot[]
  onChange: (counters: CounterSnapshot[], label: string) => void
  onAdvance: (counterId: string) => void
  onUndo: () => void
  onRewind: (counterId: string, targetRow: number) => void
  onCounterValue: (counterId: string, value: number) => void
  onSettingsSave: (counters: CounterSnapshot[], changes: Partial<ViewerSnapshot>, label: string) => void
  onSnapshotUpdate: (changes: Partial<ViewerSnapshot>) => void
  onClose: () => void
}) {
  const panelRef = useRef<HTMLElement>(null)
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const addOptionsRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerId: number; x: number; y: number; left: number; top: number; mobile: boolean } | null>(null)
  const creationRequested = useRef(false)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const collapsed = snapshot.counterPanelCollapsed === true
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [rewindOpen, setRewindOpen] = useState(false)
  const [rewindRow, setRewindRow] = useState('')
  useDismissiblePopover(addMenuOpen, addOptionsRef, addButtonRef, () => setAddMenuOpen(false))
  const baseCounters = counters.filter((counter) => counter.kind === 'simple' && counter.unit === 'row' && !counter.linkedToId)
  const activeBase = baseCounters.find((counter) => counter.id === snapshot.counterMainId) ?? baseCounters[0]
  const activeBaseId = activeBase?.id
  const related = activeBase ? counters.filter((counter) => counter.id === activeBase.id || counter.linkedToId === activeBase.id) : []
  const auxiliary = related.filter((counter) => counter.id !== activeBase?.id)
  const currentRow = activeBase?.value ?? 1
  const side = activeBase ? counterSideForRow(activeBase, currentRow) : 'rs'
  const goalCompleted = activeBase?.goalCompleted === true
  const alertState = activeBase ? counterAlertState(counters, activeBase.id, snapshot.counterPreviewEnabled === true) : { key: '', messages: [] as string[] }
  const lastAlertKey = useRef(alertState.key)
  const pendingAlert = Boolean(alertState.key && snapshot.counterAlertAcknowledged !== alertState.key)
  const dueTasks = auxiliary.filter((counter) => counter.kind === 'task' && counter.nextTaskRow === currentRow && (counter.completedCount ?? 0) < (counter.total ?? 0))
  const duePatterns = auxiliary.filter((counter) => counter.kind === 'pattern' && counter.patternAlertEnabled !== false && nextPatternAlertRow(counter, currentRow) === currentRow)
  const nextEvents = auxiliary.flatMap((counter) => {
    if (counter.kind === 'task' && (counter.completedCount ?? 0) < (counter.total ?? 0) && (counter.nextTaskRow ?? 1) >= currentRow) return [{ row: counter.nextTaskRow ?? 1, label: counter.name + ' ' + taskLabels[counter.taskKind ?? 'decrease'] }]
    if (counter.kind === 'pattern') {
      const row = nextPatternAlertRow(counter, currentRow)
      if (row !== null) return [{ row, label: counter.name + ' 무늬단' }]
    }
    return []
  }).sort((first, second) => first.row - second.row)
  const nextEventRow = nextEvents[0]?.row
  const visibleRewindRows = activeBase ? [...new Set((snapshot.counterHistory ?? []).filter((entry) => entry.actualRow < activeBase.value && findCounterRewindCheckpoint(snapshot.counterHistory ?? [], counters, activeBase.id, entry.actualRow)).map((entry) => entry.actualRow))].sort((first, second) => second - first) : []
  const canStepBack = Boolean(activeBase && activeBase.value > 1 && findCounterRewindCheckpoint(snapshot.counterHistory ?? [], counters, activeBase.id, activeBase.value - 1))
  const activeEditor = counters.find((counter) => counter.id === editingId)

  useEffect(() => {
    if (!baseCounters.length && !creationRequested.current) {
      creationRequested.current = true
      const main = createCounter('simple', '몸판 단')
      onSettingsSave([main], { counterMainId: main.id }, '메인 카운터 추가')
    }
  }, [baseCounters.length, onSettingsSave])

  useEffect(() => {
    if (activeBaseId && snapshot.counterMainId !== activeBaseId) onSnapshotUpdate({ counterMainId: activeBaseId })
  }, [activeBaseId, snapshot.counterMainId, onSnapshotUpdate])

  useEffect(() => {
    if (lastAlertKey.current === alertState.key) return
    if (!pendingAlert) {
      lastAlertKey.current = alertState.key
      return
    }
    const latest = snapshot.counterHistory?.at(-1)
    const expectedCompletedRow = goalCompleted ? currentRow : currentRow - 1
    const wasJustReached = latest && latest.baseCounterId === activeBase?.id && latest.actualRow === expectedCompletedRow && (latest.label.endsWith('단 완료') || latest.label.endsWith('목표 완료'))
    if (!wasJustReached) return
    if (snapshot.counterSoundEnabled === true) {
      try {
        const Context = window.AudioContext
        if (Context) {
          const context = new Context()
          const oscillator = context.createOscillator()
          const gain = context.createGain()
          oscillator.frequency.value = 660
          gain.gain.setValueAtTime(0.06, context.currentTime)
          gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.12)
          oscillator.connect(gain)
          gain.connect(context.destination)
          oscillator.start()
          oscillator.stop(context.currentTime + 0.12)
          oscillator.onended = () => { void context.close() }
        }
      } catch { /* Sound is a best-effort local alert. */ }
    }
    if (snapshot.counterVibrationEnabled === true && typeof navigator.vibrate === 'function') navigator.vibrate(80)
    lastAlertKey.current = alertState.key
  }, [alertState.key, pendingAlert, activeBase?.id, currentRow, goalCompleted, snapshot.counterHistory, snapshot.counterSoundEnabled, snapshot.counterVibrationEnabled])

  function beginHeaderGesture(event: ReactPointerEvent<HTMLElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0 || (event.target as HTMLElement).closest('button')) return
    const rect = panelRef.current?.getBoundingClientRect()
    const parent = panelRef.current?.parentElement?.getBoundingClientRect()
    if (!rect || !parent) return
    const mobile = window.matchMedia('(max-width: 600px)').matches
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left - parent.left, top: rect.top - parent.top, mobile }
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* Pointer capture is optional. */ }
  }

  function moveHeaderGesture(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId || drag.mobile) return
    const parent = panelRef.current?.parentElement?.getBoundingClientRect()
    const panel = panelRef.current
    if (!parent || !panel) return
    const left = Math.max(8, Math.min(parent.width - panel.offsetWidth - 8, drag.left + event.clientX - drag.x))
    const top = Math.max(8, Math.min(parent.height - panel.offsetHeight - 8, drag.top + event.clientY - drag.y))
    setPosition({ left, top })
  }

  function endHeaderGesture(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (drag.mobile && Math.abs(event.clientY - drag.y) > 32) {
      const next = event.clientY < drag.y ? false : true
      onChange(counters, 'panel:' + String(next))
    }
    dragRef.current = null
  }

  function add(kind: CounterKind) {
    if (maxCountersForType(counters, kind) >= MAX_COUNTERS_PER_TYPE) return
    const counter = createCounter(kind, kind === 'simple' ? '자유 카운터' : undefined)
    const initialized = kind === 'simple'
      ? { ...counter, value: 0, unit: 'stitch' as const }
      : { ...counter, linkedToId: activeBase?.id, currentRow: currentRow, ...(kind === 'pattern' ? { startRow: currentRow, patternRow: 1 } : { nextTaskRow: Math.max(currentRow, counter.nextTaskRow ?? currentRow) }) }
    const next = [...counters, initialized]
    onChange(next, kindLabels[kind] + ' 추가')
    setAddMenuOpen(false)
    setEditingId(initialized.id)
  }

  function modifyAuxiliary(counter: CounterSnapshot, delta: number) {
    if (counter.linkedToId) return
    if (counter.kind === 'simple') onCounterValue(counter.id, Math.max(0, counter.value + delta))
    else if (delta > 0) onChange(counters.map((item) => item.id === counter.id ? advanceStandalone(item) : item), counter.name + ' 진행')
    else onChange(counters.map((item) => item.id === counter.id ? updateCounterValue(item, counterCurrentRow(item) - 1) : item), counter.name + ' 감소')
  }

  function confirmRewind(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeBase || !rewindRow || !findCounterRewindCheckpoint(snapshot.counterHistory ?? [], counters, activeBase.id, Number(rewindRow))) return
    onRewind(activeBase.id, Number(rewindRow))
    setRewindOpen(false)
  }

  return <aside ref={panelRef} className={'number-counter-panel' + (collapsed ? ' mobile-collapsed' : '')} aria-label="카운터" style={position ? { left: position.left, top: position.top, right: 'auto', bottom: 'auto' } : undefined}>
    <header className="number-counter-header" onPointerDown={beginHeaderGesture} onPointerMove={moveHeaderGesture} onPointerUp={endHeaderGesture} onPointerCancel={endHeaderGesture} onLostPointerCapture={endHeaderGesture}>
      <div className="counter-drag-handle" aria-hidden="true" />
      <strong>카운터</strong>
      <div className="number-counter-header-actions">
        <button type="button" className="counter-undo-button" aria-label="최근 카운터·진행선 작업 되돌리기" title="최근 카운터·진행선 작업 되돌리기" disabled={!snapshot.counterHistory?.length} onClick={onUndo}><RotateCcw size={16} /></button>
        <button type="button" className="number-counter-settings-button" aria-label="카운터 설정" title="카운터 설정" onClick={() => setSettingsOpen(true)}><Settings size={17} /></button>
        <button type="button" className="icon-button counter-close-button" aria-label="카운터 닫기" onClick={onClose}><X size={18} /></button>
        <button type="button" className="icon-button counter-collapse-mobile" aria-label={collapsed ? '카운터 펼치기' : '카운터 접기'} aria-expanded={!collapsed} onClick={() => onChange(counters, 'panel:' + String(!collapsed))}>{collapsed ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</button>
      </div>
    </header>
    {!collapsed && <div className="counter-popover-body">
      {activeBase && <>
        <section className="counter-main-card" aria-label="현재 단 카운터">
          <div className="counter-main-heading"><span>현재 단</span><strong>{activeBase.name}</strong></div>
          <div className="counter-main-value">
            <button type="button" className="counter-main-minus" aria-label="이전 단으로 되돌리기" title={canStepBack ? '이전 단으로 되돌리기' : '정확한 복원 이력이 없습니다'} disabled={!canStepBack} onClick={() => { if (activeBase.value > 1) onRewind(activeBase.id, activeBase.value - 1) }}>−1</button>
            <div className="counter-main-number"><strong>{activeBase.value}</strong><span>단</span><small>{side.toUpperCase()}</small></div>
            <button type="button" className="counter-main-plus" aria-label="현재 단 완료 후 다음 단으로 이동" disabled={activeBase.goalCompleted === true || activeBase.value >= MAX_COUNTER_ROW && activeBase.goalRow !== activeBase.value} onClick={() => onAdvance(activeBase.id)}>+1</button>
          </div>
          {activeBase.goalRow && <div className="counter-goal-progress"><div><span>{activeBase.goalCompleted ? activeBase.goalRow + '단 완료' : currentRow + ' / ' + activeBase.goalRow + '단'}</span><span>마지막 {activeBase.goalFinalSide?.toUpperCase() ?? 'RS'}</span></div><progress max={activeBase.goalRow} value={Math.min(currentRow, activeBase.goalRow)} /><small>{activeBase.goalCompleted ? '목표를 완료했어요.' : '목표 ' + activeBase.goalRow + '단'}</small></div>}
        </section>
        <section className={'counter-next-card' + (dueTasks.length || duePatterns.length ? ' due' : '')} aria-label="다음 할 일">
          <div className="counter-next-title"><span>{nextEventRow === currentRow ? '이번 단' : '다음 할 일'}</span><ChevronRight size={16} /></div>
          {nextEvents.length ? <><strong>{nextEventRow}단 · {nextEvents.filter((item) => item.row === nextEventRow).map((item) => item.label).join(' · ')}</strong>{nextEventRow > currentRow && <small>{nextEventRow - currentRow}단 남았어요.</small>}</> : <span className="counter-no-event">예정된 작업이 없어요.</span>}
        </section>
        {pendingAlert && <section className="counter-pending-alert" role="status"><div><Bell size={17} /><strong>{alertState.messages.join(' ')}</strong></div><button type="button" onClick={() => onSnapshotUpdate({ counterAlertAcknowledged: alertState.key })}>확인</button></section>}
        <section className="counter-aux-section"><header><h3>보조 카운터</h3><span>{auxiliary.length}</span></header>
          {auxiliary.map((counter) => {
            const status = counter.kind === 'task' ? counterTaskProgress(counter) : null
            const progress = counter.kind === 'task' ? Math.min(1, (status?.completed ?? 0) / Math.max(1, counter.total ?? 1)) : counter.kind === 'pattern' ? Math.min(1, ((counter.patternRow ?? 1) - 1) / Math.max(1, counter.repeatLength ?? 1)) : 0
            return <article className={'counter-aux-card' + (counter.kind === 'task' && counter.nextTaskRow === currentRow ? ' due' : '')} key={counter.id}>
              <div className="counter-aux-top"><span className="counter-aux-color" style={{ background: counter.color }} /><div><strong>{counter.name}</strong><small>{counter.kind === 'pattern' ? '무늬 ' + (counter.patternRow ?? 1) + ' / ' + (counter.repeatLength ?? 1) + '단' : counter.kind === 'task' ? taskLabels[counter.taskKind ?? 'decrease'] + ' · ' + (status?.completed ?? 0) + ' / ' + (counter.total ?? 0) + '회' : unitLabels[counter.unit ?? 'row']}</small></div><button type="button" className="icon-button counter-aux-edit" aria-label={counter.name + ' 설정'} onClick={() => setEditingId(counter.id)}><Settings2 size={15} /></button></div>
              {counter.kind !== 'simple' && <div className="counter-progress-track"><span style={{ width: (progress * 100) + '%', background: counter.color }} /></div>}
              {counter.kind === 'task' && <small className="counter-aux-meta">다음 작업 {counter.nextTaskRow ?? counter.firstTaskRow ?? 1}단 · {taskSchedule(counter, 4).join(', ') || '일정 완료'}</small>}
              {counter.kind === 'pattern' && <small className="counter-aux-meta">다음 무늬단 {nextPatternAlertRow(counter, currentRow)}단 · {counter.repeatLength ?? 1}단마다 반복</small>}
              {counter.kind === 'simple' && <div className="counter-aux-stepper"><button type="button" aria-label={counter.name + ' 감소'} disabled={counter.value <= 0 || Boolean(counter.linkedToId)} onClick={() => modifyAuxiliary(counter, -1)}>−</button><strong>{counter.value}<small>{unitLabels[counter.unit ?? 'row']}</small></strong><button type="button" aria-label={counter.name + ' 증가'} disabled={Boolean(counter.linkedToId)} onClick={() => modifyAuxiliary(counter, 1)}>+</button></div>}
            </article>
          })}
          <div className="counter-add-area"><button ref={addButtonRef} type="button" className="counter-add-button" aria-expanded={addMenuOpen} onClick={() => setAddMenuOpen((open) => !open)}><Plus size={17} />카운터 추가</button>{addMenuOpen && <div ref={addOptionsRef} className="counter-add-options" role="group" aria-label="추가할 카운터 종류">{kinds.map((kind) => <button type="button" key={kind} disabled={maxCountersForType(counters, kind) >= MAX_COUNTERS_PER_TYPE} onClick={() => add(kind)}>{kindLabels[kind]}<span>{maxCountersForType(counters, kind)}/{MAX_COUNTERS_PER_TYPE}</span></button>)}</div>}</div>
        </section>
      </>}
    </div>}
    {!collapsed && <footer className="counter-popover-footer"><button type="button" className="counter-rewind-open" disabled={!visibleRewindRows.length} onClick={() => { setRewindRow(String(visibleRewindRows[0] ?? '')); setRewindOpen(true) }}><RotateCcw size={15} />단 되돌리기</button><span>{goalCompleted ? '목표 완료' : '현재 ' + currentRow + '단'}</span></footer>}
    {settingsOpen && <CounterSettings snapshot={snapshot} counters={counters} onClose={() => setSettingsOpen(false)} onSave={onSettingsSave} />}
    {activeEditor && <CounterEditor counter={activeEditor} counters={counters} onClose={() => setEditingId(null)} onSave={(next, label) => { onChange(next, label); setEditingId(null) }} />}
    {rewindOpen && <div className="modal-backdrop counter-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRewindOpen(false) }}><form className="modal-card counter-rewind-dialog" role="dialog" aria-modal="true" aria-label="단 되돌리기" onSubmit={confirmRewind}><div className="modal-heading"><div><p className="eyebrow">ROW HISTORY</p><h2>단 되돌리기</h2></div><button type="button" className="icon-button" aria-label="닫기" onClick={() => setRewindOpen(false)}><X size={20} /></button></div><label className="counter-settings-field">다시 뜰 단<select value={rewindRow} onChange={(event) => setRewindRow(event.currentTarget.value)}>{visibleRewindRows.map((row) => <option key={row} value={row}>{row}단</option>)}</select></label><p>선택한 단 시점의 {activeBase?.name}과 연동된 카운터·진행선을 복원합니다.</p><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setRewindOpen(false)}>취소</button><button type="submit" className="primary-button" disabled={!rewindRow}>적용</button></div></form></div>}
  </aside>
}
