export type BrandLoadingKind = 'app' | 'pdf' | 'chart' | 'report' | 'page-work'

export const BRAND_LOADING_COPY = [
  '분명 셌는데… 다시 셀게요.',
  '도안보고, 뜨고, 또 도안보고.',
  '한 코씩 불러오는 중…',
  '몇 단이었지… 다시 세는 중.',
  '한 코가 어디 갔지?',

  '푸를까… 그냥 갈까…',
  '실은 충분합니다. 아마도.',
  '잠깐, 지금 겉뜨기였나?',
  '블로킹이 해결해 줄 거예요.',
  '도안 해독 중…',
] as const

export const LOADING_DELAY_MS = 400
export const LOADING_COPY_INTERVAL_MS = 2000

export function selectBrandLoadingCopy(randomValue: number, previousCopy?: string) {
  const choices = BRAND_LOADING_COPY.filter((copy) => copy !== previousCopy)
  const value = Math.max(0, Math.min(1 - Number.EPSILON, randomValue))
  return choices[Math.floor(value * choices.length)]
}

export function getNextLoadingDelay(elapsedMs: number) {
  if (elapsedMs < LOADING_DELAY_MS) return LOADING_DELAY_MS - elapsedMs
  return LOADING_COPY_INTERVAL_MS - (elapsedMs - LOADING_DELAY_MS) % LOADING_COPY_INTERVAL_MS
}

export function addVisibleLoadingTime(accumulatedMs: number, activeSince: number | null, now: number) {
  return activeSince === null ? accumulatedMs : accumulatedMs + Math.max(0, now - activeSince)
}
