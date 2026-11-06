import { describe, expect, it } from 'vitest'
import { viewerTutorialPlacement, viewerTutorialSteps } from './ViewerTutorialUtils'

function rect(left: number, top: number, width: number, height: number) {
  return { left, top, width, height, right: left + width, bottom: top + height } as DOMRect
}

describe('viewer tutorial', () => {
  it('places the callout below a target when there is not enough room above', () => {
    const placement = viewerTutorialPlacement(rect(120, 36, 44, 44), 300, 220, 360, 740)

    expect(placement.side).toBe('bottom')
    expect(placement.top).toBe(110)
  })

  it('places the callout above a target when the lower edge is constrained', () => {
    const placement = viewerTutorialPlacement(rect(120, 650, 44, 44), 300, 220, 360, 740)

    expect(placement.side).toBe('top')
    expect(placement.top).toBe(400)
  })

  it('keeps callout coordinates inside the viewport on a narrow screen', () => {
    const placement = viewerTutorialPlacement(rect(0, 300, 44, 44), 296, 280, 320, 640)

    expect(placement.left).toBe(12)
    expect(placement.top).toBeGreaterThanOrEqual(12)
    expect(placement.top + 280).toBeLessThanOrEqual(628)
  })

  it('covers the nine planned Viewer features', () => {
    expect(viewerTutorialSteps).toHaveLength(9)
    expect(viewerTutorialSteps.map(([, , target]) => target)).toEqual([
      'split', 'focus', 'progress-tool', 'progress-tool', 'progress-tool',
      'counter-manage', 'timer', 'rotate', 'report',
    ])
  })
})
