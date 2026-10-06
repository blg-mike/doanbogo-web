export type WheelInput = {
  deltaX: number
  deltaY: number
  deltaMode: number
  ctrlKey: boolean
}

export type ZoomFocus = { x: number; y: number; clientX: number; clientY: number; zoom: number }

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

export function classifyWheelInput({ deltaX, deltaY, deltaMode, ctrlKey }: WheelInput) {
  if (ctrlKey) return 'zoom'
  if (deltaY === 0) return 'pan'
  if (deltaX !== 0) return 'pan'
  if (deltaMode === 1 || deltaMode === 2) return 'zoom'
  return Number.isInteger(deltaY) && Math.abs(deltaY) >= 50 ? 'zoom' : 'pan'
}

export function wheelActionForBurst(action: 'pan' | 'zoom', now: number, burstUntil: number) {
  const inBurst = now < burstUntil
  return {
    action: action === 'zoom' && inBurst ? 'pan' as const : action,
    burstUntil: action === 'pan' || inBurst ? now + 200 : burstUntil,
  }
}

export function wheelZoom(zoom: number, input: WheelInput) {
  if (input.ctrlKey) return Math.min(5, Math.max(1, zoom * Math.exp(-(input.deltaY || input.deltaX) * 0.002)))
  const steps = Math.max(1, Math.min(3, input.deltaMode === 0 ? Math.round(Math.abs(input.deltaY) / 100) : Math.ceil(Math.abs(input.deltaY) / (input.deltaMode === 1 ? 3 : 1))))
  return Math.min(5, Math.max(1, zoom * Math.pow(1.1, (input.deltaY < 0 ? 1 : -1) * steps)))
}

export function anchoredScrollOffset(pageOffset: number, pageSize: number, pagePosition: number, pointerOffset: number, scrollSize: number, viewportSize: number) {
  const maximum = Math.max(0, scrollSize - viewportSize)
  return clamp(pageOffset + pageSize * pagePosition - pointerOffset, 0, maximum)
}

export function pagePositionAtClientPoint(rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>, pageWidth: number, pageHeight: number, rotation: number, scale: number, clientX: number, clientY: number) {
  const radians = rotation * Math.PI / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  const dx = clientX - (rect.left + rect.width / 2)
  const dy = clientY - (rect.top + rect.height / 2)
  const localX = (cosine * dx + sine * dy) / Math.max(scale, 0.0001)
  const localY = (-sine * dx + cosine * dy) / Math.max(scale, 0.0001)
  return {
    x: clamp(0.5 + localX / Math.max(pageWidth, 1), 0, 1),
    y: clamp(0.5 + localY / Math.max(pageHeight, 1), 0, 1),
  }
}

export function clientPointForPagePosition(rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>, pageWidth: number, pageHeight: number, rotation: number, scale: number, x: number, y: number) {
  const radians = rotation * Math.PI / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  const localX = (x - 0.5) * pageWidth * scale
  const localY = (y - 0.5) * pageHeight * scale
  return {
    x: rect.left + rect.width / 2 + cosine * localX - sine * localY,
    y: rect.top + rect.height / 2 + sine * localX + cosine * localY,
  }
}

export function scrollOffsetForZoomFocus(scrollOffset: number, pagePointClient: number, pointerClient: number, scrollSize: number, viewportSize: number) {
  const maximum = Math.max(0, scrollSize - viewportSize)
  return clamp(scrollOffset + pagePointClient - pointerClient, 0, maximum)
}

export function isEditableTarget(target: EventTarget | null) {
  const element = target as (Element & { isContentEditable?: boolean }) | null
  if (!element || typeof element.closest !== 'function') return false
  return Boolean(element.isContentEditable || element.closest('input, textarea, select, button, [contenteditable="true"], [role="dialog"], [role="toolbar"]'))
}
