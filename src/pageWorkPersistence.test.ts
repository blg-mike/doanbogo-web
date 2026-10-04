import { describe, expect, it, vi } from 'vitest'
import type { PageWorkRecord } from './types'
import { PageWorkPersistence } from './pageWorkPersistence'

function work(documentId: string, pageNumber: number, horizontalPosition: number): PageWorkRecord {
  return { documentId, pageNumber, horizontalPosition, verticalPosition: 0.5, annotations: [] }
}

describe('page work persistence', () => {
  it('debounces each dirty page and persists only its latest record', async () => {
    vi.useFakeTimers()
    const save = vi.fn(async (_work: PageWorkRecord) => {})
    const persistence = new PageWorkPersistence(save, 300)

    persistence.schedule(work('doc', 2, 0.2))
    persistence.schedule(work('doc', 2, 0.4))
    persistence.schedule(work('doc', 8, 0.8))
    expect(save).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(300)

    expect(save.mock.calls.map(([record]) => [record.pageNumber, record.horizontalPosition])).toEqual([[2, 0.4], [8, 0.8]])
    persistence.dispose()
    vi.useRealTimers()
  })

  it('serializes same-page writes so an older save cannot finish after a newer one', async () => {
    let releaseFirst!: () => void
    const firstSave = new Promise<void>((resolve) => { releaseFirst = resolve })
    const saved: number[] = []
    const save = vi.fn(async (record: PageWorkRecord) => {
      saved.push(record.horizontalPosition)
      if (record.horizontalPosition === 0.2) await firstSave
    })
    const persistence = new PageWorkPersistence(save)

    const oldWrite = persistence.schedule(work('doc', 3, 0.2), true)
    await Promise.resolve()
    await Promise.resolve()
    const newWrite = persistence.schedule(work('doc', 3, 0.7), true)
    expect(saved).toEqual([0.2])

    releaseFirst()
    await Promise.all([oldWrite, newWrite])
    expect(saved).toEqual([0.2, 0.7])
    persistence.dispose()
  })

  it('flushes only dirty pages, including pending debounced edits', async () => {
    vi.useFakeTimers()
    const save = vi.fn(async (_work: PageWorkRecord) => {})
    const persistence = new PageWorkPersistence(save, 300)

    persistence.schedule(work('doc', 5, 0.25))
    await persistence.flushAll()

    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0][0]).toMatchObject({ pageNumber: 5, horizontalPosition: 0.25 })
    persistence.dispose()
    vi.useRealTimers()
  })

  it('reports a failed debounced save and retries the dirty record on a later flush', async () => {
    vi.useFakeTimers()
    const error = new Error('temporary storage failure')
    const save = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue(undefined)
    const onError = vi.fn()
    const persistence = new PageWorkPersistence(save, 300, onError)
    const latest = work('doc', 6, 0.65)

    await persistence.schedule(latest)
    await vi.advanceTimersByTimeAsync(300)
    expect(onError).toHaveBeenCalledWith(error)

    await persistence.flushAll()

    expect(save).toHaveBeenCalledTimes(2)
    expect(save.mock.calls.map(([record]) => record)).toEqual([latest, latest])
    persistence.dispose()
    vi.useRealTimers()
  })

  it('does not restore an older failed record over a newer in-flight save', async () => {
    let rejectFirst!: (error: Error) => void
    const firstSave = new Promise<void>((_resolve, reject) => { rejectFirst = reject })
    const saved: number[] = []
    const save = vi.fn(async (record: PageWorkRecord) => {
      saved.push(record.horizontalPosition)
      if (record.horizontalPosition === 0.2) await firstSave
    })
    const persistence = new PageWorkPersistence(save)

    const oldWrite = persistence.schedule(work('doc', 3, 0.2), true)
    await Promise.resolve()
    await Promise.resolve()
    const newWrite = persistence.schedule(work('doc', 3, 0.7), true)
    rejectFirst(new Error('old save failed'))

    await expect(oldWrite).rejects.toThrow('old save failed')
    await newWrite
    await persistence.flushAll()

    expect(saved).toEqual([0.2, 0.7])
    persistence.dispose()
  })

  it('retries a failed save for the previous document without replacing the current document page', async () => {
    let releaseFirst!: (error: Error) => void
    let markStarted!: () => void
    const firstSave = new Promise<void>((_resolve, reject) => { releaseFirst = reject })
    const started = new Promise<void>((resolve) => { markStarted = resolve })
    const saved: Array<[string, number, number]> = []
    const save = vi.fn(async (record: PageWorkRecord) => {
      saved.push([record.documentId, record.pageNumber, record.horizontalPosition])
      if (record.documentId === 'doc-a' && record.horizontalPosition === 0.2) {
        markStarted()
        await firstSave
      }
    })
    const persistence = new PageWorkPersistence(save)

    const failedWrite = persistence.schedule(work('doc-a', 1, 0.2), true)
    await started
    persistence.schedule(work('doc-a', 1, 0.4))
    persistence.schedule(work('doc-b', 1, 0.8))
    releaseFirst(new Error('document A save failed'))
    await expect(failedWrite).rejects.toThrow('document A save failed')

    await persistence.flushAll()

    expect(saved).toEqual([
      ['doc-a', 1, 0.2],
      ['doc-a', 1, 0.4],
      ['doc-b', 1, 0.8],
    ])
    persistence.dispose()
  })
})
