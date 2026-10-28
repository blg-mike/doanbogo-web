import { Minimize2, Pause, Play } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { t } from './locales'
import { addDocumentWorkSessions, addDocumentWorkTime, resetDocumentWorkTime } from './storage'
import type { DocumentWorkTimeDay, DocumentWorkTimeSession } from './types'
import { formatWorkTime, localWorkDateKey, persistedWorkTimeBase, splitWorkTimeSession } from './workTime'
import WorkTimeRecordPanel from './WorkTimeRecordPanel'

export type DocumentTimerClock = { sessionId: string; elapsedNow: () => number; todayElapsedNow: () => number; isRunning: () => boolean; startIfNotStartedToday: () => boolean; pauseAndSave: () => Promise<void>; addWorkTime: (workDate: string, elapsedMs: number) => Promise<DocumentWorkTimeTotals> }

export type DocumentWorkTimeTotals = { totalWorkTimeMs: number; todayWorkDate: string; todayWorkTimeMs: number; workTimeDays: DocumentWorkTimeDay[] }

type Props = {
  documentId: string
  initialTotalWorkTimeMs: number
  initialWorkTimeDays: DocumentWorkTimeDay[]
  initialTodayWorkDate?: string
  initialTodayWorkTimeMs?: number
  portalTarget: HTMLElement | null
  counterMiniBarLayout?: boolean
  minimized?: boolean
  restoreButtonRef?: RefObject<HTMLButtonElement | null>
  onMinimize?: () => void
  onErrorChange?: (hasError: boolean) => void
  onWorkTimeChange: (totals: DocumentWorkTimeTotals) => void
  onTodayWorkTimeChange: (date: string, elapsedMs: number) => void
  onUnsavedChange: (unsaved: boolean) => void
  onSavingChange: (saving: boolean) => void
  onClockChange: (clock: DocumentTimerClock | null) => void
  recordPanelOpen: boolean
  onRecordPanelOpenChange: (open: boolean) => void
  onRecordPanelBlockingChange?: (blocked: boolean) => void
}

export default function DocumentWorkTimer({ documentId, initialTotalWorkTimeMs, initialWorkTimeDays, initialTodayWorkDate, initialTodayWorkTimeMs = 0, portalTarget, counterMiniBarLayout = false, minimized = false, restoreButtonRef, onMinimize, onErrorChange, onWorkTimeChange, onTodayWorkTimeChange, onUnsavedChange, onSavingChange, onClockChange, recordPanelOpen, onRecordPanelOpenChange, onRecordPanelBlockingChange }: Props) {
  const [sessionId] = useState(() => crypto.randomUUID())
  const elapsedBaseRef = useRef(0)
  const initialTodayBase = initialTodayWorkDate === localWorkDateKey() ? initialTodayWorkTimeMs : 0
  const todayWorkDateRef = useRef(localWorkDateKey())
  const todayBaseRef = useRef(initialTodayBase)
  const todaySessionStartElapsedRef = useRef(0)
  const startedAtRef = useRef<number | null>(null)
  const workSessionIdRef = useRef<string | null>(null)
  const workSessionStartedAtRef = useRef<number | null>(null)
  const lastAutoSavedBoundaryRef = useRef<number | null>(null)
  const pendingSessionsRef = useRef<DocumentWorkTimeSession[]>([])
  const savedSessionIdsRef = useRef(new Set<string>())
  const savedSessionTimeByDateRef = useRef(new Map<string, number>())
  const manualWorkTimePromiseRef = useRef<Promise<DocumentWorkTimeTotals> | null>(null)
  const runningRef = useRef(false)
  const savingRef = useRef(false)
  const savePromiseRef = useRef<Promise<boolean> | null>(null)
  const activeRef = useRef(true)
  const [elapsedMs, setElapsedMs] = useState(initialTodayBase)
  const [running, setRunning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)
  const minimizeButtonRef = useRef<HTMLButtonElement>(null)
  const wasMinimizedRef = useRef(false)

  useEffect(() => onErrorChange?.(error), [error, onErrorChange])
  useEffect(() => {
    if (minimized) restoreButtonRef?.current?.focus()
    else if (wasMinimizedRef.current) minimizeButtonRef.current?.focus()
    wasMinimizedRef.current = minimized
  }, [minimized, restoreButtonRef])

  useEffect(() => {
    if (runningRef.current || startedAtRef.current !== null || elapsedBaseRef.current > 0) return
    const currentDate = localWorkDateKey()
    todayWorkDateRef.current = currentDate
    todaySessionStartElapsedRef.current = 0
    todayBaseRef.current = initialTodayWorkDate === currentDate ? initialTodayWorkTimeMs : 0
    setElapsedMs(todayBaseRef.current)
  }, [initialTodayWorkDate, initialTodayWorkTimeMs])

  const elapsedNow = useCallback(() => startedAtRef.current === null
    ? elapsedBaseRef.current
    : elapsedBaseRef.current + Math.max(0, Date.now() - startedAtRef.current), [])

  const todayElapsedNow = useCallback(() => todayWorkDateRef.current === localWorkDateKey()
    ? todayBaseRef.current + Math.max(0, elapsedNow() - todaySessionStartElapsedRef.current)
    : 0, [elapsedNow])

  const startTimer = useCallback(() => {
    if (savingRef.current || runningRef.current || pendingSessionsRef.current.length) return false
    const currentDate = localWorkDateKey()
    if (todayWorkDateRef.current !== currentDate) {
      todayWorkDateRef.current = currentDate
      todayBaseRef.current = 0
      todaySessionStartElapsedRef.current = elapsedNow()
      setElapsedMs(0)
      onTodayWorkTimeChange(currentDate, 0)
    }
    setError(false)
    const startedAt = Date.now()
    startedAtRef.current = startedAt
    workSessionIdRef.current = crypto.randomUUID()
    workSessionStartedAtRef.current = startedAt
    lastAutoSavedBoundaryRef.current = null
    runningRef.current = true
    setRunning(true)
    onUnsavedChange(true)
    return true
  }, [elapsedNow, onTodayWorkTimeChange, onUnsavedChange])

  const startIfNotStartedToday = useCallback(() => {
    if (todayElapsedNow() > 0) return false
    return startTimer()
  }, [startTimer, todayElapsedNow])

  const saveSessions = useCallback(async function saveSessionsInternal(sessions: DocumentWorkTimeSession[], final: boolean): Promise<boolean> {
    const pending = savePromiseRef.current
    if (pending) {
      if (!await pending) return false
      return saveSessionsInternal(sessions, final)
    }
    if (!sessions.length) {
      if (final) {
        workSessionIdRef.current = null
        workSessionStartedAtRef.current = null
        pendingSessionsRef.current = []
      }
      onUnsavedChange(runningRef.current)
      setError(false)
      return true
    }
    pendingSessionsRef.current = sessions
    savingRef.current = true
    setSaving(true)
    onSavingChange(true)
    setError(false)
    const operation = (async () => {
      try {
        const totals = await addDocumentWorkSessions(documentId, sessions)
        for (const session of sessions) {
          if (savedSessionIdsRef.current.has(session.id)) continue
          savedSessionIdsRef.current.add(session.id)
          savedSessionTimeByDateRef.current.set(session.workDate, (savedSessionTimeByDateRef.current.get(session.workDate) ?? 0) + session.elapsedMs)
        }
        const currentDate = localWorkDateKey()
        if (totals.todayWorkDate === currentDate) todayBaseRef.current = persistedWorkTimeBase(totals.todayWorkTimeMs, savedSessionTimeByDateRef.current.get(currentDate) ?? 0)
        pendingSessionsRef.current = []
        if (final) {
          workSessionIdRef.current = null
          workSessionStartedAtRef.current = null
          lastAutoSavedBoundaryRef.current = null
        }
        if (activeRef.current) {
          if (totals.todayWorkDate === localWorkDateKey()) setElapsedMs(totals.todayWorkTimeMs)
          onWorkTimeChange(totals)
          onUnsavedChange(runningRef.current)
        }
        return true
      } catch {
        if (activeRef.current) {
          setError(true)
          onUnsavedChange(true)
        }
        return false
      } finally {
        savingRef.current = false
        savePromiseRef.current = null
        if (activeRef.current) {
          setSaving(false)
          onSavingChange(false)
        }
      }
    })()
    savePromiseRef.current = operation
    return operation
  }, [documentId, onSavingChange, onWorkTimeChange, onUnsavedChange])

  const addWorkTime = useCallback(async (workDate: string, milliseconds: number) => {
    const previousAdd = manualWorkTimePromiseRef.current
    if (previousAdd) await previousAdd.catch(() => {})
    const previousSave = savePromiseRef.current
    if (previousSave && !await previousSave) throw new Error('작업시간을 저장하지 못했습니다.')
    if (savingRef.current) throw new Error('작업시간을 저장하지 못했습니다.')

    savingRef.current = true
    setSaving(true)
    onSavingChange(true)
    const operation = (async () => {
      try {
        const totals = await addDocumentWorkTime(documentId, milliseconds, workDate)
        if (activeRef.current) {
          const currentDate = localWorkDateKey()
          const currentDateTotal = totals.workTimeDays.find((day) => day.date === currentDate)?.elapsedMs ?? 0
          if (workDate === currentDate) {
            if (todayWorkDateRef.current !== currentDate) {
              const now = Date.now()
              const todayStart = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), new Date(now).getDate()).getTime()
              todayWorkDateRef.current = currentDate
              todaySessionStartElapsedRef.current = runningRef.current
                ? elapsedBaseRef.current + Math.max(0, todayStart - (startedAtRef.current ?? todayStart))
                : elapsedNow()
            }
            const savedSessionTime = savedSessionTimeByDateRef.current.get(currentDate) ?? 0
            todayBaseRef.current = persistedWorkTimeBase(currentDateTotal, savedSessionTime)
            setElapsedMs(todayElapsedNow())
          }
          onWorkTimeChange({ ...totals, todayWorkDate: currentDate, todayWorkTimeMs: currentDateTotal })
        }
        return totals
      } finally {
        savingRef.current = false
        if (activeRef.current) {
          setSaving(false)
          onSavingChange(false)
        }
      }
    })()
    manualWorkTimePromiseRef.current = operation
    try {
      return await operation
    } finally {
      if (manualWorkTimePromiseRef.current === operation) manualWorkTimePromiseRef.current = null
    }
  }, [documentId, elapsedNow, onSavingChange, onWorkTimeChange, todayElapsedNow])

  const pauseAndSave = useCallback(async () => {
    const manualAdd = manualWorkTimePromiseRef.current
    if (manualAdd) await manualAdd.catch(() => {})
    const elapsed = elapsedNow()
    let sessions = pendingSessionsRef.current
    if (runningRef.current) {
      const endedAt = Date.now()
      const sessionId = workSessionIdRef.current
      const sessionStartedAt = workSessionStartedAtRef.current
      sessions = sessionId && sessionStartedAt !== null ? splitWorkTimeSession(sessionId, sessionStartedAt, endedAt) : []
      elapsedBaseRef.current = elapsed
      startedAtRef.current = null
      runningRef.current = false
      setElapsedMs(todayElapsedNow())
      setRunning(false)
    }
    pendingSessionsRef.current = sessions
    if (!await saveSessions(sessions, true)) throw new Error('작업시간을 저장하지 못했습니다.')
  }, [elapsedNow, saveSessions, todayElapsedNow])

  const resetWorkTime = useCallback(async (workDate?: string) => {
    const manualAdd = manualWorkTimePromiseRef.current
    if (manualAdd) await manualAdd
    const shouldResume = runningRef.current
    if (shouldResume) await pauseAndSave()
    else if (savePromiseRef.current) await savePromiseRef.current
    if (savingRef.current) throw new Error('작업시간을 저장 중입니다.')

    savingRef.current = true
    setSaving(true)
    onSavingChange(true)
    try {
      const totals = await resetDocumentWorkTime(documentId, workDate)
      pendingSessionsRef.current = pendingSessionsRef.current.filter((session) => workDate !== undefined && session.workDate !== workDate)
      if (workDate === undefined) {
        savedSessionIdsRef.current.clear()
        savedSessionTimeByDateRef.current.clear()
      } else savedSessionTimeByDateRef.current.delete(workDate)
      setError(pendingSessionsRef.current.length > 0)

      const currentDate = localWorkDateKey()
      const currentDateTotal = totals.workTimeDays.find((day) => day.date === currentDate)?.elapsedMs ?? 0
      if (workDate === undefined || workDate === currentDate) {
        todayWorkDateRef.current = currentDate
        todayBaseRef.current = currentDateTotal
        todaySessionStartElapsedRef.current = elapsedNow()
        setElapsedMs(currentDateTotal)
      }
      onWorkTimeChange({ ...totals, todayWorkDate: currentDate, todayWorkTimeMs: currentDateTotal })
      return totals
    } finally {
      savingRef.current = false
      setSaving(false)
      onSavingChange(false)
      if (shouldResume) startTimer()
    }
  }, [documentId, elapsedNow, onSavingChange, onWorkTimeChange, pauseAndSave, startTimer])

  useEffect(() => {
    onClockChange({ sessionId, elapsedNow, todayElapsedNow, isRunning: () => runningRef.current, startIfNotStartedToday, pauseAndSave, addWorkTime })
    return () => onClockChange(null)
  }, [addWorkTime, elapsedNow, onClockChange, pauseAndSave, sessionId, startIfNotStartedToday, todayElapsedNow])

  useEffect(() => {
    activeRef.current = true
    return () => { activeRef.current = false }
  }, [])

  useEffect(() => { onSavingChange(saving) }, [saving, onSavingChange])

  useEffect(() => {
    const update = () => {
      const now = Date.now()
      const currentDate = localWorkDateKey(new Date(now))
      if (runningRef.current && workSessionIdRef.current && workSessionStartedAtRef.current !== null) {
        const todayStart = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), new Date(now).getDate()).getTime()
        const sessionStartedAt = workSessionStartedAtRef.current
        if (sessionStartedAt < todayStart && lastAutoSavedBoundaryRef.current !== todayStart) {
          lastAutoSavedBoundaryRef.current = todayStart
          const segments = splitWorkTimeSession(workSessionIdRef.current, sessionStartedAt, todayStart)
          void saveSessions(segments, false)
        }
      }
      if (todayWorkDateRef.current !== currentDate) {
        const todayStart = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), new Date(now).getDate()).getTime()
        todayWorkDateRef.current = currentDate
        todayBaseRef.current = 0
        todaySessionStartElapsedRef.current = runningRef.current
          ? elapsedBaseRef.current + Math.max(0, todayStart - (startedAtRef.current ?? todayStart))
          : elapsedNow()
        setElapsedMs(0)
        onTodayWorkTimeChange(currentDate, 0)
      }
      setElapsedMs(todayElapsedNow())
    }
    const interval = window.setInterval(update, running ? 1000 : 60_000)
    document.addEventListener('visibilitychange', update)
    window.addEventListener('focus', update)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', update)
      window.removeEventListener('focus', update)
    }
  }, [elapsedNow, onTodayWorkTimeChange, running, saveSessions, todayElapsedNow])

  async function toggle() {
    if (savingRef.current) return
    if (runningRef.current) {
      try { await pauseAndSave() } catch { /* The retry message remains visible while the timer stays paused. */ }
      return
    }
    if (pendingSessionsRef.current.length) {
      await saveSessions(pendingSessionsRef.current, true)
      return
    }
    startTimer()
  }

  if (!portalTarget) return null
  const toggleButton = <button type="button" className="viewer-work-timer-toggle" aria-label={error ? t('저장 재시도') : running ? t('일시정지') : t('재생')} title={error ? t('저장 재시도') : running ? t('일시정지') : t('재생')} disabled={saving} onClick={() => void toggle()}>
      {running ? <Pause size={17} /> : <Play size={17} />}
    </button>
  const elapsedButton = <button type="button" className="viewer-work-timer-elapsed" aria-haspopup="dialog" aria-expanded={recordPanelOpen} aria-label={`${t('오늘 누적 작업시간')} ${formatWorkTime(elapsedMs)} · ${t('작업 기록')}`} title={t('작업 기록')} aria-live="off" onClick={() => onRecordPanelOpenChange(true)}>{formatWorkTime(elapsedMs)}</button>
  const minimizeButton = counterMiniBarLayout && <button ref={minimizeButtonRef} type="button" className="viewer-work-timer-minimize" aria-label={t('작업 타이머 최소화')} title={t('작업 타이머 최소화')} onClick={onMinimize}><Minimize2 size={18} /></button>
  return createPortal(<div className="viewer-work-timer" aria-label={t('작업 타이머')}>
    {counterMiniBarLayout ? <>{elapsedButton}{toggleButton}{minimizeButton}</> : <>{toggleButton}{elapsedButton}</>}
    {recordPanelOpen && <WorkTimeRecordPanel documentId={documentId} hidden={minimized} initialTotalWorkTimeMs={initialTotalWorkTimeMs} initialWorkTimeDays={initialWorkTimeDays} onClose={() => { onRecordPanelOpenChange(false); onRecordPanelBlockingChange?.(false) }} onAddWorkTime={addWorkTime} onResetWorkTime={resetWorkTime} onInteractionBlockingChange={onRecordPanelBlockingChange} onTotalsChange={(total, days) => {
      const currentDate = localWorkDateKey()
      onWorkTimeChange({ totalWorkTimeMs: total, todayWorkDate: currentDate, todayWorkTimeMs: days.find((day) => day.date === currentDate)?.elapsedMs ?? 0, workTimeDays: days })
    }} />}
  </div>, portalTarget)
}
