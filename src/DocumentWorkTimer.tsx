import { Pause, Play } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { t } from './locales'
import { addDocumentWorkTime } from './storage'
import { formatWorkTime } from './workTime'

export type DocumentTimerClock = { sessionId: string; elapsedNow: () => number; pauseAndSave: () => Promise<void> }

type Props = {
  documentId: string
  portalTarget: HTMLElement | null
  onTotalWorkTimeChange: (total: number) => void
  onUnsavedChange: (unsaved: boolean) => void
  onSavingChange: (saving: boolean) => void
  onClockChange: (clock: DocumentTimerClock | null) => void
}

export default function DocumentWorkTimer({ documentId, portalTarget, onTotalWorkTimeChange, onUnsavedChange, onSavingChange, onClockChange }: Props) {
  const [sessionId] = useState(() => crypto.randomUUID())
  const elapsedBaseRef = useRef(0)
  const lastSavedElapsedRef = useRef(0)
  const startedAtRef = useRef<number | null>(null)
  const runningRef = useRef(false)
  const savingRef = useRef(false)
  const savePromiseRef = useRef<Promise<boolean> | null>(null)
  const activeRef = useRef(true)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [running, setRunning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)

  const elapsedNow = useCallback(() => startedAtRef.current === null
    ? elapsedBaseRef.current
    : elapsedBaseRef.current + Math.max(0, Date.now() - startedAtRef.current), [])

  const saveElapsed = useCallback(async function saveElapsedInternal(elapsed: number): Promise<boolean> {
    const pending = savePromiseRef.current
    if (pending) {
      if (!await pending) return false
      return saveElapsedInternal(elapsed)
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
        const total = await addDocumentWorkTime(documentId, delta)
        lastSavedElapsedRef.current = elapsed
        if (activeRef.current) {
          onTotalWorkTimeChange(total)
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
  }, [documentId, onSavingChange, onTotalWorkTimeChange, onUnsavedChange])

  const pauseAndSave = useCallback(async () => {
    const elapsed = elapsedNow()
    if (runningRef.current) {
      elapsedBaseRef.current = elapsed
      startedAtRef.current = null
      runningRef.current = false
      setElapsedMs(elapsed)
      setRunning(false)
    }
    if (!await saveElapsed(elapsed)) throw new Error('작업시간을 저장하지 못했습니다.')
  }, [elapsedNow, saveElapsed])

  useEffect(() => {
    onClockChange({ sessionId, elapsedNow, pauseAndSave })
    return () => onClockChange(null)
  }, [elapsedNow, onClockChange, pauseAndSave, sessionId])

  useEffect(() => {
    activeRef.current = true
    return () => { activeRef.current = false }
  }, [])

  useEffect(() => { onSavingChange(saving) }, [saving, onSavingChange])

  useEffect(() => {
    if (!running) return
    const update = () => setElapsedMs(elapsedNow())
    const interval = window.setInterval(update, 1000)
    document.addEventListener('visibilitychange', update)
    window.addEventListener('focus', update)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', update)
      window.removeEventListener('focus', update)
    }
  }, [elapsedNow, running])

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
    setError(false)
    startedAtRef.current = Date.now()
    runningRef.current = true
    setRunning(true)
    onUnsavedChange(true)
  }

  if (!portalTarget) return null
  return createPortal(<div className="viewer-work-timer" aria-label={t('작업 타이머')}>
    <button type="button" className="viewer-work-timer-toggle" aria-label={error ? t('저장 재시도') : running ? t('일시정지') : t('재생')} title={error ? t('저장 재시도') : running ? t('일시정지') : t('재생')} disabled={saving} onClick={() => void toggle()}>
      {running ? <Pause size={17} /> : <Play size={17} />}
    </button>
    <span className="viewer-work-timer-elapsed" role="timer" aria-live="off">{formatWorkTime(elapsedMs)}</span>
  </div>, portalTarget)
}
