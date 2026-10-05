import { describe, expect, it } from 'vitest'
import type { KnittingReport } from './types'
import { buildInstagramCaption } from './instagramCaption'

describe('Instagram report caption', () => {
  it('builds a concise caption from filled report fields and chronological work photos', () => {
    const report: KnittingReport = {
      id: 'report-1', documentId: 'document-1', title: '가디건', createdAt: 1, updatedAt: 1,
      fields: { 'project.name': '가디건', 'pattern.name': '봄 가디건', 'project.craft': '대바늘', 'review.memo': '가볍고 따뜻해요.' },
      representativePhoto: '', yarns: [{ id: 'yarn-1', photo: '', brand: '실가게', product: '메리노', colorName: '', colorNumber: '', lot: '', fiber: '', country: '', weightClass: '', recommendedNeedle: '', skeinWeight: '', skeinLength: '', retailer: '', purchaseLink: '', price: '', quantity: '', usedSkeins: '', usedWeight: '', leftover: '' }],
      needles: [], accessories: [], measurements: [], modifications: [], finishedPhotos: [],
      workPhotos: [
        { id: 'later', label: '마무리', dataUrl: '', uploadedAt: 20, activityDate: '2026-10-03' },
        { id: 'earlier', label: '몸판 시작', dataUrl: '', uploadedAt: 10, activityDate: '2026-10-01' },
      ],
    }
    const caption = buildInstagramCaption(report)

    expect(caption).toContain('도안: 봄 가디건')
    expect(caption).toContain('사용 실: 실가게 · 메리노')
    expect(caption.indexOf('2026-10-01')).toBeLessThan(caption.indexOf('2026-10-03'))
    expect(caption).toContain('#뜨개기록 #뜨개완성')
  })
})
