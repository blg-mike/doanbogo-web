import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ArrowLeft, BarChart3, ChevronDown, Plus, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { formatDate, formatDateTime, formatNumber, t } from './locales'
import type { DocumentWorkTimeDay, DocumentWorkTimeSession } from './types'
import { getDocument, saveDocumentWorkTimeNote } from './storage'
import { formatWorkTimeHoursMinutes, localWorkDateKey, normalizeWorkTimeDays, parseManualWorkTime, summarizeWorkTime, workTimeChartBuckets, type WorkTimeChartMode } from './workTime'

type Props = {
  documentId: string
  initialTotalWorkTimeMs: number
  initialWorkTimeDays: DocumentWorkTimeDay[]
  onClose: () => void
  onAddWorkTime: (date: string, elapsedMs: number) => Promise<{ totalWorkTimeMs: number; workTimeDays: DocumentWorkTimeDay[] }>
  onTotalsChange?: (totalWorkTimeMs: number, workTimeDays: DocumentWorkTimeDay[]) => void
  onInteractionBlockingChange?: (blocked: boolean) => void
}

type WorkTimeRecord = {
  totalWorkTimeMs: number
  workTimeDays: DocumentWorkTimeDay[]
  sessions: DocumentWorkTimeSession[]
  notes: Record<string, string>
}

function durationText(milliseconds: number) {
  const { hours, minutes } = formatWorkTimeHoursMinutes(milliseconds)
  return t('{hours}시간 {minutes}분', { hours: formatNumber(Number(hours)), minutes: formatNumber(Number(minutes)) })
}

function dayDate(date: string) {
  return new Date(date + 'T12:00:00')
}

export default function WorkTimeRecordPanel({ documentId, initialTotalWorkTimeMs, initialWorkTimeDays, onClose, onAddWorkTime, onTotalsChange, onInteractionBlockingChange }: Props) {
  const [record, setRecord] = useState<WorkTimeRecord>(() => ({ totalWorkTimeMs: initialTotalWorkTimeMs, workTimeDays: initialWorkTimeDays, sessions: [], notes: {} }))
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [view, setView] = useState<'records' | 'stats'>('records')
  const [mode, setMode] = useState<WorkTimeChartMode>('day')
  const [dailyRange, setDailyRange] = useState(7)
  const [expandedDate, setExpandedDate] = useState('')
  const [adding, setAdding] = useState(false)
  const [date, setDate] = useState(localWorkDateKey())
  const [hours, setHours] = useState('0')
  const [minutes, setMinutes] = useState('0')
  const [saving, setSaving] = useState(false)
  const [addError, setAddError] = useState('')
  const [noteDraft, setNoteDraft] = useState({ date: '', value: '' })
  const [savingNote, setSavingNote] = useState(false)
  const [noteError, setNoteError] = useState('')
  const savingRef = useRef(false)
  const noteSavingRef = useRef(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  const initialRecordRef = useRef({ totalWorkTimeMs: initialTotalWorkTimeMs, workTimeDays: initialWorkTimeDays })
  const onTotalsChangeRef = useRef(onTotalsChange)
  const closeLocked = saving || savingNote

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    requestAnimationFrame(() => closeRef.current?.focus())
    return () => {
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [documentId])

  useEffect(() => { onTotalsChangeRef.current = onTotalsChange }, [onTotalsChange])

  useEffect(() => {
    let active = true
    void getDocument(documentId).then((document) => {
      if (!document) throw new Error('도안을 찾을 수 없습니다.')
      const next = {
        totalWorkTimeMs: document.totalWorkTimeMs ?? initialRecordRef.current.totalWorkTimeMs,
        workTimeDays: normalizeWorkTimeDays(document.workTimeDays ?? initialRecordRef.current.workTimeDays, document.todayWorkDate, document.todayWorkTimeMs),
        sessions: document.workTimeSessions ?? [],
        notes: document.workTimeNotes ?? {},
      }
      if (active) {
        setRecord(next)
        onTotalsChangeRef.current?.(next.totalWorkTimeMs, next.workTimeDays)
      }
    }).catch(() => {
      if (active) setLoadError(true)
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [documentId, loadAttempt])

  const displayDaysMap = new Map(record.workTimeDays.map((day) => [day.date, day.elapsedMs]))
  const sessionTotals = new Map<string, number>()
  for (const session of record.sessions) {
    sessionTotals.set(session.workDate, (sessionTotals.get(session.workDate) ?? 0) + session.elapsedMs)
  }
  for (const [workDate, elapsedMs] of sessionTotals) if (!displayDaysMap.has(workDate)) displayDaysMap.set(workDate, elapsedMs)
  const displayDays = [...displayDaysMap].map(([workDate, elapsedMs]) => ({ date: workDate, elapsedMs })).filter((day) => day.elapsedMs > 0).sort((left, right) => left.date.localeCompare(right.date))
  const summary = summarizeWorkTime(record.totalWorkTimeMs, displayDays)
  const sortedDays = [...displayDays].sort((left, right) => right.date.localeCompare(left.date))
  const ordinals = new Map(displayDays.map((day, index) => [day.date, index + 1]))
  const activeNote = noteDraft.date === expandedDate ? noteDraft.value : record.notes[expandedDate] ?? ''
  const noteHasDraft = Boolean(noteDraft.date && noteDraft.date === expandedDate && noteDraft.value !== (record.notes[expandedDate] ?? ''))
  const bucketCount = mode === 'day' ? dailyRange : mode === 'week' ? 8 : 12
  const buckets = workTimeChartBuckets(displayDays, mode, bucketCount)
  const chartMax = Math.max(1, ...buckets.map((bucket) => bucket.elapsedMs))

  useEffect(() => {
    onInteractionBlockingChange?.(adding || closeLocked || noteHasDraft)
  }, [adding, closeLocked, noteHasDraft, onInteractionBlockingChange])

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      if (!closeLocked) onClose()
      return
    }
    if (event.key !== 'Tab') return
    const items = event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled)')
    const first = items[0]
    const last = items[items.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }

  function startAdd() {
    setDate(localWorkDateKey())
    setHours('0')
    setMinutes('0')
    setAddError('')
    setAdding(true)
  }

  function retryLoad() {
    setLoading(true)
    setLoadError(false)
    setLoadAttempt((attempt) => attempt + 1)
  }

  async function submitAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (savingRef.current || noteSavingRef.current) return
    const elapsedMs = parseManualWorkTime(hours, minutes)
    if (!elapsedMs) {
      setAddError(t('작업시간은 1분 이상 입력해 주세요.'))
      return
    }
    savingRef.current = true
    setSaving(true)
    setAddError('')
    try {
      const totals = await onAddWorkTime(date, elapsedMs)
      setRecord((current) => ({ ...current, totalWorkTimeMs: totals.totalWorkTimeMs, workTimeDays: normalizeWorkTimeDays(totals.workTimeDays) }))
      onTotalsChangeRef.current?.(totals.totalWorkTimeMs, totals.workTimeDays)
      setAdding(false)
    } catch {
      setAddError(t('작업시간을 추가하지 못했습니다.'))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  async function saveNote() {
    if (!expandedDate || noteSavingRef.current || savingRef.current) return
    noteSavingRef.current = true
    setSavingNote(true)
    setNoteError('')
    try {
      const notes = await saveDocumentWorkTimeNote(documentId, expandedDate, activeNote)
      setRecord((current) => ({ ...current, notes }))
      setNoteDraft({ date: expandedDate, value: notes[expandedDate] ?? '' })
    } catch {
      setNoteError(t('메모 저장 실패'))
    } finally {
      noteSavingRef.current = false
      setSavingNote(false)
    }
  }

  return createPortal(<div className="report-worktime-backdrop" role="presentation" onPointerDown={(event) => { event.stopPropagation(); if (event.target === event.currentTarget && !closeLocked) onClose() }}>
    <section className="report-worktime-dialog" role="dialog" aria-modal="true" aria-labelledby="report-worktime-title" onKeyDown={handleKeyDown}>
      <header className="report-worktime-dialog-header">
        {view === 'stats' && <button type="button" className="report-worktime-back" aria-label={t('뒤로')} onClick={() => setView('records')}><ArrowLeft size={19} /></button>}
        <h2 id="report-worktime-title">{view === 'stats' ? t('통계') : t('작업 기록')}</h2>
        {view === 'records' && <button type="button" className="worktime-record-add" disabled={loading || closeLocked} onClick={startAdd}><Plus size={16} />{t('시간 추가')}</button>}
        <button ref={closeRef} type="button" className="report-worktime-close" aria-label={t('닫기')} disabled={closeLocked} onClick={onClose}><X size={19} /></button>
      </header>
      {loadError && <div className="worktime-record-load-error" role="alert"><span>{t('작업 기록을 불러오지 못했습니다.')}</span><button type="button" disabled={loading} onClick={retryLoad}>{t('다시 시도')}</button></div>}
      {loading ? <div className="report-worktime-loading" role="status">{t('불러오는 중')}</div> : view === 'stats' ? <div className="report-worktime-overview">
        <section className="report-worktime-total-card"><span>{t('누적 작업시간')}</span><strong>{durationText(record.totalWorkTimeMs)}</strong><div className="report-worktime-summary-stats">
          <span><small>{t('작업일 수')}</small><b>{t('{count}일', { count: formatNumber(summary.recordedDays.length) })}</b></span>
          <span><small>{t('작업일 평균')}</small><b>{durationText(summary.averageMs)}</b></span>
          <span><small>{t('최장 작업일')}</small><b>{durationText(summary.longestDayMs)}</b></span>
        </div>{summary.unknownMs > 0 && <p>{t('날짜 미상 기록')}: {durationText(summary.unknownMs)}</p>}</section>
        <section className="report-worktime-chart-card"><header><h3>{t(mode === 'day' ? '일별' : mode === 'week' ? '주간' : '월간')}</h3>{mode === 'day' ? <select aria-label={t('최근 7일')} value={dailyRange} onChange={(event) => setDailyRange(Number(event.currentTarget.value))}><option value={7}>{t('최근 7일')}</option><option value={30}>{t('최근 30일')}</option></select> : <span>{t(mode === 'week' ? '최근 8주' : '최근 12개월')}</span>}</header>
          <nav className="report-worktime-tabs" aria-label={t('통계')}>
            {(['day', 'week', 'month'] as const).map((item) => <button key={item} type="button" aria-pressed={mode === item} className={mode === item ? 'selected' : ''} onClick={() => setMode(item)}>{t(item === 'day' ? '일별' : item === 'week' ? '주간' : '월간')}</button>)}
          </nav>
          <div className={'report-worktime-chart bars-' + buckets.length} role="img" aria-label={mode === 'day' ? t('최근 기록 {count}일', { count: bucketCount }) : t(mode === 'week' ? '최근 8주' : '최근 12개월')}>{buckets.map((bucket) => <div className="report-worktime-bar-column" key={bucket.key} title={`${bucket.label}: ${durationText(bucket.elapsedMs)}`}><b>{bucket.elapsedMs > 0 ? durationText(bucket.elapsedMs) : ''}</b><span className="report-worktime-bar-track"><i style={{ height: `${bucket.elapsedMs ? Math.max(5, bucket.elapsedMs / chartMax * 100) : 0}%` }} /></span><small>{bucket.label}</small></div>)}</div>
        </section>
      </div> : <div className="worktime-record-content">
        <section className="worktime-record-total"><span>{t('총 작업시간')}</span><strong>{durationText(record.totalWorkTimeMs)}</strong></section>
        {adding && <form className="worktime-record-form" onSubmit={(event) => void submitAdd(event)}>
          <header><h3>{t('작업시간 추가')}</h3><button type="button" aria-label={t('입력 취소')} disabled={closeLocked} onClick={() => { setAdding(false); setAddError('') }}><X size={17} /></button></header>
          <label>{t('작업 날짜')}<input type="date" value={date} required disabled={closeLocked} onChange={(event) => setDate(event.currentTarget.value)} /></label>
          <div className="worktime-record-time-fields">
            <label>{t('시간')}<input type="number" inputMode="numeric" min="0" max="9999" step="1" value={hours} disabled={closeLocked} onChange={(event) => setHours(event.currentTarget.value)} /></label>
            <label>{t('분')}<select value={minutes} disabled={closeLocked} onChange={(event) => setMinutes(event.currentTarget.value)}>{Array.from({ length: 60 }, (_, minute) => <option key={minute} value={minute}>{formatNumber(minute)}{t('분')}</option>)}</select></label>
          </div>
          {addError && <p className="worktime-record-error" role="alert">{addError}</p>}
          <button type="submit" className="report-worktime-save" disabled={closeLocked}>{saving ? t('저장 중…') : t('저장')}</button>
        </form>}
        <div className="worktime-record-list-heading"><h3>{t('날짜별 작업 기록')}</h3><button type="button" disabled={closeLocked} onClick={() => setView('stats')}><BarChart3 size={17} />{t('통계 보기')}</button></div>
        {loading && <div className="report-worktime-loading" role="status">{t('불러오는 중')}</div>}
        {!sortedDays.length && summary.unknownMs <= 0 && <p className="worktime-record-empty">{t('아직 저장된 일별 타이머 기록이 없습니다.')}</p>}
        {summary.unknownMs > 0 && <div className="worktime-record-unknown"><span>{t('날짜 미상 기록')}</span><strong>{durationText(summary.unknownMs)}</strong></div>}
        <ol className="worktime-record-days">{sortedDays.map((day) => {
          const ordinal = ordinals.get(day.date) ?? 0
          const expanded = expandedDate === day.date
          const sessions = record.sessions.filter((session) => session.workDate === day.date).sort((left, right) => left.startedAt - right.startedAt)
          const sessionsTotal = sessions.reduce((sum, session) => sum + session.elapsedMs, 0)
          const unknownTime = Math.max(0, day.elapsedMs - sessionsTotal)
          const note = noteDraft.date === day.date ? noteDraft.value : record.notes[day.date] ?? ''
          return <li key={day.date} className={expanded ? 'expanded' : ''}>
            <button type="button" className="worktime-record-day" aria-expanded={expanded} onClick={() => { setExpandedDate(expanded ? '' : day.date); setNoteError('') }}><span>{t('{day}일차', { day: formatNumber(ordinal) })} · {formatDate(dayDate(day.date), { year: 'numeric', month: '2-digit', day: '2-digit' })}</span><strong>{durationText(day.elapsedMs)}</strong><ChevronDown size={17} /></button>
            {expanded && <div className="worktime-record-day-detail">
              <h4>{t('작업 세션 기록')}</h4>
              {sessions.length ? <ol>{sessions.map((session) => <li key={session.id}><span>{formatDateTime(session.startedAt, { timeStyle: 'short' })} – {formatDateTime(session.endedAt, { timeStyle: 'short' })}</span><strong>{durationText(session.elapsedMs)}</strong></li>)}</ol> : <p>{t('세션 상세 기록 없음')}</p>}
              {unknownTime > 0 && <p className="worktime-record-unknown-time">{t('세션 미상 시간')}: {durationText(unknownTime)}</p>}
              {sessions.length > 0 && sessionsTotal > day.elapsedMs && <p className="worktime-record-unknown-time">{t('세션 기록 합계가 일별 작업시간을 초과합니다.')}</p>}
              <label>{t('메모')}<textarea value={note} placeholder={t('메모를 입력하세요.')} disabled={closeLocked} onChange={(event) => setNoteDraft({ date: day.date, value: event.currentTarget.value })} /></label>
              {noteError && <p className="worktime-record-error" role="alert">{noteError}</p>}
              <button type="button" className="report-worktime-save" disabled={closeLocked} onClick={() => void saveNote()}>{savingNote ? t('저장 중…') : t('메모 저장')}</button>
            </div>}
          </li>
        })}</ol>
      </div>}
    </section>
  </div>, document.body)
}
