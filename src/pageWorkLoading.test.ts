import { afterEach, describe, expect, it, vi } from 'vitest'
import { getRequiredPageWorkPages, loadPageWorkWithTimeout, PAGE_WORK_LOAD_TIMEOUT_MS, PageWorkLoadTimeoutError } from './pageWorkLoading'

afterEach(() => vi.useRealTimers())

describe('page work loading', () => {
  it('loads the active pane in single view and both unique pages in split view', () => {
    expect(getRequiredPageWorkPages({ split: false, activePage: 8, primaryPage: 3, secondaryPage: 8 })).toEqual([8])
    expect(getRequiredPageWorkPages({ split: true, activePage: 8, primaryPage: 3, secondaryPage: 8 })).toEqual([3, 8])
    expect(getRequiredPageWorkPages({ split: true, activePage: 3, primaryPage: 3, secondaryPage: 3 })).toEqual([3])
  })

  it('reports a timeout, then allows the page to be loaded again', async () => {
    vi.useFakeTimers()
    expect(PAGE_WORK_LOAD_TIMEOUT_MS).toBe(20_000)
    let resolveLateRead: ((value: string) => void) | undefined
    let applied: string | null = null
    const pending = loadPageWorkWithTimeout(() => new Promise<string>((resolve) => { resolveLateRead = resolve })).then((value) => {
      applied = value
      return value
    })
    const timedOut = expect(pending).rejects.toBeInstanceOf(PageWorkLoadTimeoutError)
    await vi.advanceTimersByTimeAsync(PAGE_WORK_LOAD_TIMEOUT_MS)
    await timedOut
    await expect(loadPageWorkWithTimeout(async () => 'loaded')).resolves.toBe('loaded')
    expect(resolveLateRead).toBeDefined()
    resolveLateRead?.('stale')
    await Promise.resolve()
    expect(applied).toBeNull()
  })

  it('preserves an immediate storage error for the caller to report', async () => {
    const failure = new Error('storage unavailable')
    await expect(loadPageWorkWithTimeout(async () => { throw failure }, 20)).rejects.toBe(failure)
  })
})
