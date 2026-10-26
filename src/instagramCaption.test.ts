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
    expect(caption).toContain('#봄가디건 #뜨개기록 #니트피크 #knitpeek')
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

  it('shares saved modification memos alongside distinct legacy changes and omits empty rows', () => {
    const report = {
      id: 'r', documentId: 'd', title: '숄', createdAt: 1, updatedAt: 1, fields: {}, representativePhoto: '', yarns: [], needles: [], accessories: [], measurements: [],
      modifications: [
        { id: 'memo', section: '몸판', original: '원래 20코', changed: '', memo: '메모 3코 줄임' },
        { id: 'changed', section: '소매', original: '원래 10코', changed: '5코 줄임', memo: '' },
        { id: 'both', section: '목둘레', original: '', changed: '고무단 추가', memo: '넥라인 수정' },
        { id: 'same', section: '단추', original: '', changed: '간격 조정', memo: '간격 조정' },
        { id: 'original', section: '밑단', original: '원래보다 2cm 길게', changed: '', memo: '' },
        { id: 'empty', section: '', original: '', changed: '', memo: '' },
      ], finishedPhotos: [], workPhotos: [],
    } satisfies KnittingReport

    const caption = buildInstagramCaption(report, ['modifications'])

    expect(caption).toContain('- 몸판 메모 3코 줄임')
    expect(caption).toContain('- 소매 5코 줄임')
    expect(caption).toContain('- 목둘레 넥라인 수정 고무단 추가')
    expect(caption).toContain('- 단추 간격 조정')
    expect(caption).toContain('- 밑단 원래보다 2cm 길게')
    expect(caption).not.toContain('-  ')
    expect(caption.match(/간격 조정/g)).toHaveLength(1)
  })

  it('prints saved gauge dimensions, measurement units, and the chosen needle notation', () => {
    const report = {
      id: 'r', documentId: 'd', title: '가디건', createdAt: 1, updatedAt: 1,
      fields: { 'gauge.pattern': '꽈배기', 'gauge.beforeStitches': '24', 'gauge.beforeRows': '16', 'gauge.beforeWidth': '8', 'gauge.beforeHeight': '5.5', 'gauge.beforeUnit': 'cm', 'gauge.afterStitches': '24', 'gauge.afterRows': '16', 'gauge.afterWidth': '9', 'gauge.afterHeight': '6', 'gauge.afterUnit': 'inch' },
      representativePhoto: '', yarns: [],
      needles: [
        { id: 'us', section: '소매', type: '대바늘', size: '6', sizeUnit: 'US' as const, brand: '치아오구', cableLength: '', memo: '' },
        { id: 'legacy', section: '몸판', type: '', size: '4.5', cableLength: '', memo: '' },
      ],
      accessories: [], measurements: [
        { id: 'cm', label: '기장', pattern: '', finished: '57', unit: 'cm' as const },
        { id: 'inch', label: '소매길이', pattern: '', finished: '22', unit: 'inch' as const },
      ], modifications: [], finishedPhotos: [], workPhotos: [],
    } satisfies KnittingReport
    const caption = buildInstagramCaption(report, ['needles', 'gauge', 'measurements'])

    expect(caption).toContain('치아오구 US 6')
    expect(caption).toContain('몸판 4.5')
    expect(caption).not.toContain('4.5mm')
    expect(caption).toContain('꽈배기')
    expect(caption).toContain('8 × 5.5 cm')
    expect(caption).toContain('9 × 6 인치')
    expect(caption).toContain('기장: 57 cm')
    expect(caption).toContain('소매길이: 22 인치')
  })
})
