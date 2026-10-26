type ViewerTool = 'counterPanel' | 'timerBar'
export type ViewerToolSize = { width: number; height: number }
type SizeStore = Pick<Storage, 'getItem' | 'setItem'>
type SavedSizes = Partial<Record<ViewerTool, ViewerToolSize>>

const key = 'knitpeek:viewer-tool-sizes:v1'
const maxSize = 4096

function getStorage(storage?: SizeStore) {
  try {
    return storage ?? window.localStorage
  } catch {
    return null
  }
}

function isSize(value: unknown): value is ViewerToolSize {
  if (!value || typeof value !== 'object') return false
  const size = value as Partial<ViewerToolSize>
  return Number.isFinite(size.width) && Number.isFinite(size.height)
    && (size.width ?? 0) >= 260 && (size.width ?? maxSize + 1) <= maxSize
    && (size.height ?? 0) > 0 && (size.height ?? maxSize + 1) <= maxSize
}

function parse(raw: string | null): SavedSizes {
  if (!raw) return {}
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || (value as { version?: unknown }).version !== 1) return {}
    const saved = value as Record<string, unknown>
    return {
      ...(isSize(saved.counterPanel) ? { counterPanel: saved.counterPanel } : {}),
      ...(isSize(saved.timerBar) ? { timerBar: saved.timerBar } : {}),
    }
  } catch {
    return {}
  }
}

export function readViewerToolSize(tool: ViewerTool, storage?: SizeStore): ViewerToolSize | null {
  const store = getStorage(storage)
  if (!store) return null
  try {
    return parse(store.getItem(key))[tool] ?? null
  } catch {
    return null
  }
}

export function saveViewerToolSize(tool: ViewerTool, size: ViewerToolSize, storage?: SizeStore) {
  const store = getStorage(storage)
  if (!store || !isSize(size)) return false
  try {
    store.setItem(key, JSON.stringify({ version: 1, ...parse(store.getItem(key)), [tool]: size }))
    return true
  } catch {
    return false
  }
}
