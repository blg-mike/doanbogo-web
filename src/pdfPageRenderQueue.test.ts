import { describe, expect, it, vi } from 'vitest'
import { PdfPageRenderQueue } from './pdfPageRenderQueue'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

describe('PDF page render queue', () => {
  it('waits for a cancelled render to finish before starting another page', async () => {
    const queue = new PdfPageRenderQueue()
    const firstKey = {}
    const secondKey = {}
    const first = deferred()
    const calls: string[] = []

    const cancelFirst = queue.enqueue(firstKey, async () => {
      calls.push('first:start')
      await first.promise
      calls.push('first:end')
    }, vi.fn())
    queue.enqueue(secondKey, async () => { calls.push('second:start') }, vi.fn())
    await Promise.resolve()

    cancelFirst()
    expect(calls).toEqual(['first:start'])
    first.resolve()
    await vi.waitFor(() => expect(calls).toContain('second:start'))
    expect(calls).toEqual(['first:start', 'first:end', 'second:start'])
  })

  it('resolves the idle barrier only after the active render and queued work finish', async () => {
    const queue = new PdfPageRenderQueue()
    const active = deferred()
    const firstKey = {}
    const secondKey = {}
    const calls: string[] = []
    queue.enqueue(firstKey, async () => { await active.promise; calls.push('active') }, vi.fn())
    queue.enqueue(secondKey, async () => { calls.push('queued') }, vi.fn())
    let idle = false
    const idlePromise = queue.whenIdle().then(() => { idle = true })

    await Promise.resolve()
    expect(idle).toBe(false)
    active.resolve()
    await idlePromise

    expect(calls).toEqual(['active', 'queued'])
    expect(idle).toBe(true)
  })

  it('keeps only the newest queued render for each pane and prioritizes the active pane', async () => {
    const queue = new PdfPageRenderQueue()
    const active = deferred()
    const activeKey = {}
    const otherKey = {}
    const calls: string[] = []
    queue.enqueue(activeKey, async () => active.promise, vi.fn())
    queue.enqueue(otherKey, async () => { calls.push('other') }, vi.fn(), 0)
    queue.enqueue(activeKey, async () => { calls.push('stale') }, vi.fn(), 0)
    queue.enqueue(activeKey, async () => { calls.push('active') }, vi.fn(), 1)
    await Promise.resolve()

    active.resolve()
    await vi.waitFor(() => expect(calls).toHaveLength(2))
    expect(calls).toEqual(['active', 'other'])
    expect(calls).not.toContain('stale')
  })

  it('yields an active background render to a viewer render without overlapping them', async () => {
    const queue = new PdfPageRenderQueue()
    const backgroundKey = {}
    const viewerKey = {}
    const background = deferred()
    const calls: string[] = []
    let cancelled = false

    queue.enqueue(backgroundKey, async () => {
      calls.push('background:start')
      await background.promise
      calls.push('background:end')
    }, () => {
      cancelled = true
      background.resolve()
    }, -1)
    await Promise.resolve()
    queue.enqueue(viewerKey, async () => { calls.push('viewer') }, vi.fn(), 1)

    await vi.waitFor(() => expect(calls).toContain('viewer'))
    expect(cancelled).toBe(true)
    expect(calls).toEqual(['background:start', 'background:end', 'viewer'])
  })
})
