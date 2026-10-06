import { describe, expect, it } from 'vitest'
import { addVisibleLoadingTime, BRAND_LOADING_COPY, getNextLoadingDelay, selectBrandLoadingCopy } from './brandLoadingState'

describe('random brand loading messages', () => {
  it('makes all ten messages equally available from the first display', () => {
    expect(Array.from({ length: 10 }, (_, index) => selectBrandLoadingCopy((index + 0.5) / 10))).toEqual(BRAND_LOADING_COPY)
    expect(BRAND_LOADING_COPY).toHaveLength(10)
  })

  it('avoids repeating the current message when rotating', () => {
    for (const previous of BRAND_LOADING_COPY) {
      const choices = Array.from({ length: 9 }, (_, index) => selectBrandLoadingCopy((index + 0.5) / 9, previous))
      expect(choices).not.toContain(previous)
      expect(new Set(choices).size).toBe(9)
    }
  })

  it('waits 400ms and continues rotating beyond five seconds', () => {
    expect(getNextLoadingDelay(399)).toBe(1)
    expect(getNextLoadingDelay(400)).toBe(2000)
    expect(getNextLoadingDelay(2400)).toBe(2000)
    expect(getNextLoadingDelay(5000)).toBe(1400)
  })

  it('pauses elapsed time while hidden', () => {
    expect(addVisibleLoadingTime(800, null, 1200)).toBe(800)
    expect(addVisibleLoadingTime(800, 1200, 1500)).toBe(1100)
  })
})
