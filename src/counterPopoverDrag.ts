export const COUNTER_POPOVER_LONG_PRESS_MS = 450
export const COUNTER_POPOVER_DRAG_SLOP_PX = 8

export function canStartCounterPopoverDrag(pointerType: string, heldMs: number) {
  return pointerType === 'mouse' || heldMs >= COUNTER_POPOVER_LONG_PRESS_MS
}

export function shouldCancelCounterPopoverLongPress(deltaX: number, deltaY: number) {
  return Math.hypot(deltaX, deltaY) > COUNTER_POPOVER_DRAG_SLOP_PX
}

export function getCounterPopoverDragPosition({
  left, top, deltaX, deltaY, panelWidth, panelHeight, boundsWidth, boundsHeight,
}: {
  left: number
  top: number
  deltaX: number
  deltaY: number
  panelWidth: number
  panelHeight: number
  boundsWidth: number
  boundsHeight: number
}) {
  const inset = 8
  const maxLeft = Math.max(inset, boundsWidth - panelWidth - inset)
  const maxTop = Math.max(inset, boundsHeight - panelHeight - inset)
  return {
    left: Math.max(inset, Math.min(maxLeft, left + deltaX)),
    top: Math.max(inset, Math.min(maxTop, top + deltaY)),
  }
}
