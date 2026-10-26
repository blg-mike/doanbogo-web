export type ViewerPopupRect = { left: number; top: number; width: number; height: number }
export type ViewerPopupResizeHandle = 'bottom-left' | 'bottom-right'
export type ViewerPopupSize = { width: number; height: number }

export function getViewerPopupAvailableBounds({ shell, viewport, safeArea, inset = 8 }: {
  shell: ViewerPopupRect
  viewport: ViewerPopupRect
  safeArea: { top: number; right: number; bottom: number; left: number }
  inset?: number
}): ViewerPopupRect | null {
  const values = [shell.left, shell.top, shell.width, shell.height, viewport.left, viewport.top, viewport.width, viewport.height, safeArea.top, safeArea.right, safeArea.bottom, safeArea.left, inset]
  if (!values.every(Number.isFinite) || shell.width <= 0 || shell.height <= 0 || viewport.width <= 0 || viewport.height <= 0 || inset < 0) return null
  const left = Math.max(shell.left, viewport.left + safeArea.left) + inset
  const top = Math.max(shell.top, viewport.top + safeArea.top) + inset
  const right = Math.min(shell.left + shell.width, viewport.left + viewport.width - safeArea.right) - inset
  const bottom = Math.min(shell.top + shell.height, viewport.top + viewport.height - safeArea.bottom) - inset
  return right > left && bottom > top ? { left, top, width: right - left, height: bottom - top } : null
}

export function readViewerPopupAvailableBounds(shell: HTMLElement): ViewerPopupRect | null {
  const shellRect = shell.getBoundingClientRect()
  const visualViewport = window.visualViewport
  const viewport = {
    left: visualViewport?.offsetLeft ?? 0,
    top: visualViewport?.offsetTop ?? 0,
    width: visualViewport?.width ?? window.innerWidth,
    height: visualViewport?.height ?? window.innerHeight,
  }
  const style = getComputedStyle(shell)
  const inset = (name: string) => Number.parseFloat(style.getPropertyValue(name)) || 0
  return getViewerPopupAvailableBounds({
    shell: { left: shellRect.left, top: shellRect.top, width: shellRect.width, height: shellRect.height },
    viewport,
    safeArea: {
      top: inset('--viewer-popup-safe-inset-top'),
      right: inset('--viewer-popup-safe-inset-right'),
      bottom: inset('--viewer-popup-safe-inset-bottom'),
      left: inset('--viewer-popup-safe-inset-left'),
    },
  })
}

export function getViewerPopupSize(size: ViewerPopupSize, bounds: ViewerPopupRect, minHeight: number, minWidth = 260): ViewerPopupSize | null {
  if (![size.width, size.height, bounds.width, bounds.height, minWidth, minHeight].every(Number.isFinite) || bounds.width <= 0 || bounds.height <= 0 || minWidth <= 0 || minHeight <= 0) return null
  return {
    width: Math.max(Math.min(minWidth, bounds.width), Math.min(bounds.width, size.width)),
    height: Math.max(Math.min(minHeight, bounds.height), Math.min(bounds.height, size.height)),
  }
}

export function getDefaultViewerPopupSize(tool: 'counterPanel' | 'timerBar', bounds: ViewerPopupRect, minHeight: number): ViewerPopupSize | null {
  const isCounter = tool === 'counterPanel'
  return getViewerPopupSize({
    width: isCounter ? 360 : 400,
    height: Math.round(Math.min(isCounter ? 560 : 360, bounds.height * (isCounter ? 0.75 : 0.55))),
  }, bounds, minHeight)
}

export function getViewerPopupSizeClass(width: number): 'small' | 'medium' | 'large' {
  return width < 340 ? 'small' : width < 480 ? 'medium' : 'large'
}

export function getViewerPopupResizeRect({
  handle, start, deltaX, deltaY, bounds, minWidth, minHeight,
}: {
  handle: ViewerPopupResizeHandle
  start: ViewerPopupRect
  deltaX: number
  deltaY: number
  bounds: ViewerPopupRect
  minWidth: number
  minHeight: number
}): ViewerPopupRect | null {
  const values = [start.left, start.top, start.width, start.height, deltaX, deltaY, bounds.left, bounds.top, bounds.width, bounds.height, minWidth, minHeight]
  if (!values.every(Number.isFinite) || start.width <= 0 || start.height <= 0 || bounds.width <= 0 || bounds.height <= 0 || minWidth <= 0 || minHeight <= 0) return null

  const minW = Math.min(minWidth, bounds.width)
  const minH = Math.min(minHeight, bounds.height)
  const right = bounds.left + bounds.width
  const bottom = bounds.top + bounds.height
  const top = Math.max(bounds.top, Math.min(bottom - minH, start.top))
  const height = Math.max(minH, Math.min(bottom - top, start.height + deltaY))

  if (handle === 'bottom-right') {
    const left = Math.max(bounds.left, Math.min(right - minW, start.left))
    return { left, top, width: Math.max(minW, Math.min(right - left, start.width + deltaX)), height }
  }

  const fixedRight = Math.max(bounds.left + minW, Math.min(right, start.left + start.width))
  const width = Math.max(minW, Math.min(fixedRight - bounds.left, start.width - deltaX))
  return { left: fixedRight - width, top, width, height }
}
