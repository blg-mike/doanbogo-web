import type { KnittingReportSummary } from './storage'
import type { HomeProject } from './types'

export type ReportCollectionItem = { report: KnittingReportSummary; project: HomeProject }
export type ReportStatusFilter = 'all' | 'draft' | 'complete'
export type ReportSort = 'recent' | 'name'

export function filterAndSortReports(items: ReportCollectionItem[], query: string, status: ReportStatusFilter, sort: ReportSort, locale: string) {
  const needle = query.trim().toLocaleLowerCase(locale)
  return items.filter(({ report, project }) => {
    if (status !== 'all' && report.status !== status) return false
    return !needle || [project.title, ...(project.tags ?? [])].some((value) => value.toLocaleLowerCase(locale).includes(needle))
  }).sort((a, b) => sort === 'name'
    ? a.project.title.localeCompare(b.project.title, locale) || b.report.updatedAt - a.report.updatedAt
    : b.report.updatedAt - a.report.updatedAt)
}
