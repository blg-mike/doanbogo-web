import { formatDate, formatNumber, t, translateMessage, type LocaleKey } from './locales/index'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowLeft, Check, ChevronDown, ChevronUp, Clipboard, Download, Ellipsis, GripVertical, ImagePlus, Info, Pencil, Plus, Share2, Sparkles, Trash2, X } from 'lucide-react'
import BrandLoading from './BrandLoading'
import { deleteKnittingReport, getDocument, getKnittingReportById, getKnittingReports, getPageWorks, getViewer, saveKnittingReport, type KnittingReportSummary } from './storage'
import type { CounterSnapshot, DocumentWorkTimeDay, KnittingReport, ReportAccessory, ReportMeasurement, ReportModification, ReportNeedle, ReportTimelinePhoto, ReportYarn } from './types'
import { exportKnittingReportPdf } from './knittingReportPdf'
import InstagramReportDialog from './InstagramReportDialog'
import InstagramCaptionDialog from './InstagramCaptionDialog'
import { analyzeKnittingReportCandidates, collectReportPageTexts } from './knittingReportAnalysis'
import ReportWorkTime from './ReportWorkTime'
import type { DocumentWorkTimeTotals } from './DocumentWorkTimer'
import { getGaugeMeasurement } from './reportFormatting'
import { applyMeasurementSelection, createDefaultMeasurements, findMeasurementPresetRow, isMeasurementPresetAdded, measurementPresetKeys, type MeasurementEntryDraft, type MeasurementPresetKey } from './reportMeasurementSelection'
import { isValidReportDateValue, REPORT_DATE_MAX, REPORT_DATE_MIN } from './reportDates'
import './ReportDesignSystem.css'

type Props = { documentId: string; fileName: string; pageCount: number; totalWorkTimeMs: number; workTimeDays: DocumentWorkTimeDay[]; reportId?: string; onBack: () => void; onAddWorkTime: (date: string, elapsedMs: number) => Promise<DocumentWorkTimeTotals>; onReportChange?: (reportId: string) => void }
type FieldKind = 'text' | 'date' | 'number' | 'positiveDecimal' | 'url' | 'multiline' | 'select' | 'tags'
type DetailId = 'project' | 'pattern' | 'modifications' | 'accessories'

const featureOptions = '라글란,드롭숄더,브이넥,크롭,오버핏,케이블,배색,탑다운,바텀업'

function cleanName(fileName: string) {
  return fileName.replace(/\.pdf$/i, '').trim() || t('뜨개 프로젝트')
}

function createKnittingReport(documentId: string, fileName: string, title = cleanName(fileName)): KnittingReport {
  return {
    id: crypto.randomUUID(), documentId, title, createdAt: Date.now(), updatedAt: Date.now(), status: 'draft', completedAt: null,
    fields: { 'project.name': title, 'project.status': '진행중', 'gauge.beforeWidth': '10', 'gauge.beforeHeight': '10', 'gauge.beforeUnit': 'cm', 'gauge.afterWidth': '10', 'gauge.afterHeight': '10', 'gauge.afterUnit': 'cm' }, representativePhoto: '',
    yarns: [], needles: [], accessories: [],
    measurements: createDefaultMeasurements((key) => t(key)),
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

async function compressPhotos(files: File[]) {
  const photos: ReportTimelinePhoto[] = []
  for (const file of files) {
    const uploadedAt = Date.now()
    photos.push({ id: crypto.randomUUID(), label: file.name.replace(/\.[^.]+$/, ''), dataUrl: await compressPhoto(file), uploadedAt, activityDate: localDateValue(uploadedAt) })
  }
  return photos
}

function makeYarn(): ReportYarn {
  return { id: crypto.randomUUID(), photo: '', brand: '', product: '', colorName: '', colorNumber: '', lot: '', fiber: '', country: '', weightClass: '', recommendedNeedle: '', skeinWeight: '', skeinLength: '', retailer: '', purchaseLink: '', price: '', quantity: '', usedSkeins: '', usedWeight: '', usedMeters: '', strandCount: '', needleSizeMm: '', memo: '', leftover: '' }
}

function makeNeedle(): ReportNeedle {
  return { id: crypto.randomUUID(), section: '', type: '', size: '', sizeUnit: 'mm', cableLength: '', memo: '' }
}

function makeAccessory(): ReportAccessory {
  return { id: crypto.randomUUID(), photo: '', type: '', size: '', quantity: '', detail: '' }
}

function makeModification(): ReportModification {
  return { id: crypto.randomUUID(), section: '', original: '', changed: '', memo: '' }
}

type ReportCollectionKey = 'yarns' | 'needles' | 'accessories' | 'measurements' | 'modifications'
type ReportRow = ReportYarn | ReportNeedle | ReportAccessory | ReportMeasurement | ReportModification
type ReportTextLookup = { documentId: string; reportId: string; status: 'loading' | 'error' } | { documentId: string; reportId: string; status: 'success'; texts: ReturnType<typeof collectReportPageTexts> }

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

function ReportField({ label, value, onChange, kind = 'text', options, wide = false, emptyLabel = '선택' }: {
  label: string; value: string; onChange: (value: string) => void; kind?: FieldKind; options?: string[]; wide?: boolean; emptyLabel?: string
}) {
  const [draft, setDraft] = useState(value)
  function commit(input?: HTMLInputElement) {
    if (kind === 'date' && (input?.validity.badInput || !isValidReportDateValue(draft))) {
      setDraft(value)
      return
    }
    if (kind === 'positiveDecimal' && draft.trim() && (!Number.isFinite(Number(draft)) || Number(draft) <= 0)) {
      setDraft(value)
      return
    }
    if (draft !== value) onChange(draft)
  }
  function editKeys(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      setDraft(value)
      event.currentTarget.blur()
    } else if (event.key === 'Enter' && (kind !== 'multiline' || event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) {
      event.preventDefault()
      commit(event.currentTarget instanceof HTMLInputElement ? event.currentTarget : undefined)
      event.currentTarget.blur()
    }
  }
  return <label className={'report-field' + (wide ? ' wide' : '')}>{t(label as LocaleKey)}
    {kind === 'select' ? <select value={value} onChange={(event) => onChange(event.currentTarget.value)}><option value="">{t(emptyLabel as LocaleKey)}</option>{options?.map((option) => <option key={option} value={option}>{t(option as LocaleKey)}</option>)}</select> :
      kind === 'tags' ? <span className="report-tag-options">{options?.map((option) => {
        const selected = value.split(',').map((item) => item.trim()).filter(Boolean).includes(option)
        return <button key={option} type="button" className={selected ? 'selected' : ''} onClick={() => onChange(selected ? value.split(',').map((item) => item.trim()).filter((item) => item !== option).join(', ') : [...value.split(',').map((item) => item.trim()).filter(Boolean), option].join(', '))}>{t(option as LocaleKey)}</button>
      })}</span> :
      kind === 'multiline' ? <textarea value={draft} onChange={(event) => setDraft(event.currentTarget.value)} onBlur={() => commit()} onKeyDown={editKeys} rows={3} /> :
        <input type={kind === 'number' ? 'text' : kind === 'positiveDecimal' ? 'number' : kind} inputMode={kind === 'number' || kind === 'positiveDecimal' ? 'decimal' : undefined} min={kind === 'positiveDecimal' ? '0' : kind === 'date' ? REPORT_DATE_MIN : undefined} max={kind === 'date' ? REPORT_DATE_MAX : undefined} step={kind === 'positiveDecimal' ? 'any' : undefined} value={draft} onChange={(event) => setDraft(event.currentTarget.value)} onBlur={(event) => commit(event.currentTarget)} onKeyDown={editKeys} />}
  </label>
}

function MeasurementLabelInput({ label, onCommit }: { label: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(label)
  const [editing, setEditing] = useState(false)
  const originalLabel = useRef(label)
  const cancelled = useRef(false)
  if (editing) return <input className="report-measurement-label-input" aria-label={`${label} ${t('측정 항목')}`} placeholder={t('측정 항목')} autoFocus value={draft}
    onChange={(event) => setDraft(event.currentTarget.value)}
    onBlur={() => {
      setEditing(false)
      const next = draft.trim()
      if (cancelled.current || !next) setDraft(originalLabel.current)
      else if (next !== originalLabel.current) onCommit(next)
    }}
    onKeyDown={(event) => {
      if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
        event.preventDefault()
        event.currentTarget.blur()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        cancelled.current = true
        setDraft(originalLabel.current)
        setEditing(false)
        event.currentTarget.blur()
      }
    }} />
  return <div className="report-measurement-label-display"><span>{label || t('측정 항목')}</span><button type="button" className="report-measurement-rename" aria-label={`${label} ${t('항목명 수정')}`} onClick={() => { originalLabel.current = label; cancelled.current = false; setDraft(label); setEditing(true) }}><Pencil size={15} /></button></div>
}

type CustomMeasurementDraft = MeasurementEntryDraft & { id: string }

function makeCustomMeasurementDraft(): CustomMeasurementDraft {
  return { id: crypto.randomUUID(), label: '', finished: '', unit: 'cm' }
}

function MeasurementAddDialog({ existingMeasurements, onAdd, onClose }: {
  existingMeasurements: ReportMeasurement[]
  onAdd: (presets: MeasurementEntryDraft[], custom: MeasurementEntryDraft[]) => void
  onClose: () => void
}) {
  const [selectedPresets, setSelectedPresets] = useState<MeasurementPresetKey[]>(() => measurementPresetKeys.filter((key) => isMeasurementPresetAdded(existingMeasurements, key)))
  const [presetValues, setPresetValues] = useState<Record<MeasurementPresetKey, Omit<MeasurementEntryDraft, 'label'>>>(() => Object.fromEntries(measurementPresetKeys.map((key) => {
    const row = findMeasurementPresetRow(existingMeasurements, key)
    return [key, { finished: row?.finished ?? '', unit: row?.unit ?? 'cm' }]
  })) as Record<MeasurementPresetKey, Omit<MeasurementEntryDraft, 'label'>>)
  const [customSelected, setCustomSelected] = useState(false)
  const [customEntries, setCustomEntries] = useState<CustomMeasurementDraft[]>([])
  const [edited, setEdited] = useState(false)
  const dialogRef = useRef<HTMLElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    titleRef.current?.focus()
    return () => previouslyFocused?.focus()
  }, [])

  function close(confirmDiscard: boolean) {
    if (confirmDiscard && edited && !window.confirm(t('입력 내용을 버릴까요?'))) return
    onClose()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close(true)
      return
    }
    if (event.key !== 'Tab') return
    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)') ?? [])]
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && (document.activeElement === first || document.activeElement === titleRef.current)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  function togglePreset(key: MeasurementPresetKey, checked: boolean) {
    setEdited(true)
    setSelectedPresets((current) => checked ? [...current, key] : current.filter((item) => item !== key))
  }

  function toggleCustom(checked: boolean) {
    setEdited(true)
    setCustomSelected(checked)
    if (checked && !customEntries.length) setCustomEntries([makeCustomMeasurementDraft()])
  }

  function updateCustom(id: string, patch: Partial<CustomMeasurementDraft>) {
    setEdited(true)
    setCustomEntries((current) => current.map((entry) => entry.id === id ? { ...entry, ...patch } : entry))
  }

  const count = selectedPresets.length + (customSelected ? customEntries.length : 0)
  const customNameMissing = customSelected && customEntries.some((entry) => !entry.label.trim())
  const removedPreset = measurementPresetKeys.some((key) => isMeasurementPresetAdded(existingMeasurements, key) && !selectedPresets.includes(key))
  const canApply = !customNameMissing && (count > 0 || removedPreset)

  function applySelected() {
    if (!canApply) return
    const removedWithValues = existingMeasurements.some((row) => measurementPresetKeys.some((key) => !selectedPresets.includes(key) && findMeasurementPresetRow([row], key) && (row.finished.trim() || row.pattern.trim())))
    if (removedWithValues && !window.confirm(t('입력된 치수를 삭제할까요?'))) return
    const presets = measurementPresetKeys.filter((key) => selectedPresets.includes(key)).map((key) => ({ label: t(key), ...presetValues[key] }))
    const custom = customSelected ? customEntries.map(({ label, finished, unit }) => ({ label, finished, unit })) : []
    onAdd(presets, custom)
  }

  return <div className="modal-backdrop report-measurement-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) close(true) }}>
    <section ref={dialogRef} className="modal-card report-measurement-dialog" role="dialog" aria-modal="true" aria-labelledby="report-measurement-dialog-title" onKeyDown={handleKeyDown}>
      <header className="report-measurement-dialog-header"><h2 id="report-measurement-dialog-title" ref={titleRef} tabIndex={-1}>{t('완성 실측 추가')}</h2><button type="button" className="icon-button report-measurement-close" aria-label={t('닫기')} onClick={() => close(true)}><X size={18} /></button></header>
      <div className="report-measurement-dialog-content">
        <div className="report-measurement-choices">{measurementPresetKeys.map((key, index) => {
          const label = t(key)
          const selected = selectedPresets.includes(key)
          const inputId = `report-measurement-preset-${index}`
          const valueId = `${inputId}-value`
          return <div className="report-measurement-choice-group" key={key}>
            <label className="report-measurement-choice" htmlFor={inputId}><input id={inputId} type="checkbox" checked={selected} aria-expanded={selected} aria-controls={valueId} onChange={(event) => togglePreset(key, event.currentTarget.checked)} /><span>{label}</span></label>
            {selected && <div id={valueId} className="report-measurement-choice-fields"><input aria-label={`${label} ${t('완성 치수')}`} placeholder={t('완성')} value={presetValues[key].finished} onChange={(event) => { const finished = event.currentTarget.value; setEdited(true); setPresetValues((current) => ({ ...current, [key]: { ...current[key], finished } })) }} /><select aria-label={`${label} ${t('치수 단위')}`} value={presetValues[key].unit} onChange={(event) => { const unit = event.currentTarget.value as 'cm' | 'inch'; setEdited(true); setPresetValues((current) => ({ ...current, [key]: { ...current[key], unit } })) }}><option value="cm">cm</option><option value="inch">{t('inch')}</option></select></div>}
          </div>
        })}
          <div className="report-measurement-choice-group">
            <label className="report-measurement-choice" htmlFor="report-measurement-custom"><input id="report-measurement-custom" type="checkbox" checked={customSelected} aria-expanded={customSelected} aria-controls="report-measurement-custom-fields" onChange={(event) => toggleCustom(event.currentTarget.checked)} /><span>{t('직접 입력')}</span></label>
            {customSelected && <div id="report-measurement-custom-fields" className="report-measurement-custom-list">{customEntries.map((entry, index) => <div className="report-measurement-custom-row" key={entry.id}>
              <label>{t('측정 항목')}<input required aria-invalid={!entry.label.trim()} aria-label={`${index + 1} ${t('직접 입력')} ${t('측정 항목')}`} placeholder={t('측정 항목')} value={entry.label} onChange={(event) => updateCustom(entry.id, { label: event.currentTarget.value })} /></label>
              <label>{t('완성 치수')}<input aria-label={`${entry.label || index + 1} ${t('완성 치수')}`} placeholder={t('완성')} value={entry.finished} onChange={(event) => updateCustom(entry.id, { finished: event.currentTarget.value })} /></label>
              <label>{t('치수 단위')}<select aria-label={`${entry.label || index + 1} ${t('치수 단위')}`} value={entry.unit} onChange={(event) => updateCustom(entry.id, { unit: event.currentTarget.value as 'cm' | 'inch' })}><option value="cm">cm</option><option value="inch">{t('inch')}</option></select></label>
              <button type="button" className="report-icon-button" aria-label={`${index + 1} ${t('직접 입력')} ${t('측정 항목 삭제')}`} onClick={() => { setEdited(true); setCustomEntries((current) => current.filter((item) => item.id !== entry.id)); if (customEntries.length === 1) setCustomSelected(false) }}><Trash2 size={15} /></button>
            </div>)}
              {customNameMissing && <small className="report-error" role="alert">{t('직접 입력 항목 이름을 입력하세요.')}</small>}
              <button type="button" className="secondary-button report-add-button" onClick={() => { setEdited(true); setCustomSelected(true); setCustomEntries((current) => [...current, makeCustomMeasurementDraft()]) }}><Plus size={15} />{t('직접 입력 항목 더 추가')}</button>
            </div>}
          </div>
        </div>
      </div>
      <footer className="report-measurement-dialog-actions"><button type="button" className="secondary-button" onClick={() => close(false)}>{t('취소')}</button><button type="button" className="primary-button" disabled={!canApply} onClick={applySelected}>{count ? t('{count}개 적용', { count }) : t('적용')}</button></footer>
    </section>
  </div>
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

export default function KnittingReport({ documentId, fileName, pageCount, totalWorkTimeMs, workTimeDays, reportId, onBack, onAddWorkTime, onReportChange }: Props) {
  const [report, setReport] = useState<KnittingReport | null>(null)
  const [reports, setReports] = useState<KnittingReportSummary[]>([])
  const [saveState, setSaveState] = useState('불러오는 중')
  const [exporting, setExporting] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [processingPhotos, setProcessingPhotos] = useState(false)
  const [captionOpen, setCaptionOpen] = useState(false)
  const [instagramOpen, setInstagramOpen] = useState(false)
  const [measurementDialogOpen, setMeasurementDialogOpen] = useState(false)
  const [titleEditing, setTitleEditing] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [activeDetail, setActiveDetail] = useState<'project' | null>(null)
  const [previewPhoto, setPreviewPhoto] = useState('')
  const [draggedPhotoId, setDraggedPhotoId] = useState('')
  const [undoDelete, setUndoDelete] = useState<{ label: string; restore: (current: KnittingReport) => KnittingReport } | null>(null)
  const [documentWorkTime, setDocumentWorkTime] = useState({ totalWorkTimeMs, workTimeDays })
  const [moreOpen, setMoreOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const moreTriggerRef = useRef<HTMLButtonElement>(null)
  const moreMenuRef = useRef<HTMLDivElement>(null)
  const modificationsSectionRef = useRef<HTMLElement>(null)
  const onReportChangeRef = useRef(onReportChange)
  onReportChangeRef.current = onReportChange
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
  const [pageTextLookup, setPageTextLookup] = useState<ReportTextLookup | null>(null)
  const pageTextLookupRequestRef = useRef(0)
  const timer = useRef<number | undefined>(undefined)
  const undoTimer = useRef<number | undefined>(undefined)
  const photoProcessingCount = useRef(0)
  const reportRef = useRef<KnittingReport | null>(null)
  const deletingReportIdRef = useRef<string | null>(null)
  const analyzeNowRef = useRef<(target?: KnittingReport | null) => Promise<void>>(async () => {})
  const saveQueueRef = useRef(Promise.resolve())

  useEffect(() => {
    let active = true
    void getDocument(documentId).then((document) => {
      if (!active) return
      setDocumentWorkTime({ totalWorkTimeMs: document?.totalWorkTimeMs ?? totalWorkTimeMs, workTimeDays: document?.workTimeDays ?? workTimeDays })
    }).catch(() => {})
    return () => { active = false }
  }, [documentId, totalWorkTimeMs, workTimeDays])

  function trackPhotoProcessing(processing: boolean) {
    photoProcessingCount.current = Math.max(0, photoProcessingCount.current + (processing ? 1 : -1))
    setProcessingPhotos(photoProcessingCount.current > 0)
  }

  function clearPageTextLookup() {
    pageTextLookupRequestRef.current += 1
    setPageTextLookup(null)
  }

  useEffect(() => {
    let disposed = false
    void (async () => {
      clearPageTextLookup()
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
      if (reportId !== current.id) onReportChangeRef.current?.(current.id)
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
    clearPageTextLookup()
    setSwitching(true)
    try {
      await flushPendingReport()
      const next = await getKnittingReportById(id)
      if (!next || next.documentId !== documentId) throw new Error('보고서를 불러오지 못했습니다.')
      reportRef.current = next
      setReport(next)
      setSaveState('저장됨')
      onReportChangeRef.current?.(next.id)
    } catch (cause) {
      setSaveState(cause instanceof Error ? translateMessage(cause.message) : t('보고서를 불러오지 못했습니다.'))
    } finally {
      setSwitching(false)
    }
  }

  async function addReport() {
    if (switching || processingPhotos) return
    clearPageTextLookup()
    setSwitching(true)
    try {
      await flushPendingReport()
      const next = await saveKnittingReport(createKnittingReport(documentId, fileName, `${t('새 보고서')} ${formatNumber(reports.length + 1)}`))
      reportRef.current = next
      setReport(next)
      setReports((items) => [...items, summarizeReport(next)])
      setSaveState('저장됨')
      onReportChangeRef.current?.(next.id)
      void analyzeNow(next)
    } catch (cause) {
      setSaveState(cause instanceof Error ? translateMessage(cause.message) : t('보고서를 추가하지 못했습니다.'))
    } finally {
      setSwitching(false)
    }
  }

  async function confirmDeleteReport() {
    const current = reportRef.current
    if (!current || switching || exporting || processingPhotos || titleEditing) return
    clearPageTextLookup()
    let deleted = false
    setSwitching(true)
    setDeleteError('')
    deletingReportIdRef.current = current.id
    try {
      await flushPendingReport()
      const persisted = reportRef.current
      if (!persisted || persisted.id !== current.id) throw new Error('보고서를 삭제하지 못했습니다. 저장 공간을 확인하고 다시 시도해 주세요.')
      await saveQueueRef.current
      reportRef.current = null
      await deleteKnittingReport(persisted.id)
      deleted = true
      const remaining = await getKnittingReports(documentId)
      setReports(remaining.map(summarizeReport))
      setDeleteConfirmOpen(false)
      setMoreOpen(false)
      setUndoDelete(null)
      if (!remaining.length) {
        setReport(null)
        onBack()
        return
      }
      const next = remaining.reduce((latest, item) => item.updatedAt > latest.updatedAt ? item : latest)
      deletingReportIdRef.current = null
      reportRef.current = next
      setReport(next)
      setSaveState('저장됨')
      onReportChangeRef.current?.(next.id)
    } catch (cause) {
      if (deleted) {
        reportRef.current = null
        setReport(null)
        onBack()
        return
      }
      const latest = reportRef.current ?? current
      reportRef.current = latest
      setReport(latest)
      deletingReportIdRef.current = null
      setDeleteError(cause instanceof Error ? translateMessage(cause.message) : t('보고서를 삭제하지 못했습니다. 저장 공간을 확인하고 다시 시도해 주세요.'))
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
    }, 5000)
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

  async function addWorkTime(date: string, elapsedMs: number) {
    const totals = await onAddWorkTime(date, elapsedMs)
    setDocumentWorkTime({ totalWorkTimeMs: totals.totalWorkTimeMs, workTimeDays: totals.workTimeDays })
    return totals
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
    if (deletingReportIdRef.current === next.id) throw new Error(t('보고서를 삭제하지 못했습니다. 저장 공간을 확인하고 다시 시도해 주세요.'))
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
    if (!target || analysisLoading || deletingReportIdRef.current === target.id) return
    setAnalysisLoading(true)
    setAnalysisNotice('')
    try {
      await flushPendingReport()
      const current = reportRef.current
      if (!current || current.id !== target.id || deletingReportIdRef.current === target.id) return
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

  async function findPageTexts() {
    const target = reportRef.current
    if (!target || target.documentId !== documentId || switching || (pageTextLookup?.status === 'loading' && pageTextLookup.reportId === target.id)) return
    const requestId = ++pageTextLookupRequestRef.current
    setPageTextLookup({ documentId, reportId: target.id, status: 'loading' })
    try {
      const works = await getPageWorks(documentId)
      if (requestId !== pageTextLookupRequestRef.current || reportRef.current?.id !== target.id || deletingReportIdRef.current === target.id) return
      setPageTextLookup({ documentId, reportId: target.id, status: 'success', texts: collectReportPageTexts(works) })
    } catch {
      if (requestId === pageTextLookupRequestRef.current && reportRef.current?.id === target.id && deletingReportIdRef.current !== target.id) setPageTextLookup({ documentId, reportId: target.id, status: 'error' })
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

  function rowFields<T extends ReportRow, K extends ReportCollectionKey>(row: T, key: K, descriptors: { field: keyof T; label: string; wide?: boolean; kind?: FieldKind; options?: string[]; emptyLabel?: string }[]) {
    return <div className="report-fields">{descriptors.map(({ field: fieldName, label, wide, kind, options, emptyLabel }) => {
      const value = String(row[fieldName] ?? '')
      return <ReportField key={String(fieldName) + ':' + value} label={label} value={value} kind={kind} options={options} wide={wide} emptyLabel={emptyLabel} onChange={(nextValue) => updateRow(key, row.id, { [fieldName]: nextValue } as Partial<KnittingReport[K][number]>)} />
    })}</div>
  }

  function needleCards() {
    return loadedReport.needles.map((needle, index) => <article className="report-entry-card compact report-needle-card" key={needle.id}>
      <div className="report-entry-title"><strong>{t("바늘 ")}{index + 1}</strong><button type="button" className="report-icon-button" aria-label={t("바늘 삭제")} onClick={() => removeRow('needles', needle.id)}><Trash2 size={15} /></button></div>
      {rowFields(needle, 'needles', [
        { field: 'type', label: '바늘 종류', kind: 'select', options: [...new Set(['대바늘', '코바늘', '기타', needle.type].filter(Boolean))] },
        { field: 'size', label: '사이즈' }, { field: 'sizeUnit', label: '표기', kind: 'select', options: ['mm', 'us', 'uk', 'jp'], emptyLabel: '기존 표기' },
        { field: 'brand', label: '브랜드' }, { field: 'section', label: '사용 부위' },
      ])}
    </article>)
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
      await exportKnittingReportPdf(saved, documentWorkTime.totalWorkTimeMs, documentWorkTime.workTimeDays)
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
  const visiblePageTextLookup = pageTextLookup?.documentId === documentId && pageTextLookup.reportId === loadedReport.id && (reportId === undefined || reportId === loadedReport.id) ? pageTextLookup : null
  const pageTextLoading = visiblePageTextLookup?.status === 'loading'
  const values = report.fields
  const detailTitles: Record<DetailId, LocaleKey> = { project: '프로젝트 정보', pattern: '도안 정보', modifications: '도안에서 수정한 부분', accessories: '부자재' }
  function saveMeasurementSelection(presets: MeasurementEntryDraft[], custom: MeasurementEntryDraft[]) {
    update((current) => ({ ...current, measurements: applyMeasurementSelection(current.measurements, presets, custom) }))
    setMeasurementDialogOpen(false)
  }
  const measurementEditor = <div className="report-measurement-editor">{report.measurements.length === 0 && <p className="report-measurement-empty">{t('완성한 작품의 치수를 기록해 보세요.')}</p>}{report.measurements.map((row) => <article className="report-measurement-edit-row" key={row.id}>
    <MeasurementLabelInput label={row.label} onCommit={(label) => updateRow('measurements', row.id, { label })} />
    <input className="report-measurement-value" aria-label={`${row.label} ${t('완성 치수')}`} placeholder={t("완성")} value={row.finished} onChange={(event) => updateRow('measurements', row.id, { finished: event.currentTarget.value })} />
    <select className="report-measurement-unit" aria-label={`${row.label} ${t('치수 단위')}`} value={row.unit ?? 'cm'} onChange={(event) => updateRow('measurements', row.id, { unit: event.currentTarget.value as 'cm' | 'inch' })}><option value="cm">cm</option><option value="inch">{t('inch')}</option></select>
    <button type="button" className="report-icon-button report-measurement-delete" aria-label={`${row.label} ${t('측정 항목 삭제')}`} onClick={() => removeRow('measurements', row.id)}><Trash2 size={15} /></button>
  </article>)}<button type="button" className="secondary-button report-add-button" onClick={() => setMeasurementDialogOpen(true)}><Plus size={15} />{t('치수 추가')}</button></div>

  function gaugeField(id: string, label: string, kind: FieldKind = 'text', options?: string[], fallback = '') {
    const value = values[id] ?? fallback
    return <ReportField key={id + ':' + value} label={label} value={value} kind={kind} options={options} onChange={(nextValue) => update((current) => ({ ...current, fields: { ...current.fields, [id]: nextValue } }))} />
  }

  const gaugeEditor = <div className="report-gauge-editor">
    {gaugeField('gauge.pattern', '무늬')}
    <div className="report-gauge-columns">{([['before', '세탁 전'], ['after', '세탁 후']] as const).map(([side, label]) => {
      const gauge = getGaugeMeasurement(values, side)
      return <section key={side}><h3>{t(label)}</h3><div className="report-gauge-counts">
        {gaugeField(`gauge.${side}Stitches`, '코', 'number')}{gaugeField(`gauge.${side}Rows`, '단', 'number')}
      </div><div className="report-gauge-size">
        {gaugeField(`gauge.${side}Width`, '가로', 'positiveDecimal', undefined, gauge.width)}{gaugeField(`gauge.${side}Height`, '세로', 'positiveDecimal', undefined, gauge.height)}{gaugeField(`gauge.${side}Unit`, '표기', 'select', ['cm', 'inch'], gauge.unit)}
      </div></section>
    })}</div>
  </div>

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
    if (id === 'modifications') return <><p className="report-detail-hint">{t('도안의 텍스트 도구로 작성한 원문을 조회합니다. 보고서에는 자동 추가되지 않습니다.')}</p><button type="button" className="secondary-button" disabled={pageTextLoading || switching} onClick={() => void findPageTexts()}><Sparkles size={15} />{pageTextLoading ? t('찾는 중…') : t('수정사항 다시 찾기')}</button>
      {visiblePageTextLookup && <section className="report-page-text-results" aria-live="polite" aria-busy={pageTextLoading}>
        <h3>{t('도안에 작성한 텍스트')}</h3>
        {visiblePageTextLookup.status === 'loading' && <p role="status">{t('찾는 중…')}</p>}
        {visiblePageTextLookup.status === 'error' && <div><p role="alert">{t('도안 텍스트를 불러오지 못했습니다.')}</p><button type="button" className="text-button" onClick={() => void findPageTexts()}>{t('다시 시도')}</button></div>}
        {visiblePageTextLookup.status === 'success' && (visiblePageTextLookup.texts.length
          ? <ol>{visiblePageTextLookup.texts.map((item) => <li key={item.pageNumber + ':' + item.id}><small>{t('페이지 {page}', { page: formatNumber(item.pageNumber) })}</small><p>{item.text}</p></li>)}</ol>
          : <p role="status">{t('도안에 작성한 텍스트가 없습니다.')}</p>)}
      </section>}
      {loadedReport.modifications.map((item, index) => <article className="report-entry-card compact" key={item.id}><div className="report-entry-title"><strong>{item.section || '수정사항 ' + (index + 1)}</strong><button type="button" className="report-icon-button" aria-label={t("수정사항 삭제")} onClick={() => removeRow('modifications', item.id)}><Trash2 size={15} /></button></div>{rowFields(item, 'modifications', [{ field: 'memo', label: '메모', wide: true }])}</article>)}
      {!loadedReport.modifications.length && <p className="report-empty-hint">{t("아직 기록된 수정사항이 없어요.")}</p>}<button type="button" className="secondary-button report-add-button" onClick={() => update((current) => ({ ...current, modifications: [...current.modifications, makeModification()] }))}><Plus size={15} />{t("직접 추가")}</button>
      {(loadedReport.analysisCandidates ?? []).some((candidate) => candidate.status === 'suggested') && <button type="button" className="report-candidate-notice" onClick={() => { const pending = loadedReport.analysisCandidates!.filter((candidate) => candidate.status === 'suggested'); setCandidateSelection(pending.map((candidate) => candidate.id)); setCandidateReviewOpen(true) }}><Sparkles size={16} />{t('수정사항 후보 ')}{loadedReport.analysisCandidates!.filter((candidate) => candidate.status === 'suggested').length}{t('개 확인하기')}</button>}
      {analysisNotice && <small className="report-analysis-notice" role="status">{analysisNotice}</small>}</>
    if (id === 'accessories') return <>
      <div className="report-detail-subheading"><h3>{t("부자재")}</h3><button type="button" className="secondary-button" onClick={() => update((current) => ({ ...current, accessories: [...current.accessories, makeAccessory()] }))}><Plus size={14} />{t("부자재 추가")}</button></div>
      {loadedReport.accessories.map((accessory, index) => <article className="report-entry-card" key={accessory.id}><div className="report-entry-title"><strong>{t("부자재 ")}{index + 1}</strong><button type="button" className="report-icon-button" aria-label={t("부자재 삭제")} onClick={() => removeRow('accessories', accessory.id)}><Trash2 size={15} /></button></div><PhotoField label="부자재 사진" value={accessory.photo} onChange={(photo) => updateRow('accessories', accessory.id, { photo })} onProcessingChange={trackPhotoProcessing} onPreview={setPreviewPhoto} />{rowFields(accessory, 'accessories', [{ field: 'type', label: '종류' }, { field: 'size', label: '크기' }, { field: 'quantity', label: '수량' }, { field: 'detail', label: '상세', wide: true }])}</article>)}
      {!loadedReport.accessories.length && <p className="report-empty-hint">{t('필요할 때 다시 확인할 수 있도록 자세히 남겨두세요.')}</p>}
    </>
    return null
  }
  const photoInput = (kind: 'work' | 'finished') => <label className="secondary-button report-photo-add"><Plus size={15} />{t("사진 추가")}<input type="file" accept="image/*" multiple onChange={(event) => { const files = [...(event.currentTarget.files ?? [])]; event.currentTarget.value = ''; if (kind === 'work') void addWorkPhotos(files); else void addFinishedPhotos(files) }} /></label>

  const reportTitle = values['project.name'] || report.title || t('프로젝트 이름')
  function searchReportModifications() {
    setMoreOpen(false)
    modificationsSectionRef.current?.scrollIntoView({ block: 'start' })
    void findPageTexts()
  }

  return <div className="knitting-report-editor">
    <header className="report-appbar"><button type="button" className="report-appbar-back" aria-label={t("도안으로 돌아가기")} onClick={onBack}><ArrowLeft size={20} /></button><strong>{t("뜨개보고서")}</strong><div className="report-appbar-actions"><span className="report-save-indicator"><i />{translateMessage(saveState)}</span><button type="button" className="report-appbar-share" disabled={switching || processingPhotos || titleEditing} onClick={() => void openCaption()}><Share2 size={15} /><span>{t("공유하기")}</span></button><button ref={moreTriggerRef} type="button" className="report-more-trigger" aria-label={t("보고서 메뉴")} aria-expanded={moreOpen} onClick={() => setMoreOpen((value) => !value)}><Ellipsis size={22} /></button></div>
      {moreOpen && <div ref={moreMenuRef} className="report-more-menu"><label>{t("보고서 선택")}<select aria-label={t("보고서 선택")} value={report.id} disabled={switching || processingPhotos || titleEditing} onChange={(event) => { setMoreOpen(false); void switchReport(event.currentTarget.value) }}>{reports.map((item, index) => <option key={item.id} value={item.id}>{item.title || t('보고서') + ' ' + (index + 1)}</option>)}</select></label>
        <button type="button" aria-pressed={report.status === 'complete'} disabled={switching || exporting || processingPhotos || titleEditing} onClick={() => { setMoreOpen(false); update((current) => ({ ...current, status: current.status === 'complete' ? 'draft' : 'complete', completedAt: current.status === 'complete' ? null : Date.now() })) }}><Check size={15} />{report.status === 'complete' ? t('작성 중으로 변경') : t('작성 완료')}</button><button type="button" disabled={switching || exporting || processingPhotos || titleEditing} onClick={() => { setMoreOpen(false); setActiveDetail('project') }}><Pencil size={15} />{t("수정")}</button><button type="button" className="danger-action" disabled={switching || exporting || processingPhotos || titleEditing || analysisLoading} onClick={() => { setMoreOpen(false); setDeleteError(''); setDeleteConfirmOpen(true) }}><Trash2 size={15} />{t("삭제")}</button><button type="button" disabled={switching || exporting || processingPhotos || titleEditing} onClick={() => { setMoreOpen(false); void addReport() }}><Plus size={15} />{t("보고서 추가")}</button><button type="button" disabled={switching || exporting || processingPhotos || titleEditing} onClick={() => { setMoreOpen(false); void downloadReport() }}><Download size={15} />{t("PDF 다운로드")}</button><button type="button" disabled={switching || processingPhotos || titleEditing} onClick={() => { setMoreOpen(false); void openInstagramImage() }}><ImagePlus size={15} />{t("인스타 이미지 만들기")}</button><button type="button" disabled={pageTextLoading || switching} onClick={searchReportModifications}><Sparkles size={15} />{pageTextLoading ? t("찾는 중…") : t("수정사항 다시 찾기")}</button>
      </div>}
    </header>
    <div className={'report-workspace' + (activeDetail ? ' editing' : '')}>
    <aside className="report-navigation" aria-label={t("보고서 탐색")}><button type="button" className="report-nav-back" onClick={onBack}><ArrowLeft size={16} />{t("도안으로 돌아가기")}</button><span className="report-nav-label">{t("보고서")}</span><div className="report-nav-list">{reports.map((item, index) => <button type="button" key={item.id} className={item.id === report.id ? 'active' : ''} disabled={switching || processingPhotos || titleEditing} onClick={() => void switchReport(item.id)}><strong>{item.title || t('보고서') + ' ' + (index + 1)}</strong><small>{item.id === report.id ? t('열려 있음') : formatDate(item.updatedAt)}</small></button>)}</div><button type="button" className="report-nav-add" disabled={switching || processingPhotos || titleEditing} onClick={() => void addReport()}><Plus size={15} />{t("새 보고서")}</button></aside>
    <div className="report-scroll"><main className="knitting-report-content">
      <section className="report-cover-card"><PhotoField label={t('완성 사진')} value={report.representativePhoto} onChange={(value) => update((current) => ({ ...current, representativePhoto: value }))} onProcessingChange={trackPhotoProcessing} onPreview={setPreviewPhoto} /><div className="report-cover-copy"><div className="report-cover-title-line"><span className="report-cover-eyebrow">{t('뜨개보고서')}</span><label className="report-cover-status"><span className="sr-only">{t('프로젝트 상태')}</span><select aria-label={t('프로젝트 상태')} value={values['project.status'] ?? ''} onChange={(event) => update((current) => ({ ...current, fields: { ...current.fields, 'project.status': event.currentTarget.value } }))}><option value="">{t('선택')}</option>{['예정', '진행중', '완성', '중단'].map((option) => <option key={option} value={option}>{t(option as LocaleKey)}</option>)}</select></label></div>
        <div className="report-title-row">{titleEditing ? <div className="report-title-edit-form"><input className="report-title-input" aria-label={t("보고서 제목")} autoFocus value={titleDraft} onChange={(event) => setTitleDraft(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); saveTitleEdit() } else if (event.key === 'Escape') setTitleEditing(false) }} /><button type="button" className="report-title-action save" aria-label={t("제목 저장")} disabled={!titleDraft.trim()} onClick={saveTitleEdit}><Check size={16} /></button><button type="button" className="report-title-action cancel" aria-label={t("제목 수정 취소")} onClick={() => setTitleEditing(false)}><X size={15} /></button></div> : <><h1>{reportTitle}</h1><button type="button" className="report-title-edit-trigger" aria-label={t("보고서 제목 수정")} disabled={switching || exporting || processingPhotos} onClick={beginTitleEdit}><Pencil size={15} /></button></>}</div>
        <div className="report-cover-fields">{field('pattern.name', '도안명')}{field('pattern.designer', '원작자')}{field('project.co', '시작일', 'date')}{field('project.fo', '완성일', 'date')}</div>
      </div><ReportWorkTime documentId={documentId} totalWorkTimeMs={documentWorkTime.totalWorkTimeMs} workTimeDays={documentWorkTime.workTimeDays} onAddWorkTime={addWorkTime} onTotalsChange={(total, days) => setDocumentWorkTime({ totalWorkTimeMs: total, workTimeDays: days })} /></section>
      <div className="report-form-main">
        <section className="report-form-card"><header><h2>{t('게이지 · 완성 사이즈')}</h2></header>{gaugeEditor}</section>
        <div className="report-yarn-needle-grid">
        <section className="report-form-card"><header><h2>{t('실')}</h2><button type="button" className="report-add-action" onClick={() => update((current) => ({ ...current, yarns: [...current.yarns, makeYarn()] }))}><Plus size={18} />{t('실 추가')}</button></header>
          {report.yarns.length ? report.yarns.map((yarn, index) => <article className="report-yarn-card" key={yarn.id}><div className="report-entry-title"><strong>{t('사용 실 ')}{index + 1}</strong><button type="button" className="report-remove-action" aria-label={t('실 삭제')} onClick={() => removeRow('yarns', yarn.id)}><Trash2 size={16} /></button></div>{rowFields(yarn, 'yarns', [
            { field: 'brand', label: '브랜드' }, { field: 'product', label: '제품명' }, { field: 'colorName', label: '색상명' }, { field: 'colorNumber', label: '색상번호' },
            { field: 'strandCount', label: '합수', kind: 'number' }, { field: 'usedWeight', label: '사용 중량', kind: 'number' }, { field: 'memo', label: '메모', kind: 'multiline', wide: true },
          ])}</article>) : <p className="report-form-empty">{t('필요할 때 다시 확인할 수 있도록 자세히 남겨두세요.')}</p>}
        </section>
        <section className="report-form-card"><header><h2>{t('바늘')}</h2><button type="button" className="report-add-action" onClick={() => update((current) => ({ ...current, needles: [...current.needles, makeNeedle()] }))}><Plus size={18} />{t('바늘 추가')}</button></header>
          {report.needles.length ? needleCards() : <p className="report-form-empty">{t('필요할 때 다시 확인할 수 있도록 자세히 남겨두세요.')}</p>}
        </section>
        </div>
        <section className="report-form-card"><header><h2>{t('완성 실측')}</h2></header>{measurementEditor}</section>
        <section className="report-form-card"><header><h2>{t('핏 · 완성 후기')}</h2></header><div className="report-fields report-fields-compact">
          {field('review.fit', '핏', 'select', ['작게 느껴짐', '딱 맞음', '여유 있음', '많이 여유 있음'])}{field('review.difficulty', '난이도', 'select', ['쉬움', '보통', '어려움'])}
          {field('review.satisfaction', '전체 만족도', 'select', ['1점', '2점', '3점', '4점', '5점'])}{field('review.yarnSatisfaction', '실 만족도', 'select', ['1점', '2점', '3점', '4점', '5점'])}
          {field('review.patternSatisfaction', '도안 만족도', 'select', ['1점', '2점', '3점', '4점', '5점'])}{field('review.makeAgain', '다시 뜰 의향', 'select', ['있음', '없음'])}
        </div></section>
        <section className="report-form-card report-notes-photos"><header><h2>{t('메모 · 사진')}</h2></header><div className="report-notes-photos-content">{field('project.memo', '메모', 'multiline', undefined, true)}
          <div className="report-photo-grid">
        {report.workPhotos.map((photo, index) => <article className="report-photo-tile" key={photo.id} draggable onDragStart={() => setDraggedPhotoId(photo.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (draggedPhotoId && draggedPhotoId !== photo.id) reorderWorkPhoto(draggedPhotoId, photo.id); setDraggedPhotoId('') }} onDragEnd={() => setDraggedPhotoId('')}><button type="button" className="report-photo-open" aria-label={`${photo.label || t('작업 과정 사진')} 크게 보기`} onClick={() => setPreviewPhoto(photo.dataUrl)}><img src={photo.dataUrl} alt={photo.label || t('작업 과정')} loading="lazy" decoding="async" /><span>{photo.activityDate || localDateValue(photo.uploadedAt)}</span></button><label className="report-photo-label"><span className="sr-only">{t("작업 사진 설명")}</span><input aria-label={t("작업 사진 설명")} value={photo.label} placeholder={t("작업 내용")} onChange={(event) => updateWorkPhoto(photo.id, { label: event.currentTarget.value })} /></label><label className="report-photo-date"><span className="sr-only">{t("작업 날짜")}</span><input aria-label={t("작업 날짜")} type="date" min={REPORT_DATE_MIN} max={REPORT_DATE_MAX} value={photo.activityDate} onChange={(event) => { const input = event.currentTarget; if (input.validity.badInput || !isValidReportDateValue(input.value)) return; updateWorkPhoto(photo.id, { activityDate: input.value || localDateValue(photo.uploadedAt) }) }} /></label><div className="report-photo-tools"><button type="button" draggable onDragStart={(event) => { event.stopPropagation(); setDraggedPhotoId(photo.id) }} aria-label={t("사진 순서 이동 핸들")} title={t("드래그해 순서 변경")}><GripVertical size={16} aria-hidden="true" /></button><button type="button" aria-label={t("사진 앞으로 이동")} title={t("앞으로")} disabled={index === 0} onClick={() => moveWorkPhoto(index, -1)}><ChevronUp size={14} /></button><button type="button" aria-label={t("사진 뒤로 이동")} title={t("뒤로")} disabled={index === report.workPhotos.length - 1} onClick={() => moveWorkPhoto(index, 1)}><ChevronDown size={14} /></button></div><button type="button" className="report-photo-delete" aria-label={t("작업 사진 삭제")} onClick={() => removeReportPhoto('work', photo.id)}><Trash2 size={14} /></button></article>)}
        {report.finishedPhotos.map((photo) => <article className="report-photo-tile" key={photo.id}><button type="button" className="report-photo-open" aria-label={`${photo.label || t('완성 사진')} 크게 보기`} onClick={() => setPreviewPhoto(photo.dataUrl)}><img src={photo.dataUrl} alt={photo.label || t('완성 사진')} loading="lazy" decoding="async" /><span>{t("완성")}</span></button><input aria-label={t("완성 사진 설명")} value={photo.label} placeholder={t("완성 사진")} onChange={(event) => update((current) => ({ ...current, finishedPhotos: current.finishedPhotos.map((item) => item.id === photo.id ? { ...item, label: event.currentTarget.value } : item) }))} /><button type="button" className="report-photo-delete" aria-label={t("완성 사진 삭제")} onClick={() => removeReportPhoto('finished', photo.id)}><Trash2 size={14} /></button></article>)}
        {photoInput('work')}{photoInput('finished')}
          </div></div>
        </section>
        <p className="report-share-note"><Info size={19} /><span>{t('빈 항목은 공유 문구에서 제외됩니다.')}</span></p>
      </div>
      <section className="report-form-card report-inline-detail"><header><h2>{t(detailTitles.pattern)}</h2></header><div className="report-inline-detail-body">{detailContent('pattern')}</div></section>
      <section ref={modificationsSectionRef} className="report-form-card report-inline-detail"><header><h2>{t(detailTitles.modifications)}</h2></header><div className="report-inline-detail-body">{detailContent('modifications')}</div></section>
      <section className="report-form-card report-inline-detail"><header><h2>{t(detailTitles.accessories)}</h2></header><div className="report-inline-detail-body">{detailContent('accessories')}</div></section>
      {candidateReviewOpen && <div className="modal-backdrop report-candidates-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCandidateReviewOpen(false) }}><section className="modal-card report-candidate-dialog" role="dialog" aria-modal="true" aria-label={t("수정사항 후보 검토")}><header className="report-detail-header"><div><small>{t('수정사항 후보 검토')}</small><h2>{t("수정사항 후보")}</h2><p>{t("확인한 내용만 보고서에 추가됩니다.")}</p></div><button type="button" className="icon-button" aria-label={t("닫기")} onClick={() => setCandidateReviewOpen(false)}><X size={18} /></button></header><div className="report-candidate-list">{(report.analysisCandidates ?? []).filter((candidate) => candidate.status === 'suggested').map((candidate) => <article className="report-candidate-card" key={candidate.id}><label><input type="checkbox" checked={candidateSelection.includes(candidate.id)} onChange={() => setCandidateSelection((current) => current.includes(candidate.id) ? current.filter((id) => id !== candidate.id) : [...current, candidate.id])} /><span>{t("선택")}</span></label><input aria-label={t("후보 구간")} value={candidate.section} onChange={(event) => update((current) => ({ ...current, analysisCandidates: (current.analysisCandidates ?? []).map((item) => item.id === candidate.id ? { ...item, section: event.currentTarget.value } : item) }))} /><div className="report-candidate-values">{candidate.original && <span>{candidate.original}</span>}<textarea aria-label={t("후보 수정 내용")} value={candidate.changed} onChange={(event) => update((current) => ({ ...current, analysisCandidates: (current.analysisCandidates ?? []).map((item) => item.id === candidate.id ? { ...item, changed: event.currentTarget.value } : item) }))} /></div><small>{candidate.source === 'counter' ? t('카운터 기록') : t('기록 메모')} · {candidate.evidence}</small><button type="button" className="text-button" disabled={switching} onClick={() => void dismissCandidate(candidate.id)}>{t("후보 제외")}</button></article>)}</div><footer className="report-candidate-actions"><span>{candidateSelection.length}{t("개 선택")}</span><button type="button" className="primary-button" disabled={switching || !candidateSelection.length} onClick={() => void applyCandidates()}>{t("선택한 항목 추가")}</button></footer></section></div>}
    </main></div>
    {activeDetail === 'project' && <aside className="report-inspector" aria-label={detailTitles.project}><header className="report-detail-header"><button type="button" className="icon-button report-inspector-back" aria-label={t("보고서로 돌아가기")} onClick={() => setActiveDetail(null)}><ArrowLeft size={18} /></button><div><small>{t("뜨개보고서")}</small><h2 id="report-inspector-title">{detailTitles.project}</h2></div><button type="button" className="text-button report-inspector-done" onClick={() => setActiveDetail(null)}>{t("완료")}</button></header><div className="report-detail-body">{detailContent('project')}</div></aside>}
    </div>
    <footer className="report-bottom-actions"><button type="button" className="report-save-button" disabled={switching || exporting || processingPhotos} onClick={async () => { setSwitching(true); try { await flushPendingReport(); setSaveState('저장됨') } catch (cause) { setSaveState(cause instanceof Error ? translateMessage(cause.message) : t('저장하지 못했습니다.')) } finally { setSwitching(false) }}}>{t("저장")}</button><button type="button" className="report-caption-button" disabled={switching || processingPhotos || titleEditing} onClick={() => void openCaption()}><Clipboard size={17} />{t("IG 문구 복사")}</button></footer>
    {deleteConfirmOpen && <div className="modal-backdrop report-delete-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !switching) { setDeleteConfirmOpen(false); setDeleteError('') } }}><section className="modal-card report-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="report-delete-title"><header className="modal-heading"><h2 id="report-delete-title">{t('보고서 삭제')}</h2><button type="button" className="icon-button" aria-label={t('닫기')} disabled={switching} onClick={() => { setDeleteConfirmOpen(false); setDeleteError('') }}><X size={19} /></button></header><div className="settings-copy"><p>{t('{title} 보고서와 소속 사진·기록을 삭제할까요? 연결된 PDF·프로젝트·다른 보고서는 유지됩니다.', { title: reportTitle })}</p>{deleteError && <p className="report-error" role="alert">{deleteError}</p>}<div className="modal-actions"><button type="button" className="secondary-button" disabled={switching} onClick={() => { setDeleteConfirmOpen(false); setDeleteError('') }}>{t('취소')}</button><button type="button" className="danger-button" disabled={switching} onClick={() => void confirmDeleteReport()}>{t('삭제')}</button></div></div></section></div>}
    {measurementDialogOpen && <MeasurementAddDialog existingMeasurements={report.measurements} onAdd={saveMeasurementSelection} onClose={() => setMeasurementDialogOpen(false)} />}
    {undoDelete && <div className="report-undo-snackbar" role="status"><span>{undoDelete.label}</span><button type="button" onClick={undoLastDelete}>{t("실행 취소")}</button><button type="button" aria-label={t("알림 닫기")} onClick={() => { if (undoTimer.current !== undefined) window.clearTimeout(undoTimer.current); undoTimer.current = undefined; setUndoDelete(null) }}><X size={15} /></button></div>}
    {previewPhoto && <div className="report-photo-lightbox" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewPhoto('') }}><section role="dialog" aria-modal="true" aria-label={t("사진 크게 보기")}><button type="button" aria-label={t("사진 닫기")} onClick={() => setPreviewPhoto('')}><X size={20} /></button><img src={previewPhoto} alt={t("보고서 사진")} /></section></div>}
    {captionOpen && <InstagramCaptionDialog report={report} onClose={() => setCaptionOpen(false)} onCopied={() => setSaveState('IG 문구가 복사됐어요.')} />}
    {instagramOpen && <InstagramReportDialog report={report} onClose={() => setInstagramOpen(false)} />}
  </div>
}
