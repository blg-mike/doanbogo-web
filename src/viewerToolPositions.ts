import type { ViewerPopupRect } from './viewerPopupResize'

type ViewerTool = 'counterPanel' | 'timerBar'
type PositionStore = Pick<Storage, 'getItem' | 'setItem'>
type SavedPositions = Partial<Record<ViewerTool, ViewerToolPosition>>
export type ViewerToolPosition = { leftRatio: number; topRatio: number }

const key = 'knitpeek:viewer-tool-positions:v1'

function getStorage(storage?: PositionStore) {
  try {
    return storage ?? window.localStorage
  } catch {
    return null
  }
}

function isPosition(value: unknown): value is ViewerToolPosition {
  if (!value || typeof value !== 'object') return false
  const position = value as Partial<ViewerToolPosition>
  return Number.isFinite(position.leftRatio) && Number.isFinite(position.topRatio)
    && (position.leftRatio ?? -1) >= 0 && (position.leftRatio ?? 2) <= 1
    && (position.topRatio ?? -1) >= 0 && (position.topRatio ?? 2) <= 1
}

function parse(raw: string | null): SavedPositions {
  if (!raw) return {}
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || (value as { version?: unknown }).version !== 1) return {}
    const saved = value as Record<string, unknown>
    return {
      ...(isPosition(saved.counterPanel) ? { counterPanel: saved.counterPanel } : {}),
      ...(isPosition(saved.timerBar) ? { timerBar: saved.timerBar } : {}),
    }
  } catch {
    return {}
  }
}

export function readViewerToolPosition(tool: ViewerTool, storage?: PositionStore): ViewerToolPosition | null {
  const store = getStorage(storage)
  if (!store) return null
  try {
    return parse(store.getItem(key))[tool] ?? null
  } catch {
    return null
  }
}

export function getViewerToolPosition(bounds: ViewerPopupRect, size: Pick<ViewerPopupRect, 'width' | 'height'>, position: ViewerToolPosition) {
  const values = [bounds.left, bounds.top, bounds.width, bounds.height, size.width, size.height, position.leftRatio, position.topRatio]
  if (!values.every(Number.isFinite) || bounds.width <= 0 || bounds.height <= 0 || size.width <= 0 || size.height <= 0) return null
  const maxLeft = Math.max(bounds.left, bounds.left + bounds.width - size.width)
  const maxTop = Math.max(bounds.top, bounds.top + bounds.height - size.height)
  return {
    left: bounds.left + (maxLeft - bounds.left) * position.leftRatio,
    top: bounds.top + (maxTop - bounds.top) * position.topRatio,
  }
}

export function createViewerToolPosition(bounds: ViewerPopupRect, rect: ViewerPopupRect): ViewerToolPosition | null {
  const values = [bounds.left, bounds.top, bounds.width, bounds.height, rect.left, rect.top, rect.width, rect.height]
  if (!values.every(Number.isFinite) || bounds.width <= 0 || bounds.height <= 0 || rect.width <= 0 || rect.height <= 0) return null
  const maxLeft = Math.max(bounds.left, bounds.left + bounds.width - rect.width)
  const maxTop = Math.max(bounds.top, bounds.top + bounds.height - rect.height)
  return {
    leftRatio: maxLeft === bounds.left ? 0 : Math.max(0, Math.min(1, (rect.left - bounds.left) / (maxLeft - bounds.left))),
    topRatio: maxTop === bounds.top ? 0 : Math.max(0, Math.min(1, (rect.top - bounds.top) / (maxTop - bounds.top))),
  }
}

export function saveViewerToolPosition(tool: ViewerTool, position: ViewerToolPosition, storage?: PositionStore) {
  const store = getStorage(storage)
  if (!store || !isPosition(position)) return false
  try {
    store.setItem(key, JSON.stringify({ version: 1, ...parse(store.getItem(key)), [tool]: position }))
    return true
  } catch {
    return false
  }
}
