import { useCallback, useEffect, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { getViewerPopupDragRect, type ViewerPopupRect } from './viewerPopupResize'

type ActiveDrag = {
  pointerId: number
  target: HTMLButtonElement
  start: ViewerPopupRect
  bounds: ViewerPopupRect
  startX: number
  startY: number
  clientX: number
  clientY: number
  frameId: number | null
  onLostCapture: () => void
}

type DragOptions = {
  enabled: boolean
  elementRef: RefObject<HTMLElement | null>
  getBounds: () => ViewerPopupRect | null
  onStart: (rect: ViewerPopupRect) => void
  onApply: (rect: ViewerPopupRect) => void
  onCommit: (rect: ViewerPopupRect, bounds: ViewerPopupRect) => void
  onCancel: (rect: ViewerPopupRect) => void
}

export function useViewerPopupDrag(options: DragOptions) {
  const optionsRef = useRef(options)
  const activeRef = useRef<ActiveDrag | null>(null)
  const handlersRef = useRef({ move: (_event: PointerEvent) => {}, finish: (_event: PointerEvent) => {}, cancel: () => {}, keydown: (_event: KeyboardEvent) => {} })

  const cleanup = useCallback((active: ActiveDrag) => {
    window.removeEventListener('pointermove', handlersRef.current.move, true)
    window.removeEventListener('pointerup', handlersRef.current.finish, true)
    window.removeEventListener('pointercancel', handlersRef.current.cancel, true)
    window.removeEventListener('keydown', handlersRef.current.keydown, true)
    window.removeEventListener('resize', handlersRef.current.cancel, true)
    window.removeEventListener('orientationchange', handlersRef.current.cancel, true)
    window.visualViewport?.removeEventListener('resize', handlersRef.current.cancel)
    active.target.removeEventListener('lostpointercapture', active.onLostCapture)
    if (active.frameId !== null) cancelAnimationFrame(active.frameId)
    active.frameId = null
  }, [])

  const restore = useCallback(() => {
    const active = activeRef.current
    if (!active) return
    activeRef.current = null
    cleanup(active)
    optionsRef.current.onCancel(active.start)
    if (active.target.hasPointerCapture(active.pointerId)) {
      try { active.target.releasePointerCapture(active.pointerId) } catch { /* Capture may already have been released. */ }
    }
  }, [cleanup])

  const move = useCallback((event: PointerEvent) => {
    const active = activeRef.current
    if (!active || event.pointerId !== active.pointerId) return
    active.clientX = event.clientX
    active.clientY = event.clientY
    if (active.frameId !== null) return
    active.frameId = requestAnimationFrame(() => {
      active.frameId = null
      if (activeRef.current !== active) return
      const rect = getViewerPopupDragRect(active.start, active.bounds, active.clientX - active.startX, active.clientY - active.startY)
      if (rect) optionsRef.current.onApply(rect)
    })
  }, [])

  const finish = useCallback((event: PointerEvent) => {
    const active = activeRef.current
    if (!active || event.pointerId !== active.pointerId) return
    active.clientX = event.clientX
    active.clientY = event.clientY
    if (active.frameId !== null) cancelAnimationFrame(active.frameId)
    active.frameId = null
    activeRef.current = null
    cleanup(active)
    const rect = getViewerPopupDragRect(active.start, active.bounds, active.clientX - active.startX, active.clientY - active.startY)
    if (rect) {
      optionsRef.current.onApply(rect)
      optionsRef.current.onCommit(rect, active.bounds)
    } else optionsRef.current.onCancel(active.start)
  }, [cleanup])

  const cancel = useCallback(() => restore(), [restore])
  const keydown = useCallback((event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !activeRef.current) return
    event.preventDefault()
    event.stopImmediatePropagation()
    restore()
  }, [restore])

  useLayoutEffect(() => {
    optionsRef.current = options
    handlersRef.current = { move, finish, cancel, keydown }
  }, [cancel, finish, keydown, move, options])

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = optionsRef.current
    const element = current.elementRef.current
    const bounds = current.getBounds()
    if (!current.enabled || !element || !bounds || event.pointerType === 'mouse' || event.isPrimary === false) return
    event.preventDefault()
    event.stopPropagation()
    const box = element.getBoundingClientRect()
    const start = { left: box.left, top: box.top, width: box.width, height: box.height }
    const active: ActiveDrag = {
      pointerId: event.pointerId,
      target: event.currentTarget,
      start,
      bounds,
      startX: event.clientX,
      startY: event.clientY,
      clientX: event.clientX,
      clientY: event.clientY,
      frameId: null,
      onLostCapture: () => restore(),
    }
    activeRef.current = active
    current.onStart(start)
    active.target.addEventListener('lostpointercapture', active.onLostCapture)
    try { active.target.setPointerCapture(event.pointerId) } catch { /* Window listeners keep touch input available. */ }
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', finish, true)
    window.addEventListener('pointercancel', cancel, true)
    window.addEventListener('keydown', keydown, true)
    window.addEventListener('resize', cancel, true)
    window.addEventListener('orientationchange', cancel, true)
    window.visualViewport?.addEventListener('resize', cancel)
  }, [cancel, finish, keydown, move, restore])

  useEffect(() => {
    if (!options.enabled) restore()
    return () => restore()
  }, [options.enabled, restore])

  return { onPointerDown, cancel }
}
