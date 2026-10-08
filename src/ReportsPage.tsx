import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText } from 'lucide-react'
import AppNavigation from './AppNavigation'
import { listHomeProjects, listHomeReports, type KnittingReportSummary } from './storage'
import type { HomeProject } from './types'
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
  return project.cover && url ? <img className="home-cover-image" src={url} alt="" /> : <span className="home-cover-placeholder compact"><FileText size={18} /></span>
}

export default function ReportsPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<{ report: KnittingReportSummary; project: HomeProject }[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    void Promise.all([listHomeProjects(), listHomeReports()]).then(([projects, reports]) => {
      if (!active) return
      const byKey = new Map(projects.map((project) => [project.key, project]))
      setItems(reports.filter((report) => {
        const project = byKey.get('document:' + report.documentId)
        return project && project.deletedAt === null && project.archivedAt === null
      }).map((report) => ({ report, project: byKey.get('document:' + report.documentId)! })).sort((a, b) => b.report.updatedAt - a.report.updatedAt))
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  return <div className="app-page-frame reports-page"><AppNavigation active="reports" /><main className="app-page-main">
    <header className="collection-header"><div><p className="home-eyebrow">YOUR REPORTS</p><h1>뜨개보고서</h1><p>작성 중인 기록과 완성한 프로젝트 보고서를 확인해요.</p></div></header>
    {loading ? <p className="collection-empty">보고서를 불러오는 중…</p> : items.length ? <section className="report-list">{items.map(({ report, project }) => <button className="home-report-card" key={report.id} onClick={() => navigate('/report/' + report.documentId + '/' + report.id)}><span className="home-report-cover"><ReportCover project={project} /></span><span className="home-report-info"><strong>{project.title}</strong><small>{report.status === 'complete' ? `완료 · ${new Date(report.completedAt ?? report.updatedAt).toLocaleDateString('ko-KR')}` : '작성 중'}</small><b>{report.status === 'complete' ? '보고서 보기' : '계속 작성'}</b></span></button>)}</section> : <p className="collection-empty">아직 보고서가 없습니다. 프로젝트에서 뜨개보고서를 작성할 수 있어요.</p>}
  </main></div>
}
