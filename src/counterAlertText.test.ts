import { describe, expect, it } from 'vitest'
import { repeatCounterBlockLabel } from './counterAlertText'

describe('repeat counter blockage messages', () => {
  it('explains unavailable linked counters with the existing user messages', () => {
    expect(repeatCounterBlockLabel('base-complete')).toBe('연동한 일반 카운터의 목표에 도달했거나 완료되어 반복 진행을 늘릴 수 없습니다.')
    expect(repeatCounterBlockLabel('base-limit')).toBe('연동한 일반 카운터가 9999단이라 반복 진행을 늘릴 수 없습니다.')
    expect(repeatCounterBlockLabel('missing-base')).toBe('연동한 일반 카운터를 찾을 수 없어 진행할 수 없습니다.')
  })

  it('leaves silent and completed states to their existing callers', () => {
    expect(repeatCounterBlockLabel(null)).toBeUndefined()
    expect(repeatCounterBlockLabel('missing')).toBeUndefined()
    expect(repeatCounterBlockLabel('minimum')).toBeUndefined()
    expect(repeatCounterBlockLabel('complete')).toBeUndefined()
  })
})
