import { formatDate, formatDateTime, formatNumber, t, type LocaleKey } from './locales/index'
import { useEffect, useLayoutEffect, useRef, useState, type FocusEvent as ReactFocusEvent, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDownUp, Bell, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock3, Hash, Pin, PinOff, Plus, Repeat2, RotateCcw, Settings, Settings2, Trash2, Vibrate, Volume2, X } from 'lucide-react'
import type { CounterKind, CounterSnapshot, CounterTaskKind, CounterTimerLinkMode, CounterUnit, ViewerSnapshot } from './types'
import { MAX_COUNTER_ROW, MAX_COUNTERS_PER_TYPE, counterAlertState, createCounter, counterTaskProgress, findCounterRewindCheckpoint, groupCounterTimeLaps, maxCountersForType, nextPatternAlertRow, patternRowAfterCompletion, taskSchedule } from './smartCounter'
import { ColorPresetButtons } from './ColorPresetButtons'
import { formatWorkTime } from './workTime'

const kinds: CounterKind[] = ['simple', 'pattern', 'task']
const kindLabels: Record<CounterKind, LocaleKey> = { simple: '자유 카운터', pattern: '무늬 카운터', task: '줄임·늘림 카운터' }
const unitLabels: Record<CounterUnit, LocaleKey> = { row: '단', stitch: '코', round: '회' }
const taskLabels: Record<CounterTaskKind, LocaleKey> = { decrease: '줄임', increase: '늘림' }

function translateCounterAlert(message: string) {
  let match = /^목표 (\d+)단을 완료했어요\.$/.exec(message)
  if (match) return t('목표 {row}단을 완료했어요.', { row: formatNumber(Number(match[1])) })
  match = /^다음 단에 목표 (\d+)단이에요\.$/.exec(message)
  if (match) return t('다음 단에 목표 {row}단이에요.', { row: formatNumber(Number(match[1])) })
  match = /^(.+) · (늘림|줄임) 작업 단이에요\.$/.exec(message)
  if (match) return t('{name} · {task} 작업 단이에요.', { name: match[1], task: t(match[2] as LocaleKey) })
  match = /^(.+) · 무늬 반복 단이에요\.$/.exec(message)
  if (match) return t('{name} · 무늬 반복 단이에요.', { name: match[1] })
  match = /^다음 단에 (.+) (늘림|줄임) 작업이 있어요\.$/.exec(message)
  if (match) return t('다음 단에 {name} {task} 작업이 있어요.', { name: match[1], task: t(match[2] as LocaleKey) })
  match = /^다음 단에 (.+) 무늬단이 시작돼요\.$/.exec(message)
  if (match) return t('다음 단에 {name} 무늬단이 시작돼요.', { name: match[1] })
  return message
}

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

function CounterEditor({ counter, counters, isNew = false, portal = true, inline = false, onClose, onSave, onSavingChange }: {
  counter: CounterSnapshot
  counters: CounterSnapshot[]
  isNew?: boolean
  portal?: boolean
  onClose: () => void
  onSave: (updated: CounterSnapshot[], label: string) => void | boolean | Promise<boolean>
  inline?: boolean
  onSavingChange?: (saving: boolean) => void
}) {
  const [draft, setDraft] = useState<CounterSnapshot>({ ...counter, taskRecords: counter.taskRecords?.map((item) => ({ ...item })), instructions: counter.instructions?.map((item) => ({ ...item })) })
  const draftRef = useRef(draft)
  const dirtyRef = useRef(false)
  const savingRef = useRef(false)
  const retryCloseRef = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [selectedMembers, setSelectedMembers] = useState(() => new Set(counters.filter((item) => item.linkedToId === counter.id).map((item) => item.id)))
  const selectedMembersRef = useRef(selectedMembers)
  const [linkedToId, setLinkedToId] = useState(counter.linkedToId ?? '')
  const linkedToIdRef = useRef(linkedToId)
  const [advanced, setAdvanced] = useState(false)
  const [previewGenerated, setPreviewGenerated] = useState(false)
  const rowBases = counters.filter((item) => item.id !== counter.id && item.kind === 'simple' && item.unit === 'row' && !item.linkedToId)
  const defaultBase = rowBases[0]

  function set<K extends keyof CounterSnapshot>(key: K, value: CounterSnapshot[K]) {
    const next = { ...draftRef.current, [key]: value }
    draftRef.current = next
    dirtyRef.current = true
    setDraft(next)
    setError('')
  }

  function setAndSave<K extends keyof CounterSnapshot>(key: K, value: CounterSnapshot[K]) {
    set(key, value)
    if (!isNew) void saveDraft(false)
  }

  function buildNext(updatedDraft: CounterSnapshot) {
    let next = counters.some((item) => item.id === updatedDraft.id)
      ? counters.map((item) => item.id === updatedDraft.id ? updatedDraft : item)
      : [...counters, updatedDraft]
    const rowBase = updatedDraft.kind === 'simple' && updatedDraft.unit === 'row' && !updatedDraft.linkedToId
    if (rowBase) {
      next = next.map((item) => item.id !== updatedDraft.id && (item.linkedToId === updatedDraft.id || selectedMembersRef.current.has(item.id))
        ? selectedMembersRef.current.has(item.id) ? { ...item, linkedToId: updatedDraft.id } : { ...item, linkedToId: undefined }
        : item)
    } else {
      next = next.map((item) => item.id === updatedDraft.id ? { ...item, linkedToId: linkedToIdRef.current || undefined } : item)
    }
    return next
  }

  async function saveDraft(closeAfter: boolean) {
    if (savingRef.current) return false
    if (!isNew && !dirtyRef.current) {
      if (closeAfter) onClose()
      return true
    }
    if (!formRef.current?.checkValidity()) {
      formRef.current?.reportValidity()
      return false
    }
    const updatedDraft = { ...draftRef.current, name: draftRef.current.name.trim() || t(kindLabels[draftRef.current.kind]) }
    const next = buildNext(updatedDraft)
    const action = () => onSave(next, isNew ? t(kindLabels[updatedDraft.kind]) + ' ' + t('추가') : '카운터 설정 변경')
    savingRef.current = true
    setSaving(true)
    onSavingChange?.(true)
    setError('')
    try {
      const result = await action()
      if (result === false) throw new Error('save failed')
      retryCloseRef.current = false
      draftRef.current = updatedDraft
      setDraft(updatedDraft)
      dirtyRef.current = false
      if (closeAfter) onClose()
    } catch {
      retryCloseRef.current = closeAfter
      setError(t('카운터와 진행선을 저장하지 못했습니다. 저장 공간을 확인하고 다시 시도해 주세요.'))
    } finally {
      savingRef.current = false
      setSaving(false)
      onSavingChange?.(false)
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void saveDraft(true)
  }

  function saveOnBlur(event: ReactFocusEvent<HTMLFormElement>) {
    const target = event.target
    if (!isNew && (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement && ['text', 'number'].includes(target.type))) void saveDraft(false)
  }

  function saveOnEnter(event: ReactKeyboardEvent<HTMLFormElement>) {
    if (isNew || event.key !== 'Enter' || !(event.target instanceof HTMLInputElement) || !['text', 'number'].includes(event.target.type)) return
    event.preventDefault()
    void saveDraft(false)
  }

  function chooseKind(kind: CounterKind) {
    if (maxCountersForType(counters, kind) >= MAX_COUNTERS_PER_TYPE) return
    const replacement = createCounter(kind, t(kindLabels[kind]))
    const next: CounterSnapshot = kind === 'simple'
      ? { ...replacement, id: draft.id, value: 0, unit: 'stitch' }
      : kind === 'pattern'
        ? { ...replacement, id: draft.id, ...(defaultBase ? { linkedToId: defaultBase.id, currentRow: defaultBase.value, startRow: defaultBase.value } : {}), repeatLength: 8 }
        : { ...replacement, id: draft.id, ...(defaultBase ? { linkedToId: defaultBase.id, currentRow: defaultBase.value } : {}), firstTaskRow: defaultBase?.value ?? 1, nextTaskRow: defaultBase?.value ?? 1, interval: 2, total: 8 }
    draftRef.current = next
    dirtyRef.current = true
    setDraft(next)
    linkedToIdRef.current = next.linkedToId ?? ''
    setLinkedToId(linkedToIdRef.current)
    setAdvanced(false)
    setPreviewGenerated(false)
    if (!isNew) void saveDraft(false)
  }

  function updateInstruction(id: string, change: Partial<NonNullable<CounterSnapshot['instructions']>[number]>) {
    set('instructions', (draft.instructions ?? []).map((item) => item.id === id ? { ...item, ...change } : item))
  }

  function addInstruction() {
    setAndSave('instructions', [...(draft.instructions ?? []), { id: crypto.randomUUID(), row: 1, message: '' }])
  }

  const editorForm = <form ref={formRef} className={'modal-card counter-settings-modal counter-editor' + (inline ? ' counter-panel-editor' : '')} aria-busy={saving} role={inline ? undefined : 'dialog'} aria-modal={inline ? undefined : true} aria-label={isNew ? t('보조 카운터 추가') : t(kindLabels[counter.kind]) + t(" 설정")} onSubmit={save} onBlurCapture={saveOnBlur} onKeyDownCapture={saveOnEnter}>
      <div className="modal-heading"><div>{inline && <button type="button" className="counter-editor-back" aria-label={t('뒤로')} disabled={saving} onClick={onClose}><ChevronLeft size={20} /></button>}<div><p className="eyebrow">{t('카운터 설정')}</p><h2>{isNew ? t('보조 카운터 추가') : t(kindLabels[counter.kind]) + t(" 설정")}</h2></div></div>{!inline && <button type="button" className="icon-button" aria-label={t("닫기")} disabled={saving} onClick={onClose}><X size={20} /></button>}</div>
      <div className="counter-settings-body" inert={saving}>
        {isNew && <section className="counter-kind-picker" aria-label={t('어떤 작업을 셀까요?')}>
          <strong>{t('어떤 작업을 셀까요?')}</strong>
          {kinds.map((kind) => {
            const Icon = kind === 'simple' ? Hash : kind === 'pattern' ? Repeat2 : ArrowDownUp
            const description: Record<CounterKind, LocaleKey> = { simple: '필요한 횟수를 자유롭게 세기', pattern: '4단, 8단 등의 무늬 반복하기', task: '몇 단마다 코를 늘리거나 줄이기' }
            return <button type="button" key={kind} className={'counter-kind-choice' + (draft.kind === kind ? ' selected' : '')} disabled={maxCountersForType(counters, kind) >= MAX_COUNTERS_PER_TYPE} aria-pressed={draft.kind === kind} onClick={() => chooseKind(kind)}><Icon size={19} /><span><b>{t(kindLabels[kind])}</b><small>{t(description[kind])}</small></span><i aria-hidden="true">{draft.kind === kind ? '✓' : ''}</i></button>
          })}
        </section>}
        <label className="counter-settings-field">{t("이름")}<input required maxLength={100} autoFocus value={draft.name} onChange={(event) => set('name', event.currentTarget.value)} /></label>
        <label className="counter-settings-field">{t("표시 색상")}<ColorPresetButtons label={t("카운터 색상")} className="counter-color-presets" value={draft.color} onChange={(color) => setAndSave('color', color)} /></label>
        {draft.kind === 'simple' && <>
          <label className="counter-settings-field">{t("현재 숫자")}<input type="number" min="0" max={MAX_COUNTER_ROW} value={draft.value} onChange={(event) => set('value', Number(event.currentTarget.value))} /></label>
          <label className="counter-settings-field">{t("단위")}<select value={draft.unit ?? 'row'} onChange={(event) => setAndSave('unit', event.currentTarget.value as CounterUnit)}><option value="row">{t("단")}</option><option value="stitch">{t("코")}</option><option value="round">{t("회")}</option></select></label>
        </>}
        {draft.kind === 'pattern' && <>
          <label className="counter-settings-field">{t("반복 단수")}<input required type="number" min="1" max={MAX_COUNTER_ROW} value={draft.repeatLength ?? 1} onChange={(event) => set('repeatLength', Number(event.currentTarget.value))} /></label>
          <label className="counter-settings-field">{t("첫 무늬단")}<input required type="number" min="1" max={MAX_COUNTER_ROW} value={draft.startRow ?? 1} onChange={(event) => set('startRow', Number(event.currentTarget.value))} /></label>
          <div className="counter-settings-checks"><label><input type="checkbox" checked={draft.patternAlertEnabled !== false} onChange={(event) => setAndSave('patternAlertEnabled', event.currentTarget.checked)} />{t("무늬단에서 알려주기")}</label><label><input type="checkbox" checked={draft.patternPreviewEnabled === true} onChange={(event) => setAndSave('patternPreviewEnabled', event.currentTarget.checked)} />{t("1단 전에 미리 알리기")}</label></div>
          <button type="button" className="secondary-button counter-advanced-toggle" aria-expanded={advanced} onClick={() => setAdvanced((open) => !open)}>{advanced ? t('추가 설정 접기') : t('추가 설정 펼치기')}{advanced ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button>
          {advanced && <>
            <div className="counter-settings-grid">
              <label className="counter-settings-field">{t("현재 단")}<input type="number" min="1" max={MAX_COUNTER_ROW} value={draft.currentRow ?? 1} onChange={(event) => set('currentRow', Number(event.currentTarget.value))} /></label>
              <label className="counter-settings-field">{t("현재 무늬 단")}<input type="number" min="1" max={draft.repeatLength ?? 1} value={draft.patternRow ?? 1} onChange={(event) => set('patternRow', Number(event.currentTarget.value))} /></label>
            </div>
            <div className="counter-settings-grid">
              <label className="counter-settings-field">{t("반복 번호 시작")}<input type="number" min="1" max={MAX_COUNTER_ROW} placeholder={t("입력 시 표시")} value={draft.repeatStartNumber ?? ''} onChange={(event) => set('repeatStartNumber', event.currentTarget.value ? Number(event.currentTarget.value) : undefined)} /></label>
            </div>
            <label className="counter-settings-field">{t("총 반복 횟수")}<input type="number" min="1" max={MAX_COUNTER_ROW} placeholder={t("계속 반복")} value={draft.repeatCount ?? ''} onChange={(event) => set('repeatCount', event.currentTarget.value ? Number(event.currentTarget.value) : null)} /></label>
            <section className="counter-task-settings" aria-label={t("무늬 교차 안내")}>
              <div className="counter-task-settings-heading"><strong>{t("교차·무늬 안내")}</strong></div>
              {(draft.instructions ?? []).map((item) => <div className="counter-instruction-row" key={item.id}>
                <label>{t("무늬 단")}<input type="number" min="1" max={draft.repeatLength ?? MAX_COUNTER_ROW} value={item.row} onChange={(event) => updateInstruction(item.id, { row: Number(event.currentTarget.value) })} /></label>
                <label>{t("안내 문구")}<input maxLength={2000} value={item.message} onChange={(event) => updateInstruction(item.id, { message: event.currentTarget.value })} placeholder={t("예: 왼쪽으로 교차")} /></label>
                <button type="button" className="icon-button" aria-label={t("안내 삭제")} onClick={() => setAndSave('instructions', (draft.instructions ?? []).filter((candidate) => candidate.id !== item.id))}><Trash2 size={15} /></button>
              </div>)}
              <button type="button" className="secondary-button counter-task-add" onClick={addInstruction}><Plus size={15} />{t("교차 안내 추가")}</button>
            </section>
          </>}
        </>}
        {draft.kind === 'task' && <>
          <fieldset className="counter-task-kind-field"><legend>{t('어떤 작업인가요?')}</legend><div role="group" aria-label={t('어떤 작업인가요?')}><button type="button" className={(draft.taskKind ?? 'decrease') === 'decrease' ? 'selected' : ''} aria-pressed={(draft.taskKind ?? 'decrease') === 'decrease'} onClick={() => setAndSave('taskKind', 'decrease')}>{t('줄임')}</button><button type="button" className={draft.taskKind === 'increase' ? 'selected' : ''} aria-pressed={draft.taskKind === 'increase'} onClick={() => setAndSave('taskKind', 'increase')}>{t('늘림')}</button></div></fieldset>
          <div className="counter-settings-grid">
            <label className="counter-settings-field">{t("몇 단부터 시작하나요?")}<input type="number" min="1" max={MAX_COUNTER_ROW} value={draft.firstTaskRow ?? 1} onChange={(event) => { const firstTaskRow = Number(event.currentTarget.value); set('firstTaskRow', firstTaskRow); set('nextTaskRow', firstTaskRow) }} /></label>
            <label className="counter-settings-field">{t("이후 간격")}<input type="number" min="1" max={MAX_COUNTER_ROW} value={draft.interval ?? 6} onChange={(event) => set('interval', Number(event.currentTarget.value))} /></label>
          </div>
          <label className="counter-settings-field">{t("몇 번 하나요?")}<input type="number" min="1" max={MAX_COUNTER_ROW} value={draft.total ?? 8} onChange={(event) => set('total', Number(event.currentTarget.value))} /></label>
          {isNew && <button type="button" className="counter-preview-generate" onClick={() => setPreviewGenerated(true)}><Check size={16} />{t('미리보기 생성')}</button>}
          {(!isNew || previewGenerated) && <div className="counter-schedule-preview"><strong>{t(draft.taskKind === 'increase' ? '늘림 미리보기' : '줄임 미리보기')}</strong><span>{formatNumber(draft.completedCount ?? 0)} / {formatNumber(draft.total ?? 8)}{t('회')}</span><small>{taskSchedule(draft, 8).join(' · ') || t('일정 완료')}</small></div>}
          <button type="button" className="secondary-button counter-advanced-toggle" aria-expanded={advanced} onClick={() => setAdvanced((open) => !open)}>{advanced ? t('추가 설정 접기') : t('추가 설정 펼치기')}{advanced ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button>
          {advanced && <div className="counter-settings-grid">
            <label className="counter-settings-field">{t("현재 단")}<input type="number" min="1" max={MAX_COUNTER_ROW} value={draft.currentRow ?? 1} onChange={(event) => set('currentRow', Number(event.currentTarget.value))} /></label>
            <label className="counter-settings-field">{t("완료한 횟수")}<input type="number" min="0" max={draft.total ?? MAX_COUNTER_ROW} value={draft.completedCount ?? 0} onChange={(event) => { const completedCount = Number(event.currentTarget.value); set('completedCount', completedCount); set('value', completedCount) }} /></label>
            <label className="counter-settings-field">{t("다음 작업 단")}<input type="number" min="1" max={MAX_COUNTER_ROW} value={draft.nextTaskRow ?? draft.firstTaskRow ?? 1} onChange={(event) => set('nextTaskRow', Number(event.currentTarget.value))} /></label>
          </div>}
        </>}
        {draft.kind === 'simple' && draft.unit === 'row' && !draft.linkedToId && <section className="counter-link-editor"><strong>{t("이 단 완료와 함께 진행")}</strong><span>{t("현재 숫자는 유지되고 다음 완료부터 적용됩니다.")}</span>{counters.filter((item) => item.id !== draft.id && (!item.linkedToId || item.linkedToId === draft.id) && (!counters.some((child) => child.linkedToId === item.id) || item.linkedToId === draft.id)).map((item) => <label key={item.id}><input type="checkbox" checked={selectedMembers.has(item.id)} onChange={(event) => { const next = new Set(selectedMembersRef.current); if (event.currentTarget.checked) next.add(item.id); else next.delete(item.id); selectedMembersRef.current = next; setSelectedMembers(next); dirtyRef.current = true; setError(''); if (!isNew) void saveDraft(false) }} />{item.name} · {t(kindLabels[item.kind])}</label>)}</section>}
        {!(draft.kind === 'simple' && draft.unit === 'row' && !draft.linkedToId) && <label className="counter-settings-field">{t("함께 진행할 기준 단")}<select value={linkedToId} onChange={(event) => { linkedToIdRef.current = event.currentTarget.value; setLinkedToId(linkedToIdRef.current); set('linkedToId', linkedToIdRef.current || undefined); if (!isNew) void saveDraft(false) }}><option value="">{t("연동 안 함")}</option>{rowBases.map((base) => <option key={base.id} value={base.id}>{base.name}{t(" · 현재 ")}{base.value}{t("단")}</option>)}</select></label>}
        {draft.linkedToId && <p className="counter-link-note">{t("현재 단 ")}{draft.currentRow ?? 1}{t(" · 기준 카운터와 함께 진행합니다.")}</p>}
        {error && <div className="counter-storage-error" role="alert"><span>{error}</span><button type="button" disabled={saving} onClick={() => void saveDraft(retryCloseRef.current)}>{saving ? t('저장하는 중…') : t('다시 시도')}</button></div>}
        <div className="modal-actions"><button type="button" className="secondary-button" disabled={saving} onClick={onClose}>{inline ? t('뒤로') : t("취소")}</button><button type="submit" className="primary-button" disabled={saving}><Check size={17} />{saving ? t('저장하는 중…') : isNew ? t('추가') : t("저장")}</button></div>
      </div>
    </form>
  const dialog = <div className="modal-backdrop counter-modal-backdrop counter-editor-backdrop" role="presentation" onKeyDownCapture={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose() } }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>{editorForm}</div>
  return inline ? editorForm : portal ? createPortal(dialog, document.body) : dialog
}

function sideForGoal(goalRow: number, finalSide: 'rs' | 'ws', row: number) {
  return Math.abs(goalRow - row) % 2 === 0 ? finalSide : finalSide === 'rs' ? 'ws' : 'rs'
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function CounterSettings({ snapshot, counters, timerLinkMode, onSave, onCounterSave, onTimerLinkModeChange, onEdit, onAdd, onSavingChange }: {
  snapshot: ViewerSnapshot
  counters: CounterSnapshot[]
  timerLinkMode: CounterTimerLinkMode
  onSave: (next: CounterSnapshot[], changes: Partial<ViewerSnapshot>, label: string) => Promise<boolean>
  onCounterSave: (next: CounterSnapshot[], label: string) => void | boolean | Promise<boolean>
  onTimerLinkModeChange: (mode: CounterTimerLinkMode) => Promise<void>
  onEdit: (counter: CounterSnapshot, trigger: HTMLButtonElement) => void
  onAdd: () => void
  onSavingChange: (saving: boolean) => void
}) {
  const baseCounters = counters.filter((counter) => counter.kind === 'simple' && counter.unit === 'row' && !counter.linkedToId)
  const initialBase = baseCounters.find((counter) => counter.id === snapshot.counterMainId) ?? baseCounters[0]
  const [draft, setDraft] = useState(() => ({
    mainId: initialBase?.id ?? '',
    goalRow: initialBase?.goalRow ? String(initialBase.goalRow) : '',
    firstSide: initialBase?.firstSide ?? 'rs' as 'rs' | 'ws',
    goalFinalSide: initialBase?.goalFinalSide ?? 'rs' as 'rs' | 'ws',
    goalAlert: initialBase?.goalAlertEnabled !== false,
    sound: snapshot.counterSoundEnabled === true,
    vibration: snapshot.counterVibrationEnabled === true,
    preview: snapshot.counterPreviewEnabled === true,
    timerLinkMode,
  }))
  const draftRef = useRef(draft)
  const savingRef = useRef(false)
  const retryRef = useRef<(() => Promise<boolean>) | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function runSave(action: () => Promise<boolean>) {
    if (savingRef.current) return false
    savingRef.current = true
    setSaving(true)
    onSavingChange(true)
    try {
      if (!await action()) throw new Error('save failed')
      retryRef.current = null
      setError('')
      return true
    } catch {
      retryRef.current = action
      setError(t('카운터와 진행선을 저장하지 못했습니다. 저장 공간을 확인하고 다시 시도해 주세요.'))
      return false
    } finally {
      savingRef.current = false
      setSaving(false)
      onSavingChange(false)
    }
  }

  function persist(nextDraft = draftRef.current, nextCounters = counters) {
    draftRef.current = nextDraft
    setDraft(nextDraft)
    retryRef.current = null
    setError('')
    const selected = nextCounters.find((counter) => counter.id === nextDraft.mainId)
    if (!selected || selected.kind !== 'simple' || selected.unit !== 'row') {
      setError(t('메인 단 카운터를 선택해 주세요.'))
      return
    }
    const parsedGoal = nextDraft.goalRow.trim() ? Number(nextDraft.goalRow) : null
    if (parsedGoal !== null && (!Number.isSafeInteger(parsedGoal) || parsedGoal < 1 || parsedGoal > MAX_COUNTER_ROW)) {
      setError(t('목표 단은 1~{max} 사이의 정수로 입력해 주세요.', { max: formatNumber(MAX_COUNTER_ROW) }))
      return
    }
    if (parsedGoal !== null && parsedGoal < selected.value) {
      setError(t('목표 단은 현재 단({current}단) 이상으로 설정해 주세요.', { current: formatNumber(selected.value) }))
      return
    }
    const next = nextCounters.map((counter) => counter.id !== nextDraft.mainId || counter.kind !== 'simple' ? counter : {
      ...counter,
      goalRow: parsedGoal,
      goalFinalSide: parsedGoal === null ? undefined : nextDraft.goalFinalSide,
      firstSide: nextDraft.firstSide,
      goalAlertEnabled: nextDraft.goalAlert,
      goalCompleted: parsedGoal !== null && parsedGoal === counter.goalRow ? counter.goalCompleted === true : false,
    })
    const action = async () => {
      const timerLinkChanged = nextDraft.timerLinkMode !== timerLinkMode
      if (timerLinkChanged) await onTimerLinkModeChange(nextDraft.timerLinkMode)
      const saved = await onSave(next, {
        counterMainId: nextDraft.mainId,
        counterSoundEnabled: nextDraft.sound,
        counterVibrationEnabled: nextDraft.vibration,
        counterPreviewEnabled: nextDraft.preview,
        counterAlertAcknowledged: '',
      }, '카운터 설정 변경')
      if (saved || !timerLinkChanged) return saved
      await onTimerLinkModeChange(timerLinkMode)
      return false
    }
    void runSave(action)
  }

  function changeDraft(change: Partial<typeof draft>) {
    const next = { ...draftRef.current, ...change }
    persist(next)
  }

  function selectMain(id: string) {
    const selected = baseCounters.find((counter) => counter.id === id)
    if (!selected) return
    const next = { ...draftRef.current, mainId: id, goalRow: selected.goalRow ? String(selected.goalRow) : '', firstSide: selected.firstSide ?? 'rs' as const, goalFinalSide: selected.goalFinalSide ?? 'rs' as const, goalAlert: selected.goalAlertEnabled !== false }
    persist(next)
  }

  function changeFirstSide(side: 'rs' | 'ws') {
    const target = Number(draftRef.current.goalRow)
    const next = { ...draftRef.current, firstSide: side, ...(Number.isSafeInteger(target) && target > 0 ? { goalFinalSide: sideForGoal(target, side, 1) } : {}) }
    persist(next)
  }

  function changeGoalSide(side: 'rs' | 'ws') {
    const target = Number(draftRef.current.goalRow)
    const next = { ...draftRef.current, goalFinalSide: side, ...(Number.isSafeInteger(target) && target > 0 ? { firstSide: sideForGoal(target, side, 1) } : {}) }
    persist(next)
  }

  function saveCounterList(next: CounterSnapshot[], label: string, nextDraft = draftRef.current) {
    void runSave(async () => {
      const selected = next.find((counter) => counter.id === nextDraft.mainId)
      const adjusted = selected?.kind === 'simple' ? next.map((counter) => counter.id === selected.id ? { ...counter, goalRow: nextDraft.goalRow.trim() ? Number(nextDraft.goalRow) : null, goalFinalSide: nextDraft.goalRow.trim() ? nextDraft.goalFinalSide : undefined, firstSide: nextDraft.firstSide, goalAlertEnabled: nextDraft.goalAlert } : counter) : next
      const result = await onCounterSave(adjusted, label)
      return result !== false
    })
  }

  function removeCounter(counter: CounterSnapshot) {
    if (!window.confirm(t('카운터를 삭제할까요?'))) return
    const next = counters.filter((item) => item.id !== counter.id).map((item) => item.linkedToId === counter.id ? { ...item, linkedToId: undefined } : item)
    if (counter.id !== draft.mainId) {
      saveCounterList(next, '카운터 삭제')
      return
    }
    const replacement = next.find((item) => item.kind === 'simple' && item.unit === 'row' && !item.linkedToId)
    if (!replacement) return
    const nextDraft = { ...draftRef.current, mainId: replacement.id, goalRow: replacement.goalRow ? String(replacement.goalRow) : '', firstSide: replacement.firstSide ?? 'rs' as const, goalFinalSide: replacement.goalFinalSide ?? 'rs' as const, goalAlert: replacement.goalAlertEnabled !== false }
    draftRef.current = nextDraft
    setDraft(nextDraft)
    void runSave(() => onSave(next, { counterMainId: replacement.id, counterSoundEnabled: nextDraft.sound, counterVibrationEnabled: nextDraft.vibration, counterPreviewEnabled: nextDraft.preview, counterAlertAcknowledged: '' }, '카운터 삭제'))
  }

  const mainId = draft.mainId
  return <div className="counter-settings-modal counter-global-settings counter-panel-settings" aria-label={t('카운터 설정')}>
      <div className="counter-settings-body">
        <section className="counter-global-section"><h3>{t("메인 카운터")}</h3>
          <label className="counter-settings-field">{t("현재 작업")}<select disabled={saving} value={draft.mainId} onChange={(event) => selectMain(event.currentTarget.value)}>{baseCounters.map((counter) => <option key={counter.id} value={counter.id}>{counter.name}{t(" · 현재 ")}{counter.value}{t("단")}</option>)}</select></label>
          <label className="counter-settings-field">{t("목표 단 ")}<span className="counter-field-hint">{t("선택 항목")}</span><input disabled={saving} type="number" min="1" max={MAX_COUNTER_ROW} value={draft.goalRow} onChange={(event) => { const goalRow = event.currentTarget.value; const target = Number(goalRow); const next = { ...draftRef.current, goalRow, ...(Number.isSafeInteger(target) && target > 0 ? { goalFinalSide: sideForGoal(target, draftRef.current.firstSide, 1) } : {}) }; draftRef.current = next; setDraft(next); retryRef.current = null; setError('') }} onBlur={() => persist()} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() } }} placeholder={t("목표 없이 계속 뜨기")} /></label>
          {draft.goalRow && <div className="counter-settings-choice"><span>{t("목표 마지막 면")}</span>{(['rs', 'ws'] as const).map((side) => <button type="button" disabled={saving} key={side} className={draft.goalFinalSide === side ? 'selected' : ''} onClick={() => changeGoalSide(side)}>{side.toUpperCase()}</button>)}</div>}
          <div className="counter-settings-choice"><span>{t("첫 단 면")}</span>{(['rs', 'ws'] as const).map((side) => <button type="button" disabled={saving} key={side} className={draft.firstSide === side ? 'selected' : ''} onClick={() => changeFirstSide(side)}>{side.toUpperCase()}</button>)}</div>
          {draft.goalRow && <label className="counter-settings-toggle"><input disabled={saving} type="checkbox" checked={draft.goalAlert} onChange={(event) => changeDraft({ goalAlert: event.currentTarget.checked })} /><Bell size={16} />{t("목표 단 완료 시 알려주기")}</label>}
        </section>
        <section className="counter-global-section"><h3>{t("알림")}</h3>
          <label className="counter-settings-toggle"><input disabled={saving} type="checkbox" checked={draft.sound} onChange={(event) => changeDraft({ sound: event.currentTarget.checked })} /><Volume2 size={16} />{t("단 완료·작업 알림 소리")}</label>
          <label className="counter-settings-toggle"><input disabled={saving} type="checkbox" checked={draft.vibration} onChange={(event) => changeDraft({ vibration: event.currentTarget.checked })} /><Vibrate size={16} />{t("진동 알림")}</label>
          <label className="counter-settings-toggle"><input disabled={saving} type="checkbox" checked={draft.preview} onChange={(event) => changeDraft({ preview: event.currentTarget.checked })} /><Bell size={16} />{t("1단 전 미리 알리기")}</label>
        </section>
        <section className="counter-global-section"><h3>{t('카운터와 타이머')}</h3>
          <div className="counter-timer-link-options" role="radiogroup" aria-label={t('카운터와 타이머')}>
            <label className="counter-timer-link-option"><input disabled={saving} type="radio" name="counter-timer-link" value="auto" checked={draft.timerLinkMode === 'auto'} onChange={() => changeDraft({ timerLinkMode: 'auto' })} /><span><strong>{t('자동 시작')}</strong><small>{t('오늘 처음 카운터를 조작하면 타이머를 자동으로 시작합니다.')}</small></span></label>
            <label className="counter-timer-link-option"><input disabled={saving} type="radio" name="counter-timer-link" value="ask-once" checked={draft.timerLinkMode === 'ask-once'} onChange={() => changeDraft({ timerLinkMode: 'ask-once' })} /><span><strong>{t('처음 한 번 확인 (추천)')}</strong><small>{t('처음 카운터를 조작할 때 타이머 시작 여부를 묻고 선택을 기억합니다.')}</small></span></label>
            <label className="counter-timer-link-option"><input disabled={saving} type="radio" name="counter-timer-link" value="independent" checked={draft.timerLinkMode === 'independent'} onChange={() => changeDraft({ timerLinkMode: 'independent' })} /><span><strong>{t('연동하지 않음')}</strong><small>{t('카운터와 타이머를 따로 사용합니다.')}</small></span></label>
          </div>
        </section>
        <section className="counter-global-section"><h3>{t("보조 카운터 ")}<span>{t("종류별 최대 5개")}</span></h3>
          {counters.map((counter) => <div className="counter-manage-row" key={counter.id}>
            <button type="button" disabled={saving} className={'counter-manage-main' + (counter.id === mainId ? ' selected' : '')} onClick={(event) => onEdit(counter, event.currentTarget)} aria-label={counter.name + ' ' + t('설정')}>
              <span className="counter-manage-kind-dot" style={{ background: counter.color }} />
              <span><strong>{counter.name}</strong><small>{t(kindLabels[counter.kind])} · {counter.kind === 'simple' ? counter.value + t(unitLabels[counter.unit ?? 'row']) : counter.kind === 'task' ? (counter.completedCount ?? 0) + '/' + (counter.total ?? 0) + t('회') : (counter.patternRow ?? 1) + '/' + (counter.repeatLength ?? 1) + t('단')}</small></span>
              <ChevronRight size={18} />
            </button>
            <button type="button" disabled={saving} className="icon-button" aria-label={counter.pinned ? t('고정 해제') : t('상단 고정')} onClick={() => saveCounterList(counters.map((item) => item.id === counter.id ? { ...item, pinned: !item.pinned } : item), '고정 변경')}>
              {counter.pinned ? <PinOff size={15} /> : <Pin size={15} />}
            </button>
            <button type="button" className="icon-button" aria-label={counter.name + ' ' + t('삭제')} title={counter.id === mainId && baseCounters.length <= 1 ? t('메인 카운터는 하나 이상 필요합니다') : t('삭제')} disabled={saving || counter.id === mainId && baseCounters.length <= 1} onClick={() => removeCounter(counter)}><Trash2 size={15} /></button>
          </div>)}
          {!counters.length && <p className="counter-settings-note">{t("아직 추가한 카운터가 없습니다.")}</p>}
          <button type="button" className="counter-add-button" disabled={saving || kinds.every((kind) => maxCountersForType(counters, kind) >= MAX_COUNTERS_PER_TYPE)} onClick={onAdd}><Plus size={17} />{t("카운터 추가")}</button>
        </section>
        {error && <div className="counter-storage-error" role="alert"><span>{error}</span><button type="button" disabled={saving} onClick={() => { const retry = retryRef.current; if (retry) void runSave(retry) }}>{saving ? t('저장하는 중…') : t('다시 시도')}</button></div>}
      </div>
    </div>
}

export default function CounterPanel({
  snapshot, counters, timerLinkMode, onChange, onUndo, onRewind, onCounterValue, onSettingsSave, onTimerLinkModeChange, onSnapshotUpdate, onClose, triggerRef, onSavingChange,
}: {
  snapshot: ViewerSnapshot
  counters: CounterSnapshot[]
  timerLinkMode: CounterTimerLinkMode
  onChange: (counters: CounterSnapshot[], label: string) => void | boolean | Promise<boolean>
  onUndo: () => void
  onRewind: (counterId: string, targetRow: number) => void
  onCounterValue: (counterId: string, value: number) => void
  onSettingsSave: (counters: CounterSnapshot[], changes: Partial<ViewerSnapshot>, label: string) => Promise<boolean>
  onTimerLinkModeChange: (mode: CounterTimerLinkMode) => Promise<void>
  onSnapshotUpdate: (changes: Partial<ViewerSnapshot>) => void
  onClose: () => void
  triggerRef: RefObject<HTMLButtonElement | null>
  onSavingChange: (saving: boolean) => void
}) {
  const panelRef = useRef<HTMLElement>(null)
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const dragRef = useRef<{ pointerId: number; x: number; y: number; left: number; top: number; mobile: boolean } | null>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const positionRef = useRef<{ left: number; top: number } | null>(null)
  const manuallyPositionedRef = useRef(false)
  const collapsed = snapshot.counterPanelCollapsed === true
  const [activeTab, setActiveTab] = useState<'counter' | 'laps' | 'settings'>('counter')
  const [panelSaving, setPanelSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const editorTriggerRef = useRef<HTMLButtonElement | null>(null)
  const restoreEditorFocusRef = useRef(false)
  const restoreNewCounterFocusRef = useRef(false)
  const [newCounterDraft, setNewCounterDraft] = useState<CounterSnapshot | null>(null)
  const [rewindOpen, setRewindOpen] = useState(false)
  const [rewindRow, setRewindRow] = useState('')
  const [expandedLapSession, setExpandedLapSession] = useState('')
  function closePanel() {
    if (panelSaving) return
    onClose()
    requestAnimationFrame(() => triggerRef.current?.focus())
  }
  useEffect(() => {
    if (rewindOpen || panelSaving) return
    const outside = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node) || panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      if (target instanceof Element && target.closest('.pdf-scroll-area, .viewer-floating-bar')) return
      onClose()
      requestAnimationFrame(() => triggerRef.current?.focus())
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
      requestAnimationFrame(() => triggerRef.current?.focus())
    }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('keydown', escape)
    }
  }, [onClose, panelSaving, rewindOpen, triggerRef])
  const baseCounters = counters.filter((counter) => counter.kind === 'simple' && counter.unit === 'row' && !counter.linkedToId)
  const activeBase = baseCounters.find((counter) => counter.id === snapshot.counterMainId) ?? baseCounters[0]
  const activeBaseId = activeBase?.id
  const related = activeBase ? counters.filter((counter) => counter.id === activeBase.id || counter.linkedToId === activeBase.id) : []
  const auxiliary = related.filter((counter) => counter.id !== activeBase?.id)
  const currentRow = activeBase?.value ?? 1
  const timeLapSessions = groupCounterTimeLaps(snapshot.counterTimeLaps ?? [])
  const goalCompleted = activeBase?.goalCompleted === true
  const alertState = activeBase ? counterAlertState(counters, activeBase.id, snapshot.counterPreviewEnabled === true) : { key: '', messages: [] as string[] }
  const lastAlertKey = useRef(alertState.key)
  const pendingAlert = Boolean(alertState.key && snapshot.counterAlertAcknowledged !== alertState.key)
  const dueTasks = auxiliary.filter((counter) => counter.kind === 'task' && counter.nextTaskRow === currentRow && (counter.completedCount ?? 0) < (counter.total ?? 0))
  const duePatterns = auxiliary.filter((counter) => counter.kind === 'pattern' && counter.patternAlertEnabled !== false && nextPatternAlertRow(counter, currentRow) === currentRow)
  const nextEvents = auxiliary.flatMap((counter) => {
    if (counter.kind === 'task' && (counter.completedCount ?? 0) < (counter.total ?? 0) && (counter.nextTaskRow ?? 1) >= currentRow) return [{ row: counter.nextTaskRow ?? 1, label: counter.name + ' ' + t(taskLabels[counter.taskKind ?? 'decrease']) }]
    if (counter.kind === 'pattern') {
      const row = nextPatternAlertRow(counter, currentRow)
      if (row !== null) return [{ row, label: counter.name + ' ' + t('무늬단') }]
    }
    return []
  }).sort((first, second) => first.row - second.row)
  const nextEventRow = nextEvents[0]?.row
  const visibleRewindRows = activeBase ? [...new Set((snapshot.counterHistory ?? []).filter((entry) => entry.actualRow < activeBase.value && findCounterRewindCheckpoint(snapshot.counterHistory ?? [], counters, activeBase.id, entry.actualRow)).map((entry) => entry.actualRow))].sort((first, second) => second - first) : []
  const activeEditor = counters.find((counter) => counter.id === editingId)
  function closeDirectEditor() {
    restoreEditorFocusRef.current = true
    restoreNewCounterFocusRef.current = Boolean(newCounterDraft)
    setEditingId(null)
    setNewCounterDraft(null)
  }

  useLayoutEffect(() => {
    if (editingId !== null || newCounterDraft || !restoreEditorFocusRef.current) return
    restoreEditorFocusRef.current = false
    if (restoreNewCounterFocusRef.current) {
      restoreNewCounterFocusRef.current = false
      addButtonRef.current?.focus()
    } else editorTriggerRef.current?.focus()
  }, [editingId, newCounterDraft])

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

  useLayoutEffect(() => {
    const panel = panelRef.current
    const shell = panel?.parentElement
    const bar = shell?.querySelector<HTMLElement>('.viewer-timer-bar')
    if (!panel || !shell || !bar) return
    const place = () => {
      if (window.matchMedia('(max-width: 600px)').matches) {
        manuallyPositionedRef.current = false
        positionRef.current = null
        setPosition(null)
        return
      }
      const shellRect = shell.getBoundingClientRect()
      const barRect = bar.getBoundingClientRect()
      const panelWidth = panel.offsetWidth
      const panelHeight = panel.offsetHeight
      const min = 12
      const rightSide = barRect.right - shellRect.left + 8
      const leftSide = barRect.left - shellRect.left - panelWidth - 8
      const left = manuallyPositionedRef.current && positionRef.current
        ? clamp(positionRef.current.left, min, Math.max(min, shellRect.width - panelWidth - min))
        : rightSide + panelWidth <= shellRect.width - min
          ? rightSide
          : leftSide >= min
            ? leftSide
            : clamp(rightSide, min, Math.max(min, shellRect.width - panelWidth - min))
      const top = manuallyPositionedRef.current && positionRef.current
        ? clamp(positionRef.current.top, min, Math.max(min, shellRect.height - panelHeight - min))
        : clamp(barRect.top - shellRect.top, min, Math.max(min, shellRect.height - panelHeight - min))
      const current = positionRef.current
      if (current && Math.abs(current.left - left) < 1 && Math.abs(current.top - top) < 1) return
      const next = { left, top }
      positionRef.current = next
      setPosition(next)
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(panel)
    observer.observe(shell)
    observer.observe(bar)
    window.addEventListener('resize', place)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', place)
    }
  }, [activeTab, collapsed, editingId, newCounterDraft, rewindOpen, counters.length])

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
    manuallyPositionedRef.current = true
    positionRef.current = { left, top }
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

  function add() {
    const kind = kinds.find((candidate) => maxCountersForType(counters, candidate) < MAX_COUNTERS_PER_TYPE)
    if (!kind) return
    const counter = createCounter(kind, t(kindLabels[kind]))
    const initialized = kind === 'simple'
      ? { ...counter, value: 0, unit: 'stitch' as const }
      : kind === 'pattern'
        ? { ...counter, linkedToId: activeBase?.id, currentRow, startRow: currentRow, patternRow: 1, repeatLength: 8 }
        : { ...counter, linkedToId: activeBase?.id, currentRow, firstTaskRow: currentRow, nextTaskRow: currentRow, interval: 2, total: 8 }
    restoreEditorFocusRef.current = false
    setEditingId(null)
    setNewCounterDraft(initialized)
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

  return <aside ref={panelRef} className={'number-counter-panel' + (collapsed ? ' mobile-collapsed' : '')} aria-label={t("카운터")} style={position ? { left: position.left, top: position.top, right: 'auto', bottom: 'auto' } : undefined}>
    <header className="number-counter-header" onPointerDown={beginHeaderGesture} onPointerMove={moveHeaderGesture} onPointerUp={endHeaderGesture} onPointerCancel={endHeaderGesture} onLostPointerCapture={endHeaderGesture}>
      <div className="counter-drag-handle" aria-hidden="true" />
      <nav className="counter-panel-tabs" role="tablist" aria-label={t('카운터')}>
        <button type="button" role="tab" aria-selected={activeTab === 'counter'} aria-label={t('카운터')} title={t('카운터')} disabled={panelSaving} className={activeTab === 'counter' ? 'selected' : ''} onClick={() => setActiveTab('counter')}><Hash size={19} /></button>
        <button type="button" role="tab" aria-selected={activeTab === 'laps'} aria-label={t('타임랩')} title={t('타임랩')} disabled={panelSaving} className={activeTab === 'laps' ? 'selected' : ''} onClick={() => setActiveTab('laps')}><Clock3 size={19} /></button>
        <button type="button" role="tab" aria-selected={activeTab === 'settings'} aria-label={t('카운터 설정')} title={t('카운터 설정')} disabled={panelSaving} className={activeTab === 'settings' ? 'selected' : ''} onClick={() => { setActiveTab('settings'); setEditingId(null); setNewCounterDraft(null) }}><Settings size={19} /></button>
        <button type="button" className="counter-panel-close" aria-label={t("카운터 닫기")} title={t('닫기')} disabled={panelSaving} onClick={closePanel}><X size={19} /></button>
        <button type="button" className="icon-button counter-collapse-mobile" aria-label={collapsed ? t('카운터 펼치기') : t('카운터 접기')} aria-expanded={!collapsed} disabled={panelSaving} onClick={() => onChange(counters, 'panel:' + String(!collapsed))}>{collapsed ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</button>
      </nav>
    </header>
    {!collapsed && <div className="counter-popover-body">
      {activeTab === 'counter' && activeBase && <>
        <section className="counter-main-card" aria-label={t("현재 단 카운터")}>
          <div className="counter-main-heading"><span>{t("현재 단")}</span><strong>{activeBase.name}</strong></div>
          {activeBase.goalRow && <div className="counter-goal-progress"><div><span>{activeBase.goalCompleted ? formatNumber(activeBase.goalRow) + t('단') + ' ' + t('완료') : formatNumber(currentRow) + ' / ' + formatNumber(activeBase.goalRow) + t('단')}</span><span>{t("마지막 ")}{activeBase.goalFinalSide?.toUpperCase() ?? 'RS'}</span></div><progress max={activeBase.goalRow} value={Math.min(currentRow, activeBase.goalRow)} /><small>{activeBase.goalCompleted ? t('목표를 완료했어요.') : t('목표 단 ') + formatNumber(activeBase.goalRow)}</small></div>}
        </section>
        <section className={'counter-next-card' + (dueTasks.length || duePatterns.length ? ' due' : '')} aria-label={t("다음 할 일")}>
          <div className="counter-next-title"><span>{nextEventRow === currentRow ? t('이번 단') : t('다음 할 일')}</span><ChevronRight size={16} /></div>
          {nextEvents.length ? <><strong>{formatNumber(nextEventRow)}{t("단 · ")}{nextEvents.filter((item) => item.row === nextEventRow).map((item) => item.label).join(' · ')}</strong>{nextEventRow > currentRow && <small>{formatNumber(nextEventRow - currentRow)}{t("단 남았어요.")}</small>}</> : <span className="counter-no-event">{t("예정된 작업이 없어요.")}</span>}
        </section>
        {pendingAlert && <section className="counter-pending-alert" role="status"><div><Bell size={17} /><strong>{alertState.messages.map(translateCounterAlert).join(' ')}</strong></div><button type="button" onClick={() => onSnapshotUpdate({ counterAlertAcknowledged: alertState.key })}>{t("확인")}</button></section>}
        <section className="counter-aux-section"><header><h3>{t("보조 카운터")}</h3><span>{formatNumber(auxiliary.length)}</span></header>
          {auxiliary.map((counter) => {
            const status = counter.kind === 'task' ? counterTaskProgress(counter) : null
            const progress = counter.kind === 'task' ? Math.min(1, (status?.completed ?? 0) / Math.max(1, counter.total ?? 1)) : counter.kind === 'pattern' ? Math.min(1, ((counter.patternRow ?? 1) - 1) / Math.max(1, counter.repeatLength ?? 1)) : 0
            return <article className={'counter-aux-card' + (counter.kind === 'task' && counter.nextTaskRow === currentRow ? ' due' : '')} key={counter.id}>
              <div className="counter-aux-top"><span className="counter-aux-color" style={{ background: counter.color }} /><div><strong>{counter.name}</strong><small>{counter.kind === 'pattern' ? t('무늬') + ' ' + formatNumber(counter.patternRow ?? 1) + ' / ' + formatNumber(counter.repeatLength ?? 1) + t('단') : counter.kind === 'task' ? t(taskLabels[counter.taskKind ?? 'decrease']) + ' · ' + formatNumber(status?.completed ?? 0) + ' / ' + formatNumber(counter.total ?? 0) + t('회') : t(unitLabels[counter.unit ?? 'row'])}</small></div><button ref={editorTriggerRef} type="button" className="icon-button counter-aux-edit" aria-label={counter.name + ' ' + t('설정')} onClick={(event) => { editorTriggerRef.current = event.currentTarget; setEditingId(counter.id) }}><Settings2 size={15} /></button></div>
              {counter.kind !== 'simple' && <div className="counter-progress-track"><span style={{ width: (progress * 100) + '%', background: counter.color }} /></div>}
              {counter.kind === 'task' && <small className="counter-aux-meta">{t("다음 작업 ")}{formatNumber(counter.nextTaskRow ?? counter.firstTaskRow ?? 1)}{t("단 · ")}{taskSchedule(counter, 4).map((row) => formatNumber(row)).join(', ') || t('일정 완료')}</small>}
              {counter.kind === 'pattern' && <small className="counter-aux-meta">{t("다음 무늬단 ")}{nextPatternAlertRow(counter, currentRow)}{t("단 · ")}{counter.repeatLength ?? 1}{t("단마다 반복")}</small>}
              {counter.kind === 'simple' && <div className="counter-aux-stepper"><button type="button" aria-label={t('{name} 감소', { name: counter.name })} disabled={counter.value <= 0 || Boolean(counter.linkedToId)} onClick={() => modifyAuxiliary(counter, -1)}>−</button><strong>{counter.value}<small>{t(unitLabels[counter.unit ?? 'row'])}</small></strong><button type="button" aria-label={t('{name} 증가', { name: counter.name })} disabled={Boolean(counter.linkedToId)} onClick={() => modifyAuxiliary(counter, 1)}>+</button></div>}
            </article>
          })}
          <div className="counter-add-area"><button ref={addButtonRef} type="button" className="counter-add-button" disabled={kinds.every((kind) => maxCountersForType(counters, kind) >= MAX_COUNTERS_PER_TYPE)} onClick={add}><Plus size={17} />{t("카운터 추가")}</button></div>
        </section>
      </>}
      {activeTab === 'laps' && <section className="counter-lap-sessions" aria-label={t('타임랩')}>
        <header><h2>{t('타임랩')}</h2><span>{formatNumber(timeLapSessions.length)}</span></header>
        {timeLapSessions.length ? <div className="counter-lap-session-list">{timeLapSessions.map((session) => {
          const counter = counters.find((item) => item.id === session.counterId)
          const key = session.counterId + '\0' + session.sessionId
          const expanded = expandedLapSession === key
          const start = new Date(session.startedAt)
          const end = new Date(session.endedAt)
          const startDate = formatDate(start, { month: 'short', day: 'numeric' })
          const endDate = formatDate(end, { month: 'short', day: 'numeric' })
          const time = (date: Date) => formatDateTime(date, { hour: '2-digit', minute: '2-digit' })
          return <article className="counter-lap-session" key={key}>
            <button type="button" className="counter-lap-session-summary" aria-expanded={expanded} onClick={() => setExpandedLapSession(expanded ? '' : key)}>
              <span className="counter-aux-color" style={{ background: counter?.color ?? 'var(--color-primary)' }} />
              <span className="counter-lap-session-name">{counter?.name ?? t('카운터')}</span>
              <span className="counter-lap-session-time">{startDate === endDate ? startDate + ' · ' + time(start) + ' – ' + time(end) : startDate + ' ' + time(start) + ' – ' + endDate + ' ' + time(end)}</span>
              <strong>{formatNumber(session.rowCount)}{t('단')}</strong>
              {expanded ? <ChevronUp size={18} /> : <ChevronRight size={18} />}
            </button>
            {expanded && <ol className="counter-lap-session-details">{session.laps.map((lap) => <li key={lap.id}><time>{formatWorkTime(lap.durationMs)}</time><span>{lap.rowNumber === undefined ? t('단수 미기록') : formatNumber(lap.rowNumber) + t('단')}</span><strong>{lap.rowDelta > 0 ? '+1' : '−1'}{t('단')}</strong></li>)}</ol>}
          </article>
        })}</div> : <p className="counter-laps-empty">{t('타임랩 기록이 없습니다.')}</p>}
      </section>}
      {activeTab === 'settings' && (newCounterDraft
        ? <CounterEditor inline portal={false} counter={newCounterDraft} counters={counters} isNew onClose={closeDirectEditor} onSavingChange={(saving) => { setPanelSaving(saving); onSavingChange(saving) }} onSave={(next, label) => onChange(next, label)} />
        : activeEditor
          ? <CounterEditor inline portal={false} counter={activeEditor} counters={counters} onClose={closeDirectEditor} onSavingChange={(saving) => { setPanelSaving(saving); onSavingChange(saving) }} onSave={(next, label) => onChange(next, label)} />
          : <CounterSettings snapshot={snapshot} counters={counters} timerLinkMode={timerLinkMode} onSave={onSettingsSave} onCounterSave={onChange} onTimerLinkModeChange={onTimerLinkModeChange} onEdit={(counter, trigger) => { editorTriggerRef.current = trigger; setEditingId(counter.id) }} onAdd={add} onSavingChange={(saving) => { setPanelSaving(saving); onSavingChange(saving) }} />)}
    </div>}
    {!collapsed && activeTab === 'counter' && <footer className="counter-popover-footer"><button type="button" className="counter-undo-button" aria-label={t("최근 카운터·진행선 작업 되돌리기")} title={t("최근 카운터·진행선 작업 되돌리기")} disabled={!snapshot.counterHistory?.length} onClick={onUndo}><RotateCcw size={16} /></button><button type="button" className="counter-rewind-open" disabled={!visibleRewindRows.length} onClick={() => { setRewindRow(String(visibleRewindRows[0] ?? '')); setRewindOpen(true) }}><RotateCcw size={15} />{t("단 되돌리기")}</button><span>{goalCompleted ? t('목표 완료') : t('현재 {row}단', { row: formatNumber(currentRow) })}</span></footer>}
    {rewindOpen && createPortal(<div className="modal-backdrop counter-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRewindOpen(false) }}><form className="modal-card counter-rewind-dialog" role="dialog" aria-modal="true" aria-label={t("단 되돌리기")} onSubmit={confirmRewind}><div className="modal-heading"><div><p className="eyebrow">{t('단 되돌리기')}</p><h2>{t("단 되돌리기")}</h2></div><button type="button" className="icon-button" aria-label={t("닫기")} onClick={() => setRewindOpen(false)}><X size={20} /></button></div><label className="counter-settings-field">{t("다시 뜰 단")}<select value={rewindRow} onChange={(event) => setRewindRow(event.currentTarget.value)}>{visibleRewindRows.map((row) => <option key={row} value={row}>{row}{t("단")}</option>)}</select></label><p>{t("선택한 단 시점의 ")}{activeBase?.name}{t("과 연동된 카운터·진행선을 복원합니다.")}</p><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setRewindOpen(false)}>{t("취소")}</button><button type="submit" className="primary-button" disabled={!rewindRow}>{t("적용")}</button></div></form></div>, document.body)}
  </aside>
}
