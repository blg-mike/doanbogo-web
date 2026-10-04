import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Check, FilePlus2, Grid2X2, Grid3X3, List, MoreHorizontal, Search, Settings, SlidersHorizontal, X } from 'lucide-react'
import yyLogo from './assets/yy-logo.png'
import { createWorkspaceBackup, readWorkspaceBackup } from './backup'
import { addDocument, deleteChart, deleteDocument, duplicateChart, duplicateDocument, getPreference, getStorageMode, importWorkspaceData, isQuotaError, listCharts, listDocuments, markChartOpened, markOpened, renameDocument, saveChart, savePreference, storageEstimate, subscribeStorageMode, updateTags, type StorageMode } from './storage'
import { inspectPdf, pdfErrorMessage } from './pdf'
import { chartSvg } from './charts'
import type { ChartDocument, DocumentRecord, SortMode, ViewMode } from './types'
import './Chart.css'

const sortLabels: Record<SortMode, string> = { recent: '최근 실행순', name: '이름순', upload: '업로드순' }

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
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

type LibraryItem = { type: 'pdf'; record: DocumentRecord } | { type: 'chart'; record: ChartDocument }

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-heading"><h2>{title}</h2><button className="icon-button" aria-label="닫기" onClick={onClose}><X size={20} /></button></div>
        {children}
      </section>
    </div>
  )
}

export default function Workspace() {
  const navigate = useNavigate()
  const fileInput = useRef<HTMLInputElement>(null)
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
  const [dialog, setDialog] = useState<'menu' | 'rename' | 'tags' | 'delete' | 'chart-menu' | 'chart-delete' | 'chart-rename' | 'settings' | null>(null)
  const [tagDraft, setTagDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState('')
  const [estimate, setEstimate] = useState<{ usage?: number; quota?: number } | null>(null)
  const [storageMode, setStorageMode] = useState<StorageMode>('checking')

  const refresh = useCallback(async () => {
    const [pdfs, charts] = await Promise.all([listDocuments(sort, query), listCharts(sort, query)])
    const items: LibraryItem[] = [...pdfs.map((record) => ({ type: 'pdf' as const, record })), ...charts.map((record) => ({ type: 'chart' as const, record }))]
    const itemName = (item: LibraryItem) => item.type === 'pdf' ? item.record.fileName : item.record.title
    const itemOpened = (item: LibraryItem) => item.type === 'pdf'
      ? item.record.lastOpenedAt ?? item.record.createdAt
      : item.record.lastOpenedAt ?? item.record.updatedAt
    items.sort((a, b) => {
      if (sort === 'name') return itemName(a).localeCompare(itemName(b), 'ko')
      if (sort === 'upload') return b.record.createdAt - a.record.createdAt
      return itemOpened(b) - itemOpened(a)
    })
    setDocuments(items)
  }, [sort, query])

  // oxlint-disable-next-line react/set-state-in-effect -- Reflect the IndexedDB result when the search or sort changes.
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    let active = true
    const unsubscribe = subscribeStorageMode(setStorageMode)
    void getStorageMode().then((mode) => { if (active) setStorageMode(mode) })
    return () => { active = false; unsubscribe() }
  }, [])
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
          failures.push(file.name + ': 파일이 비어 있습니다.')
          continue
        }
        let inspected: Awaited<ReturnType<typeof inspectPdf>>
        try {
          inspected = await inspectPdf(file)
        } catch (error) {
          failures.push(file.name + ': ' + pdfErrorMessage(error))
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
          pdf: file.slice(0, file.size, 'application/pdf'),
          cover: inspected.cover,
        }
        try {
          await addDocument(record)
          added++
        } catch (error) {
          if (isQuotaError(error)) throw error
          failures.push(file.name + ': 브라우저 저장소에 기록하지 못했습니다.')
        }
      }
      await refresh()
      if (failures.length) {
        const summary = added ? added + '개 추가 완료. ' : ''
        setNotice(summary + failures[0] + (failures.length > 1 ? ' 외 ' + (failures.length - 1) + '개 파일을 추가하지 못했습니다.' : ''))
      } else {
        setNotice(added === 1 ? 'PDF를 추가했습니다.' : added + '개 PDF를 추가했습니다.')
      }
    } catch (error) {
      await refresh()
      if (isQuotaError(error)) setNotice('브라우저 저장 한도를 초과했습니다. 일부 자료를 삭제하거나 다른 브라우저에서 다시 시도해 주세요.')
      else setNotice(error instanceof Error ? error.message : 'PDF를 추가하지 못했습니다.')
    } finally {
      setLoading(false)
      importingRef.current = false
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function openDocument(document: DocumentRecord) {
    await markOpened(document.id)
    navigate('/viewer/' + document.id)
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
      setRenameError(error instanceof Error ? error.message : 'PDF 이름을 변경하지 못했습니다.')
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
      setNotice('작업 파일을 내보냈습니다.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '작업 파일을 내보내지 못했습니다.')
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
      const [savedSort, savedView] = await Promise.all([getPreference('sort'), getPreference('view')])
      if (savedSort === 'recent' || savedSort === 'name' || savedSort === 'upload') setSort(savedSort)
      if (savedView === 'cover' || savedView === 'list') setView(savedView)
      await refresh()
      setDialog(null)
      setNotice(importedCount + '개 도안을 가져왔습니다.')
    } catch (error) {
      setNotice(isQuotaError(error) ? '저장 공간 한도를 넘어 작업 파일을 가져오지 못했습니다. 일부 자료를 삭제하거나 임시 저장을 사용할 수 있는 파일 실행 빌드를 이용해 주세요.' : error instanceof Error ? error.message : '작업 파일을 가져오지 못했습니다.')
    } finally {
      setLoading(false)
      importingRef.current = false
      if (backupInput.current) backupInput.current.value = ''
    }
  }

  return (
    <main className="workspace-shell">
      <header className="topbar">
        <a className="brand" href="#/" aria-label="도안보고 홈"><span className="brand-lockup"><img src={yyLogo} alt="도안보고 로고" /><small>YY공동제작</small></span><strong>도안보고</strong></a>
        <div className="topbar-actions">
          <label className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름 또는 태그 검색" aria-label="이름 또는 태그 검색" />{query && <button type="button" className="search-clear" aria-label="검색어 지우기" onClick={() => setQuery('')}><X size={15} /></button>}</label>
          <button className="icon-button" aria-label="저장 설정" onClick={() => void showSettings()}><Settings size={19} /></button>
        </div>
      </header>
      <section className="workspace-content">
        <div className="welcome-row"><div><p className="eyebrow">MY LIBRARY</p><h1>내 도안</h1><p className="welcome-copy">PDF를 모아 보고, 도안 작업을 이어가세요.</p></div><div className="document-count">{documents.length}<span>개 도안</span></div></div>
        <div className="toolbar">
          <input ref={fileInput} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(event) => void importFiles(event.currentTarget.files)} />
          <input ref={backupInput} type="file" accept=".doanbogo,application/zip" hidden onChange={(event) => void importWorkspace(event.currentTarget.files?.[0])} />
          <button className="primary-button" onClick={() => fileInput.current?.click()} disabled={loading}><FilePlus2 size={18} />{loading ? 'PDF 확인 중…' : 'PDF 추가'}</button>
          <label className="sort-select"><SlidersHorizontal size={16} /><span className="sr-only">정렬</span><select value={sort} onChange={(event) => void changeSort(event.target.value as SortMode)}>{Object.entries(sortLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <div className="view-toggle" aria-label="보기 방식"><button className={view === 'cover' ? 'active' : ''} aria-label="표지 보기" onClick={() => void changeView('cover')}><Grid2X2 size={17} /></button><button className={view === 'list' ? 'active' : ''} aria-label="목록 보기" onClick={() => void changeView('list')}><List size={18} /></button></div>
        </div>
        {notice && <div className="notice" role="status"><span>{notice}</span><button aria-label="알림 닫기" onClick={() => setNotice('')}><X size={16} /></button></div>}
        {documents.length === 0 ? (
          <section className="empty-state"><div className="empty-icon"><FilePlus2 size={27} /></div><h2>{query ? '검색 결과가 없습니다' : '아직 도안이 없습니다'}</h2><p>{query ? '이름이나 태그를 바꿔서 다시 검색해 보세요.' : 'PDF를 추가해 이곳에 모아 둘 수 있어요.'}</p>{!query && <div className="empty-actions"><button className="primary-button" onClick={() => fileInput.current?.click()}><FilePlus2 size={18} />첫 PDF 추가하기</button></div>}</section>
        ) : (
          <section className={view === 'cover' ? 'document-grid' : 'document-list'} aria-label="도안 목록">
            {documents.map((item) => item.type === 'pdf' ? (
              <article key={'pdf-' + item.record.id} className={'document-card ' + (view === 'list' ? 'list-card' : '')}>
                <button className="cover-button" onClick={() => void openDocument(item.record)} aria-label={item.record.fileName + ' 열기'}>
                  {item.record.cover ? <CoverImage blob={item.record.cover} /> : <span className="cover-placeholder"><BookOpen size={32} /></span>}
                  <span className="pdf-label">PDF</span>
                </button>
                <div className="document-info">
                  <div className="card-title-line"><button className="card-title" onClick={() => void openDocument(item.record)} title={item.record.fileName}>{item.record.fileName.replace(/\.pdf$/i, '')}</button><button className="card-more" aria-label={item.record.fileName + ' 메뉴'} onClick={() => openMenu(item.record)}><MoreHorizontal size={20} /></button></div>
                  <p className="document-meta">{item.record.pageCount}페이지 <span>·</span> {formatSize(item.record.size)}</p>
                  {item.record.tags.length > 0 && <div className="tag-list">{item.record.tags.map((tag) => <span className="tag-chip" key={tag}>{tag}</span>)}</div>}
                </div>
              </article>
            ) : (
              <article key={'chart-' + item.record.id} className={'document-card chart-document-card ' + (view === 'list' ? 'list-card' : '')}>
                <button className="cover-button chart-cover-button" onClick={() => void openChart(item.record)} aria-label={item.record.title + ' 차트 열기'}>
                  <ChartPreview chart={item.record} /><span className="chart-kind-label">{item.record.craft === 'knitting' ? 'Knitting · Colors' : 'Crochet · Free Form'}</span>
                </button>
                <div className="document-info">
                  <div className="card-title-line"><button className="card-title" onClick={() => void openChart(item.record)} title={item.record.title}>{item.record.title}</button><button className="card-more" aria-label={item.record.title + ' 메뉴'} onClick={() => openChartMenu(item.record)}><MoreHorizontal size={20} /></button></div>
                  <p className="document-meta">{item.record.craft === 'knitting' ? `${item.record.width}코 × ${item.record.height}단` : `${item.record.objects.length}개 기호`} <span>·</span> 차트</p>
                </div>
              </article>
            ))}
          </section>
        )}
        <footer className="workspace-footer">
          <span>{storageMode === 'persistent' ? 'PDF와 차트가 이 브라우저에 자동 저장됩니다.' : storageMode === 'temporary' ? '임시 저장 중 · 종료 전에 작업 파일로 저장하세요.' : '저장 방식을 확인하고 있습니다…'}</span>
          {storageMode === 'temporary' && <button className="text-control" onClick={() => void exportWorkspace()}>작업 파일 저장</button>}
        </footer>
      </section>

      {dialog === 'menu' && selected && <Modal title="도안 관리" onClose={() => setDialog(null)}><div className="action-list">
        <button onClick={() => { setFileNameDraft(selected.fileName.replace(/\.pdf$/i, '')); setRenameError(''); setDialog('rename') }}>이름 변경<span>워크스페이스와 뷰어에 표시되는 PDF 이름</span></button>
        <button onClick={() => { setTagDraft(selected.tags.join(', ')); setDialog('tags') }}>태그 편집<span>파일명 또는 태그 검색에 사용됩니다</span></button>
        <button onClick={() => void duplicateDocument(selected.id).then(() => { setDialog(null); void refresh(); setNotice('도안 사본을 만들었습니다.') }).catch(() => setNotice('도안 사본을 만들지 못했습니다.'))}>도안 복사<span>북마크와 작업 위치는 복사하지 않습니다</span></button>
        <button onClick={() => void shareOrDownload(selected).catch(() => setNotice('PDF를 공유하거나 다운로드하지 못했습니다.'))}>원본 PDF 공유 / 다운로드<span>지원하지 않는 기기에서는 파일을 다운로드합니다</span></button>
        <button className="danger-action" onClick={() => setDialog('delete')}>도안 삭제<span>PDF와 해당 작업 정보를 함께 삭제합니다</span></button>
      </div></Modal>}
      {dialog === 'rename' && selected && <Modal title="PDF 이름 변경" onClose={() => setDialog('menu')}><form className="modal-form" onSubmit={(event) => void saveDocumentName(event)}><label htmlFor="pdf-name-draft">PDF 이름</label><input id="pdf-name-draft" autoFocus required maxLength={120} value={fileNameDraft} onChange={(event) => setFileNameDraft(event.currentTarget.value)} /><p className="modal-copy">.pdf 확장자는 저장할 때 자동으로 붙습니다.</p>{renameError && <p className="rename-error" role="alert">{renameError}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setDialog('menu')}>취소</button><button className="primary-button" type="submit"><Check size={17} />저장</button></div></form></Modal>}
      {dialog === 'chart-menu' && selectedChart && <Modal title="차트 관리" onClose={() => setDialog(null)}><div className="action-list">
        <button onClick={() => { setChartTitleDraft(selectedChart.title); setDialog('chart-rename') }}>이름 변경<span>워크스페이스 카드에 표시되는 이름</span></button>
        <button onClick={() => void duplicateChart(selectedChart.id).then(() => { setDialog(null); void refresh(); setNotice('차트 사본을 만들었습니다.') }).catch(() => setNotice('차트 사본을 만들지 못했습니다.'))}>차트 복사<span>색칠, 기호와 레이어를 모두 복사합니다</span></button>
        <button onClick={() => { setDialog(null); void openChart(selectedChart) }}>차트 편집<span>{selectedChart.craft === 'knitting' ? '대바늘 색상 차트' : '코바늘 Free Form 차트'}</span></button>
        <button className="danger-action" onClick={() => setDialog('chart-delete')}>차트 삭제<span>이 차트와 편집 내용을 삭제합니다</span></button>
      </div></Modal>}
      {dialog === 'chart-rename' && selectedChart && <Modal title="차트 이름 변경" onClose={() => setDialog(null)}><form className="modal-form" onSubmit={(event) => void saveChartTitle(event)}><label htmlFor="chart-title-draft">차트 이름</label><input id="chart-title-draft" autoFocus maxLength={120} value={chartTitleDraft} onChange={(event) => setChartTitleDraft(event.target.value)} /><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setDialog('chart-menu')}>취소</button><button className="primary-button" type="submit"><Check size={17} />저장</button></div></form></Modal>}
      {dialog === 'chart-delete' && selectedChart && <Modal title="차트를 삭제할까요?" onClose={() => setDialog(null)}><div className="modal-form"><p className="modal-copy"><strong>{selectedChart.title}</strong> 차트와 편집 내용이 함께 삭제됩니다.</p><div className="modal-actions"><button className="secondary-button" onClick={() => setDialog('chart-menu')}>취소</button><button className="danger-button" onClick={() => void deleteChart(selectedChart.id).then(() => { setDialog(null); setSelectedChart(null); void refresh() })}>삭제</button></div></div></Modal>}
      {dialog === 'tags' && selected && <Modal title="태그 편집" onClose={() => setDialog(null)}><form className="modal-form" onSubmit={(event) => void saveTagDraft(event)}><label htmlFor="tag-draft">쉼표로 구분해 입력</label><input id="tag-draft" autoFocus value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} placeholder="예: 스웨터, 겨울, 선물" /><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setDialog('menu')}>취소</button><button className="primary-button" type="submit"><Check size={17} />저장</button></div></form></Modal>}
      {dialog === 'delete' && selected && <Modal title="도안을 삭제할까요?" onClose={() => setDialog(null)}><div className="modal-form"><p className="modal-copy"><strong>{selected.fileName}</strong>과 이 도안의 북마크·숨김·뷰어 위치가 함께 삭제됩니다.</p><div className="modal-actions"><button className="secondary-button" onClick={() => setDialog('menu')}>취소</button><button className="danger-button" onClick={() => void deleteDocument(selected.id).then(() => { setDialog(null); setSelected(null); void refresh() })}>삭제</button></div></div></Modal>}
      {dialog === 'settings' && <Modal title="저장 안내" onClose={() => setDialog(null)}><div className="settings-copy">
        <p>{storageMode === 'persistent' ? 'PDF, 차트와 페이지 설정이 이 브라우저에 자동 저장됩니다. 다른 브라우저나 기기로 옮기려면 작업 파일을 내보내세요.' : storageMode === 'temporary' ? '이 브라우저에서는 자동 저장을 사용할 수 없습니다. 작업 파일을 내보내야 창을 닫은 뒤에도 PDF와 차트를 복원할 수 있습니다.' : '브라우저의 자동 저장 가능 여부를 확인하고 있습니다.'}</p>
        {storageMode === 'persistent' && (estimate?.quota ? <p className="storage-estimate">저장 한도 추정: {formatSize(estimate.usage ?? 0)} 사용 / {formatSize(estimate.quota)} 한도</p> : <p className="storage-estimate">브라우저가 저장 공간 추정치를 제공하지 않습니다.</p>)}
        <div className="backup-actions"><button className="secondary-button" onClick={() => void exportWorkspace()}>작업 파일 내보내기</button><button className="secondary-button" disabled={loading} onClick={() => backupInput.current?.click()}>작업 파일 가져오기</button></div>
      </div></Modal>}
    </main>
  )
}
