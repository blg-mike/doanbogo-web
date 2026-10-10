export const PAGE_WORK_LOAD_TIMEOUT_MS = 20_000

export class PageWorkLoadTimeoutError extends Error {
  constructor() {
    super('PAGE_WORK_LOAD_TIMEOUT')
    this.name = 'PageWorkLoadTimeoutError'
  }
}

export function getRequiredPageWorkPages({ split, activePage, primaryPage, secondaryPage }: {
  split: boolean
  activePage: number
  primaryPage: number
  secondaryPage: number
}) {
  return [...new Set(split ? [primaryPage, secondaryPage] : [activePage])]
}

export function loadPageWorkWithTimeout<T>(load: () => Promise<T>, timeoutMs = PAGE_WORK_LOAD_TIMEOUT_MS) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const request = Promise.resolve().then(load)
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new PageWorkLoadTimeoutError()), timeoutMs)
  })
  return Promise.race([request, timeout]).finally(() => {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
  })
}
