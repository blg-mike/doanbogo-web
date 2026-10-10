import { formatDate, formatNumber, formatRelativeTime, t } from './locales/index'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Clock3, FilePlus2, FileText, Grid3X3, Images, Search, X } from 'lucide-react'
import AppNavigation from './AppNavigation'
import BrandLoading from './BrandLoading'
import { counterSideForRow } from './smartCounter'
import { getViewer, listHomeProjects, listHomeReports, type KnittingReportSummary } from './storage'
import type { HomeProject, ViewerSnapshot } from './types'
import { formatWorkTime } from './workTime'
import './Home.css'

function ago(timestamp: number | null) {
  if (!timestamp) return t('최근 작업 없음')
  const minutes = Math.max(1, Math.floor((Date.now() - timestamp) / 60_000))
  if (minutes < 60) return formatRelativeTime(minutes, 'minute')
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return formatRelativeTime(hours, 'hour')
  const days = Math.floor(hours / 24)
  return days < 30 ? formatRelativeTime(days, 'day') : formatDate(timestamp, { month: 'short', day: 'numeric' })
}

function Cover({ project, compact = false }: { project: HomeProject; compact?: boolean }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!project.cover) return
    const next = URL.createObjectURL(project.cover)
    // oxlint-disable-next-line react/set-state-in-effect -- Publish the Blob lifecycle URL for the cover image.
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [project.cover])
  const Icon = project.documentKind === 'photos' ? Images : project.kind === 'chart' ? Grid3X3 : FileText
  const placeholder = <span className={'home-cover-placeholder' + (compact ? ' compact' : '')}><Icon size={compact ? 18 : 25} /></span>
  if (!project.cover) return placeholder
  return url ? <img className="home-cover-image" src={url} alt="" /> : placeholder
}

function ProjectCard({ project, onOpen }: { project: HomeProject; onOpen: () => void }) {
  const type = project.kind === 'chart' ? t('차트') : project.documentKind === 'photos' ? t('사진 도안') : t('PDF 도안')
  const status = project.status === 'paused' ? t('보류') : project.status === 'completed' ? t('완료') : project.pageCount ? `${formatNumber(project.pageCount)}${t('페이지')}` : type
  return <button className="home-project-card" onClick={onOpen}>
    <span className="home-project-cover"><Cover project={project} /><i>{type}</i></span>
    <strong>{project.title}</strong><small>{status} · {ago(project.lastWorkedAt)}</small>{project.kind === 'document' && <small>{t('누적 작업시간')} {formatWorkTime(project.totalWorkTimeMs ?? 0)}</small>}
  </button>
}

export default function Home() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<HomeProject[]>([])
  const [reports, setReports] = useState<KnittingReportSummary[]>([])
  const [viewerEntry, setViewerEntry] = useState<{ projectId: string; snapshot: ViewerSnapshot } | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let active = true
    void Promise.all([listHomeProjects(), listHomeReports()]).then(([nextProjects, nextReports]) => {
      if (!active) return
      setProjects(nextProjects)
      setReports(nextReports)
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const available = useMemo(() => projects.filter((item) => item.deletedAt === null && item.archivedAt === null), [projects])
  const searchable = useMemo(() => query.trim() ? projects.filter((item) => item.deletedAt === null && `${item.title} ${item.tags.join(' ')}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) : [], [projects, query])
  const latestWork = useMemo(() => available.filter((item) => item.status !== 'completed' && item.lastWorkedAt !== null).sort((a, b) => (b.lastWorkedAt ?? 0) - (a.lastWorkedAt ?? 0))[0], [available])
  const viewer = latestWork?.kind === 'document' && viewerEntry?.projectId === latestWork.entityId ? viewerEntry.snapshot : null
  const projectByKey = useMemo(() => new Map(projects.map((item) => [item.key, item])), [projects])
  const visibleReports = useMemo(() => reports.filter((report) => {
    const project = projectByKey.get('document:' + report.documentId)
    return project && project.deletedAt === null && project.archivedAt === null
  }).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4), [reports, projectByKey])
  const visibleProjects = useMemo(() => available.sort((a, b) => Number(a.status === 'completed') - Number(b.status === 'completed') || (b.lastWorkedAt ?? b.createdAt) - (a.lastWorkedAt ?? a.createdAt)).slice(0, 8), [available])

  useEffect(() => {
    let active = true
    if (latestWork?.kind === 'document') {
      void getViewer(latestWork.entityId, latestWork.pageCount ?? 1).then((saved) => { if (active) setViewerEntry({ projectId: latestWork.entityId, snapshot: saved }) }).catch(() => {})
    }
    return () => { active = false }
  }, [latestWork?.entityId, latestWork?.pageCount, latestWork?.kind])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.key === '/' && !event.ctrlKey && !event.metaKey && !['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement)?.tagName)) || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k')) {
        event.preventDefault(); setSearchOpen(true); window.setTimeout(() => document.querySelector<HTMLInputElement>('.home-search-overlay input')?.focus(), 0)
      } else if (event.key === 'Escape') setSearchOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const mainCounter = viewer?.counters?.find((item) => item.id === viewer.counterMainId) ?? viewer?.counters?.find((item) => item.kind === 'simple')
  const currentRow = mainCounter?.currentRow ?? mainCounter?.value
  const side = mainCounter && currentRow ? counterSideForRow(mainCounter, currentRow).toUpperCase() : ''
  const resume = (project: HomeProject) => navigate(project.kind === 'chart' ? '/chart/' + project.entityId : '/viewer/' + project.entityId)
  const openProject = (project: HomeProject) => navigate(
    project.kind === 'document' && project.documentKind !== 'photos' && project.archivedAt === null
      ? '/viewer/' + project.entityId
      : '/projects/' + project.kind + '/' + project.entityId,
  )
  const reportProject = (report: KnittingReportSummary) => projectByKey.get('document:' + report.documentId)

  return <div className="app-page-frame home-page">
    <AppNavigation active="home" />
    <main className="app-page-main">
      <header className="home-header"><div><p className="home-eyebrow">{t('도안보고')}</p><h1>{t("도안보고")}</h1></div>
        <div className="home-header-actions"><label className="home-search"><Search size={17} /><input value={query} onFocus={() => setSearchOpen(true)} onChange={(event) => setQuery(event.target.value)} placeholder={t("프로젝트 이름 또는 태그 검색")} aria-label={t("프로젝트 이름 또는 태그 검색")} /><kbd>⌘K</kbd></label>
          <button className="home-new-button" aria-label={t("새 프로젝트")} onClick={() => navigate('/projects/new')}><FilePlus2 size={17} /><span>{t("새 프로젝트")}</span></button>
          <button className="home-mobile-search" aria-label={t("검색")} onClick={() => setSearchOpen(true)}><Search size={21} /></button>
        </div>
      </header>
      {loading ? <div className="home-loading"><BrandLoading kind="app" requestId="home-summary" layout="pane" /></div> : <>
        {searchOpen && <div className="home-search-overlay" role="dialog" aria-modal="true" aria-label={t("프로젝트 검색")}><header><Search size={18} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && searchable[0]) { setSearchOpen(false); openProject(searchable[0]) } }} placeholder={t("프로젝트 이름 또는 태그")} /><button onClick={() => { setSearchOpen(false); setQuery('') }} aria-label={t("검색 닫기")}><X size={19} /></button></header><div className="home-search-results">{query.trim() ? searchable.length ? searchable.map((project) => <button key={project.key} onClick={() => { setSearchOpen(false); openProject(project) }}><Cover project={project} compact /><span><strong>{project.title}</strong><small>{project.kind === 'chart' ? t('차트') : project.documentKind === 'photos' ? t('사진 도안') : t('PDF 도안')}{project.tags.length ? ' · ' + project.tags.join(', ') : ''}</small></span><ArrowRight size={16} /></button>) : <p>{t("검색 결과가 없습니다.")}</p> : <p>{t("프로젝트 이름이나 태그를 검색하세요.")}</p>}</div></div>}
        <div className="home-sections">
          {latestWork && <section className="home-section home-recent-section"><div className="home-section-heading"><div><p className="home-eyebrow">{t('이어서 뜨기 ')}</p><h2>{t("최근 작업")}</h2></div><span className="home-updated"><Clock3 size={14} />{ago(latestWork.lastWorkedAt)}</span></div>
            <article className="home-recent-card"><button className="home-recent-cover" onClick={() => openProject(latestWork)}><Cover project={latestWork} /></button><div className="home-recent-info"><h3>{latestWork.title}</h3><p>{currentRow ? `${formatNumber(currentRow)}${t('단')}${side ? ' · ' + side : ''}` : latestWork.kind === 'chart' ? t('차트 편집') : `${formatNumber(viewer?.[viewer.activePane ?? 'primary']?.page ?? 1)} / ${formatNumber(latestWork.pageCount ?? 1)}${t('페이지')}`}</p>{mainCounter?.repeatCount ? <p>{formatNumber(mainCounter.repeatCount)}{t("번째 반복 중")}</p> : viewer?.split && <p>{t("두 영역 보기 중")}</p>}{latestWork.kind === 'document' && <p>{t('누적 작업시간')} {formatWorkTime(latestWork.totalWorkTimeMs ?? 0)}</p>}<small>{t("최근 작업 ")}{ago(latestWork.lastWorkedAt)}</small></div><button className="home-resume-button" onClick={() => resume(latestWork)}>{t("이어서 뜨기 ")}<ArrowRight size={16} /></button></article>
          </section>}
          <section className="home-section"><div className="home-section-heading"><div><p className="home-eyebrow">{t('프로젝트')}</p><h2>{t("내 프로젝트")}</h2></div><button className="home-view-all" onClick={() => navigate('/projects')}>{t("전체 보기 ")}<ArrowRight size={15} /></button></div>
            {visibleProjects.length ? <div className="home-project-grid">{visibleProjects.map((project) => <ProjectCard key={project.key} project={project} onOpen={() => openProject(project)} />)}<button className="home-project-add" onClick={() => navigate('/projects/new')}><b>＋</b><span>{t("새 프로젝트")}</span></button></div> : <div className="home-empty"><p>{t("아직 프로젝트가 없어요. 도안이나 차트를 추가해 시작해 보세요.")}</p><button className="home-new-button" onClick={() => navigate('/projects/new')}>{t("새 프로젝트 만들기 ")}<ArrowRight size={15} /></button></div>}
          </section>
          {visibleReports.length > 0 && <section className="home-section"><div className="home-section-heading"><div><p className="home-eyebrow">{t('뜨개보고서')}</p><h2>{t("최근 보고서")}</h2></div><button className="home-view-all" onClick={() => navigate('/reports')}>{t("전체 보기 ")}<ArrowRight size={15} /></button></div>
            <div className="home-report-grid">{visibleReports.map((report) => { const project = reportProject(report); if (!project) return null; return <button className="home-report-card" key={report.id} onClick={() => navigate('/report/' + report.documentId + '/' + report.id)}><span className="home-report-cover"><Cover project={project} compact /></span><span className="home-report-info"><strong>{project.title}</strong><small>{report.status === 'complete' ? t('완료') + ' · ' + formatDate(report.completedAt ?? report.updatedAt) : t('작성 중')}</small><b>{report.status === 'complete' ? t('보고서 보기') : t('계속 작성')} <ArrowRight size={13} /></b></span></button> })}</div>
          </section>}
        </div>
      </>}
    </main>
  </div>
}
