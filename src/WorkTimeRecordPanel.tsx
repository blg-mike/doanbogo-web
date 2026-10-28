import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from 'react'
import { ArrowLeft, BarChart3, ChevronDown, Plus, RotateCcw, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { formatDate, formatDateTime, formatNumber, t } from './locales'
import type { DocumentWorkTimeDay, DocumentWorkTimeSession } from './types'
import { getDocument, saveDocumentWorkTimeNote } from './storage'
import { REPORT_DATE_MAX, REPORT_DATE_MIN } from './reportDates'
import { formatWorkTimeHoursMinutes, isWorkDateKey, localWorkDateKey, normalizeWorkTimeDays, parseManualWorkTime, summarizeWorkTime, workTimeChartAxisTicks, workTimeChartBuckets, type WorkTimeChartMode } from './workTime'

type Props = {
  documentId: string
  hidden?: boolean
  initialTotalWorkTimeMs: number
  initialWorkTimeDays: DocumentWorkTimeDay[]
  onClose: () => void
  onAddWorkTime: (date: string, elapsedMs: number) => Promise<{ totalWorkTimeMs: number; workTimeDays: DocumentWorkTimeDay[] }>
  onResetWorkTime: (date?: string) => Promise<{ totalWorkTimeMs: number; workTimeDays: DocumentWorkTimeDay[] }>
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

function chartBucketDate(mode: WorkTimeChartMode, key: string) {
  return mode === 'month' ? new Date(key + '-01T12:00:00') : dayDate(key)
}

function chartBucketLabel(mode: WorkTimeChartMode, key: string, compact = false) {
  const date = chartBucketDate(mode, key)
  if (compact) return formatDate(date, mode === 'month' ? { month: '2-digit' } : { month: '2-digit', day: '2-digit' })
  return formatDate(date, mode === 'month' ? { year: 'numeric', month: 'long' } : { dateStyle: 'full' })
}

export default function WorkTimeRecordPanel({ documentId, hidden = false, initialTotalWorkTimeMs, initialWorkTimeDays, onClose, onAddWorkTime, onResetWorkTime, onTotalsChange, onInteractionBlockingChange }: Props) {
  const [record, setRecord] = useState<WorkTimeRecord>(() => ({ totalWorkTimeMs: initialTotalWorkTimeMs, workTimeDays: initialWorkTimeDays, sessions: [], notes: {} }))
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [view, setView] = useState<'records' | 'stats'>('records')
  const [mode, setMode] = useState<WorkTimeChartMode>('day')
  const [dailyRange, setDailyRange] = useState(7)
  const [selectedBucketKey, setSelectedBucketKey] = useState<{ documentId: string; key: string } | null>(null)
  const [expandedDate, setExpandedDate] = useState('')
  const [resetMenuOpen, setResetMenuOpen] = useState(false)
  const [resetMode, setResetMode] = useState<'date' | 'all' | null>(null)
  const [resetDate, setResetDate] = useState('')
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState('')
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
  const resettingRef = useRef(false)
  const noteSavingRef = useRef(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  const resetMenuRef = useRef<HTMLDivElement>(null)
  const resetButtonRef = useRef<HTMLButtonElement>(null)
  const resetDateRef = useRef<HTMLSelectElement>(null)
  const resetConfirmRef = useRef<HTMLButtonElement>(null)
  const initialRecordRef = useRef({ totalWorkTimeMs: initialTotalWorkTimeMs, workTimeDays: initialWorkTimeDays })
  const onTotalsChangeRef = useRef(onTotalsChange)
  const closeLocked = saving || savingNote || resetting

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    requestAnimationFrame(() => closeRef.current?.focus())
    return () => {
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [documentId])

  useEffect(() => { onTotalsChangeRef.current = onTotalsChange }, [onTotalsChange])

  useEffect(() => {
    if (!resetMenuOpen) return
    const closeOnOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !resetMenuRef.current?.contains(event.target)) setResetMenuOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutside)
    return () => document.removeEventListener('pointerdown', closeOnOutside)
  }, [resetMenuOpen])

  useEffect(() => {
    if (resetMode === 'date') requestAnimationFrame(() => resetDateRef.current?.focus())
    else if (resetMode === 'all') requestAnimationFrame(() => resetConfirmRef.current?.focus())
  }, [resetMode])

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
  const recordDaysMap = new Map(displayDaysMap)
  for (const workDate of Object.keys(record.notes)) if (isWorkDateKey(workDate) && !recordDaysMap.has(workDate)) recordDaysMap.set(workDate, 0)
  const sortedDays = [...recordDaysMap].map(([workDate, elapsedMs]) => ({ date: workDate, elapsedMs })).sort((left, right) => right.date.localeCompare(left.date))
  const ordinals = new Map([...sortedDays].reverse().map((day, index) => [day.date, index + 1]))
  const hasResettableTime = record.totalWorkTimeMs > 0 || sortedDays.some((day) => day.elapsedMs > 0) || record.sessions.length > 0
  const activeNote = noteDraft.date === expandedDate ? noteDraft.value : record.notes[expandedDate] ?? ''
  const noteHasDraft = Boolean(noteDraft.date && noteDraft.date === expandedDate && noteDraft.value !== (record.notes[expandedDate] ?? ''))
  const bucketCount = mode === 'day' ? dailyRange : mode === 'week' ? 8 : 12
  const buckets = workTimeChartBuckets(displayDays, mode, bucketCount)
  const dataMax = Math.max(0, ...buckets.map((bucket) => bucket.elapsedMs))
  const chartTicks = workTimeChartAxisTicks(dataMax)
  const chartScaleMax = chartTicks[0] ?? 0
  const selectedBucket = buckets.find((bucket) => selectedBucketKey?.documentId === documentId && bucket.key === selectedBucketKey.key) ?? [...buckets].reverse().find((bucket) => bucket.elapsedMs > 0)
  const selectedBucketIndex = selectedBucket ? buckets.findIndex((bucket) => bucket.key === selectedBucket.key) : 0
  const chartButtons = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    onInteractionBlockingChange?.(adding || closeLocked || noteHasDraft || resetMode !== null)
  }, [adding, closeLocked, noteHasDraft, onInteractionBlockingChange, resetMode])

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      if (!closeLocked) {
        if (resetMode) { setResetMode(null); setResetError(''); requestAnimationFrame(() => resetButtonRef.current?.focus()) }
        else if (resetMenuOpen) { setResetMenuOpen(false); resetButtonRef.current?.focus() }
        else onClose()
      }
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
    setResetMenuOpen(false)
    setResetMode(null)
    setDate(localWorkDateKey())
    setHours('0')
    setMinutes('0')
    setAddError('')
    setAdding(true)
  }

  function openReset(mode: 'date' | 'all') {
    if (mode === 'date' && !sortedDays.some((day) => day.elapsedMs > 0)) return
    if (mode === 'all' && !hasResettableTime) return
    setResetMenuOpen(false)
    setAdding(false)
    setResetDate(sortedDays.find((day) => day.elapsedMs > 0)?.date ?? '')
    setResetError('')
    setResetMode(mode)
  }

  async function confirmReset() {
    if (!resetMode || resettingRef.current || savingRef.current || noteSavingRef.current) return
    const targetDate = resetMode === 'date' ? resetDate : undefined
    if (resetMode === 'date' && (!targetDate || !sortedDays.some((day) => day.date === targetDate && day.elapsedMs > 0))) return
    resettingRef.current = true
    setResetting(true)
    setResetError('')
    try {
      const totals = await onResetWorkTime(targetDate)
      const workTimeDays = normalizeWorkTimeDays(totals.workTimeDays)
      setRecord((current) => ({
        ...current,
        totalWorkTimeMs: totals.totalWorkTimeMs,
        workTimeDays,
        sessions: current.sessions.filter((session) => targetDate !== undefined && session.workDate !== targetDate),
      }))
      onTotalsChangeRef.current?.(totals.totalWorkTimeMs, workTimeDays)
      if (!targetDate || expandedDate === targetDate) setExpandedDate('')
      setResetMode(null)
      requestAnimationFrame(() => resetButtonRef.current?.focus())
    } catch {
      setResetError(t('작업시간을 초기화하지 못했습니다.'))
    } finally {
      resettingRef.current = false
      setResetting(false)
    }
  }

  function retryLoad() {
    setLoading(true)
    setLoadError(false)
    setLoadAttempt((attempt) => attempt + 1)
  }

  function handleChartKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const nextIndex = (index + (event.key === 'ArrowRight' ? 1 : -1) + buckets.length) % buckets.length
    const nextBucket = buckets[nextIndex]
    if (!nextBucket) return
    setSelectedBucketKey({ documentId, key: nextBucket.key })
    chartButtons.current[nextIndex]?.focus()
  }

  function chartTickText(milliseconds: number) {
    const { hours, minutes } = formatWorkTimeHoursMinutes(milliseconds)
    return `${formatNumber(Number(hours), { minimumIntegerDigits: 2 })}:${formatNumber(Number(minutes), { minimumIntegerDigits: 2 })}`
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

  return createPortal(<div className="report-worktime-backdrop" hidden={hidden} aria-hidden={hidden || undefined} style={hidden ? { display: 'none' } : undefined} role="presentation" onPointerDown={(event) => { event.stopPropagation(); if (event.target === event.currentTarget && !closeLocked) onClose() }}>
    <section className="report-worktime-dialog" role="dialog" aria-modal="true" aria-labelledby="report-worktime-title" onKeyDown={handleKeyDown}>
      <header className="report-worktime-dialog-header">
        {view === 'stats' && <button type="button" className="report-worktime-back" aria-label={t('뒤로')} onClick={() => setView('records')}><ArrowLeft size={19} /></button>}
        <h2 id="report-worktime-title">{view === 'stats' ? t('통계') : t('작업 기록')}</h2>
        {view === 'records' && <div className="worktime-record-header-actions">
          <div className="worktime-record-reset-wrap" ref={resetMenuRef}>
            <button ref={resetButtonRef} type="button" className="worktime-record-reset" aria-label={t('작업시간 초기화')} title={t('작업시간 초기화')} aria-expanded={resetMenuOpen} aria-controls="worktime-reset-menu" disabled={loading || closeLocked} onClick={() => setResetMenuOpen((open) => !open)}><RotateCcw size={17} /></button>
            {resetMenuOpen && <div id="worktime-reset-menu" className="worktime-record-reset-menu" role="group" aria-label={t('작업시간 초기화')}>
              <button type="button" disabled={closeLocked || !sortedDays.some((day) => day.elapsedMs > 0)} onClick={() => openReset('date')}>{t('날짜별 작업시간 초기화')}</button>
              <button type="button" disabled={closeLocked || !hasResettableTime} onClick={() => openReset('all')}>{t('전체 작업시간 초기화')}</button>
            </div>}
          </div>
          <button type="button" className="worktime-record-add" disabled={loading || closeLocked} onClick={startAdd}><Plus size={16} />{t('시간 추가')}</button>
        </div>}
        <button ref={closeRef} type="button" className="report-worktime-close" aria-label={t('닫기')} disabled={closeLocked} onClick={onClose}><X size={19} /></button>
      </header>
      {loadError && <div className="worktime-record-load-error" role="alert"><span>{t('작업 기록을 불러오지 못했습니다.')}</span><button type="button" disabled={loading} onClick={retryLoad}>{t('다시 시도')}</button></div>}
      {loading ? <div className="report-worktime-loading" role="status">{t('불러오는 중')}</div> : view === 'stats' ? <div className="report-worktime-overview">
        <section className="report-worktime-total-card"><span>{t('누적 작업시간')}</span><strong>{durationText(record.totalWorkTimeMs)}</strong><div className="report-worktime-summary-stats">
          <span><small>{t('작업일 수')}</small><b>{t('{count}일', { count: formatNumber(summary.recordedDays.length) })}</b></span>
          <span><small>{t('작업일 평균')}</small><b>{durationText(summary.averageMs)}</b></span>
          <span><small>{t('최장 작업일')}</small><b>{durationText(summary.longestDayMs)}</b></span>
        </div>{summary.unknownMs > 0 && <p>{t('날짜 미상 기록')}: {durationText(summary.unknownMs)}</p>}</section>
        <section className="report-worktime-chart-card"><header><h3>{t(mode === 'day' ? '일별' : mode === 'week' ? '주간' : '월간')}</h3><span className="report-worktime-axis-title">{t('작업 시간')} · HH:MM</span>{mode === 'day' ? <select aria-label={t('최근 7일')} value={dailyRange} onChange={(event) => setDailyRange(Number(event.currentTarget.value))}><option value={7}>{t('최근 7일')}</option><option value={30}>{t('최근 30일')}</option></select> : <span>{t(mode === 'week' ? '최근 8주' : '최근 12개월')}</span>}</header>
          <nav className="report-worktime-tabs" aria-label={t('통계')}>
            {(['day', 'week', 'month'] as const).map((item) => <button key={item} type="button" aria-pressed={mode === item} className={mode === item ? 'selected' : ''} onClick={() => setMode(item)}>{t(item === 'day' ? '일별' : item === 'week' ? '주간' : '월간')}</button>)}
          </nav>
          <div className="report-worktime-chart-layout">
            <div className="report-worktime-y-axis" aria-hidden="true"><div className={'report-worktime-y-ticks' + (chartScaleMax ? '' : ' empty')}>{chartTicks.map((tick) => <span key={tick}>{chartTickText(tick)}</span>)}</div><span className="report-worktime-y-baseline" /></div>
            <div className={'report-worktime-chart bars-' + buckets.length} role="group" aria-label={mode === 'day' ? t('최근 기록 {count}일', { count: bucketCount }) : t(mode === 'week' ? '최근 8주' : '최근 12개월')} style={{ '--report-worktime-chart-count': buckets.length } as CSSProperties}>
              <div className="report-worktime-chart-grid" aria-hidden="true">{chartTicks.map((tick) => <span key={tick} style={{ bottom: `${chartScaleMax ? tick / chartScaleMax * 100 : 0}%` }} />)}</div>
              {buckets.map((bucket, index) => {
                const labelVisible = buckets.length !== 30 || index % 6 === 0 || index === buckets.length - 1
                const selected = selectedBucket?.key === bucket.key
                const label = chartBucketLabel(mode, bucket.key, true)
                return <button ref={(element) => { chartButtons.current[index] = element }} type="button" className={'report-worktime-bar-column' + (selected ? ' selected' : '')} key={bucket.key} title={`${chartBucketLabel(mode, bucket.key)}: ${durationText(bucket.elapsedMs)}`} aria-label={`${t(mode === 'day' ? '일별' : mode === 'week' ? '주간' : '월간')} ${chartBucketLabel(mode, bucket.key)}, ${durationText(bucket.elapsedMs)}`} aria-pressed={selected} tabIndex={index === selectedBucketIndex ? 0 : -1} onClick={() => setSelectedBucketKey({ documentId, key: bucket.key })} onKeyDown={(event) => handleChartKeyDown(event, index)}><span className="report-worktime-bar-track"><i style={{ height: `${chartScaleMax ? bucket.elapsedMs / chartScaleMax * 100 : 0}%` }} /></span><small aria-hidden={!labelVisible}>{labelVisible ? label : ''}</small></button>
              })}
            </div>
          </div>
          <div className="report-worktime-chart-selection" aria-live="polite">{selectedBucket ? <><span>{chartBucketLabel(mode, selectedBucket.key)}</span><strong>{durationText(selectedBucket.elapsedMs)}</strong></> : <span>{t('선택 기간의 작업시간 기록이 없습니다.')}</span>}</div>
        </section>
      </div> : <div className="worktime-record-content">
        <section className="worktime-record-total"><span>{t('총 작업시간')}</span><strong>{durationText(record.totalWorkTimeMs)}</strong></section>
        {resetMode && <section className="worktime-record-reset-confirm" aria-labelledby="worktime-reset-title">
          <h3 id="worktime-reset-title">{t(resetMode === 'date' ? '날짜별 작업시간 초기화' : '전체 작업시간 초기화')}</h3>
          <p>{t(resetMode === 'date' ? '선택한 날짜의 작업시간과 세션 기록을 초기화합니다.' : '누적 작업시간과 모든 세션 기록을 초기화합니다.')}</p>
          <p>{t('작업 메모는 유지됩니다.')}</p>
          {resetMode === 'date' && <label>{t('초기화할 날짜')}<select ref={resetDateRef} value={resetDate} disabled={closeLocked} onChange={(event) => setResetDate(event.currentTarget.value)}>{sortedDays.filter((day) => day.elapsedMs > 0).map((day) => <option key={day.date} value={day.date}>{formatDate(dayDate(day.date), { year: 'numeric', month: '2-digit', day: '2-digit' })} · {durationText(day.elapsedMs)}</option>)}</select></label>}
          {resetError && <p className="worktime-record-error" role="alert">{resetError}</p>}
          <div><button type="button" className="worktime-record-reset-cancel" disabled={closeLocked} onClick={() => { setResetMode(null); setResetError(''); requestAnimationFrame(() => resetButtonRef.current?.focus()) }}>{t('취소')}</button><button ref={resetMode === 'all' ? resetConfirmRef : null} type="button" className="worktime-record-reset-confirm-button" disabled={closeLocked || resetMode === 'date' && !resetDate} onClick={() => void confirmReset()}>{resetting ? t('초기화 중…') : t('초기화')}</button></div>
        </section>}
        {adding && <form className="worktime-record-form" onSubmit={(event) => void submitAdd(event)}>
          <header><h3>{t('작업시간 추가')}</h3><button type="button" aria-label={t('입력 취소')} disabled={closeLocked} onClick={() => { setAdding(false); setAddError('') }}><X size={17} /></button></header>
          <label>{t('작업 날짜')}<input type="date" min={REPORT_DATE_MIN} max={REPORT_DATE_MAX} value={date} required disabled={closeLocked} onChange={(event) => setDate(event.currentTarget.value)} /></label>
          <div className="worktime-record-time-fields">
            <label>{t('시간')}<input type="number" inputMode="numeric" min="0" max="9999" step="1" value={hours} disabled={closeLocked} onChange={(event) => setHours(event.currentTarget.value)} /></label>
            <label>{t('분')}<input type="number" inputMode="numeric" min="0" max="59" step="1" value={minutes} disabled={closeLocked} onChange={(event) => setMinutes(event.currentTarget.value)} /></label>
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
