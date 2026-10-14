import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowLeft, CalendarDays, ChevronRight, X } from 'lucide-react'
import { formatDate, formatDateTime, formatNumber, t } from './locales'
import type { DocumentWorkTimeDay, DocumentWorkTimeSession } from './types'
import { formatWorkTime, formatWorkTimeHoursMinutes, summarizeWorkTime, workTimeChartBuckets, type WorkTimeChartMode } from './workTime'

type Props = {
  totalWorkTimeMs: number
  workTimeDays: DocumentWorkTimeDay[]
  sessions: DocumentWorkTimeSession[]
  notes: Record<string, string>
  loading: boolean
  onSaveNote: (date: string, note: string) => Promise<void>
}

function durationText(milliseconds: number) {
  const { hours, minutes } = formatWorkTimeHoursMinutes(milliseconds)
  return t('{hours}시간 {minutes}분', { hours: formatNumber(Number(hours)), minutes: formatNumber(Number(minutes)) })
}

function dayDate(date: string) {
  return new Date(date + 'T12:00:00')
}

function dayStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function timeOfDay(timestamp: number, workDate: string, isEnd: boolean) {
  if (isEnd && new Date(timestamp).getTime() === dayStart(new Date(timestamp))) {
    const previous = new Date(timestamp - 1)
    if (`${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}-${String(previous.getDate()).padStart(2, '0')}` === workDate) return 1440
  }
  const date = new Date(timestamp)
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60
}

export default function ReportWorkTime({ totalWorkTimeMs, workTimeDays, sessions, notes, loading, onSaveNote }: Props) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<WorkTimeChartMode>('day')
  const [dailyRange, setDailyRange] = useState(7)
  const [activeDate, setActiveDate] = useState('')
  const [noteDraftState, setNoteDraftState] = useState({ date: '', value: '' })
  const [savingNote, setSavingNote] = useState(false)
  const [noteError, setNoteError] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const summary = summarizeWorkTime(totalWorkTimeMs, workTimeDays)
  const sortedDays = [...summary.recordedDays].sort((left, right) => right.date.localeCompare(left.date))
  const ordinals = new Map([...summary.recordedDays].map((day, index) => [day.date, index + 1]))
  const selectedDay = summary.recordedDays.find((day) => day.date === activeDate)
  const daySessions = sessions.filter((session) => session.workDate === activeDate).sort((left, right) => left.startedAt - right.startedAt)
  const sessionTotal = daySessions.reduce((sum, session) => sum + session.elapsedMs, 0)
  const dayTotal = selectedDay?.elapsedMs ?? 0
  const unknownDayTime = Math.max(0, dayTotal - sessionTotal)
  const dayDetailTitle = activeDate
    ? `${formatDate(dayDate(activeDate), { month: 'long', day: 'numeric' })} (${t('{day}일차', { day: formatNumber(ordinals.get(activeDate) ?? 0) })})`
    : ''
  const bucketCount = mode === 'day' ? dailyRange : mode === 'week' ? 8 : 12
  const buckets = workTimeChartBuckets(workTimeDays, mode, bucketCount)
  const chartMax = Math.max(1, ...buckets.map((bucket) => bucket.elapsedMs))
  const noteDraft = activeDate
    ? noteDraftState.date === activeDate ? noteDraftState.value : notes[activeDate] ?? ''
    : ''

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const trigger = triggerRef.current
    closeRef.current?.focus()
    return () => {
      if (trigger?.isConnected) trigger.focus()
      else previouslyFocused?.focus()
    }
  }, [open])

  function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      if (activeDate) {
        setActiveDate('')
        requestAnimationFrame(() => closeRef.current?.focus())
      }
      else setOpen(false)
      return
    }
    if (event.key !== 'Tab') return
    const items = event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])')
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

  function showOverview() {
    setActiveDate('')
    setNoteError('')
    requestAnimationFrame(() => closeRef.current?.focus())
  }

  function showDate(date: string) {
    setActiveDate(date)
    setNoteError('')
  }

  async function saveNote() {
    if (!activeDate || savingNote) return
    setSavingNote(true)
    setNoteError('')
    try {
      await onSaveNote(activeDate, noteDraft)
    } catch {
      setNoteError(t('메모 저장 실패'))
    } finally {
      setSavingNote(false)
    }
  }

  function cancelNote() {
    setNoteDraftState({ date: activeDate, value: notes[activeDate] ?? '' })
    setNoteError('')
  }

  return <>
    <button ref={triggerRef} type="button" className="report-worktime-card" aria-haspopup="dialog" aria-expanded={open} onClick={() => { setActiveDate(''); setNoteError(''); setOpen(true) }}>
      <span className="report-worktime-title">{t('작업 시간')}</span>
      <strong className="report-worktime-total">{durationText(totalWorkTimeMs)}</strong>
      <span className="report-worktime-hint">{t('타이머에서 자동 기록')}</span>
      {sortedDays.length > 0 && <span className="report-worktime-recent">{sortedDays.slice(0, 2).map((day) => <span key={day.date}><time dateTime={day.date}>{formatDate(dayDate(day.date), { month: 'numeric', day: 'numeric' })}</time><b>{durationText(day.elapsedMs)}</b></span>)}</span>}
      <span className="report-worktime-open">{t('작업시간 기록 보기')} <ChevronRight size={15} aria-hidden="true" /></span>
    </button>
    {open && <div className="report-worktime-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingNote) setOpen(false) }}>
      <section className="report-worktime-dialog" role="dialog" aria-modal="true" aria-labelledby="report-worktime-title" onKeyDown={handleDialogKeyDown}>
        <header className="report-worktime-dialog-header">
          {activeDate && <button type="button" className="report-worktime-back" aria-label={t('뒤로')} onClick={showOverview}><ArrowLeft size={19} /></button>}
          <div><small>{t('작업 시간')}</small><h2 id="report-worktime-title">{activeDate ? dayDetailTitle : t('작업시간 기록 보기')}</h2></div>
          <button ref={closeRef} type="button" className="report-worktime-close" aria-label={t('닫기')} onClick={() => setOpen(false)}><X size={19} /></button>
        </header>
        {loading ? <div className="report-worktime-loading" role="status">{t('불러오는 중')}</div> : activeDate ? <div className="report-worktime-detail">
          <section className="report-worktime-today-card">
            <div className="report-worktime-today-heading"><div><span>{t('작업 시간')}</span><strong>{durationText(dayTotal)}</strong></div><span className="report-worktime-date"><CalendarDays size={18} />{formatDate(dayDate(activeDate), { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long' })}</span></div>
            {daySessions.length > 0 && <div className="report-worktime-timeline" aria-label={t('작업 세션 기록')}>
              <div className="report-worktime-timeline-track">{daySessions.map((session) => {
                const left = timeOfDay(session.startedAt, activeDate, false) / 1440 * 100
                const right = timeOfDay(session.endedAt, activeDate, true) / 1440 * 100
                return <span key={session.id} style={{ left: `${left}%`, width: `${Math.max(.6, right - left)}%` }} />
              })}</div>
              <div><span>{formatDateTime(daySessions[0].startedAt, { timeStyle: 'short' })}</span><span>{formatDateTime(daySessions[daySessions.length - 1].endedAt, { timeStyle: 'short' })}</span></div>
            </div>}
            {daySessions.length > 0 && <div className="report-worktime-session-stats"><span><small>{t('세션 수')}</small><b>{formatNumber(daySessions.length)}</b></span><span><small>{t('평균 세션')}</small><b>{durationText(sessionTotal / daySessions.length)}</b></span><span><small>{t('가장 긴 세션')}</small><b>{durationText(Math.max(...daySessions.map((session) => session.elapsedMs)))}</b></span></div>}
          </section>
          <section className="report-worktime-session-list"><h3>{t('작업 세션 기록')}</h3>
            {daySessions.length ? <ol>{daySessions.map((session) => <li key={session.id}><span>{formatDateTime(session.startedAt, { timeStyle: 'short' })} – {formatDateTime(session.endedAt, { timeStyle: 'short' })}</span><b>{durationText(session.elapsedMs)}</b></li>)}</ol> : <p>{t('세션 상세 기록 없음')}</p>}
            {unknownDayTime > 0 && <p className="report-worktime-unknown">{t('세션 미상 시간')}: {durationText(unknownDayTime)}</p>}
            {daySessions.length > 0 && sessionTotal > dayTotal && <p className="report-worktime-unknown">{t('세션 기록 합계가 일별 작업시간을 초과합니다.')}</p>}
          </section>
          <section className="report-worktime-note"><label htmlFor="report-worktime-note">{t('메모')}</label><textarea id="report-worktime-note" value={noteDraft} placeholder={t('메모를 입력하세요.')} onChange={(event) => setNoteDraftState({ date: activeDate, value: event.currentTarget.value })} />
            {noteError && <p role="alert">{noteError}</p>}<div><button type="button" className="report-worktime-cancel" disabled={savingNote} onClick={cancelNote}>{t('취소')}</button><button type="button" className="report-worktime-save" disabled={savingNote} onClick={() => void saveNote()}>{savingNote ? t('저장 중…') : t('메모 저장')}</button></div>
          </section>
        </div> : <div className="report-worktime-overview">
          <nav className="report-worktime-tabs" aria-label={t('작업시간 기록 보기')}>
            {(['day', 'week', 'month'] as const).map((item) => <button key={item} type="button" aria-pressed={mode === item} className={mode === item ? 'selected' : ''} onClick={() => setMode(item)}>{t(item === 'day' ? '일별' : item === 'week' ? '주간' : '월간')}</button>)}
          </nav>
          <section className="report-worktime-total-card"><span>{t('누적 작업시간')}</span><strong>{formatWorkTime(totalWorkTimeMs)}</strong><div className="report-worktime-summary-stats">
            <span><small>{t('작업일 수')}</small><b>{t('{count}일', { count: formatNumber(summary.recordedDays.length) })}</b></span>
            <span><small>{t('작업일 평균')}</small><b>{durationText(summary.averageMs)}</b></span>
            <span><small>{t('최장 작업일')}</small><b>{durationText(summary.longestDayMs)}</b></span>
          </div>{summary.unknownMs > 0 && <p>{t('날짜 미상 기록')}: {durationText(summary.unknownMs)}</p>}</section>
          <section className="report-worktime-chart-card"><header><h3>{t(mode === 'day' ? '일별' : mode === 'week' ? '주간' : '월간')}</h3>{mode === 'day' ? <select aria-label={t('최근 7일')} value={dailyRange} onChange={(event) => setDailyRange(Number(event.currentTarget.value))}><option value={7}>{t('최근 7일')}</option><option value={30}>{t('최근 30일')}</option></select> : <span>{t(mode === 'week' ? '최근 8주' : '최근 12개월')}</span>}</header>
            <div className={'report-worktime-chart bars-' + buckets.length} role="img" aria-label={mode === 'day' ? t('최근 기록 {count}일', { count: bucketCount }) : t(mode === 'week' ? '최근 8주' : '최근 12개월')}>{buckets.map((bucket) => <div className="report-worktime-bar-column" key={bucket.key} title={`${bucket.label}: ${durationText(bucket.elapsedMs)}`}><b>{bucket.elapsedMs > 0 ? durationText(bucket.elapsedMs) : ''}</b><span className="report-worktime-bar-track"><i style={{ height: `${bucket.elapsedMs ? Math.max(5, bucket.elapsedMs / chartMax * 100) : 0}%` }} /></span><small>{bucket.label}</small></div>)}</div>
          </section>
          <section className="report-worktime-days"><header><h3>{t('일별')}</h3><span>{t('{count}일', { count: formatNumber(summary.recordedDays.length) })}</span></header>
            {sortedDays.length ? <ol>{sortedDays.map((day) => <li key={day.date}><button type="button" onClick={() => showDate(day.date)}><i aria-hidden="true" /><b>{t('{day}일차', { day: formatNumber(ordinals.get(day.date) ?? 0) })}</b><time dateTime={day.date}>{formatDate(dayDate(day.date), { year: 'numeric', month: '2-digit', day: '2-digit' })}</time><strong>{durationText(day.elapsedMs)}</strong></button></li>)}</ol> : <p>{t('아직 저장된 일별 타이머 기록이 없습니다.')}</p>}
          </section>
        </div>}
      </section>
    </div>}
  </>
}
