import { formatDate, formatDateTime, formatNumber, t, translateMessage } from './locales/index'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Archive, Check, FileText, RotateCcw, Trash2 } from 'lucide-react'
import AppNavigation from './AppNavigation'
import { deleteChart, deleteDocument, getHomeProject, listHomeReports, renameChart, renameDocument, saveHomeProject, updateTags, type KnittingReportSummary } from './storage'
import type { HomeProject, HomeProjectStatus } from './types'
import { formatWorkTime } from './workTime'
import './Home.css'

function DetailCover({ project }: { project: HomeProject }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!project.cover) return
    const next = URL.createObjectURL(project.cover)
    // oxlint-disable-next-line react/set-state-in-effect -- Publish the Blob lifecycle URL for the cover image.
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [project.cover])
  return project.cover && url ? <img className="home-cover-image" src={url} alt="" /> : <span className="home-cover-placeholder compact"><FileText size={22} /></span>
}

export default function ProjectDetail() {
  const { kind = 'document', id = '' } = useParams()
  const navigate = useNavigate()
  const projectKind = kind === 'chart' ? 'chart' : 'document'
  const [project, setProject] = useState<HomeProject | null>(null)
  const [reports, setReports] = useState<KnittingReportSummary[]>([])
  const [title, setTitle] = useState('')
  const [tags, setTags] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [undoProject, setUndoProject] = useState<HomeProject | null>(null)

  useEffect(() => {
    let active = true
    void Promise.all([getHomeProject(projectKind, id), listHomeReports()]).then(([saved, allReports]) => {
      if (!active) return
      setProject(saved ?? null)
      if (saved) {
        setTitle(saved.title)
        setTags(saved.tags.join(', '))
        setReports(allReports.filter((report) => report.documentId === id).sort((a, b) => b.updatedAt - a.updatedAt))
      }
    }).catch((cause) => { if (active) setError(cause instanceof Error ? translateMessage(cause.message) : t('프로젝트를 불러오지 못했습니다.')) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [projectKind, id])

  async function saveDetails() {
    if (!project || saving) return
    setSaving(true); setError('')
    try {
      if (project.kind === 'document') {
        const [renamed] = await Promise.all([renameDocument(project.entityId, title), updateTags(project.entityId, tags.split(','))])
        const next = { ...project, title: renamed.fileName.replace(/\.pdf$/i, ''), fileName: renamed.fileName, tags: [...new Set(tags.split(',').map((tag) => tag.trim()).filter(Boolean))] }
        setProject(next); setTitle(next.title); setTags(next.tags.join(', '))
      } else {
        const renamed = await renameChart(project.entityId, title)
        const next = { ...project, title: renamed.title }
        await saveHomeProject(next)
        setProject(next); setTitle(next.title)
      }
    } catch (cause) { setError(cause instanceof Error ? translateMessage(cause.message) : t('프로젝트를 저장하지 못했습니다.')) }
    finally { setSaving(false) }
  }

  async function setStatus(status: HomeProjectStatus) {
    if (!project) return
    const next = { ...project, status }
    await saveHomeProject(next); setProject(next)
  }

  async function archiveProject() {
    if (!project) return
    const next = { ...project, archivedAt: project.archivedAt === null ? Date.now() : null }
    await saveHomeProject(next); setUndoProject(project); setProject(next); setNotice(next.archivedAt ? t('프로젝트를 보관했습니다.') : t('프로젝트 보관을 해제했습니다.'))
  }

  async function moveToTrash() {
    if (!project) return
    if (!window.confirm(t('프로젝트를 휴지통으로 이동할까요? 작업과 보고서는 보관되며 휴지통에서 복구할 수 있습니다.'))) return
    const next = { ...project, deletedAt: Date.now() }
    await saveHomeProject(next)
    setUndoProject(project)
    setProject(next)
    setNotice(t('프로젝트를 휴지통으로 이동했습니다.'))
  }

  async function permanentlyDelete() {
    if (!project || !window.confirm(t('프로젝트와 연결된 모든 작업·보고서를 영구 삭제할까요? 이 작업은 되돌릴 수 없습니다.'))) return
    if (project.kind === 'chart') await deleteChart(project.entityId)
    else await deleteDocument(project.entityId)
    navigate('/projects?view=trash')
  }

  if (!project) return <div className="app-page-frame project-detail-page"><AppNavigation active="projects" /><main className="app-page-main"><button className="home-view-all" onClick={() => navigate('/projects')}><ArrowLeft size={15} />{t("프로젝트")}</button><p className="collection-empty">{error || (loading ? t('프로젝트 불러오는 중…') : t('프로젝트를 찾을 수 없습니다.'))}</p></main></div>
  const openProject = () => navigate(project.kind === 'chart' ? '/chart/' + id : '/viewer/' + id)
  const statusLabel = project.status === 'active' ? t('작업 중') : project.status === 'paused' ? t('보류') : t('완료')
  return <div className="app-page-frame project-detail-page"><AppNavigation active="projects" /><main className="app-page-main">
    <header className="collection-header"><div><button className="home-view-all" onClick={() => navigate('/projects')}><ArrowLeft size={15} />{t("전체 프로젝트")}</button><p className="home-eyebrow">{t('프로젝트')}</p><h1>{project.title}</h1><p>{project.kind === 'chart' ? t('뜨개 차트') : project.documentKind === 'photos' ? t('사진 도안') : t('PDF 도안')} · {statusLabel}{project.kind === 'document' ? ' · ' + t('누적 작업시간') + ' ' + formatWorkTime(project.totalWorkTimeMs ?? 0) : ''}</p></div></header>
    {notice && <div className="notice" role="status"><span>{notice}</span>{undoProject && <button className="notice-undo" onClick={() => void saveHomeProject(undoProject).then(() => { setProject(undoProject); setUndoProject(null); setNotice(t('변경을 되돌렸습니다.')) })}>{t("실행 취소")}</button>}<button aria-label={t("알림 닫기")} onClick={() => { setNotice(''); setUndoProject(null) }}>×</button></div>}
    <section className="detail-card"><div className="detail-title"><div className="detail-title-cover"><DetailCover project={project} /></div><div><h2>{project.title}</h2><small>{project.pageCount ? `${formatNumber(project.pageCount)}${t('페이지')} · ` : ''}{t("최근 작업 ")}{project.lastWorkedAt ? formatDateTime(project.lastWorkedAt) : t('없음')}</small></div></div>
      <div className="detail-state-row"><label htmlFor="project-status">{t("작업 상태")}</label><select id="project-status" value={project.status} onChange={(event) => void setStatus(event.currentTarget.value as HomeProjectStatus)}><option value="active">{t("작업 중")}</option><option value="paused">{t("보류")}</option><option value="completed">{t("완료")}</option></select></div>
      <div className="project-detail-edit"><label>{t("프로젝트 이름")}<input value={title} maxLength={120} onChange={(event) => setTitle(event.currentTarget.value)} /></label>{project.kind === 'document' && <label>{t("태그")}<input value={tags} onChange={(event) => setTags(event.currentTarget.value)} placeholder={t("뜨개, 가디건")} /></label>}<button className="detail-save-button" disabled={saving} onClick={() => void saveDetails()}><Check size={16} />{saving ? t('저장 중') + '…' : t('정보 저장')}</button>{error && <p role="alert">{error}</p>}</div>
      <div className="project-actions">{project.deletedAt === null && <button className="primary" onClick={openProject}>{project.kind === 'chart' ? t('차트 편집') : t('이어서 뜨기 ')}</button>}{project.kind === 'document' && <button onClick={() => navigate('/reports')}>{t("보고서 목록")}</button>}{project.deletedAt === null ? <><button onClick={() => void archiveProject()}><Archive size={15} />{project.archivedAt ? t('보관 해제') : t('보관')}</button><button onClick={() => void moveToTrash()}><Trash2 size={15} />{t("휴지통으로")}</button></> : <><button onClick={() => void saveHomeProject({ ...project, deletedAt: null }).then(() => setProject((current) => current ? { ...current, deletedAt: null } : current))}><RotateCcw size={15} />{t("복구")}</button><button onClick={() => void permanentlyDelete()}><Trash2 size={15} />{t("영구 삭제")}</button></>}</div>
    </section>
    {project.kind === 'document' && reports.length > 0 && <section className="project-report-section"><div className="home-section-heading"><h2>{t("이 프로젝트의 보고서")}</h2></div><div className="report-list">{reports.map((report) => <button className="home-report-card" key={report.id} onClick={() => navigate('/report/' + id + '/' + report.id)}><span className="home-report-cover"><DetailCover project={project} /></span><span className="home-report-info"><strong>{report.title || project.title}</strong><small>{report.status === 'complete' ? t('완료') + ' · ' + formatDate(report.completedAt ?? report.updatedAt) : t('작성 중')}</small><b>{report.status === 'complete' ? t('보고서 보기') : t('계속 작성')}</b></span></button>)}</div></section>}
  </main></div>
}
