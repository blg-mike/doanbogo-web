type PageRenderJob = {
  key: object
  priority: number
  run: () => Promise<void>
  cancel: () => void
  cancelled: boolean
}

export class PdfPageRenderQueue {
  private active: PageRenderJob | null = null
  private pumpScheduled = false
  private readonly queued: PageRenderJob[] = []
  private readonly idleWaiters = new Set<() => void>()

  whenIdle() {
    if (!this.active && !this.pumpScheduled && !this.queued.length) return Promise.resolve()
    return new Promise<void>((resolve) => this.idleWaiters.add(resolve))
  }

  enqueue(key: object, run: () => Promise<void>, cancel: () => void, priority = 0) {
    const job: PageRenderJob = { key, run, cancel, priority, cancelled: false }
    for (let index = this.queued.length - 1; index >= 0; index--) {
      if (this.queued[index].key === key) this.cancelJob(this.queued[index], index)
    }
    if (this.active?.key === key) this.cancelJob(this.active)
    this.queued.push(job)
    if (this.active && this.active.priority < 0 && priority >= 0) this.cancelJob(this.active)
    this.pump()

    return () => {
      if (job.cancelled) return
      const index = this.queued.indexOf(job)
      this.cancelJob(job, index >= 0 ? index : undefined)
    }
  }

  setPriority(key: object, priority: number) {
    if (this.active?.key === key) this.active.priority = priority
    for (const job of this.queued) if (job.key === key) job.priority = priority
  }

  private cancelJob(job: PageRenderJob, queueIndex?: number) {
    if (job.cancelled) return
    job.cancelled = true
    if (queueIndex !== undefined) {
      this.queued.splice(queueIndex, 1)
      this.pump()
    }
    try {
      job.cancel()
    } catch {
      // Cancellation must not block the next queued render.
    }
  }

  private pump() {
    if (this.active || this.pumpScheduled) return
    this.pumpScheduled = true
    queueMicrotask(() => {
      this.pumpScheduled = false
      if (this.active) return
      this.queued.sort((first, second) => second.priority - first.priority)
      const job = this.queued.shift()
      if (!job) {
        this.resolveIdle()
        return
      }
      if (job.cancelled) {
        this.pump()
        return
      }
      this.active = job
      void job.run().catch(() => {}).finally(() => {
        if (this.active === job) this.active = null
        this.pump()
      })
    })
  }

  private resolveIdle() {
    if (this.active || this.pumpScheduled || this.queued.length) return
    this.idleWaiters.forEach((resolve) => resolve())
    this.idleWaiters.clear()
  }
}

export const pdfPageRenderQueue = new PdfPageRenderQueue()
