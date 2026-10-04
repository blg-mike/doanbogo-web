import type { PageWorkRecord } from './types'

export class PageWorkPersistence {
  private readonly pending = new Map<string, { work: PageWorkRecord; version: number }>()
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly writes = new Map<string, Promise<void>>()
  private readonly save: (work: PageWorkRecord) => Promise<void>
  private readonly delay: number
  private readonly onError: (error: unknown) => void
  private readonly versions = new Map<string, number>()
  private nextVersion = 0

  constructor(save: (work: PageWorkRecord) => Promise<void>, delay = 300, onError = (error: unknown) => console.warn('[PDF] Page work could not be saved.', error)) {
    this.save = save
    this.delay = delay
    this.onError = onError
  }

  schedule(work: PageWorkRecord, immediate = false) {
    const key = JSON.stringify([work.documentId, work.pageNumber])
    const version = ++this.nextVersion
    this.versions.set(key, version)
    this.pending.set(key, { work, version })
    this.clearTimer(key)
    if (immediate) return this.flushPage(key)
    this.timers.set(key, setTimeout(() => {
      this.timers.delete(key)
      void this.flushPage(key).catch(this.onError)
    }, this.delay))
    return Promise.resolve()
  }

  async flushAll() {
    const keys = [...this.pending.keys()]
    keys.forEach((key) => this.clearTimer(key))
    const flushes = keys.map((key) => this.flushPage(key))
    await Promise.all([...flushes, ...this.writes.values()])
  }

  dispose() {
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
  }

  private flushPage(key: string): Promise<void> {
    const entry = this.pending.get(key)
    if (!entry) return this.writes.get(key) ?? Promise.resolve()
    this.pending.delete(key)
    const previous = this.writes.get(key) ?? Promise.resolve()
    const write = previous.catch(() => {}).then(() => this.save(entry.work))
    this.writes.set(key, write)
    const clear = () => {
      if (this.writes.get(key) === write) this.writes.delete(key)
    }
    void write.then(clear, () => {
      if (this.versions.get(key) === entry.version && !this.pending.has(key)) {
        this.pending.set(key, entry)
      }
      clear()
    })
    return write
  }

  private clearTimer(key: string) {
    const timer = this.timers.get(key)
    if (timer === undefined) return
    clearTimeout(timer)
    this.timers.delete(key)
  }
}
