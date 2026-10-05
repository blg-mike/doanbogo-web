import { describe, expect, it } from 'vitest'
import { addVisibleLoadingTime, BRAND_LOADING_COPY, getBrandLoadingMessage, getNextLoadingDelay, selectBrandLoadingCopy, type BrandLoadingKind } from './brandLoadingState'

describe('brand loading messages', () => {
  it('waits 400ms, uses the short copy before 2s, and holds the selected copy until 5s', () => {
    expect(getBrandLoadingMessage('pdf', 399, BRAND_LOADING_COPY[0])).toBeNull()
    expect(getBrandLoadingMessage('pdf', 400, BRAND_LOADING_COPY[0])).toBe('한 코씩 불러오는 중…')
    expect(getBrandLoadingMessage('pdf', 1999, BRAND_LOADING_COPY[0])).toBe('한 코씩 불러오는 중…')
    expect(getBrandLoadingMessage('pdf', 2000, BRAND_LOADING_COPY[0])).toBe(BRAND_LOADING_COPY[0])
    expect(getBrandLoadingMessage('pdf', 4999, BRAND_LOADING_COPY[0])).toBe(BRAND_LOADING_COPY[0])
  })

  it('selects five equally sized common and rare message bands at 90/10 odds', () => {
    expect([0.09, 0.27, 0.45, 0.63, 0.81].map(selectBrandLoadingCopy)).toEqual(BRAND_LOADING_COPY)
    expect([0.91, 0.93, 0.95, 0.97, 0.99].map(selectBrandLoadingCopy)).toEqual([
      '푸를까… 그냥 갈까…',
      '실은 충분합니다. 아마도.',
      '잠깐, 지금 겉뜨기였나?',
      '블로킹이 해결해 줄 거예요.',
      '도안 해독 중…',
    ])
  })

  it('switches to the factual message for each loading task at 5s', () => {
    const factualMessages: Record<BrandLoadingKind, string> = {
      app: '도안을 불러오는 중…',
      pdf: '도안을 불러오는 중…',
      chart: '차트를 불러오는 중…',
      report: '보고서를 불러오는 중…',
      'page-work': '페이지 작업을 불러오는 중…',
    }
    for (const [kind, message] of Object.entries(factualMessages) as [BrandLoadingKind, string][]) {
      expect(getBrandLoadingMessage(kind, 5000, BRAND_LOADING_COPY[0])).toBe(message)
    }
  })

  it('pauses elapsed time while hidden and schedules only the next milestone', () => {
    expect(addVisibleLoadingTime(800, null, 1200)).toBe(800)
    expect(addVisibleLoadingTime(800, 1200, 1500)).toBe(1100)
    expect(getNextLoadingDelay(399)).toBe(1)
    expect(getNextLoadingDelay(2000)).toBe(3000)
    expect(getNextLoadingDelay(5000)).toBeNull()
  })
})
