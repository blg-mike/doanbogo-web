import { formatDate, formatDayCount, formatNumber, t, translateMessage, type LocaleKey } from './locales/index'
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ArrowLeft, CalendarDays, Check, ChevronDown, ChevronUp, Clipboard, Clock3, Download, Ellipsis, Gauge, ImagePlus, Pencil, Plus, Ruler, Scissors, Share2, Shirt, Sparkles, Trash2, X } from 'lucide-react'
import BrandLoading from './BrandLoading'
import { getKnittingReportById, getKnittingReports, getPageWorks, getViewer, saveKnittingReport, type KnittingReportSummary } from './storage'
import type { CounterSnapshot, KnittingReport, ReportAccessory, ReportMeasurement, ReportModification, ReportNeedle, ReportTimelinePhoto, ReportYarn } from './types'
import { exportKnittingReportPdf } from './knittingReportPdf'
import InstagramReportDialog from './InstagramReportDialog'
import InstagramCaptionDialog from './InstagramCaptionDialog'
import { analyzeKnittingReportCandidates } from './knittingReportAnalysis'
import { formatWorkTime } from './workTime'
import './ReportDesignSystem.css'

type Props = { documentId: string; fileName: string; pageCount: number; totalWorkTimeMs: number; reportId?: string; onBack: () => void }
type FieldKind = 'text' | 'date' | 'number' | 'url' | 'multiline' | 'select' | 'tags'
type DetailId = 'project' | 'pattern' | 'size' | 'yarn' | 'needles' | 'modifications' | 'oneLine' | 'gauge' | 'measurements' | 'fit' | 'yarnMemo' | 'detailMemo' | 'extras'

const featureOptions = '라글란,드롭숄더,브이넥,크롭,오버핏,케이블,배색,탑다운,바텀업'
const tensionOptions = ['많이 널손', '널손', '보통', '쫀손', '많이 쫀손']

function formatNumericText(value?: string) {
  if (!value || !/^[+-]?\d+(?:[.,]\d+)?$/.test(value.trim())) return value ?? ''
  return formatNumber(Number(value.trim().replace(',', '.')))
}

function cleanName(fileName: string) {
  return fileName.replace(/\.pdf$/i, '').trim() || t('뜨개 프로젝트')
}

function createKnittingReport(documentId: string, fileName: string, title = cleanName(fileName)): KnittingReport {
  return {
    id: crypto.randomUUID(), documentId, title, createdAt: Date.now(), updatedAt: Date.now(), status: 'draft', completedAt: null, fields: { 'project.name': title }, representativePhoto: '',
    yarns: [], needles: [], accessories: [],
    measurements: [t('기장'), t('가슴둘레'), t('소매길이')].map((label) => ({ id: crypto.randomUUID(), label, pattern: '', finished: '', unit: 'cm' as const })),
    modifications: [], finishedPhotos: [], workPhotos: [],
  }
}

function summarizeReport(report: KnittingReport): KnittingReportSummary {
  return { id: report.id, documentId: report.documentId, title: report.title, createdAt: report.createdAt, updatedAt: report.updatedAt, status: report.status ?? 'draft', completedAt: report.completedAt ?? null }
}

function localDateValue(timestamp: number) {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function projectDays(start: string, finish: string) {
  if (!start || !finish) return ''
  const from = new Date(start + 'T00:00:00')
  const to = new Date(finish + 'T00:00:00')
  const days = Math.floor((to.getTime() - from.getTime()) / 86400000)
  return Number.isFinite(days) && days >= 0 ? formatDayCount(days) : ''
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
  const [draft, setDraft] = useState(value)
  function commit() {
    if (draft !== value) onChange(draft)
  }
  function editKeys(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      setDraft(value)
      event.currentTarget.blur()
    } else if (event.key === 'Enter' && (kind !== 'multiline' || event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) {
      event.preventDefault()
      commit()
      event.currentTarget.blur()
    }
  }
  return <label className={'report-field' + (wide ? ' wide' : '')}>{t(label as LocaleKey)}
    {kind === 'select' ? <select value={value} onChange={(event) => onChange(event.currentTarget.value)}><option value="">{t("선택")}</option>{options?.map((option) => <option key={option} value={option}>{t(option as LocaleKey)}</option>)}</select> :
      kind === 'tags' ? <span className="report-tag-options">{options?.map((option) => {
        const selected = value.split(',').map((item) => item.trim()).filter(Boolean).includes(option)
        return <button key={option} type="button" className={selected ? 'selected' : ''} onClick={() => onChange(selected ? value.split(',').map((item) => item.trim()).filter((item) => item !== option).join(', ') : [...value.split(',').map((item) => item.trim()).filter(Boolean), option].join(', '))}>{t(option as LocaleKey)}</button>
      })}</span> :
      kind === 'multiline' ? <textarea value={draft} onChange={(event) => setDraft(event.currentTarget.value)} onBlur={commit} onKeyDown={editKeys} rows={3} /> :
        <input type={kind === 'number' ? 'text' : kind} inputMode={kind === 'number' ? 'decimal' : undefined} value={draft} onChange={(event) => setDraft(event.currentTarget.value)} onBlur={commit} onKeyDown={editKeys} />}
  </label>
}

function PhotoField({ label, value, onChange, onProcessingChange, onPreview }: { label: string; value: string; onChange: (value: string) => void; onProcessingChange?: (processing: boolean) => void; onPreview?: (value: string) => void }) {
  const [error, setError] = useState('')
  async function readPhoto(file?: File) {
    if (!file) return
    onProcessingChange?.(true)
    try { onChange(await compressPhoto(file)); setError('') }
    catch (reason) { setError(reason instanceof Error ? translateMessage(reason.message) : t('사진을 처리할 수 없습니다.')) }
    finally { onProcessingChange?.(false) }
  }
  return <div className="report-photo-field">
    {value ? onPreview ? <button type="button" className="report-photo-preview" aria-label={t(label as LocaleKey) + ' ' + t('크게 보기')} onClick={() => onPreview(value)}><img src={value} alt={t(label as LocaleKey)} /></button> : <img src={value} alt={t(label as LocaleKey)} /> : <div className="report-photo-empty"><ImagePlus size={21} /><span>{t(label as LocaleKey)}</span></div>}
    <label className="report-photo-button"><ImagePlus size={15} />{t(value ? '사진 바꾸기' : '사진 추가')}<input type="file" accept="image/*" onChange={(event) => { void readPhoto(event.currentTarget.files?.[0]); event.currentTarget.value = '' }} /></label>
    {value && <button className="report-remove-photo" aria-label={t(label as LocaleKey) + ' ' + t('삭제')} onClick={() => onChange('')}><Trash2 size={14} /></button>}
    {error && <small className="report-error">{error}</small>}
  </div>
}

function ReportCard({ title, summary, icon, recommended, onClick }: { title: string; summary: string; icon: ReactNode; recommended?: boolean; onClick: () => void }) {
  return <button type="button" className="report-summary-card" onClick={onClick}><span className="report-summary-icon">{icon}</span><span className="report-summary-copy"><strong>{title}</strong><small>{summary || t('필요할 때 다시 확인할 수 있도록 자세히 남겨두세요.')}</small></span>{recommended && <span className="report-recommended">{t("추천")}</span>}<Pencil size={15} className="report-summary-edit" /></button>
}

function PersonalCard({ title, summary, icon, open, onClick }: { title: string; summary: string; icon: ReactNode; open: boolean; onClick: () => void }) {
  return <button type="button" className={'report-personal-card' + (open ? ' open' : '')} aria-expanded={open} onClick={onClick}><span className="report-personal-icon">{icon}</span><span className="report-summary-copy"><strong>{title}</strong><small>{summary || t('필요할 때 다시 확인할 수 있도록 자세히 남겨두세요.')}</small></span><ChevronDown size={17} className="report-personal-chevron" /></button>
}

export default function KnittingReport({ documentId, fileName, pageCount, totalWorkTimeMs, reportId, onBack }: Props) {
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
  const [previewPhoto, setPreviewPhoto] = useState('')
  const [draggedPhotoId, setDraggedPhotoId] = useState('')
  const [undoDelete, setUndoDelete] = useState<{ label: string; restore: (current: KnittingReport) => KnittingReport } | null>(null)
  const [expandedPersonal, setExpandedPersonal] = useState<string[]>([])
  const [moreOpen, setMoreOpen] = useState(false)
  const moreTriggerRef = useRef<HTMLButtonElement>(null)
  const moreMenuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!moreOpen) return
    function handlePointerDown(event: globalThis.PointerEvent) {
      const target = event.target
      if (!(target instanceof Node) || moreMenuRef.current?.contains(target) || moreTriggerRef.current?.contains(target)) return
      setMoreOpen(false)
    }
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setMoreOpen(false)
      moreTriggerRef.current?.focus()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [moreOpen])
  const [candidateReviewOpen, setCandidateReviewOpen] = useState(false)
  const [candidateSelection, setCandidateSelection] = useState<string[]>([])
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisNotice, setAnalysisNotice] = useState('')
  const timer = useRef<number | undefined>(undefined)
  const undoTimer = useRef<number | undefined>(undefined)
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
      const current = currentReports.find((item) => item.id === reportId) ?? currentReports.reduce((latest, item) => item.updatedAt > latest.updatedAt ? item : latest)
      setReports(currentReports.map(summarizeReport))
      reportRef.current = current
      setReport(current)
      setSaveState('저장됨')
      if (createdOnOpen) void analyzeNowRef.current(current)
    })().catch(() => { if (!disposed) setSaveState('불러오지 못했습니다. 페이지를 다시 열어 주세요.') })
    return () => {
      disposed = true
      if (timer.current !== undefined) window.clearTimeout(timer.current)
      if (undoTimer.current !== undefined) window.clearTimeout(undoTimer.current)
      if (reportRef.current?.documentId === documentId) void persistReport(reportRef.current)
    }
  }, [documentId, fileName, reportId])

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
      setReports((items) => items.map((item) => item.id === saved.id ? summarizeReport(saved) : item))
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
      setSaveState(cause instanceof Error ? translateMessage(cause.message) : t('보고서를 불러오지 못했습니다.'))
    } finally {
      setSwitching(false)
    }
  }

  async function addReport() {
    if (switching || processingPhotos) return
    setSwitching(true)
    try {
      await flushPendingReport()
      const next = await saveKnittingReport(createKnittingReport(documentId, fileName, `${t('새 보고서')} ${formatNumber(reports.length + 1)}`))
      reportRef.current = next
      setReport(next)
      setReports((items) => [...items, summarizeReport(next)])
      setSaveState('저장됨')
      void analyzeNow(next)
    } catch (cause) {
      setSaveState(cause instanceof Error ? translateMessage(cause.message) : t('보고서를 추가하지 못했습니다.'))
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
    setReports((items) => items.map((item) => item.id === next.id ? summarizeReport(next) : item))
    setSaveState('저장 중…')
    if (timer.current !== undefined) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = undefined
      void persistReport(next).then((saved) => {
        if (reportRef.current !== next) return
        reportRef.current = saved
        setReport(saved)
        setSaveState('저장됨')
      }).catch(() => setSaveState(t('저장하지 못했습니다. 저장 공간을 확인해 주세요.')))
    }, 350)
  }

  function scheduleUndo(label: string, restore: (current: KnittingReport) => KnittingReport) {
    if (undoTimer.current !== undefined) window.clearTimeout(undoTimer.current)
    setUndoDelete({ label, restore })
    undoTimer.current = window.setTimeout(() => {
      undoTimer.current = undefined
      setUndoDelete(null)
    }, 4000)
  }

  function undoLastDelete() {
    if (!undoDelete) return
    if (undoTimer.current !== undefined) window.clearTimeout(undoTimer.current)
    undoTimer.current = undefined
    update(undoDelete.restore)
    setUndoDelete(null)
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
    const value = report?.fields[id] ?? ''
    return <ReportField key={id + ':' + value} label={label} value={value} kind={kind} options={options} wide={wide} onChange={(nextValue) => update((current) => ({ ...current, fields: { ...current.fields, [id]: nextValue } }))} />
  }

  function updateRow<K extends ReportCollectionKey>(key: K, id: string, patch: Partial<KnittingReport[K][number]>) {
    update((current) => ({ ...current, [key]: (current[key] as ReportRow[]).map((row) => row.id === id ? { ...row, ...patch } : row) }) as KnittingReport)
  }

  function removeRow(key: ReportCollectionKey, id: string) {
    const current = reportRef.current
    const rows = current?.[key] as ReportRow[] | undefined
    const index = rows?.findIndex((row) => row.id === id) ?? -1
    if (!rows || index < 0) return
    const removed = rows[index]
    scheduleUndo('항목을 삭제했습니다.', (latest) => {
      const nextRows = latest[key] as ReportRow[]
      const insertAt = Math.min(index, nextRows.length)
      return { ...latest, [key]: [...nextRows.slice(0, insertAt), removed, ...nextRows.slice(insertAt)] } as KnittingReport
    })
    update((current) => ({ ...current, [key]: (current[key] as ReportRow[]).filter((row) => row.id !== id) }) as KnittingReport)
  }

  function removeReportPhoto(kind: 'work' | 'finished', id: string) {
    const current = reportRef.current
    if (!current) return
    if (kind === 'work') {
      const index = current.workPhotos.findIndex((photo) => photo.id === id)
      if (index < 0) return
      const removed = current.workPhotos[index]
      scheduleUndo('작업 사진을 삭제했습니다.', (latest) => ({ ...latest, workPhotos: [...latest.workPhotos.slice(0, Math.min(index, latest.workPhotos.length)), removed, ...latest.workPhotos.slice(Math.min(index, latest.workPhotos.length))] }))
      update((latest) => ({ ...latest, workPhotos: latest.workPhotos.filter((photo) => photo.id !== id) }))
      return
    }
    const index = current.finishedPhotos.findIndex((photo) => photo.id === id)
    if (index < 0) return
    const removed = current.finishedPhotos[index]
    scheduleUndo('완성 사진을 삭제했습니다.', (latest) => ({ ...latest, finishedPhotos: [...latest.finishedPhotos.slice(0, Math.min(index, latest.finishedPhotos.length)), removed, ...latest.finishedPhotos.slice(Math.min(index, latest.finishedPhotos.length))] }))
    update((latest) => ({ ...latest, finishedPhotos: latest.finishedPhotos.filter((photo) => photo.id !== id) }))
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
      setSaveState(cause instanceof Error ? translateMessage(cause.message) : t('수정사항 후보를 분석하지 못했습니다.'))
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
      setSaveState(cause instanceof Error ? translateMessage(cause.message) : t('선택한 수정사항을 저장하지 못했습니다.'))
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
      setSaveState(cause instanceof Error ? translateMessage(cause.message) : t('후보를 제외하지 못했습니다.'))
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

  function moveWorkPhoto(index: number, offset: number) {
    update((current) => {
      const destination = index + offset
      if (destination < 0 || destination >= current.workPhotos.length) return current
      const workPhotos = [...current.workPhotos]
      ;[workPhotos[index], workPhotos[destination]] = [workPhotos[destination], workPhotos[index]]
      return { ...current, workPhotos }
    })
  }

  function reorderWorkPhoto(sourceId: string, targetId: string) {
    update((current) => {
      const from = current.workPhotos.findIndex((photo) => photo.id === sourceId)
      const to = current.workPhotos.findIndex((photo) => photo.id === targetId)
      if (from < 0 || to < 0 || from === to) return current
      const workPhotos = [...current.workPhotos]
      const [photo] = workPhotos.splice(from, 1)
      workPhotos.splice(to, 0, photo)
      return { ...current, workPhotos }
    })
  }

  function rowFields<T extends ReportRow, K extends ReportCollectionKey>(row: T, key: K, descriptors: { field: keyof T; label: string; wide?: boolean }[]) {
    return <div className="report-fields">{descriptors.map(({ field: fieldName, label, wide }) => {
      const value = String(row[fieldName] ?? '')
      return <ReportField key={String(fieldName) + ':' + value} label={label} value={value} wide={wide} onChange={(nextValue) => updateRow(key, row.id, { [fieldName]: nextValue } as Partial<KnittingReport[K][number]>)} />
    })}</div>
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
      setReports((items) => items.map((item) => item.id === saved.id ? summarizeReport(saved) : item))
      await exportKnittingReportPdf(saved, totalWorkTimeMs)
      setSaveState('저장됨')
    } catch (error) {
      setSaveState(error instanceof Error ? translateMessage(error.message) : t('PDF를 만들지 못했습니다.'))
    } finally { setExporting(false) }
  }

  async function openCaption() {
    if (!report || switching) return
    setSwitching(true)
    try {
      await flushPendingReport()
      setCaptionOpen(true)
    } catch (cause) {
      setSaveState(cause instanceof Error ? translateMessage(cause.message) : t('보고서를 저장하지 못했습니다.'))
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
      setSaveState(cause instanceof Error ? translateMessage(cause.message) : t('보고서를 저장하지 못했습니다.'))
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
      setSaveState(cause instanceof Error ? translateMessage(cause.message) : t('사진을 처리하지 못했습니다.'))
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
      setSaveState(cause instanceof Error ? translateMessage(cause.message) : t('사진을 처리하지 못했습니다.'))
    } finally {
      trackPhotoProcessing(false)
    }
  }

  if (!report) return saveState === '불러오는 중'
    ? <BrandLoading kind="report" requestId={'report:' + documentId} layout="report" />
    : <div className="knitting-report-error" role="alert">{translateMessage(saveState)}</div>
  const loadedReport = report
  const values = report.fields
  const detailTitles: Record<DetailId, LocaleKey> = { project: '프로젝트 정보', pattern: '도안 정보', size: '사이즈', yarn: '사용 실', needles: '바늘 · 부자재', modifications: '도안에서 수정한 부분', oneLine: '한줄 기록', gauge: '게이지', measurements: '완성 실측', fit: '핏 · 완성 후기', yarnMemo: '실 메모', detailMemo: '상세 메모', extras: '기타 기록' }
  const measurementEditor = <div className="report-measurement-editor">{report.measurements.map((row) => <article className="report-measurement-edit-row" key={row.id}>
    <input aria-label={t("측정 항목")} placeholder={t("예: 총장")} value={row.label} onChange={(event) => updateRow('measurements', row.id, { label: event.currentTarget.value })} />
    <input aria-label={t("도안 치수")} placeholder={t("도안")} value={row.pattern} onChange={(event) => updateRow('measurements', row.id, { pattern: event.currentTarget.value })} />
    <input aria-label={t("완성 치수")} placeholder={t("완성")} value={row.finished} onChange={(event) => updateRow('measurements', row.id, { finished: event.currentTarget.value })} />
    <select aria-label={t("치수 단위")} value={row.unit ?? 'cm'} onChange={(event) => updateRow('measurements', row.id, { unit: event.currentTarget.value as 'cm' | 'inch' })}><option value="cm">cm</option><option value="inch">{t('inch')}</option></select>
    <button type="button" className="report-icon-button" aria-label={t("측정 항목 삭제")} onClick={() => removeRow('measurements', row.id)}><Trash2 size={15} /></button>
  </article>)}<button type="button" className="secondary-button report-add-button" onClick={() => update((current) => ({ ...current, measurements: [...current.measurements, makeMeasurement()] }))}><Plus size={15} />{t("측정 항목 추가")}</button></div>

  function detailContent(id: DetailId) {
    if (id === 'project') return <div className="report-fields">
      {field('project.craft', '뜨개 종류', 'select', ['대바늘', '코바늘'])}
      <label className="report-field">{t("프로젝트 상태")}<select value={values['project.status'] ?? ''} onChange={(event) => changeProjectStatus(event.currentTarget.value)}><option value="">{t("선택")}</option>{['예정', '진행중', '완성', '중단'].map((option) => <option key={option} value={option}>{t(option as LocaleKey)}</option>)}</select></label>
      {field('project.co', 'CO · 시작일', 'date')}{field('project.fo', 'FO · 완성일', 'date')}{field('project.workTime', '작업시간 메모', 'text')}{field('project.recipient', '만든 대상')}
    </div>
    if (id === 'pattern') return <div className="report-fields">
      {field('pattern.name', '도안명')}{field('pattern.designer', '원작자 · 디자이너')}{field('pattern.source', '도안 출처')}
      {field('pattern.seller', '도안 구매처')}{field('pattern.link', '도안 링크', 'url')}{field('pattern.language', '사용 언어')}
      {field('pattern.features', '디자인 특징', 'tags', featureOptions.split(','), true)}{field('pattern.memo', '도안 메모', 'multiline', undefined, true)}
    </div>
    if (id === 'size') return <>{field('pattern.originalSizes', '도안 사이즈')}{field('pattern.selectedSize', '뜬 사이즈')}{measurementEditor}</>
    if (id === 'yarn') return <>{loadedReport.yarns.map((yarn, index) => <article className="report-entry-card" key={yarn.id}>
      <div className="report-entry-title"><strong>{t("사용 실 ")}{index + 1}</strong><button type="button" className="report-icon-button" aria-label={t("실 삭제")} onClick={() => removeRow('yarns', yarn.id)}><Trash2 size={15} /></button></div>
      <div className="report-entry-with-photo"><PhotoField label="실 사진" value={yarn.photo} onChange={(photo) => updateRow('yarns', yarn.id, { photo })} onProcessingChange={trackPhotoProcessing} onPreview={setPreviewPhoto} />{rowFields(yarn, 'yarns', [
        { field: 'brand', label: '브랜드' }, { field: 'product', label: '제품명' }, { field: 'colorName', label: '컬러명' }, { field: 'colorNumber', label: '컬러번호' },
        { field: 'usedSkeins', label: '사용 타래 수' }, { field: 'usedWeight', label: '사용 중량 (g)' }, { field: 'usedMeters', label: '사용 길이 (m)' }, { field: 'memo', label: '메모', wide: true },
        { field: 'lot', label: 'Lot No.' }, { field: 'fiber', label: '성분' }, { field: 'weightClass', label: '실 굵기' }, { field: 'skeinWeight', label: '타래 중량' },
        { field: 'skeinLength', label: '타래 길이' }, { field: 'recommendedNeedle', label: '권장 바늘' }, { field: 'country', label: '제조국' },
        { field: 'quantity', label: '구매 수량' }, { field: 'leftover', label: '남은 실' }, { field: 'retailer', label: '구매처' }, { field: 'purchaseLink', label: '구매 링크' }, { field: 'price', label: '구매 가격' },
      ])}</div></article>)}<button type="button" className="secondary-button report-add-button" onClick={() => update((current) => ({ ...current, yarns: [...current.yarns, makeYarn()] }))}><Plus size={15} />{t("다른 실 추가")}</button></>
    if (id === 'needles') return <>
      <div className="report-detail-subheading"><h3>{t("사용 바늘")}</h3><button type="button" className="secondary-button" onClick={() => update((current) => ({ ...current, needles: [...current.needles, makeNeedle()] }))}><Plus size={14} />{t("바늘 추가")}</button></div>
      {loadedReport.needles.map((needle, index) => <article className="report-entry-card compact" key={needle.id}><div className="report-entry-title"><strong>{t("바늘 ")}{index + 1}</strong><button type="button" className="report-icon-button" aria-label={t("바늘 삭제")} onClick={() => removeRow('needles', needle.id)}><Trash2 size={15} /></button></div>{rowFields(needle, 'needles', [{ field: 'section', label: '구간' }, { field: 'type', label: '바늘 종류' }, { field: 'size', label: '사이즈' }, { field: 'cableLength', label: '케이블 길이' }, { field: 'memo', label: '메모', wide: true }])}</article>)}
      <div className="report-detail-subheading"><h3>{t("부자재")}</h3><button type="button" className="secondary-button" onClick={() => update((current) => ({ ...current, accessories: [...current.accessories, makeAccessory()] }))}><Plus size={14} />{t("부자재 추가")}</button></div>
      {loadedReport.accessories.map((accessory, index) => <article className="report-entry-card" key={accessory.id}><div className="report-entry-title"><strong>{t("부자재 ")}{index + 1}</strong><button type="button" className="report-icon-button" aria-label={t("부자재 삭제")} onClick={() => removeRow('accessories', accessory.id)}><Trash2 size={15} /></button></div><PhotoField label="부자재 사진" value={accessory.photo} onChange={(photo) => updateRow('accessories', accessory.id, { photo })} onProcessingChange={trackPhotoProcessing} onPreview={setPreviewPhoto} />{rowFields(accessory, 'accessories', [{ field: 'type', label: '종류' }, { field: 'size', label: '크기' }, { field: 'quantity', label: '수량' }, { field: 'detail', label: '상세', wide: true }])}</article>)}
    </>
    if (id === 'modifications') return <><p className="report-detail-hint">{t("뜨는 중 남긴 메모에서 후보를 찾습니다. 확인한 내용만 보고서에 추가돼요.")}</p><button type="button" className="secondary-button" disabled={analysisLoading || switching} onClick={() => void analyzeNow()}><Sparkles size={15} />{analysisLoading ? t('찾는 중…') : t('수정사항 다시 찾기')}</button>
      {loadedReport.modifications.map((item, index) => <article className="report-entry-card compact" key={item.id}><div className="report-entry-title"><strong>{item.section || '수정사항 ' + (index + 1)}</strong><button type="button" className="report-icon-button" aria-label={t("수정사항 삭제")} onClick={() => removeRow('modifications', item.id)}><Trash2 size={15} /></button></div>{rowFields(item, 'modifications', [{ field: 'section', label: '구간' }, { field: 'original', label: '도안 값' }, { field: 'changed', label: '실제 변경' }, { field: 'memo', label: '메모', wide: true }])}</article>)}
      {!loadedReport.modifications.length && <p className="report-empty-hint">{t("아직 기록된 수정사항이 없어요.")}</p>}<button type="button" className="secondary-button report-add-button" onClick={() => update((current) => ({ ...current, modifications: [...current.modifications, makeModification()] }))}><Plus size={15} />{t("직접 추가")}</button></>
    if (id === 'oneLine') return <>{field('review.nextChanges', '한줄 기록', 'multiline', undefined, true)}<small className="report-field-hint">{t("권장 150자 · 다음에 참고하고 싶은 점이나 다시 뜨고 싶은 마음을 적어 주세요.")}</small></>
    if (id === 'gauge') return <><div className="report-fields">
      {field('gauge.unit', '측정 기준', 'select', ['10cm', '4in'])}{field('gauge.patternStitches', '도안 게이지 · 코')}{field('gauge.patternRows', '도안 게이지 · 단')}
      {field('gauge.beforeStitches', '세탁 전 · 코')}{field('gauge.beforeRows', '세탁 전 · 단')}{field('gauge.afterStitches', '세탁 후 · 코')}{field('gauge.afterRows', '세탁 후 · 단')}{field('gauge.memo', '게이지 메모', 'multiline', undefined, true)}
    </div><div className="report-tension"><strong>{t("손땀")}</strong><div>{tensionOptions.map((option, index) => <label key={option} className={values['gauge.tension'] === String(index + 1) ? 'selected' : ''}><input type="radio" name="report-tension" value={index + 1} checked={values['gauge.tension'] === String(index + 1)} onChange={() => update((current) => ({ ...current, fields: { ...current.fields, 'gauge.tension': String(index + 1) } }))} />{t(option as LocaleKey)}</label>)}</div></div></>
    if (id === 'measurements') return <>{measurementEditor}<small className="report-field-hint">{t("항목명과 단위를 원하는 대로 입력할 수 있어요.")}</small></>
    if (id === 'fit') return <div className="report-fields">
      {field('review.fit', '핏', 'select', ['작게 느껴짐', '딱 맞음', '여유 있음', '많이 여유 있음'])}{field('review.difficulty', '난이도', 'select', ['쉬움', '보통', '어려움'])}
      {field('review.satisfaction', '전체 만족도', 'select', ['1점', '2점', '3점', '4점', '5점'])}{field('review.yarnSatisfaction', '실 만족도', 'select', ['1점', '2점', '3점', '4점', '5점'])}
      {field('review.patternSatisfaction', '도안 만족도', 'select', ['1점', '2점', '3점', '4점', '5점'])}{field('review.makeAgain', '다시 뜰 의향', 'select', ['있음', '없음'])}
    </div>
    if (id === 'yarnMemo') return <>{field('private.yarnMemo', '실 메모', 'multiline', undefined, true)}<small className="report-field-hint">{t("세탁·촉감·늘어남 등 나중에 다시 볼 내용을 기록합니다.")}</small></>
    if (id === 'detailMemo') return <>{field('project.memo', '상세 메모', 'multiline', undefined, true)}<small className="report-field-hint">{t("다음 프로젝트를 위해 기억해둘 내용을 자유롭게 적어 주세요.")}</small></>
    return <div className="report-fields">
      {field('pattern.source', '도안 출처')}{field('pattern.seller', '도안 구매처')}{field('pattern.link', '도안 링크', 'url')}{field('pattern.language', '사용 언어')}
      {field('finished.washed', '세탁 여부', 'select', ['예', '아니오'])}{field('finished.washingMethod', '세탁 방법')}{field('finished.blockingMethod', '블로킹 방법')}
      {field('finished.beforeSize', '세탁 전 크기')}{field('finished.afterSize', '세탁 후 크기')}{field('finished.washMemo', '세탁·블로킹 변화', 'multiline', undefined, true)}
      {field('review.problems', '문제와 해결', 'multiline', undefined, true)}{field('review.memo', '완성 메모', 'multiline', undefined, true)}
    </div>
  }
  const yarnSummary = report.yarns.map((yarn) => [yarn.brand, yarn.product, yarn.colorName, yarn.colorNumber].filter(Boolean).join(' ')).filter(Boolean).join(' · ')
  const usageSummary = report.yarns.map((yarn) => [yarn.usedSkeins && formatNumericText(yarn.usedSkeins) + t('볼'), yarn.usedWeight && formatNumericText(yarn.usedWeight) + 'g', yarn.usedMeters && formatNumericText(yarn.usedMeters) + 'm'].filter(Boolean).join(' · ')).filter(Boolean).join(' / ')
  const needleSummary = report.needles.map((needle) => [needle.section, needle.size && needle.size + (needle.size.toLowerCase().includes('mm') ? '' : 'mm')].filter(Boolean).join(' ')).filter(Boolean).join(' · ')
  const modificationSummary = report.modifications.map((item) => [item.section, item.changed || item.memo].filter(Boolean).join(' ')).filter(Boolean).join(' · ')
  const photoInput = (kind: 'work' | 'finished') => <label className="secondary-button report-photo-add"><Plus size={15} />{t("사진 추가")}<input type="file" accept="image/*" multiple onChange={(event) => { const files = [...(event.currentTarget.files ?? [])]; event.currentTarget.value = ''; if (kind === 'work') void addWorkPhotos(files); else void addFinishedPhotos(files) }} /></label>

  const duration = projectDays(values['project.co'] ?? '', values['project.fo'] ?? '')
  const reportTitle = values['project.name'] || report.title || t('프로젝트 이름')

  return <div className="knitting-report-editor">
    <header className="report-appbar"><button type="button" className="report-appbar-back" aria-label={t("도안으로 돌아가기")} onClick={onBack}><ArrowLeft size={20} /></button><strong>{t("뜨개보고서")}</strong><div className="report-appbar-actions"><span className="report-save-indicator"><i />{translateMessage(saveState)}</span><button type="button" className="report-status-toggle" aria-pressed={report.status === 'complete'} disabled={switching || exporting || processingPhotos || titleEditing} onClick={() => update((current) => ({ ...current, status: current.status === 'complete' ? 'draft' : 'complete', completedAt: current.status === 'complete' ? null : Date.now() }))}>{report.status === 'complete' ? t('작성 중으로 변경') : t('작성 완료')}</button><button type="button" className="report-appbar-edit" disabled={switching || exporting || processingPhotos} onClick={() => setActiveDetail(activeDetail ? null : 'project')}><Pencil size={15} /><span>{activeDetail ? t('닫기') : t('편집')}</span></button><button type="button" className="report-appbar-share" disabled={switching || processingPhotos || titleEditing} onClick={() => void openCaption()}><Share2 size={15} /><span>{t("공유하기")}</span></button><button ref={moreTriggerRef} type="button" className="report-more-trigger" aria-label={t("보고서 메뉴")} aria-expanded={moreOpen} onClick={() => setMoreOpen((value) => !value)}><Ellipsis size={22} /></button></div>
      {moreOpen && <div ref={moreMenuRef} className="report-more-menu"><label>{t("보고서 선택")}<select aria-label={t("보고서 선택")} value={report.id} disabled={switching || processingPhotos || titleEditing} onChange={(event) => { setMoreOpen(false); void switchReport(event.currentTarget.value) }}>{reports.map((item, index) => <option key={item.id} value={item.id}>{item.title || t('보고서') + ' ' + (index + 1)}</option>)}</select></label>
        <button type="button" disabled={switching || exporting || processingPhotos || titleEditing} onClick={() => { setMoreOpen(false); void addReport() }}><Plus size={15} />{t("보고서 추가")}</button><button type="button" disabled={switching || exporting || processingPhotos || titleEditing} onClick={() => { setMoreOpen(false); void downloadReport() }}><Download size={15} />{t("PDF 다운로드")}</button><button type="button" disabled={switching || processingPhotos || titleEditing} onClick={() => { setMoreOpen(false); void openInstagramImage() }}><ImagePlus size={15} />{t("인스타 이미지 만들기")}</button><button type="button" disabled={analysisLoading || switching} onClick={() => { setMoreOpen(false); void analyzeNow() }}><Sparkles size={15} />{t("수정사항 다시 찾기")}</button>
      </div>}
    </header>
    <div className={'report-workspace' + (activeDetail ? ' editing' : '')}>
    <aside className="report-navigation" aria-label={t("보고서 탐색")}><button type="button" className="report-nav-back" onClick={onBack}><ArrowLeft size={16} />{t("도안으로 돌아가기")}</button><span className="report-nav-label">{t("보고서")}</span><div className="report-nav-list">{reports.map((item, index) => <button type="button" key={item.id} className={item.id === report.id ? 'active' : ''} disabled={switching || processingPhotos || titleEditing} onClick={() => void switchReport(item.id)}><strong>{item.title || t('보고서') + ' ' + (index + 1)}</strong><small>{item.id === report.id ? t('열려 있음') : formatDate(item.updatedAt)}</small></button>)}</div><button type="button" className="report-nav-add" disabled={switching || processingPhotos || titleEditing} onClick={() => void addReport()}><Plus size={15} />{t("새 보고서")}</button></aside>
    <div className="report-scroll"><main className="knitting-report-content">
      <section className="report-cover-card"><PhotoField label={t('완성 사진')} value={report.representativePhoto} onChange={(value) => update((current) => ({ ...current, representativePhoto: value }))} onProcessingChange={trackPhotoProcessing} onPreview={setPreviewPhoto} /><div className="report-cover-copy"><span className="report-cover-eyebrow">{t('뜨개보고서')}</span>
        <div className="report-title-row">{titleEditing ? <div className="report-title-edit-form"><input className="report-title-input" aria-label={t("보고서 제목")} autoFocus value={titleDraft} onChange={(event) => setTitleDraft(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); saveTitleEdit() } else if (event.key === 'Escape') setTitleEditing(false) }} /><button type="button" className="report-title-action save" aria-label={t("제목 저장")} disabled={!titleDraft.trim()} onClick={saveTitleEdit}><Check size={16} /></button><button type="button" className="report-title-action cancel" aria-label={t("제목 수정 취소")} onClick={() => setTitleEditing(false)}><X size={15} /></button></div> : <><h1>{reportTitle}</h1><button type="button" className="report-title-edit-trigger" aria-label={t("보고서 제목 수정")} disabled={switching || exporting || processingPhotos} onClick={beginTitleEdit}><Pencil size={15} /></button></>}</div>
        <button type="button" className="report-cover-pattern" onClick={() => setActiveDetail('pattern')}>{values['pattern.name'] || t('도안명 추가')}{values['pattern.designer'] ? ' · ' + values['pattern.designer'] : ''}</button><div className="report-cover-dates"><span>{values['project.co'] || t('시작일 추가')}</span><b>—</b><span>{values['project.fo'] || t('완료일 추가')}</span><button type="button" onClick={() => setActiveDetail('project')}>{t("프로젝트 정보 편집")}</button></div>
      </div></section>
      <div className="report-facts" aria-label={t("프로젝트 요약")}>{values['project.status'] && <span className={'report-status-badge status-' + values['project.status']}><i />{values['project.status']}</span>}{values['project.fo'] && <span><CalendarDays size={15} />{values['project.fo']}</span>}{(values['pattern.selectedSize'] || values['pattern.originalSizes']) && <span><Ruler size={15} />{values['pattern.selectedSize'] || values['pattern.originalSizes']}</span>}<span><Clock3 size={15} />{t('누적 작업시간')} {formatWorkTime(totalWorkTimeMs)}</span>{values['project.workTime'] && <span>{t('작업시간 메모')}: {values['project.workTime']}</span>}{duration && <span>{values['project.co']} → {values['project.fo']} · {duration}</span>}</div>
      <div className="report-content-grid"><section className="report-overview-section"><header><div><h2>{t("도안 · 재료 · 내 수정")}</h2><p>{t("필요한 항목을 선택해 자세히 편집하세요.")}</p></div></header><div className="report-summary-list">
        <ReportCard title={t("뜬 사이즈")} icon={<Ruler size={18} />} summary={values['pattern.selectedSize'] || values['pattern.originalSizes'] || ''} recommended onClick={() => setActiveDetail('size')} />
        <ReportCard title={t("사용 실")} icon={<span>◉</span>} summary={[yarnSummary, usageSummary].filter(Boolean).join(' · ')} recommended onClick={() => setActiveDetail('yarn')} />
        <ReportCard title={t("사용 바늘")} icon={<Scissors size={18} />} summary={needleSummary} recommended onClick={() => setActiveDetail('needles')} />
        <ReportCard title={t("도안에서 수정한 부분")} icon={<Pencil size={17} />} summary={modificationSummary} recommended onClick={() => setActiveDetail('modifications')} />
        <ReportCard title={t("한줄 기록")} icon={<Clipboard size={17} />} summary={values['review.nextChanges'] || ''} recommended onClick={() => setActiveDetail('oneLine')} />
      </div>
      {(report.analysisCandidates ?? []).some((candidate) => candidate.status === 'suggested') && <button type="button" className="report-candidate-notice" onClick={() => { const pending = report.analysisCandidates!.filter((candidate) => candidate.status === 'suggested'); setCandidateSelection(pending.map((candidate) => candidate.id)); setCandidateReviewOpen(true) }}><Sparkles size={16} />{t("수정사항 후보 ")}{report.analysisCandidates!.filter((candidate) => candidate.status === 'suggested').length}{t("개 확인하기")}</button>}
      {analysisNotice && <small className="report-analysis-notice" role="status">{analysisNotice}</small>}</section>
      <section className="report-personal-section"><header><div><h2>{t("내 기록 ")}<span className="report-help-mark" title={t("필요한 항목만 열어 개인 기록으로 남길 수 있어요.")}>?</span></h2><p>{t("필요할 때 다시 확인할 수 있도록 자세히 남겨두세요.")}</p></div></header>
        <PersonalCard title={t("게이지")} summary={[values['gauge.patternStitches'] && formatNumericText(values['gauge.patternStitches']) + t('코'), values['gauge.patternRows'] && formatNumericText(values['gauge.patternRows']) + t('단'), values['gauge.afterStitches'] && t('실제') + ' ' + formatNumericText(values['gauge.afterStitches']) + t('코'), values['gauge.afterRows'] && formatNumericText(values['gauge.afterRows']) + t('단')].filter(Boolean).join(' · ')} icon={<Gauge size={18} />} open={expandedPersonal.includes('gauge')} onClick={() => togglePersonal('gauge')} />
        {expandedPersonal.includes('gauge') && <div className="report-personal-inline">{detailContent('gauge')}</div>}
        <PersonalCard title={t("완성 실측")} summary={report.measurements.filter((row) => row.finished.trim()).map((row) => [row.label, row.finished].filter(Boolean).join(' ')).join(' · ')} icon={<Ruler size={18} />} open={expandedPersonal.includes('measurements')} onClick={() => togglePersonal('measurements')} />
        {expandedPersonal.includes('measurements') && <div className="report-personal-inline">{detailContent('measurements')}</div>}
        <PersonalCard title={t("핏 기록")} summary={values['review.fit'] || ''} icon={<Shirt size={18} />} open={expandedPersonal.includes('fit')} onClick={() => togglePersonal('fit')} />
        {expandedPersonal.includes('fit') && <div className="report-personal-inline">{detailContent('fit')}</div>}
        <PersonalCard title={t("실 메모")} summary={values['private.yarnMemo'] || ''} icon={<span>◉</span>} open={expandedPersonal.includes('yarnMemo')} onClick={() => togglePersonal('yarnMemo')} />
        {expandedPersonal.includes('yarnMemo') && <div className="report-personal-inline">{detailContent('yarnMemo')}</div>}
        <PersonalCard title={t("상세 메모")} summary={values['project.memo'] || ''} icon={<Clipboard size={18} />} open={expandedPersonal.includes('detailMemo')} onClick={() => togglePersonal('detailMemo')} />
        {expandedPersonal.includes('detailMemo') && <div className="report-personal-inline">{detailContent('detailMemo')}</div>}
        <button type="button" className="report-more-records" onClick={() => setActiveDetail('extras')}>{t("기타 기록 · 세탁 · 후기 편집 ")}<Pencil size={14} /></button>
      </section></div>
      <section className="report-photo-section"><header><div><h2>{t("과정 사진")}</h2><p>{t("작업 날짜와 설명을 남기고, 드래그하거나 화살표로 순서를 바꿀 수 있어요.")}</p></div></header><div className="report-photo-grid">
        {report.workPhotos.map((photo, index) => <article className="report-photo-tile" key={photo.id} draggable onDragStart={() => setDraggedPhotoId(photo.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (draggedPhotoId && draggedPhotoId !== photo.id) reorderWorkPhoto(draggedPhotoId, photo.id); setDraggedPhotoId('') }} onDragEnd={() => setDraggedPhotoId('')}><button type="button" className="report-photo-open" aria-label={`${photo.label || t('작업 과정 사진')} 크게 보기`} onClick={() => setPreviewPhoto(photo.dataUrl)}><img src={photo.dataUrl} alt={photo.label || t('작업 과정')} loading="lazy" decoding="async" /><span>{photo.activityDate || localDateValue(photo.uploadedAt)}</span></button><label className="report-photo-label"><span className="sr-only">{t("작업 사진 설명")}</span><input aria-label={t("작업 사진 설명")} value={photo.label} placeholder={t("작업 내용")} onChange={(event) => updateWorkPhoto(photo.id, { label: event.currentTarget.value })} /></label><label className="report-photo-date"><span className="sr-only">{t("작업 날짜")}</span><input aria-label={t("작업 날짜")} type="date" value={photo.activityDate} onChange={(event) => updateWorkPhoto(photo.id, { activityDate: event.currentTarget.value || localDateValue(photo.uploadedAt) })} /></label><div className="report-photo-tools"><button type="button" draggable onDragStart={(event) => { event.stopPropagation(); setDraggedPhotoId(photo.id) }} aria-label={t("사진 순서 이동 핸들")} title={t("드래그해 순서 변경")}>↕</button><button type="button" aria-label={t("사진 앞으로 이동")} title={t("앞으로")} disabled={index === 0} onClick={() => moveWorkPhoto(index, -1)}><ChevronUp size={14} /></button><button type="button" aria-label={t("사진 뒤로 이동")} title={t("뒤로")} disabled={index === report.workPhotos.length - 1} onClick={() => moveWorkPhoto(index, 1)}><ChevronDown size={14} /></button></div><button type="button" className="report-photo-delete" aria-label={t("작업 사진 삭제")} onClick={() => removeReportPhoto('work', photo.id)}><Trash2 size={14} /></button></article>)}
        {report.finishedPhotos.map((photo) => <article className="report-photo-tile" key={photo.id}><button type="button" className="report-photo-open" aria-label={`${photo.label || t('완성 사진')} 크게 보기`} onClick={() => setPreviewPhoto(photo.dataUrl)}><img src={photo.dataUrl} alt={photo.label || t('완성 사진')} loading="lazy" decoding="async" /><span>{t("완성")}</span></button><input aria-label={t("완성 사진 설명")} value={photo.label} placeholder={t("완성 사진")} onChange={(event) => update((current) => ({ ...current, finishedPhotos: current.finishedPhotos.map((item) => item.id === photo.id ? { ...item, label: event.currentTarget.value } : item) }))} /><button type="button" className="report-photo-delete" aria-label={t("완성 사진 삭제")} onClick={() => removeReportPhoto('finished', photo.id)}><Trash2 size={14} /></button></article>)}
        {photoInput('work')}{photoInput('finished')}
      </div></section>
      {candidateReviewOpen && <div className="modal-backdrop report-candidates-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCandidateReviewOpen(false) }}><section className="modal-card report-candidate-dialog" role="dialog" aria-modal="true" aria-label={t("수정사항 후보 검토")}><header className="report-detail-header"><div><small>{t('수정사항 후보 검토')}</small><h2>{t("수정사항 후보")}</h2><p>{t("확인한 내용만 보고서에 추가됩니다.")}</p></div><button type="button" className="icon-button" aria-label={t("닫기")} onClick={() => setCandidateReviewOpen(false)}><X size={18} /></button></header><div className="report-candidate-list">{(report.analysisCandidates ?? []).filter((candidate) => candidate.status === 'suggested').map((candidate) => <article className="report-candidate-card" key={candidate.id}><label><input type="checkbox" checked={candidateSelection.includes(candidate.id)} onChange={() => setCandidateSelection((current) => current.includes(candidate.id) ? current.filter((id) => id !== candidate.id) : [...current, candidate.id])} /><span>{t("선택")}</span></label><input aria-label={t("후보 구간")} value={candidate.section} onChange={(event) => update((current) => ({ ...current, analysisCandidates: (current.analysisCandidates ?? []).map((item) => item.id === candidate.id ? { ...item, section: event.currentTarget.value } : item) }))} /><div className="report-candidate-values">{candidate.original && <span>{candidate.original}</span>}<textarea aria-label={t("후보 수정 내용")} value={candidate.changed} onChange={(event) => update((current) => ({ ...current, analysisCandidates: (current.analysisCandidates ?? []).map((item) => item.id === candidate.id ? { ...item, changed: event.currentTarget.value } : item) }))} /></div><small>{candidate.source === 'counter' ? t('카운터 기록') : t('기록 메모')} · {candidate.evidence}</small><button type="button" className="text-button" disabled={switching} onClick={() => void dismissCandidate(candidate.id)}>{t("후보 제외")}</button></article>)}</div><footer className="report-candidate-actions"><span>{candidateSelection.length}{t("개 선택")}</span><button type="button" className="primary-button" disabled={switching || !candidateSelection.length} onClick={() => void applyCandidates()}>{t("선택한 항목 추가")}</button></footer></section></div>}
    </main></div>
    {activeDetail && <aside className="report-inspector" aria-label={detailTitles[activeDetail]}><header className="report-detail-header"><button type="button" className="icon-button report-inspector-back" aria-label={t("보고서로 돌아가기")} onClick={() => setActiveDetail(null)}><ArrowLeft size={18} /></button><div><small>{t("뜨개보고서")}</small><h2 id="report-inspector-title">{detailTitles[activeDetail]}</h2></div><button type="button" className="text-button report-inspector-done" onClick={() => setActiveDetail(null)}>{t("완료")}</button></header><div className="report-detail-body">{detailContent(activeDetail)}</div></aside>}
    </div>
    <footer className="report-bottom-actions"><button type="button" className="report-save-button" disabled={switching || exporting || processingPhotos} onClick={async () => { setSwitching(true); try { await flushPendingReport(); setSaveState('저장됨') } catch (cause) { setSaveState(cause instanceof Error ? translateMessage(cause.message) : t('저장하지 못했습니다.')) } finally { setSwitching(false) }}}>{t("저장")}</button><button type="button" className="report-caption-button" disabled={switching || processingPhotos || titleEditing} onClick={() => void openCaption()}><Clipboard size={17} />{t("IG 문구 복사")}</button></footer>
    {undoDelete && <div className="report-undo-snackbar" role="status"><span>{undoDelete.label}</span><button type="button" onClick={undoLastDelete}>{t("실행 취소")}</button><button type="button" aria-label={t("알림 닫기")} onClick={() => { if (undoTimer.current !== undefined) window.clearTimeout(undoTimer.current); undoTimer.current = undefined; setUndoDelete(null) }}><X size={15} /></button></div>}
    {previewPhoto && <div className="report-photo-lightbox" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewPhoto('') }}><section role="dialog" aria-modal="true" aria-label={t("사진 크게 보기")}><button type="button" aria-label={t("사진 닫기")} onClick={() => setPreviewPhoto('')}><X size={20} /></button><img src={previewPhoto} alt={t("보고서 사진")} /></section></div>}
    {captionOpen && <InstagramCaptionDialog report={report} onClose={() => setCaptionOpen(false)} onCopied={() => setSaveState('IG 문구가 복사됐어요.')} />}
    {instagramOpen && <InstagramReportDialog report={report} onClose={() => setInstagramOpen(false)} />}
  </div>
}
