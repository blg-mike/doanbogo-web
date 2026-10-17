import { describe, expect, it } from 'vitest'
import { filterAndSortReports, type ReportCollectionItem } from './reportCollection'

const items = [
  { report: { id: 'r1', documentId: 'd1', title: '', createdAt: 1, updatedAt: 10, status: 'draft', completedAt: null }, project: { key: 'document:d1', entityId: 'd1', kind: 'document', title: 'Cardigan', cover: null, tags: ['winter'], status: 'active', archivedAt: null, deletedAt: null, lastWorkedAt: null, createdAt: 1 } },
  { report: { id: 'r2', documentId: 'd2', title: '', createdAt: 2, updatedAt: 20, status: 'complete', completedAt: 20 }, project: { key: 'document:d2', entityId: 'd2', kind: 'document', title: 'Socks', cover: null, tags: ['summer'], status: 'active', archivedAt: null, deletedAt: null, lastWorkedAt: null, createdAt: 2 } },
] as ReportCollectionItem[]

describe('report collection filters', () => {
  it('searches project names and tags, filters status, and sorts by recent or name', () => {
    expect(filterAndSortReports(items, 'winter', 'all', 'recent', 'en').map(({ report }) => report.id)).toEqual(['r1'])
    expect(filterAndSortReports(items, '', 'complete', 'recent', 'en').map(({ report }) => report.id)).toEqual(['r2'])
    expect(filterAndSortReports(items, '', 'all', 'name', 'en').map(({ project }) => project.title)).toEqual(['Cardigan', 'Socks'])
    expect(filterAndSortReports(items, '', 'all', 'recent', 'en').map(({ report }) => report.id)).toEqual(['r2', 'r1'])
  })
})
