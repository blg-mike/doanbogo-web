import { formatDate, formatNumber, languageNames, reloadLanguagePreference, t, translateMessage, type LocaleKey, useLanguagePreference } from './locales/index'
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BookOpen, Camera, Check, ChevronDown, ChevronUp, FilePlus2, FolderPlus, Grid2X2, Grid3X3, Images, List, MoreHorizontal, Search, Settings, SlidersHorizontal, X } from 'lucide-react'
import yyLogo from './assets/yy-logo.png'
import { createWorkspaceBackup, readWorkspaceBackup } from './backup'
import { addDocument, appendPhotoPages, createPhotoFolder, duplicateChart, duplicateDocument, getDocument, getHomeProject, getPhotoPage, getPreference, getStorageMode, importWorkspaceData, isQuotaError, listCharts, listDocuments, listHomeProjects, markChartOpened, renameDocument, saveChart, saveHomeProject, savePreference, storageEstimate, subscribeStorageMode, updateTags, type StorageMode } from './storage'
import { inspectPdf, pdfErrorMessage } from './pdf'
import { preparePhotoFile, sortPhotoFiles } from './photoImages'
import { chartSvg } from './charts'
import type { ChartDocument, DocumentRecord, HomeProject, SortMode, ViewMode } from './types'
import { formatWorkTime } from './workTime'
import AppNavigation from './AppNavigation'
import './Chart.css'

const sortLabels: Record<SortMode, LocaleKey> = { recent: '최근 실행순', name: '이름순', upload: '업로드순' }

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return formatNumber(Math.max(1, Math.round(bytes / 1024))) + ' KB'
  return formatNumber(bytes / (1024 * 1024), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' MB'
}

function CoverImage({ blob }: { blob: Blob }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    const nextUrl = URL.createObjectURL(blob)
    // oxlint-disable-next-line react/set-state-in-effect -- Keep the temporary URL in sync with this Blob.
    setUrl(nextUrl)
    return () => URL.revokeObjectURL(nextUrl)
  }, [blob])
  return url ? <img className="cover-image" src={url} alt="" /> : <span className="cover-placeholder"><BookOpen size={32} /></span>
}

function PhotoCover({ documentId }: { documentId: string }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    let active = true
    let nextUrl = ''
    void getPhotoPage(documentId, 1).then((photo) => {
      if (!photo || !active) return
      nextUrl = URL.createObjectURL(photo.blob)
      setUrl(nextUrl)
    }).catch(() => {})
    return () => { active = false; if (nextUrl) URL.revokeObjectURL(nextUrl) }
  }, [documentId])
  return url ? <img className="cover-image" src={url} alt="" /> : <span className="cover-placeholder"><Images size={32} /></span>
}

function ChartPreview({ chart }: { chart: ChartDocument }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    const nextUrl = URL.createObjectURL(new Blob([chartSvg(chart)], { type: 'image/svg+xml' }))
    // oxlint-disable-next-line react/set-state-in-effect -- Keep the preview URL in sync with its saved chart.
    setUrl(nextUrl)
    return () => URL.revokeObjectURL(nextUrl)
  }, [chart])
  return url ? <img className="chart-preview-image" src={url} alt="" /> : <span className="cover-placeholder"><Grid3X3 size={32} /></span>
}

type LibraryItem = { type: 'document'; record: DocumentRecord } | { type: 'chart'; record: ChartDocument }
type PhotoDraftItem = { id: string; file: File }

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-heading"><h2>{title}</h2><button className="icon-button" aria-label={t("닫기")} onClick={onClose}><X size={20} /></button></div>
        {children}
      </section>
    </div>
  )
}

export default function Workspace() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { preference: languagePreference, setPreference: setLanguagePreference } = useLanguagePreference()
  const fileInput = useRef<HTMLInputElement>(null)
  const photoCameraInput = useRef<HTMLInputElement>(null)
  const photoFilesInput = useRef<HTMLInputElement>(null)
  const photoFolderInput = useRef<HTMLInputElement>(null)
  const backupInput = useRef<HTMLInputElement>(null)
  const importingRef = useRef(false)
  const [documents, setDocuments] = useState<LibraryItem[]>([])
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortMode>('recent')
  const [view, setView] = useState<ViewMode>('cover')
  const [selected, setSelected] = useState<DocumentRecord | null>(null)
  const [selectedChart, setSelectedChart] = useState<ChartDocument | null>(null)
  const [chartTitleDraft, setChartTitleDraft] = useState('')
  const [fileNameDraft, setFileNameDraft] = useState('')
  const [renameError, setRenameError] = useState('')
  const [dialog, setDialog] = useState<'menu' | 'rename' | 'tags' | 'delete' | 'photos' | 'chart-menu' | 'chart-delete' | 'chart-rename' | 'settings' | null>(null)
  const [photoMode, setPhotoMode] = useState<'new' | 'append'>('new')
  const [photoFolderName, setPhotoFolderName] = useState('')
  const [photoDraft, setPhotoDraft] = useState<PhotoDraftItem[]>([])
  const [photoError, setPhotoError] = useState('')
  const [tagDraft, setTagDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState('')
  const [estimate, setEstimate] = useState<{ usage?: number; quota?: number } | null>(null)
  const [storageMode, setStorageMode] = useState<StorageMode>('checking')
  const [undoProject, setUndoProject] = useState<HomeProject | null>(null)
  const collectionMode = searchParams.get('view') === 'archived' || searchParams.get('view') === 'trash' ? searchParams.get('view') : 'active'
  const openDocument = (record: DocumentRecord) => navigate(
    collectionMode === 'active' && record.kind !== 'photos'
      ? '/viewer/' + record.id
      : '/projects/document/' + record.id,
  )
  const documentAction = (record: DocumentRecord) => collectionMode === 'active' && record.kind !== 'photos' ? '뷰어 열기' : '상세'

  const refresh = useCallback(async () => {
    const [pdfs, charts, projects] = await Promise.all([listDocuments(sort, query), listCharts(sort, query), listHomeProjects()])
    const byKey = new Map(projects.map((project) => [project.key, project]))
    const visible = (project: HomeProject | undefined) => Boolean(project && (collectionMode === 'trash' ? project.deletedAt !== null : collectionMode === 'archived' ? project.deletedAt === null && project.archivedAt !== null : project.deletedAt === null && project.archivedAt === null))
    const items: LibraryItem[] = [...pdfs.filter((record) => visible(byKey.get('document:' + record.id))).map((record) => ({ type: 'document' as const, record })), ...charts.filter((record) => visible(byKey.get('chart:' + record.id))).map((record) => ({ type: 'chart' as const, record }))]
    const itemName = (item: LibraryItem) => item.type === 'document' ? item.record.fileName : item.record.title
    const itemOpened = (item: LibraryItem) => item.type === 'document'
      ? item.record.lastOpenedAt ?? item.record.createdAt
      : item.record.lastOpenedAt ?? item.record.updatedAt
    items.sort((a, b) => {
      if (sort === 'name') return itemName(a).localeCompare(itemName(b), 'ko')
      if (sort === 'upload') return b.record.createdAt - a.record.createdAt
      return itemOpened(b) - itemOpened(a)
    })
    setDocuments(items)
  }, [sort, query, collectionMode])

  // oxlint-disable-next-line react/set-state-in-effect -- Reflect the IndexedDB result when the search or sort changes.
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    let active = true
    const unsubscribe = subscribeStorageMode(setStorageMode)
    void getStorageMode().then((mode) => { if (active) setStorageMode(mode) })
    return () => { active = false; unsubscribe() }
  }, [])
  useEffect(() => {
    const add = searchParams.get('add')
    const settings = searchParams.get('settings')
    if (add || settings) {
      setSearchParams({}, { replace: true })
      if (add === 'pdf') window.setTimeout(() => fileInput.current?.click(), 80)
      else if (add === 'photos') startPhotoFolder()
      else if (settings) void showSettings()
    }
  }, [searchParams, setSearchParams])
  useEffect(() => {
    void (async () => {
      const [savedSort, savedView] = await Promise.all([getPreference('sort'), getPreference('view')])
      if (savedSort === 'recent' || savedSort === 'name' || savedSort === 'upload') setSort(savedSort)
      if (savedView === 'cover' || savedView === 'list') setView(savedView)
    })()
  }, [])

  async function importFiles(files: FileList | null) {
    if (!files?.length || importingRef.current) return
    importingRef.current = true
    setLoading(true)
    setNotice('')
    let added = 0
    const failures: string[] = []
    try {
      for (const file of Array.from(files)) {
        if (file.size === 0) {
          failures.push(file.name + ': ' + t('파일이 비어 있습니다.'))
          continue
        }
        let inspected: Awaited<ReturnType<typeof inspectPdf>>
        try {
          inspected = await inspectPdf(file)
        } catch (error) {
          failures.push(file.name + ': ' + translateMessage(pdfErrorMessage(error)))
          continue
        }
        const record: DocumentRecord = {
          id: crypto.randomUUID(),
          fileName: file.name,
          size: file.size,
          pageCount: inspected.pageCount,
          createdAt: Date.now(),
          lastOpenedAt: null,
          tags: [],
          kind: 'pdf',
          pdf: file.slice(0, file.size, 'application/pdf'),
          cover: inspected.cover,
        }
        try {
          await addDocument(record)
          void import('./pdfRecognition').then(({ enqueuePdfRecognition }) => enqueuePdfRecognition(record)).catch((error: unknown) => {
            console.warn('[PDF] Background link analysis could not start.', error)
          })
          added++
        } catch (error) {
          if (isQuotaError(error)) throw error
          failures.push(file.name + ': ' + t('브라우저 저장소에 기록하지 못했습니다.'))
        }
      }
      await refresh()
      if (failures.length) {
        const summary = added ? t('{count}개 추가 완료. ', { count: formatNumber(added) }) : ''
        setNotice(summary + failures[0] + (failures.length > 1 ? t(' 외 {count}개 파일을 추가하지 못했습니다.', { count: formatNumber(failures.length - 1) }) : ''))
      } else {
        setNotice(added === 1 ? t('PDF를 추가했습니다.') : t('PDF {count}개를 추가했습니다.', { count: formatNumber(added) }))
      }
    } catch (error) {
      await refresh()
      if (isQuotaError(error)) setNotice(t('브라우저 저장 한도를 초과했습니다. 일부 자료를 삭제하거나 다른 브라우저에서 다시 시도해 주세요.'))
      else setNotice(error instanceof Error ? translateMessage(error.message) : t('PDF를 추가하지 못했습니다.'))
    } finally {
      setLoading(false)
      importingRef.current = false
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  function startPhotoFolder() {
    setSelected(null)
    setPhotoMode('new')
    setPhotoFolderName(t('사진 도안 만들기') + ' ' + formatDate(Date.now()))
    setPhotoDraft([])
    setPhotoError('')
    setDialog('photos')
  }

  function startAddingPhotos(document: DocumentRecord) {
    setSelected(document)
    setPhotoMode('append')
    setPhotoFolderName(document.fileName)
    setPhotoDraft([])
    setPhotoError('')
    setDialog('photos')
  }

  function addPhotoFiles(files: FileList | null) {
    if (!files?.length) return
    const sorted = sortPhotoFiles(Array.from(files))
    setPhotoDraft((current) => [...current, ...sorted.map((file) => ({ id: crypto.randomUUID(), file }))])
    setPhotoError('')
  }

  function movePhotoDraft(index: number, offset: number) {
    setPhotoDraft((current) => {
      const destination = index + offset
      if (destination < 0 || destination >= current.length) return current
      const updated = [...current]
      ;[updated[index], updated[destination]] = [updated[destination], updated[index]]
      return updated
    })
  }

  async function savePhotos(event: FormEvent) {
    event.preventDefault()
    if (!photoDraft.length || importingRef.current) return
    importingRef.current = true
    setLoading(true)
    setPhotoError('')
    try {
      const prepared = []
      for (const item of photoDraft) prepared.push(await preparePhotoFile(item.file))
      let saved: DocumentRecord
      if (photoMode === 'new') saved = await createPhotoFolder(photoFolderName, prepared)
      else if (selected?.kind === 'photos') {
        await appendPhotoPages(selected.id, prepared)
        saved = await getDocument(selected.id) ?? selected
      } else throw new Error('사진 폴더를 찾을 수 없습니다.')
      void import('./pdfRecognition').then(({ enqueuePdfRecognition }) => enqueuePdfRecognition(saved, null, true)).catch(() => {})
      await refresh()
      setDialog(null)
      setSelected(null)
      setPhotoDraft([])
      setNotice(photoMode === 'new' ? t('사진 도안 폴더를 추가했습니다.') : t('사진 페이지를 추가했습니다.'))
    } catch (error) {
      setPhotoError(isQuotaError(error)
        ? t('브라우저 저장 공간이 부족해 사진을 저장하지 못했습니다. 저장 공간을 확보한 뒤 다시 시도해 주세요.')
        : error instanceof Error ? translateMessage(error.message) : t('사진을 저장하지 못했습니다.'))
    } finally {
      setLoading(false)
      importingRef.current = false
      if (photoCameraInput.current) photoCameraInput.current.value = ''
      if (photoFilesInput.current) photoFilesInput.current.value = ''
      if (photoFolderInput.current) photoFolderInput.current.value = ''
    }
  }

  async function changeSort(value: SortMode) {
    setSort(value)
    await savePreference('sort', value)
  }

  async function changeView(value: ViewMode) {
    setView(value)
    await savePreference('view', value)
  }

  function openMenu(document: DocumentRecord) {
    setSelected(document)
    setDialog('menu')
  }

  function openChartMenu(chart: ChartDocument) {
    setSelectedChart(chart)
    setDialog('chart-menu')
  }

  async function openChart(chart: ChartDocument) {
    await markChartOpened(chart.id)
    navigate('/chart/' + chart.id)
  }

  async function saveTagDraft(event: FormEvent) {
    event.preventDefault()
    if (!selected) return
    await updateTags(selected.id, tagDraft.split(','))
    setDialog(null)
    await refresh()
  }

  async function saveDocumentName(event: FormEvent) {
    event.preventDefault()
    if (!selected) return
    try {
      await renameDocument(selected.id, fileNameDraft)
      setDialog(null)
      setSelected(null)
      await refresh()
    } catch (error) {
      setRenameError(error instanceof Error ? translateMessage(error.message) : t('이름을 변경하지 못했습니다.'))
    }
  }

  async function saveChartTitle(event: FormEvent) {
    event.preventDefault()
    if (!selectedChart) return
    await saveChart({ ...selectedChart, title: chartTitleDraft.trim() || '제목 없음' })
    setDialog(null)
    await refresh()
  }

  async function shareOrDownload(document: DocumentRecord) {
    if (!document.pdf || document.kind === 'photos') throw new Error('사진 폴더에는 원본 PDF가 없습니다.')
    const file = new File([document.pdf], document.fileName, { type: 'application/pdf' })
    if (navigator.canShare?.({ files: [file] }) && navigator.share) {
      await navigator.share({ files: [file], title: document.fileName })
      return
    }
    const url = URL.createObjectURL(document.pdf)
    const anchor = window.document.createElement('a')
    anchor.href = url
    anchor.download = document.fileName
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function showSettings() {
    setEstimate(await storageEstimate())
    setDialog('settings')
  }

  async function exportWorkspace() {
    try {
      const blob = await createWorkspaceBackup()
      const url = URL.createObjectURL(blob)
      const anchor = window.document.createElement('a')
      anchor.href = url
      anchor.download = '도안보고-작업백업-' + new Date().toISOString().slice(0, 10) + '.doanbogo'
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setDialog(null)
      setNotice(t('작업 파일을 내보냈습니다.'))
    } catch (error) {
      setNotice(error instanceof Error ? translateMessage(error.message) : t('작업 파일을 내보내지 못했습니다.'))
    }
  }

  async function importWorkspace(file: File | undefined) {
    if (!file || importingRef.current) return
    importingRef.current = true
    setLoading(true)
    setNotice('')
    try {
      const data = await readWorkspaceBackup(file)
      const importedCount = await importWorkspaceData(data)
      await reloadLanguagePreference()
      const [savedSort, savedView] = await Promise.all([getPreference('sort'), getPreference('view')])
      if (savedSort === 'recent' || savedSort === 'name' || savedSort === 'upload') setSort(savedSort)
      if (savedView === 'cover' || savedView === 'list') setView(savedView)
      await refresh()
      setDialog(null)
      setNotice(t('도안 {count}개를 가져왔습니다.', { count: formatNumber(importedCount) }))
    } catch (error) {
      setNotice(isQuotaError(error) ? t('저장 공간이 부족해 작업 파일을 가져오지 못했습니다. 일부 자료를 삭제하거나 임시 저장을 사용할 수 있는 portable 실행 파일을 이용해 주세요.') : error instanceof Error ? translateMessage(error.message) : t('작업 파일을 가져오지 못했습니다.'))
    } finally {
      setLoading(false)
      importingRef.current = false
      if (backupInput.current) backupInput.current.value = ''
    }
  }

  return (
    <div className="workspace-app-frame"><AppNavigation active="projects" /><main className="workspace-shell">
      <header className="topbar">
        <a className="brand" href="#/" aria-label={t("도안보고 홈")}><span className="brand-lockup"><img src={yyLogo} alt={t("도안보고 로고")} /><small>{t("YY공동제작")}</small></span><strong>{t("도안보고")}</strong></a>
        <div className="topbar-actions">
          <label className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("이름 또는 태그 검색")} aria-label={t("이름 또는 태그 검색")} />{query && <button type="button" className="search-clear" aria-label={t("검색어 지우기")} onClick={() => setQuery('')}><X size={15} /></button>}</label>
          <button className="icon-button" aria-label={t("설정")} onClick={() => void showSettings()}><Settings size={19} /></button>
        </div>
      </header>
      <section className="workspace-content">
        <div className="welcome-row"><div><p className="eyebrow">{t('프로젝트')}</p><h1>{collectionMode === 'trash' ? t('휴지통') : collectionMode === 'archived' ? t('보관한 프로젝트') : t('내 프로젝트')}</h1><p className="welcome-copy">{t("도안과 차트, 작업 상태를 한곳에서 관리해요.")}</p></div><div className="document-count">{formatNumber(documents.length)}<span>{t("개 프로젝트")}</span></div></div>
        <nav className="project-filter-tabs" aria-label={t("프로젝트 보기")}><button className={collectionMode === 'active' ? 'active' : ''} onClick={() => setSearchParams({})}>{t("전체")}</button><button className={collectionMode === 'archived' ? 'active' : ''} onClick={() => setSearchParams({ view: 'archived' })}>{t("보관")}</button><button className={collectionMode === 'trash' ? 'active' : ''} onClick={() => setSearchParams({ view: 'trash' })}>{t("휴지통")}</button></nav>
        <div className="toolbar">
          <input ref={fileInput} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(event) => void importFiles(event.currentTarget.files)} />
          <input ref={photoCameraInput} type="file" accept="image/*" capture="environment" hidden onChange={(event) => { addPhotoFiles(event.currentTarget.files); event.currentTarget.value = '' }} />
          <input ref={photoFilesInput} type="file" accept="image/*" multiple hidden onChange={(event) => { addPhotoFiles(event.currentTarget.files); event.currentTarget.value = '' }} />
          <input ref={photoFolderInput} type="file" accept="image/*" multiple hidden onChange={(event) => { addPhotoFiles(event.currentTarget.files); event.currentTarget.value = '' }} />
          <input ref={backupInput} type="file" accept=".doanbogo,application/zip" hidden onChange={(event) => void importWorkspace(event.currentTarget.files?.[0])} />
          <button className="primary-button" onClick={() => fileInput.current?.click()} disabled={loading}><FilePlus2 size={18} />{loading ? t('추가 중…') : t('PDF 추가')}</button>
          <button className="secondary-button" onClick={startPhotoFolder} disabled={loading}><Images size={18} />{t("사진 추가")}</button>
          <button className="secondary-button" onClick={() => navigate('/charts/new')} disabled={loading}><Grid3X3 size={18} />{t("차트 만들기")}</button>
          <label className="sort-select"><SlidersHorizontal size={16} /><span className="sr-only">{t("정렬")}</span><select value={sort} onChange={(event) => void changeSort(event.target.value as SortMode)}>{Object.entries(sortLabels).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label>
          <div className="view-toggle" aria-label={t("보기 방식")}><button className={view === 'cover' ? 'active' : ''} aria-label={t("표지 보기")} onClick={() => void changeView('cover')}><Grid2X2 size={17} /></button><button className={view === 'list' ? 'active' : ''} aria-label={t("목록 보기")} onClick={() => void changeView('list')}><List size={18} /></button></div>
        </div>
        {notice && <div className="notice" role="status"><span>{notice}</span>{undoProject && <button className="notice-undo" onClick={() => void saveHomeProject({ ...undoProject, deletedAt: null }).then(() => { setUndoProject(null); setNotice(t('프로젝트를 복구했습니다.')); void refresh() })}>{t("실행 취소")}</button>}<button aria-label={t("알림 닫기")} onClick={() => { setNotice(''); setUndoProject(null) }}><X size={16} /></button></div>}
        {documents.length === 0 ? (
          <section className="empty-state"><div className="empty-icon"><FilePlus2 size={27} /></div><h2>{query ? t('검색 결과가 없습니다') : t('아직 도안이 없습니다')}</h2><p>{query ? t('이름이나 태그를 바꿔서 다시 검색해 보세요.') : t('PDF 또는 사진을 추가해 이곳에 모아 둘 수 있어요.')}</p>{!query && <div className="empty-actions"><button className="primary-button" onClick={() => fileInput.current?.click()}><FilePlus2 size={18} />{t("첫 PDF 추가하기")}</button><button className="secondary-button" onClick={startPhotoFolder}><Images size={18} />{t("사진 추가")}</button></div>}</section>
        ) : (
          <section className={view === 'cover' ? 'document-grid' : 'document-list'} aria-label={t("도안 목록")}>
            {documents.map((item) => item.type === 'document' ? (
              <article key={'document-' + item.record.id} className={'document-card ' + (view === 'list' ? 'list-card' : '')}>
                <button className="cover-button" onClick={() => openDocument(item.record)} aria-label={item.record.fileName + ' ' + documentAction(item.record)}>
                  {item.record.kind === 'photos' ? item.record.cover ? <CoverImage blob={item.record.cover} /> : <PhotoCover documentId={item.record.id} /> : item.record.cover ? <CoverImage blob={item.record.cover} /> : <span className="cover-placeholder"><BookOpen size={32} /></span>}
                  <span className="pdf-label">{item.record.kind === 'photos' ? t('사진') : 'PDF'}</span>
                </button>
                <div className="document-info">
                  <div className="card-title-line"><button className="card-title" onClick={() => openDocument(item.record)} title={item.record.fileName}>{item.record.kind === 'photos' ? item.record.fileName : item.record.fileName.replace(/\.pdf$/i, '')}</button><button className="card-more" aria-label={t('{name} 메뉴', { name: item.record.fileName })} onClick={() => openMenu(item.record)}><MoreHorizontal size={20} /></button></div>
                  <p className="document-meta">{item.record.pageCount}{t("페이지 ")}<span>·</span> {formatSize(item.record.size)}<span> · </span>{t('누적 작업시간')} {formatWorkTime(item.record.totalWorkTimeMs ?? 0)}</p>
                  {item.record.tags.length > 0 && <div className="tag-list">{item.record.tags.map((tag) => <span className="tag-chip" key={tag}>{tag}</span>)}</div>}
                </div>
              </article>
            ) : (
              <article key={'chart-' + item.record.id} className={'document-card chart-document-card ' + (view === 'list' ? 'list-card' : '')}>
                <button className="cover-button chart-cover-button" onClick={() => navigate('/projects/chart/' + item.record.id)} aria-label={t('{name} 상세', { name: item.record.title })}>
                  <ChartPreview chart={item.record} /><span className="chart-kind-label">{item.record.craft === 'knitting' ? t('대바늘 · 색상') : t('코바늘 · 자유 형식')}</span>
                </button>
                <div className="document-info">
                  <div className="card-title-line"><button className="card-title" onClick={() => navigate('/projects/chart/' + item.record.id)} title={item.record.title}>{item.record.title}</button><button className="card-more" aria-label={t('{name} 메뉴', { name: item.record.title })} onClick={() => openChartMenu(item.record)}><MoreHorizontal size={20} /></button></div>
                  <p className="document-meta">{item.record.craft === 'knitting' ? `${item.record.width}코 × ${item.record.height}단` : `${item.record.objects.length}개 기호`} <span>·</span>{t(" 차트")}</p>
                </div>
              </article>
            ))}
          </section>
        )}
        <footer className="workspace-footer">
          <span>{storageMode === 'persistent' ? t('PDF, 사진과 차트가 이 브라우저에 자동 저장됩니다.') : storageMode === 'temporary' ? t('임시 저장 중 · 종료 전에 작업 파일로 저장하세요.') : t('저장 방식을 확인하고 있습니다…')}</span>
          {storageMode === 'temporary' && <button className="text-control" onClick={() => void exportWorkspace()}>{t("작업 파일 저장")}</button>}
        </footer>
      </section>

      {dialog === 'menu' && selected && <Modal title={t("도안 관리")} onClose={() => setDialog(null)}><div className="action-list">
        <button onClick={() => { setFileNameDraft(selected.kind === 'photos' ? selected.fileName : selected.fileName.replace(/\.pdf$/i, '')); setRenameError(''); setDialog('rename') }}>{t("이름 변경")}<span>{t("워크스페이스와 뷰어에 표시되는 이름")}</span></button>
        {selected.kind === 'photos' && <button onClick={() => startAddingPhotos(selected)}>{t("사진 추가")}<span>{t("이 폴더의 마지막 페이지 뒤에 사진을 추가합니다")}</span></button>}
        <button onClick={() => { setTagDraft(selected.tags.join(', ')); setDialog('tags') }}>{t("태그 편집")}<span>{t("파일명 또는 태그 검색에 사용됩니다")}</span></button>
        <button onClick={() => void duplicateDocument(selected.id).then(() => { setDialog(null); void refresh(); setNotice(t('도안 사본을 만들었습니다.')) }).catch(() => setNotice(t('도안 사본을 만들지 못했습니다.')))}>{t("도안 복사")}<span>{t("북마크와 작업 위치는 복사하지 않습니다")}</span></button>
        {selected.kind !== 'photos' && <button onClick={() => void shareOrDownload(selected).catch(() => setNotice(t('PDF를 공유하거나 다운로드하지 못했습니다.')))}>{t("원본 PDF 공유 / 다운로드")}<span>{t("지원하지 않는 기기에서는 파일을 다운로드합니다")}</span></button>}
        <button className="danger-action" onClick={() => setDialog('delete')}>{t("휴지통으로 이동")}<span>{t("프로젝트와 작업 기록은 휴지통에서 복구할 수 있습니다")}</span></button>
      </div></Modal>}
      {dialog === 'rename' && selected && <Modal title={selected.kind === 'photos' ? t('사진 폴더 이름 변경') : t('PDF 이름 변경')} onClose={() => setDialog('menu')}><form className="modal-form" onSubmit={(event) => void saveDocumentName(event)}><label htmlFor="pdf-name-draft">{selected.kind === 'photos' ? t('폴더 이름') : t('PDF 이름')}</label><input id="pdf-name-draft" autoFocus required maxLength={120} value={fileNameDraft} onChange={(event) => setFileNameDraft(event.currentTarget.value)} />{selected.kind !== 'photos' && <p className="modal-copy">{t(".pdf 확장자는 저장할 때 자동으로 붙습니다.")}</p>}{renameError && <p className="rename-error" role="alert">{renameError}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setDialog('menu')}>{t("취소")}</button><button className="primary-button" type="submit"><Check size={17} />{t("저장")}</button></div></form></Modal>}
      {dialog === 'photos' && <Modal title={photoMode === 'new' ? t('사진 도안 만들기') : t('사진 추가')} onClose={() => { setDialog(photoMode === 'append' ? 'menu' : null); setPhotoDraft([]); setPhotoError('') }}><form className="modal-form photo-import-form" onSubmit={(event) => void savePhotos(event)}>
        {photoMode === 'new' && <><label htmlFor="photo-folder-name">{t("폴더 이름")}</label><input id="photo-folder-name" required maxLength={120} value={photoFolderName} onChange={(event) => setPhotoFolderName(event.currentTarget.value)} /></>}
        <p className="modal-copy">{photoDraft.length ? `${photoDraft.length}장 선택됨 · 촬영 순서대로 페이지가 만들어집니다. 더 촬영하거나 사진을 선택한 뒤 완료하세요.` : t('사진을 찍거나 기존 사진 여러 장 또는 폴더를 선택하세요.')}</p>
        <div className="photo-import-actions"><button type="button" className="secondary-button" onClick={() => photoCameraInput.current?.click()}><Camera size={16} />{photoDraft.length ? t('계속 촬영') : t('사진 찍기')}</button><button type="button" className="secondary-button" onClick={() => photoFilesInput.current?.click()}><Images size={16} />{t("사진 선택")}</button><button type="button" className="secondary-button" onClick={() => { photoFolderInput.current?.setAttribute('webkitdirectory', ''); photoFolderInput.current?.click() }}><FolderPlus size={16} />{t("폴더 선택")}</button></div>
        {photoDraft.length > 0 && <ol className="photo-draft-list">{photoDraft.map((item, index) => <li key={item.id}><span><b>{index + 1}</b>{item.file.name}</span><div><button type="button" aria-label={`${item.file.name} 위로 이동`} title={t("위로")} disabled={index === 0} onClick={() => movePhotoDraft(index, -1)}><ChevronUp size={15} /></button><button type="button" aria-label={`${item.file.name} 아래로 이동`} title={t("아래로")} disabled={index === photoDraft.length - 1} onClick={() => movePhotoDraft(index, 1)}><ChevronDown size={15} /></button><button type="button" aria-label={`${item.file.name} 제거`} title={t("제거")} onClick={() => setPhotoDraft((current) => current.filter((photo) => photo.id !== item.id))}><X size={15} /></button></div></li>)}</ol>}
        {photoError && <p className="rename-error" role="alert">{photoError}</p>}
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => { setDialog(photoMode === 'append' ? 'menu' : null); setPhotoDraft([]); setPhotoError('') }}>{t("취소")}</button><button className="primary-button" type="submit" disabled={!photoDraft.length || loading}>{loading ? t('사진을 준비하고 있습니다…') : photoMode === 'new' ? t('완료하고 폴더 만들기') : t('사진 추가 완료')}</button></div>
      </form></Modal>}
      {dialog === 'chart-menu' && selectedChart && <Modal title={t("차트 관리")} onClose={() => setDialog(null)}><div className="action-list">
        <button onClick={() => { setChartTitleDraft(selectedChart.title); setDialog('chart-rename') }}>{t("이름 변경")}<span>{t("워크스페이스 카드에 표시되는 이름")}</span></button>
        <button onClick={() => void duplicateChart(selectedChart.id).then(() => { setDialog(null); void refresh(); setNotice(t('차트 사본을 만들었습니다.')) }).catch(() => setNotice(t('차트 사본을 만들지 못했습니다.')))}>{t("차트 복사")}<span>{t("색칠, 기호와 레이어를 모두 복사합니다")}</span></button>
        <button onClick={() => { setDialog(null); void openChart(selectedChart) }}>{t("차트 편집")}<span>{selectedChart.craft === 'knitting' ? t('대바늘 색상 차트') : t('코바늘 Free Form 차트')}</span></button>
        <button className="danger-action" onClick={() => setDialog('chart-delete')}>{t("휴지통으로 이동")}<span>{t("차트는 휴지통에서 복구할 수 있습니다")}</span></button>
      </div></Modal>}
      {dialog === 'chart-rename' && selectedChart && <Modal title={t("차트 이름 변경")} onClose={() => setDialog(null)}><form className="modal-form" onSubmit={(event) => void saveChartTitle(event)}><label htmlFor="chart-title-draft">{t("차트 이름")}</label><input id="chart-title-draft" autoFocus maxLength={120} value={chartTitleDraft} onChange={(event) => setChartTitleDraft(event.target.value)} /><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setDialog('chart-menu')}>{t("취소")}</button><button className="primary-button" type="submit"><Check size={17} />{t("저장")}</button></div></form></Modal>}
      {dialog === 'chart-delete' && selectedChart && <Modal title={t("차트를 휴지통으로 이동할까요?")} onClose={() => setDialog(null)}><div className="modal-form"><p className="modal-copy"><strong>{selectedChart.title}</strong>{t("과 편집 내용은 보존되며 휴지통에서 복구할 수 있습니다.")}</p><div className="modal-actions"><button className="secondary-button" onClick={() => setDialog('chart-menu')}>{t("취소")}</button><button className="danger-button" onClick={() => void getHomeProject('chart', selectedChart.id).then((project) => { if (!project) return; const trashed = { ...project, deletedAt: Date.now() }; setUndoProject(trashed); return saveHomeProject(trashed) }).then(() => { setNotice(t('차트를 휴지통으로 옮겼습니다.')); setDialog(null); setSelectedChart(null); void refresh() })}>{t("휴지통으로")}</button></div></div></Modal>}
      {dialog === 'tags' && selected && <Modal title={t("태그 편집")} onClose={() => setDialog(null)}><form className="modal-form" onSubmit={(event) => void saveTagDraft(event)}><label htmlFor="tag-draft">{t("쉼표로 구분해 입력")}</label><input id="tag-draft" autoFocus value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} placeholder={t("예: 스웨터, 겨울, 선물")} /><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setDialog('menu')}>{t("취소")}</button><button className="primary-button" type="submit"><Check size={17} />{t("저장")}</button></div></form></Modal>}
      {dialog === 'delete' && selected && <Modal title={t("프로젝트를 휴지통으로 이동할까요?")} onClose={() => setDialog(null)}><div className="modal-form"><p className="modal-copy"><strong>{selected.fileName}</strong>{t("과 작업 기록·보고서를 보존합니다. 휴지통에서 언제든 복구할 수 있어요.")}</p><div className="modal-actions"><button className="secondary-button" onClick={() => setDialog('menu')}>{t("취소")}</button><button className="danger-button" onClick={() => void getHomeProject('document', selected.id).then((project) => { if (!project) return; const trashed = { ...project, deletedAt: Date.now() }; setUndoProject(trashed); return saveHomeProject(trashed) }).then(() => { setNotice(t('프로젝트를 휴지통으로 옮겼습니다.')); setDialog(null); setSelected(null); void refresh() })}>{t("휴지통으로")}</button></div></div></Modal>}
      {dialog === 'settings' && <Modal title={t("설정")} onClose={() => setDialog(null)}><div className="settings-copy">
        <label className="settings-language-control" htmlFor="language-preference">{t('앱 언어')}<select id="language-preference" value={languagePreference} onChange={(event) => void setLanguagePreference(event.currentTarget.value as 'auto' | keyof typeof languageNames)}><option value="auto">{t('기기 언어 사용')}</option>{Object.entries(languageNames).map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
        <p>{storageMode === 'persistent' ? t('PDF, 사진, 차트와 페이지 설정이 이 브라우저에 자동 저장됩니다. 다른 브라우저나 기기로 옮기려면 작업 파일을 내보내세요.') : storageMode === 'temporary' ? t('이 브라우저에서는 자동 저장을 사용할 수 없습니다. 작업 파일을 내보내야 창을 닫은 뒤에도 자료를 복원할 수 있습니다.') : t('브라우저의 자동 저장 가능 여부를 확인하고 있습니다.')}</p>
        {storageMode === 'persistent' && (estimate?.quota ? <p className="storage-estimate">{t("저장 한도 추정: ")}{formatSize(estimate.usage ?? 0)}{t(" 사용 / ")}{formatSize(estimate.quota)}{t(" 한도")}</p> : <p className="storage-estimate">{t("브라우저가 저장 공간 추정치를 제공하지 않습니다.")}</p>)}
        <div className="backup-actions"><button className="secondary-button" onClick={() => void exportWorkspace()}>{t("작업 파일 내보내기")}</button><button className="secondary-button" disabled={loading} onClick={() => backupInput.current?.click()}>{t("작업 파일 가져오기")}</button></div>
      </div></Modal>}
    </main></div>
  )
}
