import { useEffect, useRef, type ReactNode } from 'react'

const HOLD_DELAY_MS = 450
const HOLD_INTERVAL_MS = 220

export function CounterStepButton({ children, label, title, disabled, className, onStep }: {
  children: ReactNode
  label: string
  title?: string
  disabled: boolean
  className: string
  onStep: () => void
}) {
  const pointerIdRef = useRef<number | null>(null)
  const holdTimerRef = useRef<number | undefined>(undefined)
  const repeatTimerRef = useRef<number | undefined>(undefined)
  const clearClickTimerRef = useRef<number | undefined>(undefined)
  const heldRef = useRef(false)

  function clearTimers() {
    window.clearTimeout(holdTimerRef.current)
    window.clearInterval(repeatTimerRef.current)
    holdTimerRef.current = undefined
    repeatTimerRef.current = undefined
  }

  useEffect(() => () => {
    window.clearTimeout(holdTimerRef.current)
    window.clearInterval(repeatTimerRef.current)
    window.clearTimeout(clearClickTimerRef.current)
  }, [])

  return <button type="button" className={className} aria-label={label} title={title ?? label} disabled={disabled}
    onPointerDown={(event) => {
      if (disabled || event.pointerType === 'mouse' && event.button !== 0) return
      clearTimers()
      window.clearTimeout(clearClickTimerRef.current)
      pointerIdRef.current = event.pointerId
      heldRef.current = false
      event.currentTarget.setPointerCapture(event.pointerId)
      holdTimerRef.current = window.setTimeout(() => {
        if (pointerIdRef.current !== event.pointerId) return
        heldRef.current = true
        onStep()
        repeatTimerRef.current = window.setInterval(onStep, HOLD_INTERVAL_MS)
      }, HOLD_DELAY_MS)
    }}
    onPointerUp={(event) => {
      if (pointerIdRef.current !== event.pointerId) return
      pointerIdRef.current = null
      clearTimers()
      if (heldRef.current) clearClickTimerRef.current = window.setTimeout(() => { heldRef.current = false }, 600)
    }}
    onPointerCancel={(event) => {
      if (pointerIdRef.current !== event.pointerId) return
      pointerIdRef.current = null
      heldRef.current = false
      clearTimers()
    }}
    onClick={(event) => {
      if (heldRef.current) {
        event.preventDefault()
        heldRef.current = false
        window.clearTimeout(clearClickTimerRef.current)
        return
      }
      onStep()
    }}
    onContextMenu={(event) => event.preventDefault()}>{children}</button>
}
