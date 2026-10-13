import { Pause, Play } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { t } from './locales'
import { addDocumentWorkTime } from './storage'
import type { DocumentWorkTimeDay } from './types'
import { formatWorkTime, localWorkDateKey } from './workTime'

export type DocumentTimerClock = { sessionId: string; elapsedNow: () => number; todayElapsedNow: () => number; isRunning: () => boolean; startIfNotStartedToday: () => boolean; pauseAndSave: () => Promise<void> }

export type DocumentWorkTimeTotals = { totalWorkTimeMs: number; todayWorkDate: string; todayWorkTimeMs: number; workTimeDays: DocumentWorkTimeDay[] }

type Props = {
  documentId: string
  initialTodayWorkDate?: string
  initialTodayWorkTimeMs?: number
  portalTarget: HTMLElement | null
  onWorkTimeChange: (totals: DocumentWorkTimeTotals) => void
  onTodayWorkTimeChange: (date: string, elapsedMs: number) => void
  onUnsavedChange: (unsaved: boolean) => void
  onSavingChange: (saving: boolean) => void
  onClockChange: (clock: DocumentTimerClock | null) => void
}

export default function DocumentWorkTimer({ documentId, initialTodayWorkDate, initialTodayWorkTimeMs = 0, portalTarget, onWorkTimeChange, onTodayWorkTimeChange, onUnsavedChange, onSavingChange, onClockChange }: Props) {
  const [sessionId] = useState(() => crypto.randomUUID())
  const elapsedBaseRef = useRef(0)
  const lastSavedElapsedRef = useRef(0)
  const initialTodayBase = initialTodayWorkDate === localWorkDateKey() ? initialTodayWorkTimeMs : 0
  const todayWorkDateRef = useRef(localWorkDateKey())
  const todayBaseRef = useRef(initialTodayBase)
  const todaySessionStartElapsedRef = useRef(0)
  const startedAtRef = useRef<number | null>(null)
  const runningRef = useRef(false)
  const savingRef = useRef(false)
  const savePromiseRef = useRef<Promise<boolean> | null>(null)
  const activeRef = useRef(true)
  const [elapsedMs, setElapsedMs] = useState(initialTodayBase)
  const [running, setRunning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (runningRef.current || startedAtRef.current !== null || elapsedBaseRef.current > 0 || lastSavedElapsedRef.current > 0) return
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
    if (savingRef.current || runningRef.current) return false
    const currentDate = localWorkDateKey()
    if (todayWorkDateRef.current !== currentDate) {
      todayWorkDateRef.current = currentDate
      todayBaseRef.current = 0
      todaySessionStartElapsedRef.current = elapsedNow()
      setElapsedMs(0)
      onTodayWorkTimeChange(currentDate, 0)
    }
    setError(false)
    startedAtRef.current = Date.now()
    runningRef.current = true
    setRunning(true)
    onUnsavedChange(true)
    return true
  }, [elapsedNow, onTodayWorkTimeChange, onUnsavedChange])

  const startIfNotStartedToday = useCallback(() => {
    if (todayElapsedNow() > 0) return false
    return startTimer()
  }, [startTimer, todayElapsedNow])

  const saveElapsed = useCallback(async function saveElapsedInternal(elapsed: number, workDate = todayWorkDateRef.current): Promise<boolean> {
    const pending = savePromiseRef.current
    if (pending) {
      if (!await pending) return false
      return saveElapsedInternal(elapsed, workDate)
    }
    const delta = Math.max(0, elapsed - lastSavedElapsedRef.current)
    if (delta === 0) {
      onUnsavedChange(false)
      setError(false)
      return true
    }
    savingRef.current = true
    setSaving(true)
    onSavingChange(true)
    setError(false)
    const operation = (async () => {
      try {
        const totals = await addDocumentWorkTime(documentId, delta, workDate)
        lastSavedElapsedRef.current = elapsed
        if (totals.todayWorkDate === localWorkDateKey()) todayBaseRef.current = Math.max(0, totals.todayWorkTimeMs - Math.max(0, elapsed - todaySessionStartElapsedRef.current))
        if (activeRef.current) {
          setElapsedMs(totals.todayWorkTimeMs)
          onWorkTimeChange(totals)
          onUnsavedChange(false)
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

  const pauseAndSave = useCallback(async () => {
    const elapsed = elapsedNow()
    if (runningRef.current) {
      elapsedBaseRef.current = elapsed
      startedAtRef.current = null
      runningRef.current = false
      setElapsedMs(todayElapsedNow())
      setRunning(false)
    }
    if (!await saveElapsed(elapsed)) throw new Error('작업시간을 저장하지 못했습니다.')
  }, [elapsedNow, saveElapsed, todayElapsedNow])

  useEffect(() => {
    onClockChange({ sessionId, elapsedNow, todayElapsedNow, isRunning: () => runningRef.current, startIfNotStartedToday, pauseAndSave })
    return () => onClockChange(null)
  }, [elapsedNow, onClockChange, pauseAndSave, sessionId, startIfNotStartedToday, todayElapsedNow])

  useEffect(() => {
    activeRef.current = true
    return () => { activeRef.current = false }
  }, [])

  useEffect(() => { onSavingChange(saving) }, [saving, onSavingChange])

  useEffect(() => {
    const update = () => {
      const currentDate = localWorkDateKey()
      if (todayWorkDateRef.current !== currentDate) {
        const previousDate = todayWorkDateRef.current
        const elapsed = elapsedNow()
        void saveElapsed(elapsed, previousDate).then((saved) => {
          if (!saved || todayWorkDateRef.current !== previousDate) return
          todayWorkDateRef.current = currentDate
          todayBaseRef.current = 0
          todaySessionStartElapsedRef.current = elapsed
          setElapsedMs(0)
          onTodayWorkTimeChange(currentDate, 0)
        })
        return
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
  }, [elapsedNow, onTodayWorkTimeChange, running, saveElapsed, todayElapsedNow])

  async function toggle() {
    if (savingRef.current) return
    if (runningRef.current) {
      try { await pauseAndSave() } catch { /* The retry message remains visible while the timer stays paused. */ }
      return
    }
    if (elapsedBaseRef.current > lastSavedElapsedRef.current) {
      await saveElapsed(elapsedBaseRef.current)
      return
    }
    startTimer()
  }

  if (!portalTarget) return null
  return createPortal(<div className="viewer-work-timer" aria-label={t('작업 타이머')}>
    <button type="button" className="viewer-work-timer-toggle" aria-label={error ? t('저장 재시도') : running ? t('일시정지') : t('재생')} title={error ? t('저장 재시도') : running ? t('일시정지') : t('재생')} disabled={saving} onClick={() => void toggle()}>
      {running ? <Pause size={17} /> : <Play size={17} />}
    </button>
    <span className="viewer-work-timer-elapsed" role="timer" aria-label={t('오늘 누적 작업시간')} title={t('오늘 누적 작업시간')} aria-live="off">{formatWorkTime(elapsedMs)}</span>
  </div>, portalTarget)
}
