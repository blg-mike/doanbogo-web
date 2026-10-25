import { normalizeCounterSnapshots } from './smartCounter'
import type { CounterHistoryEntry, ViewerSnapshot } from './types'

export function normalizeViewerCounterState(viewer: ViewerSnapshot): ViewerSnapshot {
  const previousBases = Array.isArray(viewer.counters) ? viewer.counters.filter((counter) => counter?.kind === 'simple' && counter.unit !== 'stitch' && counter.unit !== 'round' && !counter.linkedToId) : []
  const counterMainId = previousBases.find((counter) => counter.id === viewer.counterMainId)?.id ?? previousBases[0]?.id ?? viewer.counterMainId
  const cleaned: ViewerSnapshot & { counterTimeLaps?: unknown } = { ...viewer, counters: normalizeCounterSnapshots(viewer.counters), ...(counterMainId ? { counterMainId } : {}) }
  delete cleaned.counterTimeLaps
  cleaned.counterHistory = (viewer.counterHistory ?? []).map((item) => {
    const entry: CounterHistoryEntry & { timeLapId?: unknown } = { ...item, counters: normalizeCounterSnapshots(item.counters) }
    delete entry.timeLapId
    return entry
  })
  return cleaned
}
