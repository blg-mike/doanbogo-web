import type { ColorworkCell } from './types'

export type ColorworkCellChange = { index: number; before: ColorworkCell | null; after: ColorworkCell | null }

export function applyColorworkCellChanges(cells: readonly (ColorworkCell | null)[], changes: readonly ColorworkCellChange[], direction: 'undo' | 'redo') {
  const next = [...cells]
  for (const change of changes) next[change.index] = direction === 'undo' ? change.before : change.after
  return next
}
