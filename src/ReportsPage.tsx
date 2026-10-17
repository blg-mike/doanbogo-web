import { formatDate, formatNumber, t, useLocale } from './locales/index'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Grid2X2, List, Search, SlidersHorizontal, X } from 'lucide-react'
import AppNavigation from './AppNavigation'
import { getPreference, listHomeProjects, listHomeReports, savePreference, type KnittingReportSummary } from './storage'
import type { HomeProject, ViewMode } from './types'
import { formatWorkTime } from './workTime'
import { filterAndSortReports, type ReportSort, type ReportStatusFilter } from './reportCollection'
import './Home.css'

function ReportCover({ project }: { project: HomeProject }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!project.cover) return
    const next = URL.createObjectURL(project.cover)
    // oxlint-disable-next-line react/set-state-in-effect -- Publish the Blob lifecycle URL for the cover image.
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [project.cover])
  return project.cover && url ? <img className="home-cover-image" src={url} alt="" /> : <span className="home-cover-placeholder"><FileText size={32} /></span>
}

export default function ReportsPage() {
  const navigate = useNavigate()
  const locale = useLocale()
  const [items, setItems] = useState<{ report: KnittingReportSummary; project: HomeProject }[]>([])
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<ReportStatusFilter>('all')
  const [sort, setSort] = useState<ReportSort>('recent')
  const [view, setView] = useState<ViewMode>('cover')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const [projects, reports] = await Promise.all([listHomeProjects(), listHomeReports()])
        const [savedSort, savedView] = await Promise.all([getPreference('reports.sort').catch(() => undefined), getPreference('reports.view').catch(() => undefined)])
        if (!active) return
        const byKey = new Map(projects.map((project) => [project.key, project]))
        setItems(reports.flatMap((report) => {
          const project = byKey.get('document:' + report.documentId)
          return project && project.deletedAt === null && project.archivedAt === null ? [{ report, project }] : []
        }))
        if (savedSort === 'recent' || savedSort === 'name') setSort(savedSort)
        if (savedView === 'cover' || savedView === 'list') setView(savedView)
        setLoadError(false)
      } catch {
        if (active) setLoadError(true)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [reload])

  const visibleItems = useMemo(() => filterAndSortReports(items, query, status, sort, locale), [items, query, status, sort, locale])
  const updateSort = (next: ReportSort) => { setSort(next); void savePreference('reports.sort', next) }
  const updateView = (next: ViewMode) => { setView(next); void savePreference('reports.view', next) }

  return <div className="workspace-app-frame reports-page"><AppNavigation active="reports" /><main className="workspace-shell">
    <section className="workspace-content report-workspace-content">
      <div className="welcome-row"><div><p className="eyebrow">{t('뜨개보고서')}</p><h1>{t('뜨개보고서')}</h1><p className="welcome-copy">{t('작성 중인 기록과 완성한 프로젝트 보고서를 확인해요.')}</p></div><div className="document-count">{t('보고서 {count}개', { count: formatNumber(visibleItems.length) })}</div></div>
      <div className="collection-search-row"><label className="search-box report-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('이름 또는 태그 검색')} aria-label={t('이름 또는 태그 검색')} />{query && <button type="button" className="search-clear" aria-label={t('검색어 지우기')} onClick={() => setQuery('')}><X size={15} /></button>}</label></div>
      <div className="toolbar reports-toolbar">
        <label className="sort-select report-filter"><span className="sr-only">{t('상태')}</span><select aria-label={t('상태')} value={status} onChange={(event) => setStatus(event.currentTarget.value as ReportStatusFilter)}><option value="all">{t('전체')}</option><option value="draft">{t('작성 중')}</option><option value="complete">{t('완료')}</option></select></label>
        <label className="sort-select"><SlidersHorizontal size={16} /><span className="sr-only">{t('정렬')}</span><select aria-label={t('정렬')} value={sort} onChange={(event) => updateSort(event.currentTarget.value as ReportSort)}><option value="recent">{t('최근 수정순')}</option><option value="name">{t('이름순')}</option></select></label>
        <div className="view-toggle" aria-label={t('보기 방식')}><button className={view === 'cover' ? 'active' : ''} aria-label={t('표지 보기')} aria-pressed={view === 'cover'} onClick={() => updateView('cover')}><Grid2X2 size={17} /></button><button className={view === 'list' ? 'active' : ''} aria-label={t('목록 보기')} aria-pressed={view === 'list'} onClick={() => updateView('list')}><List size={18} /></button></div>
      </div>
      {loading ? <p className="collection-empty" role="status">{t('보고서를 불러오는 중…')}</p> : loadError ? <section className="empty-state" role="alert"><div className="empty-icon"><FileText size={27} /></div><h2>{t('보고서를 불러오지 못했습니다.')}</h2><button className="secondary-button" onClick={() => { setLoadError(false); setLoading(true); setReload((value) => value + 1) }}>{t('다시 시도')}</button></section> : visibleItems.length ? <section className={view === 'cover' ? 'document-grid' : 'document-list'} aria-label={t('보고서 목록')}>
        {visibleItems.map(({ report, project }) => <button type="button" className={'document-card report-document-card ' + (view === 'list' ? 'list-card' : '')} key={report.id} onClick={() => navigate('/report/' + report.documentId + '/' + report.id)}>
          <span className="cover-button report-cover"><ReportCover project={project} /><span className="pdf-label">{report.status === 'complete' ? t('완료') : t('작성 중')}</span></span>
          <span className="document-info"><span className="card-title-line"><strong className="card-title">{project.title}</strong></span><small className="report-status">{report.status === 'complete' ? t('완료') : t('작성 중')} · {formatDate(report.updatedAt)}</small><span className="document-meta">{t('누적 작업시간')} {formatWorkTime(project.totalWorkTimeMs ?? 0)}</span>{(project.tags ?? []).length > 0 && <span className="tag-list">{(project.tags ?? []).map((tag) => <span className="tag-chip" key={tag}>{tag}</span>)}</span>}<b className="report-card-action">{report.status === 'complete' ? t('보고서 보기') : t('계속 작성')}</b></span>
        </button>)}
      </section> : <section className="empty-state"><div className="empty-icon"><FileText size={27} /></div><h2>{items.length || query || status !== 'all' ? t('검색 결과가 없습니다.') : t('아직 보고서가 없습니다. 프로젝트에서 뜨개보고서를 작성할 수 있어요.')}</h2>{(query || status !== 'all') && <p>{t('이름이나 태그를 바꿔서 다시 검색해 보세요.')}</p>}</section>}
    </section>
  </main></div>
}
