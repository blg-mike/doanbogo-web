import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, Check, ChevronDown, Clipboard, Download, Ellipsis, Gauge, ImagePlus, Pencil, Plus, Ruler, Scissors, Shirt, Sparkles, Trash2, X } from 'lucide-react'
import BrandLoading from './BrandLoading'
import { getKnittingReportById, getKnittingReports, getPageWorks, getViewer, saveKnittingReport, type KnittingReportSummary } from './storage'
import type { CounterSnapshot, KnittingReport, ReportAccessory, ReportMeasurement, ReportModification, ReportNeedle, ReportTimelinePhoto, ReportYarn } from './types'
import { exportKnittingReportPdf } from './knittingReportPdf'
import InstagramReportDialog from './InstagramReportDialog'
import InstagramCaptionDialog from './InstagramCaptionDialog'
import { analyzeKnittingReportCandidates } from './knittingReportAnalysis'

type Props = { documentId: string; fileName: string; pageCount: number; onBack: () => void }
type FieldKind = 'text' | 'date' | 'number' | 'url' | 'multiline' | 'select' | 'tags'
type DetailId = 'project' | 'pattern' | 'size' | 'yarn' | 'needles' | 'modifications' | 'oneLine' | 'gauge' | 'measurements' | 'fit' | 'yarnMemo' | 'detailMemo' | 'extras'

const featureOptions = '라글란,드롭숄더,브이넥,크롭,오버핏,케이블,배색,탑다운,바텀업'
const tensionOptions = ['많이 널손', '널손', '보통', '쫀손', '많이 쫀손']

function cleanName(fileName: string) {
  return fileName.replace(/\.pdf$/i, '').trim() || '뜨개 프로젝트'
}

function createKnittingReport(documentId: string, fileName: string, title = cleanName(fileName)): KnittingReport {
  return {
    id: crypto.randomUUID(), documentId, title, createdAt: Date.now(), updatedAt: Date.now(), fields: { 'project.name': title }, representativePhoto: '',
    yarns: [], needles: [], accessories: [],
    measurements: ['기장', '가슴둘레', '소매길이'].map((label) => ({ id: crypto.randomUUID(), label, pattern: '', finished: '', unit: 'cm' as const })),
    modifications: [], finishedPhotos: [], workPhotos: [],
  }
}

function localDateValue(timestamp: number) {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

async function compressPhotos(files: File[]) {
  const photos: ReportTimelinePhoto[] = []
  for (const file of files) {
    const uploadedAt = Date.now()
    photos.push({ id: crypto.randomUUID(), label: file.name.replace(/\.[^.]+$/, ''), dataUrl: await compressPhoto(file), uploadedAt, activityDate: localDateValue(uploadedAt) })
  }
  return photos
}

function makeYarn(): ReportYarn {
  return { id: crypto.randomUUID(), photo: '', brand: '', product: '', colorName: '', colorNumber: '', lot: '', fiber: '', country: '', weightClass: '', recommendedNeedle: '', skeinWeight: '', skeinLength: '', retailer: '', purchaseLink: '', price: '', quantity: '', usedSkeins: '', usedWeight: '', usedMeters: '', memo: '', leftover: '' }
}

function makeNeedle(): ReportNeedle {
  return { id: crypto.randomUUID(), section: '', type: '', size: '', cableLength: '', memo: '' }
}

function makeAccessory(): ReportAccessory {
  return { id: crypto.randomUUID(), photo: '', type: '', size: '', quantity: '', detail: '' }
}

function makeMeasurement(): ReportMeasurement {
  return { id: crypto.randomUUID(), label: '', pattern: '', finished: '', unit: 'cm' }
}

function makeModification(): ReportModification {
  return { id: crypto.randomUUID(), section: '', original: '', changed: '', memo: '' }
}

type ReportCollectionKey = 'yarns' | 'needles' | 'accessories' | 'measurements' | 'modifications'
type ReportRow = ReportYarn | ReportNeedle | ReportAccessory | ReportMeasurement | ReportModification

async function compressPhoto(file: File) {
  const source = await createImageBitmap(file)
  const scale = Math.min(1, 1600 / Math.max(source.width, source.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(source.width * scale))
  canvas.height = Math.max(1, Math.round(source.height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('사진을 처리할 수 없습니다.')
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  source.close()
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('사진을 저장할 수 없습니다.')), 'image/jpeg', 0.82))
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('사진을 읽지 못했습니다.'))
    reader.onerror = () => reject(new Error('사진을 읽지 못했습니다.'))
    reader.readAsDataURL(blob)
  })
}

function ReportField({ label, value, onChange, kind = 'text', options, wide = false }: {
  label: string; value: string; onChange: (value: string) => void; kind?: FieldKind; options?: string[]; wide?: boolean
}) {
  return <label className={'report-field' + (wide ? ' wide' : '')}>{label}
    {kind === 'select' ? <select value={value} onChange={(event) => onChange(event.currentTarget.value)}><option value="">선택</option>{options?.map((option) => <option key={option}>{option}</option>)}</select> :
      kind === 'tags' ? <span className="report-tag-options">{options?.map((option) => {
        const selected = value.split(',').map((item) => item.trim()).filter(Boolean).includes(option)
        return <button key={option} type="button" className={selected ? 'selected' : ''} onClick={() => onChange(selected ? value.split(',').map((item) => item.trim()).filter((item) => item !== option).join(', ') : [...value.split(',').map((item) => item.trim()).filter(Boolean), option].join(', '))}>{option}</button>
      })}</span> :
      kind === 'multiline' ? <textarea value={value} onChange={(event) => onChange(event.currentTarget.value)} rows={3} /> :
        <input type={kind === 'number' ? 'text' : kind} inputMode={kind === 'number' ? 'decimal' : undefined} value={value} onChange={(event) => onChange(event.currentTarget.value)} />}
  </label>
}

function PhotoField({ label, value, onChange, onProcessingChange }: { label: string; value: string; onChange: (value: string) => void; onProcessingChange?: (processing: boolean) => void }) {
  const [error, setError] = useState('')
  async function readPhoto(file?: File) {
    if (!file) return
    onProcessingChange?.(true)
    try { onChange(await compressPhoto(file)); setError('') }
    catch (reason) { setError(reason instanceof Error ? reason.message : '사진을 처리할 수 없습니다.') }
    finally { onProcessingChange?.(false) }
  }
  return <div className="report-photo-field">
    {value ? <img src={value} alt={label} /> : <div className="report-photo-empty"><ImagePlus size={21} /><span>{label}</span></div>}
    <label className="report-photo-button"><ImagePlus size={15} />{value ? '사진 바꾸기' : '사진 추가'}<input type="file" accept="image/*" onChange={(event) => { void readPhoto(event.currentTarget.files?.[0]); event.currentTarget.value = '' }} /></label>
    {value && <button className="report-remove-photo" aria-label={label + ' 삭제'} onClick={() => onChange('')}><Trash2 size={14} /></button>}
    {error && <small className="report-error">{error}</small>}
  </div>
}

function ReportCard({ title, summary, icon, recommended, onClick }: { title: string; summary: string; icon: ReactNode; recommended?: boolean; onClick: () => void }) {
  return <button type="button" className="report-summary-card" onClick={onClick}><span className="report-summary-icon">{icon}</span><span className="report-summary-copy"><strong>{title}</strong><small>{summary || '필요할 때 다시 확인할 수 있도록 남겨두세요.'}</small></span>{recommended && <span className="report-recommended">추천</span>}<Pencil size={15} className="report-summary-edit" /></button>
}

function PersonalCard({ title, summary, icon, open, onClick }: { title: string; summary: string; icon: ReactNode; open: boolean; onClick: () => void }) {
  return <button type="button" className={'report-personal-card' + (open ? ' open' : '')} aria-expanded={open} onClick={onClick}><span className="report-personal-icon">{icon}</span><span className="report-summary-copy"><strong>{title}</strong><small>{summary || '필요할 때 다시 확인할 수 있도록 자세히 남겨두세요.'}</small></span><ChevronDown size={17} className="report-personal-chevron" /></button>
}

export default function KnittingReport({ documentId, fileName, pageCount, onBack }: Props) {
  const [report, setReport] = useState<KnittingReport | null>(null)
  const [reports, setReports] = useState<KnittingReportSummary[]>([])
  const [saveState, setSaveState] = useState('불러오는 중')
  const [exporting, setExporting] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [processingPhotos, setProcessingPhotos] = useState(false)
  const [captionOpen, setCaptionOpen] = useState(false)
  const [instagramOpen, setInstagramOpen] = useState(false)
  const [titleEditing, setTitleEditing] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [activeDetail, setActiveDetail] = useState<DetailId | null>(null)
  const [expandedPersonal, setExpandedPersonal] = useState<string[]>([])
  const [moreOpen, setMoreOpen] = useState(false)
  const [candidateReviewOpen, setCandidateReviewOpen] = useState(false)
  const [candidateSelection, setCandidateSelection] = useState<string[]>([])
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisNotice, setAnalysisNotice] = useState('')
  const timer = useRef<number | undefined>(undefined)
  const photoProcessingCount = useRef(0)
  const reportRef = useRef<KnittingReport | null>(null)
  const analyzeNowRef = useRef<(target?: KnittingReport | null) => Promise<void>>(async () => {})
  const saveQueueRef = useRef(Promise.resolve())

  function trackPhotoProcessing(processing: boolean) {
    photoProcessingCount.current = Math.max(0, photoProcessingCount.current + (processing ? 1 : -1))
    setProcessingPhotos(photoProcessingCount.current > 0)
  }

  useEffect(() => {
    let disposed = false
    void (async () => {
      setReport(null)
      setReports([])
      let currentReports = await getKnittingReports(documentId)
      let createdOnOpen = false
      if (!currentReports.length) {
        const created = await saveKnittingReport(createKnittingReport(documentId, fileName))
        currentReports = [created]
        createdOnOpen = true
      }
      if (disposed) return
      const current = currentReports.reduce((latest, item) => item.updatedAt > latest.updatedAt ? item : latest)
      setReports(currentReports.map(({ id, title, createdAt, updatedAt }) => ({ id, title, createdAt, updatedAt })))
      reportRef.current = current
      setReport(current)
      setSaveState('저장됨')
      if (createdOnOpen) void analyzeNowRef.current(current)
    })().catch(() => { if (!disposed) setSaveState('불러오지 못했습니다. 페이지를 다시 열어 주세요.') })
    return () => {
      disposed = true
      if (timer.current !== undefined) window.clearTimeout(timer.current)
      if (reportRef.current?.documentId === documentId) void persistReport(reportRef.current)
    }
  }, [documentId, fileName])

  function persistReport(value: KnittingReport) {
    const task = saveQueueRef.current.then(() => saveKnittingReport(value))
    saveQueueRef.current = task.then(() => undefined, () => undefined)
    return task
  }

  async function flushPendingReport() {
    if (timer.current !== undefined) window.clearTimeout(timer.current)
    timer.current = undefined
    const current = reportRef.current
    if (!current) return
    const saved = await persistReport(current)
    if (reportRef.current === current) {
      reportRef.current = saved
      setReport(saved)
      setReports((items) => items.map((item) => item.id === saved.id ? { id: saved.id, title: saved.title, createdAt: saved.createdAt, updatedAt: saved.updatedAt } : item))
    }
  }

  async function switchReport(id: string) {
    if (switching || processingPhotos || id === reportRef.current?.id) return
    setSwitching(true)
    try {
      await flushPendingReport()
      const next = await getKnittingReportById(id)
      if (!next || next.documentId !== documentId) throw new Error('보고서를 불러오지 못했습니다.')
      reportRef.current = next
      setReport(next)
      setSaveState('저장됨')
    } catch (cause) {
      setSaveState(cause instanceof Error ? cause.message : '보고서를 불러오지 못했습니다.')
    } finally {
      setSwitching(false)
    }
  }

  async function addReport() {
    if (switching || processingPhotos) return
    setSwitching(true)
    try {
      await flushPendingReport()
      const next = await saveKnittingReport(createKnittingReport(documentId, fileName, `새 보고서 ${reports.length + 1}`))
      reportRef.current = next
      setReport(next)
      setReports((items) => [...items, { id: next.id, title: next.title, createdAt: next.createdAt, updatedAt: next.updatedAt }])
      setSaveState('저장됨')
      void analyzeNow(next)
    } catch (cause) {
      setSaveState(cause instanceof Error ? cause.message : '보고서를 추가하지 못했습니다.')
    } finally {
      setSwitching(false)
    }
  }

  function update(change: (current: KnittingReport) => KnittingReport) {
    const current = reportRef.current
    if (!current || switching || exporting) return
    const changed = change(current)
    const next = { ...changed, title: changed.fields['project.name']?.trim() || changed.title }
    reportRef.current = next
    setReport(next)
    setReports((items) => items.map((item) => item.id === next.id ? { ...item, title: next.title } : item))
    setSaveState('저장 중…')
    if (timer.current !== undefined) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = undefined
      void persistReport(next).then((saved) => {
        if (reportRef.current !== next) return
        reportRef.current = saved
        setReport(saved)
        setSaveState('저장됨')
      }).catch(() => setSaveState('저장하지 못했습니다. 저장 공간을 확인해 주세요.'))
    }, 350)
  }

  function beginTitleEdit() {
    if (switching || exporting || processingPhotos) return
    setTitleDraft(report?.fields['project.name']?.trim() || report?.title || '')
    setTitleEditing(true)
  }

  function saveTitleEdit() {
    const title = titleDraft.trim()
    if (!title || !report) return
    update((current) => ({ ...current, fields: { ...current.fields, 'project.name': title } }))
    setTitleEditing(false)
  }

  function field(id: string, label: string, kind: FieldKind = 'text', options?: string[], wide = false) {
    return <ReportField key={id} label={label} value={report?.fields[id] ?? ''} kind={kind} options={options} wide={wide} onChange={(value) => update((current) => ({ ...current, fields: { ...current.fields, [id]: value } }))} />
  }

  function updateRow<K extends ReportCollectionKey>(key: K, id: string, patch: Partial<KnittingReport[K][number]>) {
    update((current) => ({ ...current, [key]: (current[key] as ReportRow[]).map((row) => row.id === id ? { ...row, ...patch } : row) }) as KnittingReport)
  }

  function removeRow(key: ReportCollectionKey, id: string) {
    update((current) => ({ ...current, [key]: (current[key] as ReportRow[]).filter((row) => row.id !== id) }) as KnittingReport)
  }

  async function saveImmediately(next: KnittingReport) {
    if (timer.current !== undefined) window.clearTimeout(timer.current)
    timer.current = undefined
    const saved = await persistReport(next)
    if (reportRef.current?.id === saved.id) {
      reportRef.current = saved
      setReport(saved)
      setReports((items) => items.map((item) => item.id === saved.id ? { ...item, title: saved.title, updatedAt: saved.updatedAt } : item))
      setSaveState('저장됨')
    }
    return saved
  }

  async function analyzeNow(target = reportRef.current) {
    if (!target || analysisLoading) return
    setAnalysisLoading(true)
    setAnalysisNotice('')
    try {
      await flushPendingReport()
      const current = reportRef.current
      if (!current || current.id !== target.id) return
      const [works, viewer] = await Promise.all([getPageWorks(documentId), getViewer(documentId, pageCount)])
      const reportNotes = [
        ...(['project.memo', 'pattern.memo', 'gauge.memo', 'review.problems', 'review.memo', 'finished.washMemo', 'private.yarnMemo'] as const)
          .map((key) => ({ id: key, text: current.fields[key] ?? '' })),
        ...current.yarns.map((yarn) => ({ id: `yarn:${yarn.id}`, text: yarn.memo ? `실 메모: ${yarn.memo}` : '' })),
        ...current.needles.map((needle) => ({ id: `needle:${needle.id}`, text: needle.memo ? `바늘 메모: ${needle.memo}` : '' })),
      ].filter((note) => note.text.trim())
      const found = analyzeKnittingReportCandidates({ works, counters: (viewer.counters ?? []) as CounterSnapshot[], projectComplete: current.fields['project.status'] === '완성', reportNotes })
      const existing = current.analysisCandidates ?? []
      const byFingerprint = new Map(existing.map((candidate) => [candidate.fingerprint, candidate]))
      const merged = [...existing]
      for (const candidate of found) {
        if (!byFingerprint.has(candidate.fingerprint)) merged.push(candidate)
      }
      const saved = await saveImmediately({ ...current, analysisCandidates: merged })
      const pending = saved.analysisCandidates?.filter((candidate) => candidate.status === 'suggested') ?? []
      if (pending.length) {
        setCandidateSelection(pending.map((candidate) => candidate.id))
        setCandidateReviewOpen(true)
      } else setAnalysisNotice('새 수정사항 후보를 찾지 못했습니다.')
    } catch (cause) {
      setSaveState(cause instanceof Error ? cause.message : '수정사항 후보를 분석하지 못했습니다.')
    } finally {
      setAnalysisLoading(false)
    }
  }

  useEffect(() => {
    analyzeNowRef.current = analyzeNow
  })

  function changeProjectStatus(value: string) {
    const before = reportRef.current?.fields['project.status']
    update((current) => ({ ...current, fields: { ...current.fields, 'project.status': value } }))
    if (value === '완성' && before !== '완성') void analyzeNow()
  }

  async function applyCandidates() {
    if (!report || switching || !candidateSelection.length) return
    setSwitching(true)
    try {
      await flushPendingReport()
      const current = reportRef.current
      if (!current) return
      const selected = new Set(candidateSelection)
      const candidates = current.analysisCandidates ?? []
      const accepted = candidates.filter((candidate) => selected.has(candidate.id) && candidate.status === 'suggested')
      const updated = candidates.map((candidate) => selected.has(candidate.id) && candidate.status === 'suggested' ? { ...candidate, status: 'confirmed' as const } : candidate)
      const known = new Set(current.modifications.map((item) => [item.section, item.original, item.changed].join('|')))
      const additions = accepted.filter((candidate) => !known.has([candidate.section, candidate.original, candidate.changed].join('|'))).map((candidate) => ({ id: crypto.randomUUID(), section: candidate.section, original: candidate.original, changed: candidate.changed, memo: candidate.evidence }))
      await saveImmediately({ ...current, modifications: [...current.modifications, ...additions], analysisCandidates: updated })
      setCandidateReviewOpen(false)
    } catch (cause) {
      setSaveState(cause instanceof Error ? cause.message : '선택한 수정사항을 저장하지 못했습니다.')
    } finally {
      setSwitching(false)
    }
  }

  async function dismissCandidate(id: string) {
    if (switching) return
    setSwitching(true)
    try {
      await flushPendingReport()
      const current = reportRef.current
      if (!current) return
      await saveImmediately({ ...current, analysisCandidates: (current.analysisCandidates ?? []).map((candidate) => candidate.id === id ? { ...candidate, status: 'dismissed' } : candidate) })
      setCandidateSelection((items) => items.filter((item) => item !== id))
    } catch (cause) {
      setSaveState(cause instanceof Error ? cause.message : '후보를 제외하지 못했습니다.')
    } finally {
      setSwitching(false)
    }
  }

  function togglePersonal(key: string) {
    setExpandedPersonal((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key])
  }

  function updateWorkPhoto(id: string, patch: Partial<ReportTimelinePhoto>) {
    update((current) => ({ ...current, workPhotos: current.workPhotos.map((photo) => photo.id === id ? { ...photo, ...patch } : photo) }))
  }

  function rowFields<T extends ReportRow, K extends ReportCollectionKey>(row: T, key: K, descriptors: { field: keyof T; label: string; wide?: boolean }[]) {
    return <div className="report-fields">{descriptors.map(({ field: fieldName, label, wide }) => <ReportField key={String(fieldName)} label={label} value={String(row[fieldName] ?? '')} wide={wide} onChange={(value) => updateRow(key, row.id, { [fieldName]: value } as Partial<KnittingReport[K][number]>)} />)}</div>
  }

  async function downloadReport() {
    if (!report || exporting) return
    setExporting(true)
    setSaveState('보고서 준비 중…')
    try {
      if (timer.current !== undefined) window.clearTimeout(timer.current)
      timer.current = undefined
      const saved = await persistReport(report)
      if (reportRef.current !== report) return
      reportRef.current = saved
      setReport(saved)
      setReports((items) => items.map((item) => item.id === saved.id ? { id: saved.id, title: saved.title, createdAt: saved.createdAt, updatedAt: saved.updatedAt } : item))
      await exportKnittingReportPdf(saved)
      setSaveState('저장됨')
    } catch (error) {
      setSaveState(error instanceof Error ? error.message : 'PDF를 만들지 못했습니다.')
    } finally { setExporting(false) }
  }

  async function openCaption() {
    if (!report || switching) return
    setSwitching(true)
    try {
      await flushPendingReport()
      setCaptionOpen(true)
    } catch (cause) {
      setSaveState(cause instanceof Error ? cause.message : '보고서를 저장하지 못했습니다.')
    } finally {
      setSwitching(false)
    }
  }

  async function openInstagramImage() {
    if (switching || processingPhotos) return
    setSwitching(true)
    try {
      await flushPendingReport()
      setInstagramOpen(true)
    } catch (cause) {
      setSaveState(cause instanceof Error ? cause.message : '보고서를 저장하지 못했습니다.')
    } finally {
      setSwitching(false)
    }
  }

  async function addWorkPhotos(files: File[]) {
    if (!files.length || processingPhotos) return
    const reportId = reportRef.current?.id
    if (!reportId) return
    trackPhotoProcessing(true)
    setSaveState('사진 처리 중…')
    try {
      await flushPendingReport()
      const base = reportRef.current
      if (!base || base.id !== reportId) throw new Error('보고서가 변경되어 사진을 추가하지 못했습니다.')
      const uploaded = await compressPhotos(files)
      const saved = await persistReport({ ...base, workPhotos: [...base.workPhotos, ...uploaded] })
      if (reportRef.current?.id === reportId) {
        reportRef.current = saved
        setReport(saved)
        setReports((items) => items.map((item) => item.id === saved.id ? { ...item, updatedAt: saved.updatedAt } : item))
        setSaveState('저장됨')
      }
    } catch (cause) {
      setSaveState(cause instanceof Error ? cause.message : '사진을 처리하지 못했습니다.')
    } finally {
      trackPhotoProcessing(false)
    }
  }

  async function addFinishedPhotos(files: File[]) {
    if (!files.length) return
    const reportId = reportRef.current?.id
    if (!reportId) return
    trackPhotoProcessing(true)
    setSaveState('사진 처리 중…')
    try {
      await flushPendingReport()
      const base = reportRef.current
      if (!base || base.id !== reportId) throw new Error('보고서가 변경되어 사진을 추가하지 못했습니다.')
      const photos = await Promise.all(files.map(async (file) => ({ id: crypto.randomUUID(), label: file.name.replace(/\.[^.]+$/, ''), dataUrl: await compressPhoto(file) })))
      const saved = await persistReport({ ...base, finishedPhotos: [...base.finishedPhotos, ...photos] })
      if (reportRef.current?.id === reportId) {
        reportRef.current = saved
        setReport(saved)
        setReports((items) => items.map((item) => item.id === saved.id ? { ...item, updatedAt: saved.updatedAt } : item))
        setSaveState('저장됨')
      }
    } catch (cause) {
      setSaveState(cause instanceof Error ? cause.message : '사진을 처리하지 못했습니다.')
    } finally {
      trackPhotoProcessing(false)
    }
  }

  if (!report) return saveState === '불러오는 중'
    ? <BrandLoading kind="report" requestId={'report:' + documentId} layout="report" />
    : <div className="knitting-report-error" role="alert">{saveState}</div>
  const loadedReport = report
  const values = report.fields
  const detailTitles: Record<DetailId, string> = { project: '프로젝트 정보', pattern: '도안 정보', size: '사이즈', yarn: '사용 실', needles: '바늘 · 부자재', modifications: '도안에서 수정한 부분', oneLine: '한줄 기록', gauge: '게이지', measurements: '완성 실측', fit: '핏 · 완성 후기', yarnMemo: '실 메모', detailMemo: '상세 메모', extras: '기타 기록' }
  const measurementEditor = <div className="report-measurement-editor">{report.measurements.map((row) => <article className="report-measurement-edit-row" key={row.id}>
    <input aria-label="측정 항목" placeholder="예: 총장" value={row.label} onChange={(event) => updateRow('measurements', row.id, { label: event.currentTarget.value })} />
    <input aria-label="도안 치수" placeholder="도안" value={row.pattern} onChange={(event) => updateRow('measurements', row.id, { pattern: event.currentTarget.value })} />
    <input aria-label="완성 치수" placeholder="완성" value={row.finished} onChange={(event) => updateRow('measurements', row.id, { finished: event.currentTarget.value })} />
    <select aria-label="치수 단위" value={row.unit ?? 'cm'} onChange={(event) => updateRow('measurements', row.id, { unit: event.currentTarget.value as 'cm' | 'inch' })}><option value="cm">cm</option><option value="inch">inch</option></select>
    <button type="button" className="report-icon-button" aria-label="측정 항목 삭제" onClick={() => removeRow('measurements', row.id)}><Trash2 size={15} /></button>
  </article>)}<button type="button" className="secondary-button report-add-button" onClick={() => update((current) => ({ ...current, measurements: [...current.measurements, makeMeasurement()] }))}><Plus size={15} />측정 항목 추가</button></div>

  function detailContent(id: DetailId) {
    if (id === 'project') return <div className="report-fields">
      {field('project.craft', '뜨개 종류', 'select', ['대바늘', '코바늘'])}
      <label className="report-field">프로젝트 상태<select value={values['project.status'] ?? ''} onChange={(event) => changeProjectStatus(event.currentTarget.value)}><option value="">선택</option>{['예정', '진행중', '완성', '중단'].map((option) => <option key={option}>{option}</option>)}</select></label>
      {field('project.co', 'CO · 시작일', 'date')}{field('project.fo', 'FO · 완성일', 'date')}{field('project.recipient', '만든 대상')}
    </div>
    if (id === 'pattern') return <div className="report-fields">
      {field('pattern.name', '도안명')}{field('pattern.designer', '원작자 · 디자이너')}{field('pattern.source', '도안 출처')}
      {field('pattern.seller', '도안 구매처')}{field('pattern.link', '도안 링크', 'url')}{field('pattern.language', '사용 언어')}
      {field('pattern.features', '디자인 특징', 'tags', featureOptions.split(','), true)}{field('pattern.memo', '도안 메모', 'multiline', undefined, true)}
    </div>
    if (id === 'size') return <>{field('pattern.originalSizes', '도안 사이즈')}{field('pattern.selectedSize', '뜬 사이즈')}{measurementEditor}</>
    if (id === 'yarn') return <>{loadedReport.yarns.map((yarn, index) => <article className="report-entry-card" key={yarn.id}>
      <div className="report-entry-title"><strong>사용 실 {index + 1}</strong><button type="button" className="report-icon-button" aria-label="실 삭제" onClick={() => removeRow('yarns', yarn.id)}><Trash2 size={15} /></button></div>
      <div className="report-entry-with-photo"><PhotoField label="실 사진" value={yarn.photo} onChange={(photo) => updateRow('yarns', yarn.id, { photo })} onProcessingChange={trackPhotoProcessing} />{rowFields(yarn, 'yarns', [
        { field: 'brand', label: '브랜드' }, { field: 'product', label: '제품명' }, { field: 'colorName', label: '컬러명' }, { field: 'colorNumber', label: '컬러번호' },
        { field: 'usedSkeins', label: '사용 타래 수' }, { field: 'usedWeight', label: '사용 중량 (g)' }, { field: 'usedMeters', label: '사용 길이 (m)' }, { field: 'memo', label: '메모', wide: true },
        { field: 'lot', label: 'Lot No.' }, { field: 'fiber', label: '성분' }, { field: 'weightClass', label: '실 굵기' }, { field: 'skeinWeight', label: '타래 중량' },
        { field: 'skeinLength', label: '타래 길이' }, { field: 'recommendedNeedle', label: '권장 바늘' }, { field: 'country', label: '제조국' },
        { field: 'quantity', label: '구매 수량' }, { field: 'leftover', label: '남은 실' }, { field: 'retailer', label: '구매처' }, { field: 'purchaseLink', label: '구매 링크' }, { field: 'price', label: '구매 가격' },
      ])}</div></article>)}<button type="button" className="secondary-button report-add-button" onClick={() => update((current) => ({ ...current, yarns: [...current.yarns, makeYarn()] }))}><Plus size={15} />다른 실 추가</button></>
    if (id === 'needles') return <>
      <div className="report-detail-subheading"><h3>사용 바늘</h3><button type="button" className="secondary-button" onClick={() => update((current) => ({ ...current, needles: [...current.needles, makeNeedle()] }))}><Plus size={14} />바늘 추가</button></div>
      {loadedReport.needles.map((needle, index) => <article className="report-entry-card compact" key={needle.id}><div className="report-entry-title"><strong>바늘 {index + 1}</strong><button type="button" className="report-icon-button" aria-label="바늘 삭제" onClick={() => removeRow('needles', needle.id)}><Trash2 size={15} /></button></div>{rowFields(needle, 'needles', [{ field: 'section', label: '구간' }, { field: 'type', label: '바늘 종류' }, { field: 'size', label: '사이즈' }, { field: 'cableLength', label: '케이블 길이' }, { field: 'memo', label: '메모', wide: true }])}</article>)}
      <div className="report-detail-subheading"><h3>부자재</h3><button type="button" className="secondary-button" onClick={() => update((current) => ({ ...current, accessories: [...current.accessories, makeAccessory()] }))}><Plus size={14} />부자재 추가</button></div>
      {loadedReport.accessories.map((accessory, index) => <article className="report-entry-card" key={accessory.id}><div className="report-entry-title"><strong>부자재 {index + 1}</strong><button type="button" className="report-icon-button" aria-label="부자재 삭제" onClick={() => removeRow('accessories', accessory.id)}><Trash2 size={15} /></button></div><PhotoField label="부자재 사진" value={accessory.photo} onChange={(photo) => updateRow('accessories', accessory.id, { photo })} onProcessingChange={trackPhotoProcessing} />{rowFields(accessory, 'accessories', [{ field: 'type', label: '종류' }, { field: 'size', label: '크기' }, { field: 'quantity', label: '수량' }, { field: 'detail', label: '상세', wide: true }])}</article>)}
    </>
    if (id === 'modifications') return <><p className="report-detail-hint">뜨는 중 남긴 메모에서 후보를 찾습니다. 확인한 내용만 보고서에 추가돼요.</p><button type="button" className="secondary-button" disabled={analysisLoading || switching} onClick={() => void analyzeNow()}><Sparkles size={15} />{analysisLoading ? '찾는 중…' : '수정사항 다시 찾기'}</button>
      {loadedReport.modifications.map((item, index) => <article className="report-entry-card compact" key={item.id}><div className="report-entry-title"><strong>{item.section || '수정사항 ' + (index + 1)}</strong><button type="button" className="report-icon-button" aria-label="수정사항 삭제" onClick={() => removeRow('modifications', item.id)}><Trash2 size={15} /></button></div>{rowFields(item, 'modifications', [{ field: 'section', label: '구간' }, { field: 'original', label: '도안 값' }, { field: 'changed', label: '실제 변경' }, { field: 'memo', label: '메모', wide: true }])}</article>)}
      {!loadedReport.modifications.length && <p className="report-empty-hint">아직 기록된 수정사항이 없어요.</p>}<button type="button" className="secondary-button report-add-button" onClick={() => update((current) => ({ ...current, modifications: [...current.modifications, makeModification()] }))}><Plus size={15} />직접 추가</button></>
    if (id === 'oneLine') return <>{field('review.nextChanges', '한줄 기록', 'multiline', undefined, true)}<small className="report-field-hint">권장 150자 · 다음에 참고하고 싶은 점이나 다시 뜨고 싶은 마음을 적어 주세요.</small></>
    if (id === 'gauge') return <><div className="report-fields">
      {field('gauge.unit', '측정 기준', 'select', ['10cm', '4in'])}{field('gauge.patternStitches', '도안 게이지 · 코')}{field('gauge.patternRows', '도안 게이지 · 단')}
      {field('gauge.beforeStitches', '세탁 전 · 코')}{field('gauge.beforeRows', '세탁 전 · 단')}{field('gauge.afterStitches', '세탁 후 · 코')}{field('gauge.afterRows', '세탁 후 · 단')}{field('gauge.memo', '게이지 메모', 'multiline', undefined, true)}
    </div><div className="report-tension"><strong>손땀</strong><div>{tensionOptions.map((option, index) => <label key={option} className={values['gauge.tension'] === String(index + 1) ? 'selected' : ''}><input type="radio" name="report-tension" value={index + 1} checked={values['gauge.tension'] === String(index + 1)} onChange={() => update((current) => ({ ...current, fields: { ...current.fields, 'gauge.tension': String(index + 1) } }))} />{option}</label>)}</div></div></>
    if (id === 'measurements') return <>{measurementEditor}<small className="report-field-hint">항목명과 단위를 원하는 대로 입력할 수 있어요.</small></>
    if (id === 'fit') return <div className="report-fields">
      {field('review.fit', '핏', 'select', ['작게 느껴짐', '딱 맞음', '여유 있음', '많이 여유 있음'])}{field('review.difficulty', '난이도', 'select', ['쉬움', '보통', '어려움'])}
      {field('review.satisfaction', '전체 만족도', 'select', ['1점', '2점', '3점', '4점', '5점'])}{field('review.yarnSatisfaction', '실 만족도', 'select', ['1점', '2점', '3점', '4점', '5점'])}
      {field('review.patternSatisfaction', '도안 만족도', 'select', ['1점', '2점', '3점', '4점', '5점'])}{field('review.makeAgain', '다시 뜰 의향', 'select', ['있음', '없음'])}
    </div>
    if (id === 'yarnMemo') return <>{field('private.yarnMemo', '실 메모', 'multiline', undefined, true)}<small className="report-field-hint">세탁·촉감·늘어남 등 나중에 다시 볼 내용을 기록합니다.</small></>
    if (id === 'detailMemo') return <>{field('project.memo', '상세 메모', 'multiline', undefined, true)}<small className="report-field-hint">다음 프로젝트를 위해 기억해둘 내용을 자유롭게 적어 주세요.</small></>
    return <div className="report-fields">
      {field('pattern.source', '도안 출처')}{field('pattern.seller', '도안 구매처')}{field('pattern.link', '도안 링크', 'url')}{field('pattern.language', '사용 언어')}
      {field('finished.washed', '세탁 여부', 'select', ['예', '아니오'])}{field('finished.washingMethod', '세탁 방법')}{field('finished.blockingMethod', '블로킹 방법')}
      {field('finished.beforeSize', '세탁 전 크기')}{field('finished.afterSize', '세탁 후 크기')}{field('finished.washMemo', '세탁·블로킹 변화', 'multiline', undefined, true)}
      {field('review.problems', '문제와 해결', 'multiline', undefined, true)}{field('review.memo', '완성 메모', 'multiline', undefined, true)}
    </div>
  }
  const yarnSummary = report.yarns.map((yarn) => [yarn.brand, yarn.product, yarn.colorName, yarn.colorNumber].filter(Boolean).join(' ')).filter(Boolean).join(' · ')
  const usageSummary = report.yarns.map((yarn) => [yarn.usedSkeins && yarn.usedSkeins + '볼', yarn.usedWeight && yarn.usedWeight + 'g', yarn.usedMeters && yarn.usedMeters + 'm'].filter(Boolean).join(' · ')).filter(Boolean).join(' / ')
  const needleSummary = report.needles.map((needle) => [needle.section, needle.size && needle.size + (needle.size.toLowerCase().includes('mm') ? '' : 'mm')].filter(Boolean).join(' ')).filter(Boolean).join(' · ')
  const modificationSummary = report.modifications.map((item) => [item.section, item.changed || item.memo].filter(Boolean).join(' ')).filter(Boolean).join(' · ')
  const photoInput = (kind: 'work' | 'finished') => <label className="secondary-button report-photo-add"><Plus size={15} />사진 추가<input type="file" accept="image/*" multiple onChange={(event) => { const files = [...(event.currentTarget.files ?? [])]; event.currentTarget.value = ''; if (kind === 'work') void addWorkPhotos(files); else void addFinishedPhotos(files) }} /></label>

  return <div className="knitting-report-editor">
    <header className="report-appbar"><button type="button" className="report-appbar-back" aria-label="도안으로 돌아가기" onClick={onBack}><ArrowLeft size={20} /></button><strong>뜨개보고서</strong><span className="report-save-indicator"><i />{saveState}</span><button type="button" className="report-more-trigger" aria-label="보고서 메뉴" aria-expanded={moreOpen} onClick={() => setMoreOpen((value) => !value)}><Ellipsis size={22} /></button>
      {moreOpen && <div className="report-more-menu"><label>보고서 선택<select aria-label="보고서 선택" value={report.id} disabled={switching || processingPhotos || titleEditing} onChange={(event) => { setMoreOpen(false); void switchReport(event.currentTarget.value) }}>{reports.map((item, index) => <option key={item.id} value={item.id}>{item.title || '보고서 ' + (index + 1)}</option>)}</select></label>
        <button type="button" disabled={switching || exporting || processingPhotos || titleEditing} onClick={() => { setMoreOpen(false); void addReport() }}><Plus size={15} />보고서 추가</button><button type="button" disabled={switching || exporting || processingPhotos || titleEditing} onClick={() => { setMoreOpen(false); void downloadReport() }}><Download size={15} />PDF 다운로드</button><button type="button" disabled={switching || processingPhotos || titleEditing} onClick={() => { setMoreOpen(false); void openInstagramImage() }}><ImagePlus size={15} />인스타 이미지 만들기</button><button type="button" disabled={analysisLoading || switching} onClick={() => { setMoreOpen(false); void analyzeNow() }}><Sparkles size={15} />수정사항 다시 찾기</button>
      </div>}
    </header>
    <div className="report-scroll"><main className="knitting-report-content">
      <section className="report-cover-card"><PhotoField label="완성 사진" value={report.representativePhoto} onChange={(value) => update((current) => ({ ...current, representativePhoto: value }))} onProcessingChange={trackPhotoProcessing} /><div className="report-cover-copy"><span className="report-cover-eyebrow">KNITTING REPORT</span>
        <div className="report-title-row">{titleEditing ? <div className="report-title-edit-form"><input className="report-title-input" aria-label="보고서 제목" autoFocus value={titleDraft} onChange={(event) => setTitleDraft(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); saveTitleEdit() } else if (event.key === 'Escape') setTitleEditing(false) }} /><button type="button" className="report-title-action save" aria-label="제목 저장" disabled={!titleDraft.trim()} onClick={saveTitleEdit}><Check size={16} /></button><button type="button" className="report-title-action cancel" aria-label="제목 수정 취소" onClick={() => setTitleEditing(false)}><X size={15} /></button></div> : <><h1>{values['project.name'] || report.title || '프로젝트 이름'}</h1><button type="button" className="report-title-edit-trigger" aria-label="보고서 제목 수정" disabled={switching || exporting || processingPhotos} onClick={beginTitleEdit}><Pencil size={15} /></button></>}</div>
        <button type="button" className="report-cover-pattern" onClick={() => setActiveDetail('pattern')}>{values['pattern.name'] || '도안명 추가'}{values['pattern.designer'] ? ' · ' + values['pattern.designer'] : ''}</button><div className="report-cover-dates"><span>{values['project.co'] || '시작일 추가'}</span><b>—</b><span>{values['project.fo'] || '완료일 추가'}</span><button type="button" onClick={() => setActiveDetail('project')}>프로젝트 정보 편집</button></div>
      </div></section>
      <section className="report-overview-section"><header><div><h2>공유 추천</h2><p>Instagram에 함께 올리면 다른 뜨개인에게 도움이 되는 정보예요.</p></div></header><div className="report-summary-list">
        <ReportCard title="뜬 사이즈" icon={<Ruler size={18} />} summary={values['pattern.selectedSize'] || values['pattern.originalSizes'] || ''} recommended onClick={() => setActiveDetail('size')} />
        <ReportCard title="사용 실" icon={<span>◉</span>} summary={[yarnSummary, usageSummary].filter(Boolean).join(' · ')} recommended onClick={() => setActiveDetail('yarn')} />
        <ReportCard title="사용 바늘" icon={<Scissors size={18} />} summary={needleSummary} recommended onClick={() => setActiveDetail('needles')} />
        <ReportCard title="도안에서 수정한 부분" icon={<Pencil size={17} />} summary={modificationSummary} recommended onClick={() => setActiveDetail('modifications')} />
        <ReportCard title="한줄 기록" icon={<Clipboard size={17} />} summary={values['review.nextChanges'] || ''} recommended onClick={() => setActiveDetail('oneLine')} />
      </div>
      {(report.analysisCandidates ?? []).some((candidate) => candidate.status === 'suggested') && <button type="button" className="report-candidate-notice" onClick={() => { const pending = report.analysisCandidates!.filter((candidate) => candidate.status === 'suggested'); setCandidateSelection(pending.map((candidate) => candidate.id)); setCandidateReviewOpen(true) }}><Sparkles size={16} />수정사항 후보 {report.analysisCandidates!.filter((candidate) => candidate.status === 'suggested').length}개 확인하기</button>}
      {analysisNotice && <small className="report-analysis-notice" role="status">{analysisNotice}</small>}</section>
      <section className="report-personal-section"><header><div><h2>내 기록 <span className="report-help-mark" title="필요한 항목만 열어 개인 기록으로 남길 수 있어요.">?</span></h2><p>필요할 때 다시 확인할 수 있도록 자세히 남겨두세요.</p></div></header>
        <PersonalCard title="게이지" summary={[values['gauge.patternStitches'] && values['gauge.patternStitches'] + '코', values['gauge.patternRows'] && values['gauge.patternRows'] + '단', values['gauge.afterStitches'] && '실제 ' + values['gauge.afterStitches'] + '코', values['gauge.afterRows'] && values['gauge.afterRows'] + '단'].filter(Boolean).join(' · ')} icon={<Gauge size={18} />} open={expandedPersonal.includes('gauge')} onClick={() => togglePersonal('gauge')} />
        {expandedPersonal.includes('gauge') && <div className="report-personal-inline">{detailContent('gauge')}</div>}
        <PersonalCard title="완성 실측" summary={report.measurements.filter((row) => row.finished.trim()).map((row) => [row.label, row.finished].filter(Boolean).join(' ')).join(' · ')} icon={<Ruler size={18} />} open={expandedPersonal.includes('measurements')} onClick={() => togglePersonal('measurements')} />
        {expandedPersonal.includes('measurements') && <div className="report-personal-inline">{detailContent('measurements')}</div>}
        <PersonalCard title="핏 기록" summary={values['review.fit'] || ''} icon={<Shirt size={18} />} open={expandedPersonal.includes('fit')} onClick={() => togglePersonal('fit')} />
        {expandedPersonal.includes('fit') && <div className="report-personal-inline">{detailContent('fit')}</div>}
        <PersonalCard title="실 메모" summary={values['private.yarnMemo'] || ''} icon={<span>◉</span>} open={expandedPersonal.includes('yarnMemo')} onClick={() => togglePersonal('yarnMemo')} />
        {expandedPersonal.includes('yarnMemo') && <div className="report-personal-inline">{detailContent('yarnMemo')}</div>}
        <PersonalCard title="상세 메모" summary={values['project.memo'] || ''} icon={<Clipboard size={18} />} open={expandedPersonal.includes('detailMemo')} onClick={() => togglePersonal('detailMemo')} />
        {expandedPersonal.includes('detailMemo') && <div className="report-personal-inline">{detailContent('detailMemo')}</div>}
        <button type="button" className="report-more-records" onClick={() => setActiveDetail('extras')}>기타 기록 · 세탁 · 후기 편집 <Pencil size={14} /></button>
      </section>
      <section className="report-photo-section"><header><div><h2>사진 모음 <small>(선택)</small></h2><p>진행 과정이나 디테일 사진을 추가해 보세요.</p></div></header><div className="report-photo-grid">
        {report.workPhotos.slice().sort((left, right) => left.activityDate.localeCompare(right.activityDate) || left.uploadedAt - right.uploadedAt).map((photo) => <article className="report-photo-tile" key={photo.id}><img src={photo.dataUrl} alt={photo.label || '작업 과정'} /><input aria-label="작업 날짜" type="date" value={photo.activityDate} onChange={(event) => updateWorkPhoto(photo.id, { activityDate: event.currentTarget.value || localDateValue(photo.uploadedAt) })} /><input aria-label="작업 사진 설명" value={photo.label} placeholder="작업 내용" onChange={(event) => updateWorkPhoto(photo.id, { label: event.currentTarget.value })} /><button type="button" className="report-photo-delete" aria-label="작업 사진 삭제" onClick={() => update((current) => ({ ...current, workPhotos: current.workPhotos.filter((item) => item.id !== photo.id) }))}><Trash2 size={14} /></button></article>)}
        {report.finishedPhotos.map((photo) => <article className="report-photo-tile" key={photo.id}><img src={photo.dataUrl} alt={photo.label || '완성 사진'} /><input aria-label="완성 사진 설명" value={photo.label} placeholder="완성 사진" onChange={(event) => update((current) => ({ ...current, finishedPhotos: current.finishedPhotos.map((item) => item.id === photo.id ? { ...item, label: event.currentTarget.value } : item) }))} /><button type="button" className="report-photo-delete" aria-label="완성 사진 삭제" onClick={() => update((current) => ({ ...current, finishedPhotos: current.finishedPhotos.filter((item) => item.id !== photo.id) }))}><Trash2 size={14} /></button></article>)}
        {photoInput('work')}{photoInput('finished')}
      </div></section>
      {activeDetail && <div className="modal-backdrop report-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !processingPhotos) setActiveDetail(null) }}><section className="modal-card report-detail-dialog" role="dialog" aria-modal="true" aria-label={detailTitles[activeDetail]}><header className="report-detail-header"><button type="button" className="icon-button" aria-label="보고서로 돌아가기" onClick={() => setActiveDetail(null)}><ArrowLeft size={18} /></button><div><small>뜨개보고서</small><h2>{detailTitles[activeDetail]}</h2></div><button type="button" className="text-button" onClick={() => setActiveDetail(null)}>완료</button></header><div className="report-detail-body">{detailContent(activeDetail)}</div></section></div>}
      {candidateReviewOpen && <div className="modal-backdrop report-candidates-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCandidateReviewOpen(false) }}><section className="modal-card report-candidate-dialog" role="dialog" aria-modal="true" aria-label="수정사항 후보 검토"><header className="report-detail-header"><div><small>MODIFICATION REVIEW</small><h2>수정사항 후보</h2><p>확인한 내용만 보고서에 추가됩니다.</p></div><button type="button" className="icon-button" aria-label="닫기" onClick={() => setCandidateReviewOpen(false)}><X size={18} /></button></header><div className="report-candidate-list">{(report.analysisCandidates ?? []).filter((candidate) => candidate.status === 'suggested').map((candidate) => <article className="report-candidate-card" key={candidate.id}><label><input type="checkbox" checked={candidateSelection.includes(candidate.id)} onChange={() => setCandidateSelection((current) => current.includes(candidate.id) ? current.filter((id) => id !== candidate.id) : [...current, candidate.id])} /><span>선택</span></label><input aria-label="후보 구간" value={candidate.section} onChange={(event) => update((current) => ({ ...current, analysisCandidates: (current.analysisCandidates ?? []).map((item) => item.id === candidate.id ? { ...item, section: event.currentTarget.value } : item) }))} /><div className="report-candidate-values">{candidate.original && <span>{candidate.original}</span>}<textarea aria-label="후보 수정 내용" value={candidate.changed} onChange={(event) => update((current) => ({ ...current, analysisCandidates: (current.analysisCandidates ?? []).map((item) => item.id === candidate.id ? { ...item, changed: event.currentTarget.value } : item) }))} /></div><small>{candidate.source === 'counter' ? '카운터 기록' : '기록 메모'} · {candidate.evidence}</small><button type="button" className="text-button" disabled={switching} onClick={() => void dismissCandidate(candidate.id)}>후보 제외</button></article>)}</div><footer className="report-candidate-actions"><span>{candidateSelection.length}개 선택</span><button type="button" className="primary-button" disabled={switching || !candidateSelection.length} onClick={() => void applyCandidates()}>선택한 항목 추가</button></footer></section></div>}
    </main></div>
    <footer className="report-bottom-actions"><button type="button" className="report-save-button" disabled={switching || exporting || processingPhotos} onClick={async () => { setSwitching(true); try { await flushPendingReport(); setSaveState('저장됨') } catch (cause) { setSaveState(cause instanceof Error ? cause.message : '저장하지 못했습니다.') } finally { setSwitching(false) }}}>저장</button><button type="button" className="report-caption-button" disabled={switching || processingPhotos || titleEditing} onClick={() => void openCaption()}><Clipboard size={17} />IG 문구 복사</button></footer>
    {captionOpen && <InstagramCaptionDialog report={report} onClose={() => setCaptionOpen(false)} onCopied={() => setSaveState('IG 문구가 복사됐어요.')} />}
    {instagramOpen && <InstagramReportDialog report={report} onClose={() => setInstagramOpen(false)} />}
  </div>
}
