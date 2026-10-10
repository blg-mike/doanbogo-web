import { Pause, Play } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { t } from './locales'
import { addDocumentWorkTime } from './storage'
import { formatWorkTime } from './workTime'

type Props = {
  documentId: string
  portalTarget: HTMLElement | null
  onTotalWorkTimeChange: (total: number) => void
  onUnsavedChange: (unsaved: boolean) => void
  onSavingChange: (saving: boolean) => void
}

export default function DocumentWorkTimer({ documentId, portalTarget, onTotalWorkTimeChange, onUnsavedChange, onSavingChange }: Props) {
  const elapsedBaseRef = useRef(0)
  const lastSavedElapsedRef = useRef(0)
  const startedAtRef = useRef<number | null>(null)
  const runningRef = useRef(false)
  const savingRef = useRef(false)
  const activeRef = useRef(true)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [running, setRunning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)

  const elapsedNow = useCallback(() => startedAtRef.current === null
    ? elapsedBaseRef.current
    : elapsedBaseRef.current + Math.max(0, Date.now() - startedAtRef.current), [])

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

  async function saveElapsed(elapsed: number) {
    const delta = Math.max(0, elapsed - lastSavedElapsedRef.current)
    if (delta === 0) {
      onUnsavedChange(false)
      setError(false)
      return
    }
    savingRef.current = true
    setSaving(true)
    onSavingChange(true)
    setError(false)
    try {
      const total = await addDocumentWorkTime(documentId, delta)
      lastSavedElapsedRef.current = elapsed
      if (activeRef.current) {
        onTotalWorkTimeChange(total)
        onUnsavedChange(false)
      }
    } catch {
      if (activeRef.current) {
        setError(true)
        onUnsavedChange(true)
      }
    } finally {
      savingRef.current = false
      if (activeRef.current) {
        setSaving(false)
        onSavingChange(false)
      }
    }
  }

  async function toggle() {
    if (savingRef.current) return
    if (runningRef.current) {
      const elapsed = elapsedNow()
      elapsedBaseRef.current = elapsed
      startedAtRef.current = null
      runningRef.current = false
      setElapsedMs(elapsed)
      setRunning(false)
      await saveElapsed(elapsed)
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
    <span className="viewer-work-timer-elapsed" role="timer" aria-live="off">{formatWorkTime(elapsedMs)}</span>
    <button type="button" className="viewer-work-timer-toggle" aria-label={error ? t('저장 재시도') : running ? t('일시정지') : t('재생')} title={error ? t('저장 재시도') : running ? t('일시정지') : t('재생')} disabled={saving} onClick={() => void toggle()}>
      {running ? <Pause size={17} /> : <Play size={17} />}
    </button>
  </div>, portalTarget)
}
