import { t } from './locales/index'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import BrandLoading from './BrandLoading'
import KnittingReport from './KnittingReport'
import { addDocumentWorkTime, getHomeProject } from './storage'
import type { DocumentWorkTimeDay, HomeProject } from './types'
import { normalizeWorkTimeDays } from './workTime'

export default function StandaloneReportRoute() {
  const { documentId = '', reportId = '' } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState<HomeProject | null>(null)
  const [workTimeDays, setWorkTimeDays] = useState<DocumentWorkTimeDay[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    void getHomeProject('document', documentId).then((saved) => {
      if (!active) return
      setProject(saved ?? null)
      setWorkTimeDays(normalizeWorkTimeDays(saved?.workTimeDays, saved?.todayWorkDate, saved?.todayWorkTimeMs))
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [documentId])
  if (loading) return <BrandLoading kind="report" requestId={'standalone-report:' + reportId} layout="screen" />
  if (!project || project.deletedAt !== null) return <main className="knitting-report-error">{t("보고서를 연결된 프로젝트에서 찾지 못했습니다.")}<button className="text-button" onClick={() => navigate('/reports')}>{t("보고서 목록으로")}</button></main>
  return <div className="standalone-report-route"><KnittingReport key={reportId} documentId={documentId} fileName={project.fileName ?? project.title} pageCount={project.pageCount ?? 1} totalWorkTimeMs={project.totalWorkTimeMs ?? 0} workTimeDays={workTimeDays} reportId={reportId} onBack={() => navigate('/reports')} onAddWorkTime={(date, elapsedMs) => addDocumentWorkTime(documentId, elapsedMs, date)} onReportChange={(nextId) => navigate('/report/' + documentId + '/' + nextId, { replace: true })} /></div>
}
