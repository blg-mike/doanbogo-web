export type BrandLoadingKind = 'app' | 'pdf' | 'chart' | 'report' | 'page-work'

export const BRAND_LOADING_COPY = [
  '분명 셌는데… 다시 셀게요.',
  '도안보고, 뜨고, 또 도안보고.',
  '한 코씩 불러오는 중…',
  '몇 단이었지… 다시 세는 중.',
  '한 코가 어디 갔지?',
] as const

const RARE_LOADING_COPY = [
  '푸를까… 그냥 갈까…',
  '실은 충분합니다. 아마도.',
  '잠깐, 지금 겉뜨기였나?',
  '블로킹이 해결해 줄 거예요.',
  '도안 해독 중…',
] as const

export const LOADING_MILESTONES = [400, 2000, 5000] as const

const FACTUAL_LOADING_COPY: Record<BrandLoadingKind, string> = {
  app: '도안을 불러오는 중…',
  pdf: '도안을 불러오는 중…',
  chart: '차트를 불러오는 중…',
  report: '보고서를 불러오는 중…',
  'page-work': '페이지 작업을 불러오는 중…',
}

export function selectBrandLoadingCopy(randomValue: number) {
  const value = Math.max(0, Math.min(1 - Number.EPSILON, randomValue))
  const rare = value >= 0.9
  const groupPosition = rare ? (value - 0.9) / 0.1 : value / 0.9
  const index = Math.min(4, Math.floor(groupPosition * 5))
  return rare ? RARE_LOADING_COPY[index] : BRAND_LOADING_COPY[index]
}

export function getBrandLoadingMessage(kind: BrandLoadingKind, elapsedMs: number, selectedCopy: string) {
  if (elapsedMs < LOADING_MILESTONES[0]) return null
  if (elapsedMs < LOADING_MILESTONES[1]) return '한 코씩 불러오는 중…'
  if (elapsedMs < LOADING_MILESTONES[2]) return selectedCopy
  return FACTUAL_LOADING_COPY[kind]
}

export function getNextLoadingDelay(elapsedMs: number) {
  const next = LOADING_MILESTONES.find((milestone) => elapsedMs < milestone)
  return next === undefined ? null : Math.max(0, next - elapsedMs)
}

export function addVisibleLoadingTime(accumulatedMs: number, activeSince: number | null, now: number) {
  return activeSince === null ? accumulatedMs : accumulatedMs + Math.max(0, now - activeSince)
}
