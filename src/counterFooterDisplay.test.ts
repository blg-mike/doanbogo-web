import { describe, expect, it } from 'vitest'
import { counterFooterName } from './counterFooterDisplay'

describe('counterFooterName', () => {
  it('omits the generic counter suffix in supported locales', () => {
    expect(counterFooterName('메인 카운터')).toBe('메인')
    expect(counterFooterName('Main counter')).toBe('Main')
    expect(counterFooterName('模様カウンター')).toBe('模様')
    expect(counterFooterName('Musterzähler')).toBe('Muster')
    expect(counterFooterName('Mønstertæller')).toBe('Mønster')
    expect(counterFooterName('Gjenta-teller')).toBe('Gjenta')
    expect(counterFooterName('Indtagnings-/udtagnings\u00adtæller')).toBe('Indtagnings-/udtagnings')
    expect(counterFooterName('Mallilaskuri')).toBe('Malli')
  })

  it('keeps custom names and avoids an empty label', () => {
    expect(counterFooterName('몸판')).toBe('몸판')
    expect(counterFooterName('카운터')).toBe('카운터')
  })
})
