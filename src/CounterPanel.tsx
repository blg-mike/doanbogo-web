import { formatDateTime, formatNumber, t, type LocaleKey } from './locales/index'
import { useEffect, useLayoutEffect, useRef, useState, type FocusEvent as ReactFocusEvent, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDownUp, Bell, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock3, GripVertical, Hash, Pin, PinOff, Plus, Repeat, Repeat2, RotateCcw, Settings, Trash2, Vibrate, Volume2, X } from 'lucide-react'
import type { CounterKind, CounterSnapshot, CounterTimerLinkMode, CounterUnit, ViewerSnapshot } from './types'
import { MAX_COUNTER_ROW, MAX_COUNTERS_PER_TYPE, counterAlertState, createCounter, findCounterRewindCheckpoint, groupCounterTimeLaps, maxCountersForType, repeatCounterProgress, stepRepeatCounter, taskSchedule } from './smartCounter'
import { ColorPresetButtons } from './ColorPresetButtons'
import { canStartCounterPopoverDrag, COUNTER_POPOVER_LONG_PRESS_MS, getCounterPopoverDragPosition, shouldCancelCounterPopoverLongPress } from './counterPopoverDrag'
import { CounterStepButton } from './CounterStepButton'

const kinds: CounterKind[] = ['simple', 'pattern', 'task', 'repeat']
const kindLabels: Record<CounterKind, LocaleKey> = { simple: '자유 카운터', pattern: '무늬 카운터', task: '줄임·늘림 카운터', repeat: '반복 카운터' }
const unitLabels: Record<CounterUnit, LocaleKey> = { row: '단', stitch: '코', round: '회' }
function counterSummary(counter: CounterSnapshot) {
  if (counter.kind === 'simple') return formatNumber(counter.value) + t(unitLabels[counter.unit ?? 'row'])
  if (counter.kind === 'task') return formatNumber(counter.completedCount ?? 0) + '/' + formatNumber(counter.total ?? 0) + t('회')
  if (counter.kind === 'repeat') return formatNumber(repeatCounterProgress(counter)?.completedRepeats ?? 0) + '/' + formatNumber(counter.repeatTarget ?? 1) + t('회')
  return formatNumber(counter.patternRow ?? 1) + '/' + formatNumber(counter.repeatLength ?? 1) + t('단')
}

function CounterEditor({ counter, counters, isNew = false, portal = true, inline = false, defaultLinkToId, onClose, onSave, onDelete, canDelete = true, onSavingChange }: {
  counter: CounterSnapshot
  counters: CounterSnapshot[]
  isNew?: boolean
  portal?: boolean
  defaultLinkToId?: string
  onClose: () => void
  onSave: (updated: CounterSnapshot[], label: string) => void | boolean | Promise<boolean>
  onDelete?: (counter: CounterSnapshot) => Promise<boolean>
  canDelete?: boolean
  inline?: boolean
  onSavingChange?: (saving: boolean) => void
}) {
  const [draft, setDraft] = useState<CounterSnapshot>({ ...counter, taskRecords: counter.taskRecords?.map((item) => ({ ...item })), instructions: counter.instructions?.map((item) => ({ ...item })) })
  const draftRef = useRef(draft)
  const dirtyRef = useRef(false)
  const savingRef = useRef(false)
  const retryCloseRef = useRef(false)
  const retryDeleteRef = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [selectedMembers, setSelectedMembers] = useState(() => new Set(counters.filter((item) => item.linkedToId === counter.id).map((item) => item.id)))
  const selectedMembersRef = useRef(selectedMembers)
  const [linkedToId, setLinkedToId] = useState(counter.linkedToId ?? '')
  const linkedToIdRef = useRef(linkedToId)
  const [repeatLinkedToId, setRepeatLinkedToId] = useState(counter.repeatLinkedToId ?? '')
  const repeatLinkedToIdRef = useRef(repeatLinkedToId)
  const [advanced, setAdvanced] = useState(false)
  const [previewGenerated, setPreviewGenerated] = useState(false)
  const rowBases = counters.filter((item) => item.id !== counter.id && item.kind === 'simple' && item.unit === 'row' && !item.linkedToId)
  const defaultBase = rowBases.find((item) => item.id === defaultLinkToId) ?? rowBases[0]

  function set<K extends keyof CounterSnapshot>(key: K, value: CounterSnapshot[K]) {
    const next = { ...draftRef.current, [key]: value }
    draftRef.current = next
    dirtyRef.current = true
    setDraft(next)
    retryDeleteRef.current = false
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
    } else if (updatedDraft.kind === 'repeat') {
      next = next.map((item) => item.id === updatedDraft.id ? { ...item, linkedToId: undefined, repeatLinkedToId: repeatLinkedToIdRef.current || undefined } : item)
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
    if (draftRef.current.kind === 'repeat') {
      const start = draftRef.current.repeatStartRow ?? 0
      const end = draftRef.current.repeatEndRow ?? 0
      const target = draftRef.current.repeatTarget ?? 0
      if ((end - start + 1) * target > MAX_COUNTER_ROW) {
        setError(t('반복 범위와 횟수의 총 단수는 9999 이하여야 합니다.'))
        return false
      }
      if (draftRef.current.value > (end - start + 1) * target) {
        setError(t('목표 반복 단수는 이미 완료한 단수보다 작을 수 없습니다.'))
        return false
      }
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

  async function deleteCounter(confirm = true) {
    if (isNew || !onDelete || confirm && !window.confirm(t('카운터를 삭제할까요?')) || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    onSavingChange?.(true)
    setError('')
    try {
      if (!await onDelete(draftRef.current)) throw new Error('delete failed')
      retryDeleteRef.current = false
      onClose()
    } catch {
      retryDeleteRef.current = true
      setError(t('카운터와 진행선을 저장하지 못했습니다. 저장 공간을 확인하고 다시 시도해 주세요.'))
    } finally {
      savingRef.current = false
      setSaving(false)
      onSavingChange?.(false)
    }
  }

  function chooseKind(kind: CounterKind) {
    if (maxCountersForType(counters, kind) >= MAX_COUNTERS_PER_TYPE) return
    const replacement = createCounter(kind, t(kindLabels[kind]))
    const next: CounterSnapshot = kind === 'simple'
      ? { ...replacement, id: draft.id, value: 0, unit: 'stitch' }
      : kind === 'pattern'
        ? { ...replacement, id: draft.id, ...(defaultBase ? { linkedToId: defaultBase.id, currentRow: defaultBase.value, startRow: defaultBase.value } : {}), repeatLength: 8 }
        : kind === 'task'
          ? { ...replacement, id: draft.id, ...(defaultBase ? { linkedToId: defaultBase.id, currentRow: defaultBase.value } : {}), firstTaskRow: defaultBase?.value ?? 1, nextTaskRow: defaultBase?.value ?? 1, interval: 2, total: 8 }
          : { ...replacement, id: draft.id, ...(defaultBase ? { repeatLinkedToId: defaultBase.id } : {}) }
    draftRef.current = next
    dirtyRef.current = true
    setDraft(next)
    linkedToIdRef.current = next.linkedToId ?? ''
    setLinkedToId(linkedToIdRef.current)
    repeatLinkedToIdRef.current = next.repeatLinkedToId ?? ''
    setRepeatLinkedToId(repeatLinkedToIdRef.current)
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
            const Icon = kind === 'simple' ? Hash : kind === 'pattern' ? Repeat2 : kind === 'task' ? ArrowDownUp : Repeat
            const description: Record<CounterKind, LocaleKey> = { simple: '필요한 횟수를 자유롭게 세기', pattern: '4단, 8단 등의 무늬 반복하기', task: '몇 단마다 코를 늘리거나 줄이기', repeat: '지정한 단 구간을 목표 횟수만큼 반복하기' }
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
        {draft.kind === 'repeat' && <>
          <div className="counter-settings-grid">
            <label className="counter-settings-field">{t('시작 단')}<input required type="number" inputMode="numeric" min="1" max={MAX_COUNTER_ROW} step="1" value={draft.repeatStartRow ?? 1} onChange={(event) => set('repeatStartRow', Number(event.currentTarget.value))} /></label>
            <label className="counter-settings-field">{t('종료 단')}<input required type="number" inputMode="numeric" min={draft.repeatStartRow ?? 1} max={MAX_COUNTER_ROW} step="1" value={draft.repeatEndRow ?? 2} onChange={(event) => set('repeatEndRow', Number(event.currentTarget.value))} /></label>
          </div>
          <label className="counter-settings-field">{t('목표 반복 횟수')}<input required type="number" inputMode="numeric" min="1" max={MAX_COUNTER_ROW} step="1" value={draft.repeatTarget ?? 5} onChange={(event) => set('repeatTarget', Number(event.currentTarget.value))} /></label>
          {(() => {
            const progress = repeatCounterProgress(draft)
            return progress && <div className="counter-repeat-preview" aria-live="polite">
              <strong>{t('반복 {start}~{end}단 × {target}회', { start: formatNumber(progress.startRow), end: formatNumber(progress.endRow), target: formatNumber(progress.target) })}</strong>
              <span>{t('완료 반복 {completed} / {target}회', { completed: formatNumber(progress.completedRepeats), target: formatNumber(progress.target) })}</span>
              <span>{progress.complete ? t('목표 반복 완료') : t('현재 {row}단 진행 예정', { row: formatNumber(progress.nextRow ?? progress.startRow) })}</span>
              <span>{t('총 {completed} / {total}단 완료', { completed: formatNumber(progress.completedRows), total: formatNumber(progress.totalRows) })}</span>
            </div>
          })()}
          <label className="counter-settings-field">{t('일반 카운터 연동')}<select value={repeatLinkedToId} onChange={(event) => { repeatLinkedToIdRef.current = event.currentTarget.value; setRepeatLinkedToId(repeatLinkedToIdRef.current); set('repeatLinkedToId', repeatLinkedToIdRef.current || undefined); if (!isNew) void saveDraft(false) }}><option value="">{t('연동 안 함')}</option>{rowBases.map((base) => <option key={base.id} value={base.id}>{base.name}{t(' · 현재 ')}{base.value}{t('단')}</option>)}</select></label>
          <p className="counter-link-note">{t('선택한 일반 카운터 숫자만 올립니다. 반복에서 −를 눌러도 일반 단수는 줄지 않습니다.')}</p>
        </>}
        {draft.kind === 'simple' && draft.unit === 'row' && !draft.linkedToId && <section className="counter-link-editor"><strong>{t("이 단 완료와 함께 진행")}</strong><span>{t("현재 숫자는 유지되고 다음 완료부터 적용됩니다.")}</span>{counters.filter((item) => item.id !== draft.id && item.kind !== 'repeat' && (!item.linkedToId || item.linkedToId === draft.id) && (!counters.some((child) => child.linkedToId === item.id) || item.linkedToId === draft.id)).map((item) => <label key={item.id}><input type="checkbox" checked={selectedMembers.has(item.id)} onChange={(event) => { const next = new Set(selectedMembersRef.current); if (event.currentTarget.checked) next.add(item.id); else next.delete(item.id); selectedMembersRef.current = next; setSelectedMembers(next); dirtyRef.current = true; setError(''); if (!isNew) void saveDraft(false) }} />{item.name} · {t(kindLabels[item.kind])}</label>)}</section>}
        {draft.kind !== 'repeat' && !(draft.kind === 'simple' && draft.unit === 'row' && !draft.linkedToId) && <label className="counter-settings-field">{t("함께 진행할 기준 단")}<select value={linkedToId} onChange={(event) => { linkedToIdRef.current = event.currentTarget.value; setLinkedToId(linkedToIdRef.current); set('linkedToId', linkedToIdRef.current || undefined); if (!isNew) void saveDraft(false) }}><option value="">{t("연동 안 함")}</option>{rowBases.map((base) => <option key={base.id} value={base.id}>{base.name}{t(" · 현재 ")}{base.value}{t("단")}</option>)}</select></label>}
        {draft.linkedToId && <p className="counter-link-note">{t("현재 단 ")}{draft.currentRow ?? 1}{t(" · 기준 카운터와 함께 진행합니다.")}</p>}
        {!isNew && <div className="counter-editor-management">
          <button type="button" aria-label={draft.pinned ? t('고정 해제') : t('상단 고정')} title={draft.pinned ? t('고정 해제') : t('상단 고정')} disabled={saving} onClick={() => setAndSave('pinned', !draft.pinned)}>{draft.pinned ? <PinOff size={16} /> : <Pin size={16} />}{draft.pinned ? t('고정 해제') : t('상단 고정')}</button>
          <button type="button" aria-label={t('삭제')} title={!canDelete ? t('메인 카운터는 하나 이상 필요합니다') : t('삭제')} disabled={saving || !canDelete} onClick={() => void deleteCounter()}><Trash2 size={16} />{t('삭제')}</button>
        </div>}
        {error && <div className="counter-storage-error" role="alert"><span>{error}</span><button type="button" disabled={saving} onClick={() => retryDeleteRef.current ? void deleteCounter(false) : void saveDraft(retryCloseRef.current)}>{saving ? t('저장하는 중…') : t('다시 시도')}</button></div>}
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

function CounterSettings({ view, snapshot, counters, timerLinkMode, onSave, onTimerLinkModeChange, onEdit, onAdd, onRepeatStep, counterActionSaving, addButtonRef, onSavingChange }: {
  view: 'main' | 'settings'
  snapshot: ViewerSnapshot
  counters: CounterSnapshot[]
  timerLinkMode: CounterTimerLinkMode
  onSave: (next: CounterSnapshot[], changes: Partial<ViewerSnapshot>, label: string) => Promise<boolean>
  onTimerLinkModeChange: (mode: CounterTimerLinkMode) => Promise<void>
  onEdit: (counter: CounterSnapshot, trigger: HTMLButtonElement) => void
  onAdd: () => void
  onRepeatStep: (counterId: string, direction: -1 | 1) => void
  counterActionSaving: boolean
  addButtonRef: RefObject<HTMLButtonElement | null>
  onSavingChange: (saving: boolean) => void
}) {
  const baseCounters = counters.filter((counter) => counter.kind === 'simple' && counter.unit === 'row' && !counter.linkedToId)
  const initialBase = baseCounters.find((counter) => counter.id === snapshot.counterMainId) ?? baseCounters[0]
  const [draft, setDraft] = useState(() => ({
    mainId: initialBase?.id ?? '',
    goalRow: initialBase?.goalRow ? String(initialBase.goalRow) : '',
    knittingMode: initialBase?.knittingMode ?? 'flat' as 'flat' | 'round',
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
      knittingMode: nextDraft.knittingMode,
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
    const next = { ...draftRef.current, mainId: id, goalRow: selected.goalRow ? String(selected.goalRow) : '', knittingMode: selected.knittingMode ?? 'flat' as const, firstSide: selected.firstSide ?? 'rs' as const, goalFinalSide: selected.goalFinalSide ?? 'rs' as const, goalAlert: selected.goalAlertEnabled !== false }
    persist(next)
  }

  function changeKnittingMode(knittingMode: 'flat' | 'round') {
    if (knittingMode === draftRef.current.knittingMode) return
    persist({ ...draftRef.current, knittingMode })
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

  const selectedMain = baseCounters.find((counter) => counter.id === draft.mainId) ?? baseCounters[0]
  const knittingModes = [['flat', '평면'], ['round', '원통']] as const
  return <div className={'counter-settings-modal counter-global-settings counter-panel-settings counter-panel-settings-' + view} aria-label={t(view === 'main' ? '카운터 설정' : '설정')}>
      <div className="counter-settings-body">
        {view === 'main' ? <>
          <h2 className="counter-panel-view-title">{t('카운터 설정')}</h2>
          <section className="counter-main-design-section">
            <header><h3>{t('메인 카운터')}</h3><strong>{selectedMain?.name ?? t('카운터')}</strong></header>
            <div className="counter-main-setting-row"><span>{t('뜨기 방식')}</span><div className="counter-knitting-mode" role="group" aria-label={t('뜨기 방식')}>
              {knittingModes.map(([mode, label]) => <button type="button" key={mode} disabled={saving} aria-pressed={draft.knittingMode === mode} className={draft.knittingMode === mode ? 'selected' : ''} onClick={() => changeKnittingMode(mode)}>{t(label)}</button>)}
            </div></div>
            <div className="counter-main-setting-row counter-goal-setting-row"><label htmlFor="counter-goal-row">{t('목표단')} <small id="counter-goal-optional">{t('선택 항목')}</small></label><div className="counter-goal-input-wrap"><input id="counter-goal-row" disabled={saving} type="number" min="1" max={MAX_COUNTER_ROW} step="1" value={draft.goalRow} aria-describedby="counter-goal-optional" placeholder="00" onChange={(event) => { const goalRow = event.currentTarget.value; const target = Number(goalRow); const next = { ...draftRef.current, goalRow, ...(Number.isSafeInteger(target) && target > 0 ? { goalFinalSide: sideForGoal(target, draftRef.current.firstSide, 1) } : {}) }; draftRef.current = next; setDraft(next); retryRef.current = null; setError('') }} onBlur={() => persist()} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() } }} /><span>{t('단')}</span></div></div>
          </section>
          <section className="counter-main-aux-section"><header><h3>{t('보조 카운터')}</h3><button ref={addButtonRef} type="button" className="counter-main-add-button" disabled={saving || kinds.every((kind) => maxCountersForType(counters, kind) >= MAX_COUNTERS_PER_TYPE)} onClick={onAdd}><Plus size={16} />{t('추가')}</button></header>
            <div className="counter-main-aux-list">{counters.filter((counter) => counter.id !== selectedMain?.id).map((counter) => counter.kind === 'repeat'
              ? (() => {
                const progress = repeatCounterProgress(counter)!
                const blocked = stepRepeatCounter(counters, counter.id, 1).blocked
                const blockedLabel = blocked === 'base-complete' ? t('연동한 일반 카운터의 목표에 도달했거나 완료되어 반복 진행을 늘릴 수 없습니다.')
                  : blocked === 'base-limit' ? t('연동한 일반 카운터가 9999단이라 반복 진행을 늘릴 수 없습니다.')
                    : blocked === 'missing-base' ? t('연동한 일반 카운터를 찾을 수 없어 진행할 수 없습니다.') : undefined
                const base = counters.find((item) => item.id === counter.repeatLinkedToId)
                return <article className="counter-main-aux-card counter-main-repeat-card" key={counter.id}>
                  <span className="counter-main-aux-color" style={{ background: counter.color }} />
                  <button type="button" className="counter-main-aux-copy counter-main-repeat-edit" disabled={saving} aria-label={`${counter.name}: ${t(kindLabels[counter.kind])}, ${counterSummary(counter)}, ${t('설정')}`} onClick={(event) => onEdit(counter, event.currentTarget)}>
                    <strong>{counter.name}</strong>
                    <small>{t('반복 {start}~{end}단 × {target}회', { start: formatNumber(progress.startRow), end: formatNumber(progress.endRow), target: formatNumber(progress.target) })}</small>
                    <small>{t('완료 반복 {completed} / {target}회', { completed: formatNumber(progress.completedRepeats), target: formatNumber(progress.target) })} · {progress.complete ? t('목표 반복 완료') : t('현재 {row}단 진행 예정', { row: formatNumber(progress.nextRow ?? progress.startRow) })}</small>
                    <small>{t('총 {completed} / {total}단 완료', { completed: formatNumber(progress.completedRows), total: formatNumber(progress.totalRows) })}</small>
                    <small>{base?.kind === 'simple' ? base.name : t('연동 안 함')}</small>
                    {blockedLabel && <small role="status">{blockedLabel}</small>}
                  </button>
                  <div className="counter-main-repeat-actions">
                    <CounterStepButton className="counter-repeat-step" label={t('반복 단 줄이기')} disabled={saving || counterActionSaving || counter.value <= 0} onStep={() => onRepeatStep(counter.id, -1)}>−</CounterStepButton>
                    <CounterStepButton className="counter-repeat-step" label={t('반복 단 늘리기')} title={blockedLabel} disabled={saving || counterActionSaving || progress.complete} onStep={() => onRepeatStep(counter.id, 1)}>+</CounterStepButton>
                  </div>
                </article>
              })()
              : <button type="button" className="counter-main-aux-card" key={counter.id} disabled={saving} aria-label={`${counter.name}: ${t(kindLabels[counter.kind])}, ${counterSummary(counter)}, ${t('설정')}`} onClick={(event) => onEdit(counter, event.currentTarget)}>
                <span className="counter-main-aux-color" style={{ background: counter.color }} /><span className="counter-main-aux-copy"><strong>{counter.name}</strong><small>{t(kindLabels[counter.kind])} · {counterSummary(counter)}</small></span><ChevronRight size={18} />
              </button>)}
            {!counters.some((counter) => counter.id !== selectedMain?.id) && <p className="counter-settings-note">{t('아직 추가한 카운터가 없습니다.')}</p>}</div>
          </section>
        </> : <>
          <h2 className="counter-panel-view-title">{t('카운터·타이머 설정')}</h2>
          <section className="counter-global-section"><h3>{t('메인 카운터')}</h3>
            <label className="counter-settings-field">{t('현재 작업')}<select disabled={saving} value={draft.mainId} onChange={(event) => selectMain(event.currentTarget.value)}>{baseCounters.map((counter) => <option key={counter.id} value={counter.id}>{counter.name}{t(' · 현재 ')}{formatNumber(counter.value)}{t('단')}</option>)}</select></label>
            <button ref={addButtonRef} type="button" className="counter-main-add-button counter-settings-add-counter" disabled={saving || kinds.every((kind) => maxCountersForType(counters, kind) >= MAX_COUNTERS_PER_TYPE)} onClick={onAdd}><Plus size={16} />{t('보조 카운터 추가')}</button>
            {draft.knittingMode === 'round' ? <p className="counter-settings-note">{t('원통에서는 RS로 계산합니다.')}</p> : <>
              {draft.goalRow && <div className="counter-settings-choice"><span>{t('목표 마지막 면')}</span>{(['rs', 'ws'] as const).map((side) => <button type="button" disabled={saving} key={side} className={draft.goalFinalSide === side ? 'selected' : ''} onClick={() => changeGoalSide(side)}>{side.toUpperCase()}</button>)}</div>}
              <div className="counter-settings-choice"><span>{t('첫 단 면')}</span>{(['rs', 'ws'] as const).map((side) => <button type="button" disabled={saving} key={side} className={draft.firstSide === side ? 'selected' : ''} onClick={() => changeFirstSide(side)}>{side.toUpperCase()}</button>)}</div>
            </>}
            {draft.goalRow && <label className="counter-settings-toggle"><input disabled={saving} type="checkbox" checked={draft.goalAlert} onChange={(event) => changeDraft({ goalAlert: event.currentTarget.checked })} /><Bell size={16} />{t('목표 단 완료 시 알려주기')}</label>}
          </section>
          <section className="counter-global-section"><h3>{t('알림')}</h3>
            <label className="counter-settings-toggle"><input disabled={saving} type="checkbox" checked={draft.sound} onChange={(event) => changeDraft({ sound: event.currentTarget.checked })} /><Volume2 size={16} />{t('단 완료·작업 알림 소리')}</label>
            <label className="counter-settings-toggle"><input disabled={saving} type="checkbox" checked={draft.vibration} onChange={(event) => changeDraft({ vibration: event.currentTarget.checked })} /><Vibrate size={16} />{t('진동 알림')}</label>
            <label className="counter-settings-toggle"><input disabled={saving} type="checkbox" checked={draft.preview} onChange={(event) => changeDraft({ preview: event.currentTarget.checked })} /><Bell size={16} />{t('1단 전 미리 알리기')}</label>
          </section>
          <section className="counter-global-section"><h3>{t('카운터와 타이머')}</h3>
            <div className="counter-timer-link-options" role="radiogroup" aria-label={t('카운터와 타이머')}>
              <label className="counter-timer-link-option"><input disabled={saving} type="radio" name="counter-timer-link" value="auto" checked={draft.timerLinkMode === 'auto'} onChange={() => changeDraft({ timerLinkMode: 'auto' })} /><span><strong>{t('자동 시작')}</strong><small>{t('오늘 처음 카운터를 조작하면 타이머를 자동으로 시작합니다.')}</small></span></label>
              <label className="counter-timer-link-option"><input disabled={saving} type="radio" name="counter-timer-link" value="ask-once" checked={draft.timerLinkMode === 'ask-once'} onChange={() => changeDraft({ timerLinkMode: 'ask-once' })} /><span><strong>{t('처음 한 번 확인 (추천)')}</strong><small>{t('처음 카운터를 조작할 때 타이머 시작 여부를 묻고 선택을 기억합니다.')}</small></span></label>
              <label className="counter-timer-link-option"><input disabled={saving} type="radio" name="counter-timer-link" value="independent" checked={draft.timerLinkMode === 'independent'} onChange={() => changeDraft({ timerLinkMode: 'independent' })} /><span><strong>{t('연동하지 않음')}</strong><small>{t('카운터와 타이머를 따로 사용합니다.')}</small></span></label>
            </div>
          </section>
          <p className="counter-settings-note">{t('변경사항은 자동 저장됩니다.')}</p>
        </>}
        {error && <div className="counter-storage-error" role="alert"><span>{error}</span><button type="button" disabled={saving} onClick={() => { const retry = retryRef.current; if (retry) void runSave(retry) }}>{saving ? t('저장하는 중…') : t('다시 시도')}</button></div>}
      </div>
    </div>
}

export default function CounterPanel({
  snapshot, counters, timerLinkMode, onChange, onUndo, onRewind, onRepeatStep, counterActionSaving, onSettingsSave, onTimerLinkModeChange, onSnapshotUpdate, onClose, triggerRef, onSavingChange,
}: {
  snapshot: ViewerSnapshot
  counters: CounterSnapshot[]
  timerLinkMode: CounterTimerLinkMode
  onChange: (counters: CounterSnapshot[], label: string) => void | boolean | Promise<boolean>
  onUndo: () => void
  onRewind: (counterId: string, targetRow: number) => void
  onRepeatStep: (counterId: string, direction: -1 | 1) => void
  counterActionSaving: boolean
  onSettingsSave: (counters: CounterSnapshot[], changes: Partial<ViewerSnapshot>, label: string) => Promise<boolean>
  onTimerLinkModeChange: (mode: CounterTimerLinkMode) => Promise<void>
  onSnapshotUpdate: (changes: Partial<ViewerSnapshot>) => void
  onClose: () => void
  triggerRef: RefObject<HTMLButtonElement | null>
  onSavingChange: (saving: boolean) => void
}) {
  const panelRef = useRef<HTMLElement>(null)
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const dragRef = useRef<{ pointerId: number; pointerType: string; startedAt: number; x: number; y: number; left: number; top: number; viewport: boolean; dragging: boolean; moved: boolean; cancelled: boolean; timerId: number; cleanup: () => void } | null>(null)
  const [position, setPosition] = useState<{ left: number; top: number; viewport: boolean } | null>(null)
  const positionRef = useRef<{ left: number; top: number; viewport: boolean } | null>(null)
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
  useEffect(() => () => dragRef.current?.cleanup(), [])
  const [rewindRow, setRewindRow] = useState('')
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
  const currentRow = activeBase?.value ?? 1
  const timeLapSessions = groupCounterTimeLaps(snapshot.counterTimeLaps ?? [])
  const goalCompleted = activeBase?.goalCompleted === true
  const alertState = activeBase ? counterAlertState(counters, activeBase.id, snapshot.counterPreviewEnabled === true) : { key: '', messages: [] as string[] }
  const lastAlertKey = useRef(alertState.key)
  const pendingAlert = Boolean(alertState.key && snapshot.counterAlertAcknowledged !== alertState.key)
  const visibleRewindRows = activeBase ? [...new Set((snapshot.counterHistory ?? []).filter((entry) => entry.actualRow < activeBase.value && findCounterRewindCheckpoint(snapshot.counterHistory ?? [], counters, activeBase.id, entry.actualRow)).map((entry) => entry.actualRow))].sort((first, second) => second - first) : []
  const activeEditor = counters.find((counter) => counter.id === editingId)
  function closeDirectEditor() {
    restoreEditorFocusRef.current = true
    restoreNewCounterFocusRef.current = Boolean(newCounterDraft)
    setEditingId(null)
    setNewCounterDraft(null)
    setActiveTab('counter')
  }

  function editCounter(counter: CounterSnapshot, trigger: HTMLButtonElement) {
    editorTriggerRef.current = trigger
    setNewCounterDraft(null)
    setEditingId(counter.id)
    setActiveTab('settings')
  }

  async function deleteCounter(counter: CounterSnapshot) {
    const next = counters.filter((item) => item.id !== counter.id).map((item) => ({
      ...item,
      ...(item.linkedToId === counter.id ? { linkedToId: undefined } : {}),
      ...(item.repeatLinkedToId === counter.id ? { repeatLinkedToId: undefined } : {}),
    }))
    if (counter.id !== activeBase?.id) return (await onChange(next, '카운터 삭제')) !== false
    const replacement = next.find((item) => item.kind === 'simple' && item.unit === 'row' && !item.linkedToId)
    if (!replacement) return false
    return onSettingsSave(next, {
      counterMainId: replacement.id,
      counterSoundEnabled: snapshot.counterSoundEnabled === true,
      counterVibrationEnabled: snapshot.counterVibrationEnabled === true,
      counterPreviewEnabled: snapshot.counterPreviewEnabled === true,
      counterAlertAcknowledged: '',
    }, '카운터 삭제')
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
        if (manuallyPositionedRef.current && positionRef.current) {
          const panelRect = panel.getBoundingClientRect()
          const base = positionRef.current.viewport ? positionRef.current : { left: panelRect.left, top: panelRect.top }
          const next = { ...getCounterPopoverDragPosition({ ...base, deltaX: 0, deltaY: 0, panelWidth: panel.offsetWidth, panelHeight: panel.offsetHeight, boundsWidth: window.innerWidth, boundsHeight: window.innerHeight }), viewport: true }
          if (positionRef.current.viewport && Math.abs(positionRef.current.left - next.left) < 1 && Math.abs(positionRef.current.top - next.top) < 1) return
          positionRef.current = next
          setPosition(next)
          return
        }
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
      const manualBase = positionRef.current?.viewport ? { left: panel.getBoundingClientRect().left - shellRect.left, top: panel.getBoundingClientRect().top - shellRect.top } : positionRef.current
      const left = manuallyPositionedRef.current && manualBase
        ? clamp(manualBase.left, min, Math.max(min, shellRect.width - panelWidth - min))
        : rightSide + panelWidth <= shellRect.width - min
          ? rightSide
          : leftSide >= min
            ? leftSide
            : clamp(rightSide, min, Math.max(min, shellRect.width - panelWidth - min))
      const top = manuallyPositionedRef.current && manualBase
        ? clamp(manualBase.top, min, Math.max(min, shellRect.height - panelHeight - min))
        : clamp(barRect.top - shellRect.top, min, Math.max(min, shellRect.height - panelHeight - min))
      const current = positionRef.current
      if (current && !current.viewport && Math.abs(current.left - left) < 1 && Math.abs(current.top - top) < 1) return
      const next = { left, top, viewport: false }
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
    dragRef.current?.cleanup()
    const rect = panelRef.current?.getBoundingClientRect()
    const parent = panelRef.current?.parentElement?.getBoundingClientRect()
    if (!rect || !parent) return
    const viewport = window.matchMedia('(max-width: 600px)').matches
    const startedAt = Date.now()
    const drag = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      startedAt,
      x: event.clientX,
      y: event.clientY,
      left: viewport ? rect.left : rect.left - parent.left,
      top: viewport ? rect.top : rect.top - parent.top,
      viewport,
      dragging: canStartCounterPopoverDrag(event.pointerType, 0),
      moved: false,
      cancelled: false,
      timerId: 0,
      cleanup: () => {},
    }
    const cleanup = () => {
      window.clearTimeout(drag.timerId)
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', finish, true)
      window.removeEventListener('pointercancel', finish, true)
      window.removeEventListener('resize', cancel, true)
      if (dragRef.current === drag) dragRef.current = null
    }
    const move = (pointer: PointerEvent) => {
      if (pointer.pointerId !== drag.pointerId) return
      const deltaX = pointer.clientX - drag.x
      const deltaY = pointer.clientY - drag.y
      if (!drag.dragging && shouldCancelCounterPopoverLongPress(deltaX, deltaY)) {
        window.clearTimeout(drag.timerId)
        drag.cancelled = true
        return
      }
      if (drag.cancelled) return
      if (!drag.dragging || !panelRef.current || !drag.moved && Math.hypot(deltaX, deltaY) < 4) return
      drag.moved = true
      const currentParent = panelRef.current.parentElement?.getBoundingClientRect()
      const boundsWidth = drag.viewport ? window.innerWidth : currentParent?.width ?? 0
      const boundsHeight = drag.viewport ? window.innerHeight : currentParent?.height ?? 0
      const next = { ...getCounterPopoverDragPosition({ left: drag.left, top: drag.top, deltaX, deltaY, panelWidth: panelRef.current.offsetWidth, panelHeight: panelRef.current.offsetHeight, boundsWidth, boundsHeight }), viewport: drag.viewport }
      manuallyPositionedRef.current = true
      positionRef.current = next
      setPosition(next)
    }
    const finish = (pointer: PointerEvent) => {
      if (pointer.pointerId !== drag.pointerId) return
      if (drag.cancelled && drag.viewport && Math.abs(pointer.clientY - drag.y) > 32) onChange(counters, 'panel:' + String(pointer.clientY > drag.y))
      cleanup()
    }
    const cancel = () => cleanup()
    drag.cleanup = cleanup
    dragRef.current = drag
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', finish, true)
    window.addEventListener('pointercancel', finish, true)
    window.addEventListener('resize', cancel, true)
    if (!drag.dragging) {
      drag.timerId = window.setTimeout(() => {
        if (dragRef.current === drag && canStartCounterPopoverDrag(drag.pointerType, Date.now() - drag.startedAt)) drag.dragging = true
      }, COUNTER_POPOVER_LONG_PRESS_MS)
    }
  }

  function add() {
    const kind = kinds.find((candidate) => maxCountersForType(counters, candidate) < MAX_COUNTERS_PER_TYPE)
    if (!kind) return
    const counter = createCounter(kind, t(kindLabels[kind]))
    const initialized = kind === 'simple'
      ? { ...counter, value: 0, unit: 'stitch' as const }
      : kind === 'pattern'
        ? { ...counter, linkedToId: activeBase?.id, currentRow, startRow: currentRow, patternRow: 1, repeatLength: 8 }
        : kind === 'task'
          ? { ...counter, linkedToId: activeBase?.id, currentRow, firstTaskRow: currentRow, nextTaskRow: currentRow, interval: 2, total: 8 }
          : { ...counter, repeatLinkedToId: activeBase?.id }
    restoreEditorFocusRef.current = false
    setEditingId(null)
    setActiveTab('settings')
    setNewCounterDraft(initialized)
  }

  function confirmRewind(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeBase || !rewindRow || !findCounterRewindCheckpoint(snapshot.counterHistory ?? [], counters, activeBase.id, Number(rewindRow))) return
    onRewind(activeBase.id, Number(rewindRow))
    setRewindOpen(false)
  }

  return <aside ref={panelRef} className={'number-counter-panel' + (collapsed ? ' mobile-collapsed' : '') + (position?.viewport ? ' positioned-mobile' : '')} aria-label={t("카운터")} style={position ? { position: position.viewport ? 'fixed' : 'absolute', left: position.left, top: position.top, right: 'auto', bottom: 'auto' } : undefined}>
    <header className="number-counter-header" onPointerDown={beginHeaderGesture}>
      <div className="counter-drag-handle" aria-hidden="true"><GripVertical size={17} /></div>
      <nav className="counter-panel-tabs" role="tablist" aria-label={t('카운터')}>
        <button type="button" role="tab" aria-selected={activeTab === 'counter'} aria-label={t('카운터')} title={t('카운터')} disabled={panelSaving} className={activeTab === 'counter' ? 'selected' : ''} onClick={() => setActiveTab('counter')}><Hash size={19} /></button>
        <button type="button" role="tab" aria-selected={activeTab === 'laps'} aria-label={t('타임랩')} title={t('타임랩')} disabled={panelSaving} className={activeTab === 'laps' ? 'selected' : ''} onClick={() => setActiveTab('laps')}><Clock3 size={19} /></button>
        <button type="button" role="tab" aria-selected={activeTab === 'settings'} aria-label={t('카운터 설정')} title={t('카운터 설정')} disabled={panelSaving} className={activeTab === 'settings' ? 'selected' : ''} onClick={() => { setActiveTab('settings'); setEditingId(null); setNewCounterDraft(null) }}><Settings size={19} /></button>
        <button type="button" className="counter-panel-close" aria-label={t("카운터 닫기")} title={t('닫기')} disabled={panelSaving} onClick={closePanel}><X size={19} /></button>
        <button type="button" className="icon-button counter-collapse-mobile" aria-label={collapsed ? t('카운터 펼치기') : t('카운터 접기')} aria-expanded={!collapsed} disabled={panelSaving} onClick={() => onChange(counters, 'panel:' + String(!collapsed))}>{collapsed ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</button>
      </nav>
    </header>
    {!collapsed && <div className={'counter-popover-body' + (activeTab === 'settings' && (newCounterDraft || activeEditor) ? ' counter-popover-body-editor' : '')}>
      {activeTab === 'counter' && <CounterSettings view="main" snapshot={snapshot} counters={counters} timerLinkMode={timerLinkMode} onSave={onSettingsSave} onTimerLinkModeChange={onTimerLinkModeChange} onEdit={editCounter} onAdd={add} onRepeatStep={onRepeatStep} counterActionSaving={counterActionSaving} addButtonRef={addButtonRef} onSavingChange={(saving) => { setPanelSaving(saving); onSavingChange(saving) }} />}
      {activeTab === 'laps' && <section className="counter-lap-sessions" aria-label={t('타임랩')}>
        <header><h2>{t('타임랩')}</h2></header>
        {timeLapSessions.length ? <div className="counter-lap-session-list">{timeLapSessions.map((session) => {
          const counter = counters.find((item) => item.id === session.counterId)
          const key = session.counterId + '\0' + session.sessionId
          const time = (timestamp: number) => formatDateTime(timestamp, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
          const timeRange = `${time(session.startedAt)}~${time(session.endedAt)}`
          return <article className="counter-lap-session" key={key} aria-label={`${counter?.name ?? t('카운터')} · ${timeRange} · ${formatNumber(session.rowCount)}${t('단')}`}>
            <span className="counter-lap-session-time">{timeRange}</span>
            <strong>{formatNumber(session.rowCount)}{t('단')}</strong>
          </article>
        })}</div> : <p className="counter-laps-empty">{t('타임랩 기록이 없습니다.')}</p>}
      </section>}
      {activeTab === 'settings' && (newCounterDraft
        ? <CounterEditor inline portal={false} counter={newCounterDraft} counters={counters} defaultLinkToId={activeBase?.id} isNew onClose={closeDirectEditor} onSavingChange={(saving) => { setPanelSaving(saving); onSavingChange(saving) }} onSave={(next, label) => onChange(next, label)} />
        : activeEditor
          ? <CounterEditor inline portal={false} counter={activeEditor} counters={counters} defaultLinkToId={activeBase?.id} canDelete={activeEditor.id !== activeBase?.id || baseCounters.length > 1} onDelete={deleteCounter} onClose={closeDirectEditor} onSavingChange={(saving) => { setPanelSaving(saving); onSavingChange(saving) }} onSave={(next, label) => onChange(next, label)} />
          : <CounterSettings view="settings" snapshot={snapshot} counters={counters} timerLinkMode={timerLinkMode} onSave={onSettingsSave} onTimerLinkModeChange={onTimerLinkModeChange} onEdit={editCounter} onAdd={add} onRepeatStep={onRepeatStep} counterActionSaving={counterActionSaving} addButtonRef={addButtonRef} onSavingChange={(saving) => { setPanelSaving(saving); onSavingChange(saving) }} />)}
    </div>}
    {!collapsed && activeTab === 'counter' && <footer className="counter-popover-footer"><button type="button" className="counter-undo-button" aria-label={t("최근 카운터·진행선 작업 되돌리기")} title={t("최근 카운터·진행선 작업 되돌리기")} disabled={!snapshot.counterHistory?.length} onClick={onUndo}><RotateCcw size={16} /></button><button type="button" className="counter-rewind-open" disabled={!visibleRewindRows.length} onClick={() => { setRewindRow(String(visibleRewindRows[0] ?? '')); setRewindOpen(true) }}><RotateCcw size={15} />{t("단 되돌리기")}</button><span>{goalCompleted ? t('목표 완료') : t('현재 {row}단', { row: formatNumber(currentRow) })}</span></footer>}
    {rewindOpen && createPortal(<div className="modal-backdrop counter-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRewindOpen(false) }}><form className="modal-card counter-rewind-dialog" role="dialog" aria-modal="true" aria-label={t("단 되돌리기")} onSubmit={confirmRewind}><div className="modal-heading"><div><p className="eyebrow">{t('단 되돌리기')}</p><h2>{t("단 되돌리기")}</h2></div><button type="button" className="icon-button" aria-label={t("닫기")} onClick={() => setRewindOpen(false)}><X size={20} /></button></div><label className="counter-settings-field">{t("다시 뜰 단")}<select value={rewindRow} onChange={(event) => setRewindRow(event.currentTarget.value)}>{visibleRewindRows.map((row) => <option key={row} value={row}>{row}{t("단")}</option>)}</select></label><p>{t("선택한 단 시점의 ")}{activeBase?.name}{t("과 연동된 카운터·진행선을 복원합니다.")}</p><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setRewindOpen(false)}>{t("취소")}</button><button type="submit" className="primary-button" disabled={!rewindRow}>{t("적용")}</button></div></form></div>, document.body)}
  </aside>
}
