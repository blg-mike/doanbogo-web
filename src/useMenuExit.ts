import { useCallback, useEffect, useRef, useState } from 'react'

const MENU_EXIT_MS = 150
const MENU_EXIT_FALLBACK_MS = MENU_EXIT_MS + 40

export function moveFocusFromClosingMenu(menu: HTMLElement | null, trigger: HTMLElement | null, outsideTarget?: EventTarget | null, restoreTrigger = false) {
  if (!menu?.contains(document.activeElement)) return
  if (restoreTrigger) {
    trigger?.focus()
    return
  }
  const target = outsideTarget instanceof Element ? outsideTarget.closest<HTMLElement>('button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"]), [contenteditable="true"]') : null
  target?.focus({ preventScroll: true })
  if (menu.contains(document.activeElement) && document.activeElement instanceof HTMLElement) document.activeElement.blur()
}

export function useMenuExit() {
  const [exitingKey, setExitingKey] = useState<string | null>(null)
  const exitingKeyRef = useRef<string | null>(null)
  const timerRef = useRef<number | undefined>(undefined)

  const clearTimer = useCallback(() => {
    if (timerRef.current === undefined) return
    window.clearTimeout(timerRef.current)
    timerRef.current = undefined
  }, [])

  const updateExitingKey = useCallback((key: string | null) => {
    exitingKeyRef.current = key
    setExitingKey(key)
  }, [])

  const finishExit = useCallback((key: string) => {
    if (exitingKeyRef.current !== key) return
    clearTimer()
    updateExitingKey(null)
  }, [clearTimer, updateExitingKey])

  const beginExit = useCallback((key: string) => {
    clearTimer()
    const reducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) {
      updateExitingKey(null)
      return false
    }
    updateExitingKey(key)
    timerRef.current = window.setTimeout(() => finishExit(key), MENU_EXIT_FALLBACK_MS)
    return true
  }, [clearTimer, finishExit, updateExitingKey])

  const cancelExit = useCallback(() => {
    clearTimer()
    updateExitingKey(null)
  }, [clearTimer, updateExitingKey])

  useEffect(() => () => clearTimer(), [clearTimer])
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onPreferenceChange = () => {
      if (preference.matches && exitingKeyRef.current) finishExit(exitingKeyRef.current)
    }
    preference.addEventListener('change', onPreferenceChange)
    return () => preference.removeEventListener('change', onPreferenceChange)
  }, [finishExit])

  return { exitingKey, beginExit, finishExit, cancelExit }
}
