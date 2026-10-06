import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Check, ChevronDown, ChevronUp, Pin, PinOff, Plus, RotateCcw, Settings2, Trash2, X } from 'lucide-react'
import type { CounterKind, CounterSnapshot, CounterTaskKind, CounterUnit, ViewerSnapshot } from './types'
import { MAX_COUNTER_ROW, MAX_COUNTERS_PER_TYPE, createCounter, counterTaskProgress, maxCountersForType, patternRowAfterCompletion, shouldPlayCounterTaskSound, taskSchedule } from './smartCounter'

const kinds: CounterKind[] = ['simple', 'pattern', 'task']
const kindLabels: Record<CounterKind, string> = { simple: '단순 카운터', pattern: '무늬 카운터', task: '줄임·늘림 카운터' }
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
        <label className="counter-settings-field">표시 색상<input aria-label="카운터 색상" type="color" value={draft.color} onChange={(event) => set('color', event.currentTarget.value)} /></label>
        {draft.kind === 'simple' && <>
          <label className="counter-settings-field">현재 숫자<input type="number" min="0" max={MAX_COUNTER_ROW} value={draft.value} onChange={(event) => set('value', Number(event.currentTarget.value))} /></label>
          <label className="counter-settings-field">단위<select value={draft.unit ?? 'row'} onChange={(event) => set('unit', event.currentTarget.value as CounterUnit)}><option value="row">단</option><option value="stitch">코</option><option value="round">회</option></select></label>
        </>}
        {draft.kind === 'pattern' && <>
          <label className="counter-settings-field">반복 단수<input required type="number" min="1" max={MAX_COUNTER_ROW} value={draft.repeatLength ?? 1} onChange={(event) => set('repeatLength', Number(event.currentTarget.value))} /></label>
          <button type="button" className="secondary-button counter-advanced-toggle" aria-expanded={advanced} onClick={() => setAdvanced((open) => !open)}>{advanced ? '추가 설정 접기' : '추가 설정 펼치기'}{advanced ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button>
          {advanced && <>
            <div className="counter-settings-grid">
              <label className="counter-settings-field">현재 단<input type="number" min="1" max={MAX_COUNTER_ROW} value={draft.currentRow ?? 1} onChange={(event) => set('currentRow', Number(event.currentTarget.value))} /></label>
              <label className="counter-settings-field">현재 무늬 단<input type="number" min="1" max={draft.repeatLength ?? 1} value={draft.patternRow ?? 1} onChange={(event) => set('patternRow', Number(event.currentTarget.value))} /></label>
            </div>
            <div className="counter-settings-grid">
              <label className="counter-settings-field">무늬 시작 단<input type="number" min="1" max={MAX_COUNTER_ROW} value={draft.startRow ?? 1} onChange={(event) => set('startRow', Number(event.currentTarget.value))} /></label>
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

export default function CounterPanel({
  snapshot, counters, onChange, onAdvance, onUndo, onRewind, onCounterValue,
}: {
  snapshot: ViewerSnapshot
  counters: CounterSnapshot[]
  onChange: (counters: CounterSnapshot[], label: string) => void
  onAdvance: (counterId: string) => void
  onUndo: () => void
  onRewind: (counterId: string, targetRow: number) => void
  onCounterValue: (counterId: string, value: number) => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(snapshot.counterPanelCollapsed === true)
  const [rewindBase, setRewindBase] = useState('')
  const [rewindRow, setRewindRow] = useState('')
  const [rewindOpen, setRewindOpen] = useState(false)
  const [activeCounterId, setActiveCounterId] = useState('')
  const soundInitialized = useRef(false)
  const lastSoundHistoryId = useRef<string | null>(null)
  const lastActualRow = useRef<number | null>(null)
  const baseCounters = counters.filter((counter) => counter.kind === 'simple' && counter.unit === 'row' && !counter.linkedToId)
  const activeBase = counters.find((counter) => counter.id === activeCounterId) ?? baseCounters[0]
  const related = activeBase ? counters.filter((counter) => counter.id === activeBase.id || counter.linkedToId === activeBase.id) : []
  const currentRow = activeBase?.value ?? 0
  const dueTasks = related.filter((counter) => counter.kind === 'task' && counter.nextTaskRow === currentRow && (counter.completedCount ?? 0) < (counter.total ?? 0))
  const patternInstructions = related.flatMap((counter) => counter.kind === 'pattern' ? (counter.instructions ?? []).filter((item) => item.row === (counter.patternRow ?? 1)).map((item) => ({ counter, item })) : [])
  const hasCurrentInstructions = dueTasks.length > 0 || patternInstructions.length > 0
  const previewTasks = snapshot.counterPreviewEnabled ? related.filter((counter) => counter.kind === 'task' && counter.nextTaskRow === currentRow + 1 && (counter.completedCount ?? 0) < (counter.total ?? 0)) : []
  const dueKey = activeBase ? [activeBase.id, currentRow, ...dueTasks.map((counter) => counter.id), ...patternInstructions.map(({ counter, item }) => counter.id + item.id)].join(':') : ''

  useEffect(() => {
    const latestHistory = snapshot.counterHistory?.at(-1)
    if (!soundInitialized.current) {
      soundInitialized.current = true
      lastSoundHistoryId.current = latestHistory?.id ?? null
      lastActualRow.current = currentRow
      return
    }
    if (snapshot.counterSoundEnabled !== true || !hasCurrentInstructions) {
      lastSoundHistoryId.current = latestHistory?.id ?? null
      lastActualRow.current = currentRow
      return
    }
    if (activeBase && shouldPlayCounterTaskSound(latestHistory, activeBase.name, currentRow, lastSoundHistoryId.current, lastActualRow.current)) {
      try {
        const AudioContextConstructor = window.AudioContext
        if (AudioContextConstructor) {
          const context = new AudioContextConstructor()
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
      } catch { /* Audio is an optional alert. */ }
    }
    lastSoundHistoryId.current = latestHistory?.id ?? null
    lastActualRow.current = currentRow
  }, [dueKey, dueTasks.length, patternInstructions.length, hasCurrentInstructions, currentRow, activeBase, snapshot.counterSoundEnabled, snapshot.counterHistory])

  function save(next: CounterSnapshot[], label: string) {
    onChange(next, label)
  }

  function add(kind: CounterKind) {
    if (maxCountersForType(counters, kind) >= MAX_COUNTERS_PER_TYPE) return
    const next = [...counters, createCounter(kind)]
    save(next, kindLabels[kind] + ' 추가')
    setEditingId(next.at(-1)!.id)
  }

  function update(id: string, change: Partial<CounterSnapshot>, label: string) {
    save(counters.map((counter) => counter.id === id ? { ...counter, ...change } : counter), label)
  }

  function remove(counter: CounterSnapshot) {
    const next = counters.filter((item) => item.id !== counter.id).map((item) => {
      if (item.linkedToId === counter.id) return { ...item, linkedToId: undefined }
      return item
    })
    save(next, kindLabels[counter.kind] + ' 삭제')
    if (activeCounterId === counter.id) setActiveCounterId('')
  }

  function togglePin(counter: CounterSnapshot) {
    update(counter.id, { pinned: !counter.pinned }, counter.name + (counter.pinned ? ' 고정 해제' : ' 고정'))
  }

  function modifyCounter(counter: CounterSnapshot, delta: number) {
    if (counter.kind === 'simple' && counter.unit === 'row' && !counter.linkedToId) {
      if (delta > 0) onAdvance(counter.id)
      else onCounterValue(counter.id, Math.max(0, counter.value - 1))
      return
    }
    if (counter.linkedToId) return
    if (delta > 0) save(counters.map((item) => item.id === counter.id ? advanceStandalone(item) : item), counter.name + ' 진행')
    else update(counter.id, updateCounterValue(counter, counterCurrentRow(counter) - 1), counter.name + ' 보정')
  }

  function confirmRewind(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const target = Number(rewindRow)
    if (!rewindBase || !Number.isSafeInteger(target) || target < 1) return
    onRewind(rewindBase, target)
    setRewindOpen(false)
  }

  const collapsedKinds = snapshot.collapsedCounterKinds ?? {}
  const sorted = [...counters].sort((first, second) => Number(second.pinned) - Number(first.pinned))
  const activeEditor = counters.find((counter) => counter.id === editingId)

  return <aside className={'number-counter-panel' + (collapsed ? ' mobile-collapsed' : '')} aria-label="카운터">
    <header className="number-counter-header">
      <div><strong>카운터</strong><span>최대 15개</span></div>
      <div className="number-counter-header-actions">
        <button type="button" className="counter-undo-button" title="최근 카운터·진행선 작업 되돌리기" disabled={!snapshot.counterHistory?.length} onClick={onUndo}><RotateCcw size={15} />되돌리기</button>
        <button type="button" className="icon-button counter-collapse-mobile" aria-label={collapsed ? '카운터 펼치기' : '카운터 접기'} aria-expanded={!collapsed} onClick={() => { const next = !collapsed; setCollapsed(next); onChange(counters, 'panel:' + String(next)) }}>{collapsed ? <ChevronUp size={17} /> : <ChevronDown size={17} />}</button>
      </div>
    </header>
    {activeBase && <div className="counter-current-summary"><label>기준 단<select aria-label="이번 단 기준 카운터" value={activeBase.id} onChange={(event) => setActiveCounterId(event.currentTarget.value)}>{baseCounters.map((counter) => <option key={counter.id} value={counter.id}>{counter.name}</option>)}</select></label><strong>현재 {activeBase.value}단</strong>{[...dueTasks.map((counter) => counter.name + ' ' + taskLabels[counter.taskKind ?? 'decrease']), ...patternInstructions.map(({ counter, item }) => counter.name + ': ' + item.message)].length > 0 && <span>이번 단 할 일: {[...dueTasks.map((counter) => counter.name + ' ' + taskLabels[counter.taskKind ?? 'decrease']), ...patternInstructions.map(({ counter, item }) => counter.name + ': ' + item.message)].join(' · ')}</span>}{previewTasks.length > 0 && <span>다음 단 예고: {previewTasks.map((counter) => counter.name + ' ' + taskLabels[counter.taskKind ?? 'decrease']).join(' · ')}</span>}</div>}
    {!collapsed && <>
      <div className="counter-panel-options"><label><input type="checkbox" checked={snapshot.counterSoundEnabled === true} onChange={(event) => onChange(counters, 'sound:' + String(event.currentTarget.checked))} />작업 단 소리</label><label><input type="checkbox" checked={snapshot.counterPreviewEnabled === true} onChange={(event) => onChange(counters, 'preview:' + String(event.currentTarget.checked))} />직전 단 예고</label></div>
      {kinds.map((kind) => {
        const rows = sorted.filter((counter) => counter.kind === kind)
        const isCollapsed = collapsedKinds[kind] === true
        return <section className="counter-kind-section" key={kind}>
          <header><button type="button" aria-expanded={!isCollapsed} onClick={() => onChange(counters, 'collapse:' + kind + ':' + String(!isCollapsed))}>{isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}<strong>{kindLabels[kind]}</strong><span>{rows.length}/{MAX_COUNTERS_PER_TYPE}</span></button><button type="button" className="counter-add-kind" aria-label={kindLabels[kind] + ' 추가'} title={rows.length >= MAX_COUNTERS_PER_TYPE ? '종류별 최대 5개' : kindLabels[kind] + ' 추가'} disabled={rows.length >= MAX_COUNTERS_PER_TYPE} onClick={() => add(kind)}><Plus size={15} /></button></header>
          {!isCollapsed && rows.map((counter) => {
            const row = counterCurrentRow(counter)
            const status = counter.kind === 'task' ? counterTaskProgress(counter) : null
            const repeatNumber = counter.kind === 'pattern' && counter.repeatStartNumber !== undefined && row >= (counter.startRow ?? 1)
              ? counter.repeatStartNumber + Math.floor((row - (counter.startRow ?? 1)) / (counter.repeatLength ?? 1))
              : null
            const due = counter.kind === 'task' && row === counter.nextTaskRow && (counter.completedCount ?? 0) < (counter.total ?? 0)
            const group = counter.kind === 'simple' && counter.unit === 'row' && !counter.linkedToId
            const members = counters.filter((item) => item.linkedToId === counter.id)
            return <article className={'counter-card' + (counter.pinned ? ' pinned' : '') + (due ? ' due' : '') + (counter.legacyOverflow ? ' legacy-overflow' : '')} key={counter.id}>
              <div className="counter-card-heading"><strong title={counter.name}>{counter.name}</strong><span>{counter.legacyOverflow ? '이전 항목' : kind === 'simple' ? unitLabels[counter.unit ?? 'row'] : kind === 'pattern' ? '반복 ' + (counter.repeatLength ?? 1) + '단' : taskLabels[counter.taskKind ?? 'decrease']}</span><button type="button" className="icon-button" aria-label={counter.pinned ? '상단 고정 해제' : '상단 고정'} title={counter.pinned ? '상단 고정 해제' : '상단 고정'} onClick={() => togglePin(counter)}>{counter.pinned ? <PinOff size={14} /> : <Pin size={14} />}</button><button type="button" className="icon-button" aria-label={counter.name + ' 수정'} title="수정" onClick={() => setEditingId(counter.id)}><Settings2 size={14} /></button><button type="button" className="icon-button" aria-label={counter.name + ' 삭제'} title="삭제" onClick={() => remove(counter)}><Trash2 size={14} /></button></div>
              <div className="counter-card-value"><button type="button" aria-label={counter.name + ' 감소'} disabled={row <= 1 || Boolean(counter.linkedToId)} onClick={() => modifyCounter(counter, -1)}>−</button><button type="button" className="counter-value" aria-label={counter.name + ' 숫자 직접 입력'} onClick={() => { const value = window.prompt('다음으로 진행할 숫자를 입력하세요.', String(counter.kind === 'task' ? counter.completedCount ?? 0 : row)); if (value !== null && Number.isSafeInteger(Number(value))) onCounterValue(counter.id, Number(value)) }}>{counter.kind === 'task' ? status?.completed ?? 0 : counter.kind === 'pattern' ? counter.patternRow ?? 1 : counter.value}<small>{counter.kind === 'task' ? '완료' : unitLabels[counter.kind === 'simple' ? counter.unit ?? 'row' : 'row']}</small></button><button type="button" aria-label={counter.name + ' 진행'} disabled={Boolean(counter.linkedToId)} onClick={() => modifyCounter(counter, 1)}>+</button></div>
              {counter.kind === 'pattern' && <p className="counter-card-meta">현재 {row}단 · {counter.patternRow ?? 1}/{counter.repeatLength ?? 1}단{repeatNumber === null ? '' : ' · ' + repeatNumber + '회차'}{counter.repeatCount == null ? '' : ' / ' + counter.repeatCount + '회'}</p>}
              {counter.kind === 'task' && <><p className="counter-card-meta">현재 {row}단 · {status?.completed ?? 0}/{counter.total ?? 0}회 완료 · 다음 {counter.nextTaskRow ?? counter.firstTaskRow ?? 1}단</p><p className="counter-card-meta">예정: {taskSchedule(counter, 4).join(' → ')}{(counter.total ?? 0) > 4 ? ' …' : ''}</p></>}
              {group && <><button type="button" className="counter-complete-row" onClick={() => { setActiveCounterId(counter.id); onAdvance(counter.id) }}>{counter.value}{unitLabels[counter.unit ?? 'row']} 완료</button>{members.length > 0 && <span className="counter-linked-members">함께 진행 {members.length}개</span>}</>}
              {due && <span className="counter-due-label">이번 단 {taskLabels[counter.taskKind ?? 'decrease']} · 완료 시 횟수 반영</span>}
            </article>
          })}
          {!rows.length && !isCollapsed && <p className="counter-empty">아직 추가한 카운터가 없습니다.</p>}
        </section>
      })}
      <div className="counter-history-actions"><label>단 되돌아가기 기준<select value={rewindBase} onChange={(event) => setRewindBase(event.currentTarget.value)}><option value="">기준 단 카운터 선택</option>{baseCounters.map((counter) => <option key={counter.id} value={counter.id}>{counter.name} · 현재 {counter.value}단</option>)}</select></label><input aria-label="다시 뜰 단" type="number" min="1" max={MAX_COUNTER_ROW} value={rewindRow} onChange={(event) => setRewindRow(event.currentTarget.value)} placeholder="다시 뜰 단" /><button type="button" className="secondary-button" disabled={!rewindBase || !rewindRow} onClick={() => setRewindOpen(true)}>단 되돌아가기</button></div>
    </>}
    {activeEditor && <CounterEditor counter={activeEditor} counters={counters} onClose={() => setEditingId(null)} onSave={(next, label) => { save(next, label); setEditingId(null) }} />}
    {rewindOpen && <div className="modal-backdrop counter-modal-backdrop" role="presentation"><form className="modal-card counter-rewind-dialog" role="dialog" aria-modal="true" aria-label="단 되돌아가기 확인" onSubmit={confirmRewind}><div className="modal-heading"><div><p className="eyebrow">ROW HISTORY</p><h2>단 되돌아가기</h2></div><button type="button" className="icon-button" aria-label="닫기" onClick={() => setRewindOpen(false)}><X size={20} /></button></div><p>다음으로 다시 뜰 단은 <strong>{rewindRow}단</strong>입니다.</p><p>연동된 무늬 위치와 줄임·늘림 완료 내역을 함께 되돌립니다. 이력이 없는 구간은 예상값으로 표시됩니다.</p><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setRewindOpen(false)}>취소</button><button type="submit" className="primary-button">적용</button></div></form></div>}
  </aside>
}
