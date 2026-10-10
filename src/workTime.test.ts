import { describe, expect, it } from 'vitest'
import { formatWorkTime } from './workTime'

describe('work time formatting', () => {
  it('shows hours, minutes, and seconds without wrapping long totals', () => {
    expect(formatWorkTime(0)).toBe('00:00:00')
    expect(formatWorkTime(3_723_999)).toBe('01:02:03')
    expect(formatWorkTime(360_000_000)).toBe('100:00:00')
  })
})
