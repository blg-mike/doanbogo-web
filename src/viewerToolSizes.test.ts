import { describe, expect, it } from 'vitest'
import { readViewerToolSize, saveViewerToolSize, type ViewerToolSize } from './viewerToolSizes'

function createStorage(initial?: string) {
  let value = initial ?? null
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => { value = next },
    value: () => value,
  }
}

const counterSize: ViewerToolSize = { width: 360, height: 420 }
const timerSize: ViewerToolSize = { width: 400, height: 300 }

describe('viewer tool size preferences', () => {
  it('round-trips both tool sizes in one versioned preference', () => {
    const storage = createStorage()
    expect(saveViewerToolSize('counterPanel', counterSize, storage)).toBe(true)
    expect(saveViewerToolSize('timerBar', timerSize, storage)).toBe(true)
    expect(readViewerToolSize('counterPanel', storage)).toEqual(counterSize)
    expect(readViewerToolSize('timerBar', storage)).toEqual(timerSize)
    expect(storage.value()).toContain('"version":1')
  })

  it.each([
    'invalid json',
    '{"version":2,"counterPanel":{"width":360,"height":420}}',
    '{"version":1,"counterPanel":{"width":null,"height":420}}',
    '{"version":1,"counterPanel":{"width":99999,"height":420}}',
    '{"version":1,"counterPanel":{"width":360,"height":0}}',
  ])('ignores malformed or out-of-range values: %s', (raw) => {
    expect(readViewerToolSize('counterPanel', createStorage(raw))).toBeNull()
  })

  it('preserves the other tool when saving one size and ignores its invalid value', () => {
    const storage = createStorage('{"version":1,"counterPanel":{"width":360,"height":420},"timerBar":{"width":0,"height":300}}')
    expect(saveViewerToolSize('timerBar', timerSize, storage)).toBe(true)
    expect(readViewerToolSize('counterPanel', storage)).toEqual(counterSize)
    expect(readViewerToolSize('timerBar', storage)).toEqual(timerSize)
  })

  it('does not throw when the storage is unavailable', () => {
    const storage = {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('denied') },
    }
    expect(readViewerToolSize('timerBar', storage)).toBeNull()
    expect(saveViewerToolSize('timerBar', timerSize, storage)).toBe(false)
  })
})
