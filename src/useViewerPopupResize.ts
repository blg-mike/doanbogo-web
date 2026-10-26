import { useCallback, useEffect, useLayoutEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { getViewerPopupResizeRect, getViewerPopupSizeClass, type ViewerPopupRect, type ViewerPopupResizeHandle } from './viewerPopupResize'

type ActiveResize = {
  pointerId: number
  handle: ViewerPopupResizeHandle
  target: HTMLButtonElement
  start: ViewerPopupRect
  bounds: ViewerPopupRect
  minHeight: number
  startX: number
  startY: number
  clientX: number
  clientY: number
  frameId: number | null
  onLostCapture: () => void
}

type ResizeOptions = {
  enabled: boolean
  elementRef: RefObject<HTMLElement | null>
  getBounds: () => ViewerPopupRect | null
  getMinHeight: () => number
  onStart: (rect: ViewerPopupRect) => void
  onApply: (rect: ViewerPopupRect) => void
  onCommit: (rect: ViewerPopupRect) => void
  onCancel: (rect: ViewerPopupRect) => void
}

export function useViewerPopupResize(options: ResizeOptions) {
  const optionsRef = useRef(options)
  const activeRef = useRef<ActiveResize | null>(null)
  const handlersRef = useRef({ move: (_event: PointerEvent) => {}, finish: (_event: PointerEvent) => {}, cancel: (_event?: Event) => {}, keydown: (_event: KeyboardEvent) => {} })

  const cleanup = useCallback((active: ActiveResize) => {
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
      try { active.target.releasePointerCapture(active.pointerId) } catch { /* Capture may already have been released by the browser. */ }
    }
  }, [cleanup])

  const applyPointer = useCallback((active: ActiveResize, clientX: number, clientY: number) => getViewerPopupResizeRect({
    handle: active.handle,
    start: active.start,
    deltaX: clientX - active.startX,
    deltaY: clientY - active.startY,
    bounds: active.bounds,
    minWidth: 260,
    minHeight: active.minHeight,
  }), [])

  const move = useCallback((event: PointerEvent) => {
    const active = activeRef.current
    if (!active || event.pointerId !== active.pointerId) return
    active.clientX = event.clientX
    active.clientY = event.clientY
    if (active.frameId !== null) return
    active.frameId = requestAnimationFrame(() => {
      active.frameId = null
      if (activeRef.current !== active) return
      const rect = applyPointer(active, active.clientX, active.clientY)
      if (rect) optionsRef.current.onApply(rect)
    })
  }, [applyPointer])

  const cancel = useCallback((event?: Event) => {
    const active = activeRef.current
    if (event instanceof PointerEvent && active && event.pointerId !== active.pointerId) return
    restore()
  }, [restore])

  const finish = useCallback((event: PointerEvent) => {
    const active = activeRef.current
    if (!active || event.pointerId !== active.pointerId) return
    active.clientX = event.clientX
    active.clientY = event.clientY
    if (active.frameId !== null) cancelAnimationFrame(active.frameId)
    active.frameId = null
    activeRef.current = null
    cleanup(active)
    const rect = applyPointer(active, active.clientX, active.clientY)
    if (rect) {
      optionsRef.current.onApply(rect)
      optionsRef.current.onCommit(rect)
    } else optionsRef.current.onCancel(active.start)
  }, [applyPointer, cleanup])

  const onKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !activeRef.current) return
    event.preventDefault()
    event.stopImmediatePropagation()
    restore()
  }, [restore])

  useLayoutEffect(() => {
    optionsRef.current = options
    handlersRef.current = { move, finish, cancel, keydown: onKeyDown }
  }, [cancel, finish, move, onKeyDown, options])

  const resize = useCallback((handle: ViewerPopupResizeHandle, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const active = activeRef.current
    if (active) return
    const currentOptions = optionsRef.current
    const element = currentOptions.elementRef.current
    const bounds = currentOptions.getBounds()
    if (!currentOptions.enabled || !element || !bounds || event.isPrimary === false || event.pointerType === 'mouse' && event.button !== 0) return
    const rect = element.getBoundingClientRect()
    const start = { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    const next: ActiveResize = {
      pointerId: event.pointerId,
      handle,
      target: event.currentTarget,
      start,
      bounds,
      minHeight: currentOptions.getMinHeight(),
      startX: event.clientX,
      startY: event.clientY,
      clientX: event.clientX,
      clientY: event.clientY,
      frameId: null,
      onLostCapture: () => cancel(),
    }
    activeRef.current = next
    currentOptions.onStart(start)
    next.target.addEventListener('lostpointercapture', next.onLostCapture)
    try { next.target.setPointerCapture(event.pointerId) } catch { /* Window listeners keep the gesture available without capture. */ }
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', finish, true)
    window.addEventListener('pointercancel', cancel, true)
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('resize', cancel, true)
    window.addEventListener('orientationchange', cancel, true)
    window.visualViewport?.addEventListener('resize', cancel)
  }, [cancel, finish, move, onKeyDown])

  const keyResize = useCallback((handle: ViewerPopupResizeHandle, event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
    const direction = directions[event.key]
    const currentOptions = optionsRef.current
    const element = currentOptions.elementRef.current
    const bounds = currentOptions.getBounds()
    if (!direction || !currentOptions.enabled || !element || !bounds) return
    event.preventDefault()
    event.stopPropagation()
    const current = element.getBoundingClientRect()
    const start = { left: current.left, top: current.top, width: current.width, height: current.height }
    const step = event.shiftKey ? 24 : 8
    const deltaX = direction[0] * step
    const deltaY = direction[1] * step
    const rect = getViewerPopupResizeRect({
      handle,
      start,
      deltaX,
      deltaY,
      bounds,
      minWidth: 260,
      minHeight: currentOptions.getMinHeight(),
    })
    if (!rect) return
    currentOptions.onStart(start)
    currentOptions.onApply(rect)
    currentOptions.onCommit(rect)
  }, [])

  useEffect(() => {
    if (!options.enabled) restore()
    const element = options.elementRef.current
    if (!element || !options.enabled) return () => restore()
    const setSizeClass = () => { element.setAttribute('data-popup-size', getViewerPopupSizeClass(element.getBoundingClientRect().width)) }
    const observer = new ResizeObserver(setSizeClass)
    observer.observe(element)
    setSizeClass()
    return () => {
      observer.disconnect()
      restore()
    }
  }, [options.enabled, options.elementRef, restore])

  return useCallback((handle: ViewerPopupResizeHandle) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => resize(handle, event),
    onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => keyResize(handle, event),
  }), [keyResize, resize])
}
