import { t } from './locales/index'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import BrandLoading from './BrandLoading'
import KnittingReport from './KnittingReport'
import { getHomeProject } from './storage'
import type { HomeProject } from './types'

export default function StandaloneReportRoute() {
  const { documentId = '', reportId = '' } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState<HomeProject | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    void getHomeProject('document', documentId).then((saved) => { if (active) setProject(saved ?? null) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [documentId])
  if (loading) return <BrandLoading kind="report" requestId={'standalone-report:' + reportId} layout="screen" />
  if (!project || project.deletedAt !== null) return <main className="knitting-report-error">{t("보고서를 연결된 프로젝트에서 찾지 못했습니다.")}<button className="text-button" onClick={() => navigate('/reports')}>{t("보고서 목록으로")}</button></main>
  return <KnittingReport key={reportId} documentId={documentId} fileName={project.fileName ?? project.title} pageCount={project.pageCount ?? 1} totalWorkTimeMs={project.totalWorkTimeMs ?? 0} reportId={reportId} onBack={() => navigate('/reports')} />
}
