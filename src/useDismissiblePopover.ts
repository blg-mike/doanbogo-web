import { useEffect, useRef } from 'react'

type PopoverElement = Element & { focus?: () => void }
type ElementRef = { readonly current: PopoverElement | null }
type IgnoreOutsidePointer = (target: Element, event: PointerEvent) => boolean

export function useDismissiblePopover(open: boolean, panelRef: ElementRef, triggerRef: ElementRef, onClose: () => void, restoreFocusOnOutside = false, ignoreOutsidePointer?: IgnoreOutsidePointer) {
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node) || panelRef.current?.contains(target) || triggerRef.current?.contains(target) || (target instanceof Element && ignoreOutsidePointer?.(target, event))) return
      onCloseRef.current()
      const focusableTarget = target instanceof Element && target.closest('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])')
      if (restoreFocusOnOutside && !focusableTarget) triggerRef.current?.focus?.()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onCloseRef.current()
      triggerRef.current?.focus?.()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [ignoreOutsidePointer, open, panelRef, restoreFocusOnOutside, triggerRef])
}
