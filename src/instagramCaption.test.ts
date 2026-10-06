import { describe, expect, it } from 'vitest'
import type { KnittingReport } from './types'
import { buildInstagramCaption, recommendedCaptionFields } from './instagramCaption'

describe('Instagram report caption', () => {
  it('builds the selected share recommendations and omits private notes and empty values', () => {
    const report: KnittingReport = {
      id: 'report-1', documentId: 'document-1', title: '가디건', createdAt: 1, updatedAt: 1,
      fields: { 'project.name': '가디건', 'pattern.name': '봄 가디건', 'project.memo': '개인 메모', 'private.yarnMemo': '실은 세탁 후 늘어남', 'review.memo': '가볍고 따뜻해요.', 'review.nextChanges': '다음에는 소매를 짧게 뜨기' },
      representativePhoto: '', yarns: [{ id: 'yarn-1', photo: '', brand: '실가게', product: '메리노', colorName: '크림', colorNumber: '1012', lot: '', fiber: '', country: '', weightClass: '', recommendedNeedle: '', skeinWeight: '', skeinLength: '', retailer: '', purchaseLink: '', price: '', quantity: '', usedSkeins: '4.3', usedWeight: '215', usedMeters: '850', memo: '실타래 메모', leftover: '' }],
      needles: [], accessories: [], measurements: [], modifications: [], finishedPhotos: [],
      workPhotos: [],
    }
    const caption = buildInstagramCaption(report)

    expect(caption).toContain('도안\n봄 가디건')
    expect(caption).toContain('Yarn\n실가게 메리노 크림 1012')
    expect(caption).toContain('4.3볼 · 215g · 850m')
    expect(caption).toContain('다음에는 소매를 짧게 뜨기')
    expect(caption).toContain('#봄가디건 #뜨개기록')
    expect(caption).not.toContain('개인 메모')
    expect(caption).not.toContain('실은 세탁 후 늘어남')
    expect(caption).not.toContain('실타래 메모')
    expect(caption).not.toContain('가볍고 따뜻해요.')
    const captionWithYarnMemo = buildInstagramCaption(report, [...recommendedCaptionFields, 'yarnMemo'])
    expect(captionWithYarnMemo).toContain('실은 세탁 후 늘어남')
    expect(captionWithYarnMemo).toContain('실타래 메모')
  })

  it('adds optional personal fields only when selected', () => {
    const report = { id: 'r', documentId: 'd', title: '숄', createdAt: 1, updatedAt: 1, fields: { 'private.yarnMemo': '세탁 후 늘어남' }, representativePhoto: '', yarns: [], needles: [], accessories: [], measurements: [], modifications: [], finishedPhotos: [], workPhotos: [] } satisfies KnittingReport
    expect(buildInstagramCaption(report)).not.toContain('세탁 후 늘어남')
    expect(buildInstagramCaption(report, [...recommendedCaptionFields, 'yarnMemo'])).toContain('세탁 후 늘어남')
  })
})
