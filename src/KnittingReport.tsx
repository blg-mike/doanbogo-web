import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Download, ImagePlus, Plus, Trash2 } from 'lucide-react'
import { getKnittingReport, saveKnittingReport } from './storage'
import type { KnittingReport, ReportAccessory, ReportMeasurement, ReportModification, ReportNeedle, ReportYarn } from './types'
import { exportKnittingReportPdf } from './knittingReportPdf'

type Props = { documentId: string; fileName: string }
type FieldKind = 'text' | 'date' | 'number' | 'url' | 'multiline' | 'select' | 'tags'

const featureOptions = '라글란,드롭숄더,브이넥,크롭,오버핏,케이블,배색,탑다운,바텀업'
const tensionOptions = ['많이 널손', '널손', '보통', '쫀손', '많이 쫀손']

function cleanName(fileName: string) {
  return fileName.replace(/\.pdf$/i, '').trim() || '뜨개 프로젝트'
}

function createKnittingReport(documentId: string, fileName: string): KnittingReport {
  const title = cleanName(fileName)
  return {
    documentId, title, createdAt: Date.now(), updatedAt: Date.now(), fields: { 'project.name': title }, representativePhoto: '',
    yarns: [], needles: [], accessories: [],
    measurements: ['기장', '가슴둘레', '소매길이'].map((label) => ({ id: crypto.randomUUID(), label, pattern: '', finished: '' })),
    modifications: [], finishedPhotos: [],
  }
}

function makeYarn(): ReportYarn {
  return { id: crypto.randomUUID(), photo: '', brand: '', product: '', colorName: '', colorNumber: '', lot: '', fiber: '', country: '', weightClass: '', recommendedNeedle: '', skeinWeight: '', skeinLength: '', retailer: '', purchaseLink: '', price: '', quantity: '', usedSkeins: '', usedWeight: '', leftover: '' }
}

function makeNeedle(): ReportNeedle {
  return { id: crypto.randomUUID(), section: '', type: '', size: '', cableLength: '', memo: '' }
}

function makeAccessory(): ReportAccessory {
  return { id: crypto.randomUUID(), photo: '', type: '', size: '', quantity: '', detail: '' }
}

function makeMeasurement(): ReportMeasurement {
  return { id: crypto.randomUUID(), label: '', pattern: '', finished: '' }
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

function PhotoField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [error, setError] = useState('')
  async function readPhoto(file?: File) {
    if (!file) return
    try { onChange(await compressPhoto(file)); setError('') }
    catch (reason) { setError(reason instanceof Error ? reason.message : '사진을 처리할 수 없습니다.') }
  }
  return <div className="report-photo-field">
    {value ? <img src={value} alt={label} /> : <div className="report-photo-empty"><ImagePlus size={21} /><span>{label}</span></div>}
    <label className="report-photo-button"><ImagePlus size={15} />{value ? '사진 바꾸기' : '사진 추가'}<input type="file" accept="image/*" onChange={(event) => { void readPhoto(event.currentTarget.files?.[0]); event.currentTarget.value = '' }} /></label>
    {value && <button className="report-remove-photo" aria-label={label + ' 삭제'} onClick={() => onChange('')}><Trash2 size={14} /></button>}
    {error && <small className="report-error">{error}</small>}
  </div>
}

function ReportSection({ number, title, children }: { number: string; title: string; children: ReactNode }) {
  return <section className="knitting-report-section"><header><span>{number}</span><h2>{title}</h2></header>{children}</section>
}

export default function KnittingReport({ documentId, fileName }: Props) {
  const [report, setReport] = useState<KnittingReport | null>(null)
  const [saveState, setSaveState] = useState('불러오는 중')
  const [exporting, setExporting] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const reportRef = useRef<KnittingReport | null>(null)

  useEffect(() => {
    let disposed = false
    void (async () => {
      const saved = await getKnittingReport(documentId)
      const current = saved ?? createKnittingReport(documentId, fileName)
      if (!saved) await saveKnittingReport(current)
      if (disposed) return
      reportRef.current = current
      setReport(current)
      setSaveState('저장됨')
    })().catch(() => { if (!disposed) setSaveState('불러오지 못했습니다. 페이지를 다시 열어 주세요.') })
    return () => {
      disposed = true
      if (timer.current !== undefined) window.clearTimeout(timer.current)
    }
  }, [documentId, fileName])

  useEffect(() => () => {
    if (timer.current !== undefined && reportRef.current) void saveKnittingReport(reportRef.current)
  }, [])

  function update(change: (current: KnittingReport) => KnittingReport) {
    const current = reportRef.current
    if (!current) return
    const changed = change(current)
    const next = { ...changed, title: changed.fields['project.name']?.trim() || changed.title }
    reportRef.current = next
    setReport(next)
    setSaveState('저장 중…')
    if (timer.current !== undefined) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      void saveKnittingReport(next).then((saved) => {
        reportRef.current = saved
        setReport(saved)
        setSaveState('저장됨')
      }).catch(() => setSaveState('저장하지 못했습니다. 저장 공간을 확인해 주세요.'))
    }, 350)
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

  function rowFields<T extends ReportRow, K extends ReportCollectionKey>(row: T, key: K, descriptors: { field: keyof T; label: string; wide?: boolean }[]) {
    return <div className="report-fields">{descriptors.map(({ field: fieldName, label, wide }) => <ReportField key={String(fieldName)} label={label} value={String(row[fieldName] ?? '')} wide={wide} onChange={(value) => updateRow(key, row.id, { [fieldName]: value } as Partial<KnittingReport[K][number]>)} />)}</div>
  }

  async function downloadReport() {
    if (!report || exporting) return
    setExporting(true)
    setSaveState('보고서 준비 중…')
    try {
      if (timer.current !== undefined) window.clearTimeout(timer.current)
      const saved = await saveKnittingReport(report)
      reportRef.current = saved
      setReport(saved)
      await exportKnittingReportPdf(saved)
      setSaveState('저장됨')
    } catch (error) {
      setSaveState(error instanceof Error ? error.message : 'PDF를 만들지 못했습니다.')
    } finally { setExporting(false) }
  }

  if (!report) return <div className="knitting-report-loading"><span className="loading-orb" /><p>{saveState}</p></div>
  const values = report.fields

  return <div className="knitting-report-editor">
    <div className="knitting-report-toolbar"><div><span className="eyebrow">KNITTING REPORT</span><h1>뜨개보고서</h1><small>{saveState}</small></div><button className="primary-button" disabled={exporting} onClick={() => void downloadReport()}><Download size={17} />{exporting ? 'PDF 만드는 중…' : 'PDF 다운로드'}</button></div>
    <div className="knitting-report-paper">
      <div className="knitting-report-cover"><div><span>KNITTING REPORT</span><h1>{values['project.name'] || '프로젝트 이름'}</h1><small>작성일 {new Date(report.createdAt).toLocaleDateString('ko-KR')}</small></div><PhotoField label="대표 사진" value={report.representativePhoto} onChange={(value) => update((current) => ({ ...current, representativePhoto: value }))} /></div>

      <ReportSection number="01" title="프로젝트 정보">
        <div className="report-fields three-columns">
          {field('project.name', '프로젝트명')}{field('project.craft', '뜨개 종류', 'select', ['대바늘', '코바늘'])}{field('project.status', '상태', 'select', ['예정', '진행중', '완성', '중단'])}
          {field('project.co', 'CO · 시작일', 'date')}{field('project.fo', 'FO · 완성일', 'date')}{field('project.recipient', '만든 대상')}{field('project.memo', '메모', 'multiline', undefined, true)}
        </div>
      </ReportSection>

      <ReportSection number="02" title="도안 정보">
        <div className="report-fields three-columns">
          {field('pattern.name', '도안명')}{field('pattern.designer', '원작자 · 디자이너')}{field('pattern.source', '도안 출처')}
          {field('pattern.seller', '도안 구매처')}{field('pattern.link', '도안 링크', 'url')}{field('pattern.language', '사용 언어')}
          {field('pattern.originalSizes', '원본 사이즈')}{field('pattern.selectedSize', '선택한 사이즈')}{field('pattern.features', '디자인 특징', 'tags', featureOptions.split(','), true)}
          {field('pattern.memo', '도안 메모', 'multiline', undefined, true)}
        </div>
        <div className="report-linked-file"><strong>연결된 PDF</strong><span>{fileName}</span><small>현재 열어 둔 도안과 연결된 보고서입니다.</small></div>
        <div className="report-subheading"><h3>도안 기준 치수</h3><button className="secondary-button" onClick={() => update((current) => ({ ...current, measurements: [...current.measurements, makeMeasurement()] }))}><Plus size={15} />측정 항목 추가</button></div>
        <div className="report-measurement-table"><div className="report-pattern-size-head"><span>항목</span><span>도안 기준 치수</span><span /></div>{report.measurements.map((row) => <div className="report-pattern-size-row" key={row.id}><input aria-label="측정 항목" placeholder="항목" value={row.label} onChange={(event) => updateRow('measurements', row.id, { label: event.currentTarget.value })} /><input aria-label="도안 치수" placeholder="수치와 단위" value={row.pattern} onChange={(event) => updateRow('measurements', row.id, { pattern: event.currentTarget.value })} /><button className="report-icon-button" aria-label="측정 항목 삭제" onClick={() => removeRow('measurements', row.id)}><Trash2 size={15} /></button></div>)}</div>
      </ReportSection>

      <ReportSection number="03" title="사용한 실">
        {report.yarns.map((yarn, index) => <article className="report-entry-card" key={yarn.id}><div className="report-entry-title"><strong>실 {index + 1}</strong><button className="report-icon-button" aria-label={'실 ' + (index + 1) + ' 삭제'} onClick={() => removeRow('yarns', yarn.id)}><Trash2 size={16} /></button></div><div className="report-entry-with-photo"><PhotoField label="실 사진" value={yarn.photo} onChange={(photo) => updateRow('yarns', yarn.id, { photo })} />{rowFields(yarn, 'yarns', [
          { field: 'brand', label: '브랜드' }, { field: 'product', label: '제품명' }, { field: 'colorName', label: '색상명' }, { field: 'colorNumber', label: '색상번호' }, { field: 'lot', label: 'Lot No.' }, { field: 'fiber', label: '성분' }, { field: 'country', label: '제조국' }, { field: 'weightClass', label: '두께' }, { field: 'recommendedNeedle', label: '권장 바늘' }, { field: 'skeinWeight', label: '한 타래 중량' }, { field: 'skeinLength', label: '한 타래 길이' }, { field: 'retailer', label: '구매처' }, { field: 'purchaseLink', label: '구매 링크' }, { field: 'price', label: '구매 가격' }, { field: 'quantity', label: '구매 수량' }, { field: 'usedSkeins', label: '사용 타래 수' }, { field: 'usedWeight', label: '사용 중량' }, { field: 'leftover', label: '남은 실' },
        ])}</div></article>)}
        <button className="secondary-button report-add-button" onClick={() => update((current) => ({ ...current, yarns: [...current.yarns, makeYarn()] }))}><Plus size={16} />사용한 실 추가</button>
      </ReportSection>

      <ReportSection number="04" title="바늘 · 부자재">
        <div className="report-subheading"><h3>사용 바늘</h3><button className="secondary-button" onClick={() => update((current) => ({ ...current, needles: [...current.needles, makeNeedle()] }))}><Plus size={15} />바늘 추가</button></div>
        {report.needles.map((needle, index) => <article className="report-entry-card compact" key={needle.id}><div className="report-entry-title"><strong>바늘 {index + 1}</strong><button className="report-icon-button" aria-label="바늘 삭제" onClick={() => removeRow('needles', needle.id)}><Trash2 size={15} /></button></div>{rowFields(needle, 'needles', [{ field: 'section', label: '구간' }, { field: 'type', label: '바늘 종류' }, { field: 'size', label: '사이즈' }, { field: 'cableLength', label: '케이블 길이' }, { field: 'memo', label: '메모', wide: true }])}</article>)}
        <div className="report-subheading"><h3>부자재</h3><button className="secondary-button" onClick={() => update((current) => ({ ...current, accessories: [...current.accessories, makeAccessory()] }))}><Plus size={15} />부자재 추가</button></div>
        <div className="report-accessories">{report.accessories.map((accessory, index) => <article className="report-entry-card report-accessory" key={accessory.id}><div className="report-entry-title"><strong>부자재 {index + 1}</strong><button className="report-icon-button" aria-label="부자재 삭제" onClick={() => removeRow('accessories', accessory.id)}><Trash2 size={15} /></button></div><PhotoField label="부자재 사진" value={accessory.photo} onChange={(photo) => updateRow('accessories', accessory.id, { photo })} />{rowFields(accessory, 'accessories', [{ field: 'type', label: '종류' }, { field: 'size', label: '크기' }, { field: 'quantity', label: '수량' }, { field: 'detail', label: '상세', wide: true }])}</article>)}</div>
      </ReportSection>

      <ReportSection number="05" title="게이지 · 손땀">
        <div className="report-fields three-columns">
          {field('gauge.unit', '측정 기준', 'select', ['10cm', '4in'])}{field('gauge.patternStitches', '도안 게이지 · 코')}{field('gauge.patternRows', '도안 게이지 · 단')}
          {field('gauge.beforeStitches', '세탁 전 · 코')}{field('gauge.beforeRows', '세탁 전 · 단')}{field('gauge.afterStitches', '세탁 후 · 코')}
          {field('gauge.afterRows', '세탁 후 · 단')}{field('gauge.memo', '게이지 메모', 'multiline', undefined, true)}
        </div>
        <div className="report-tension"><strong>손땀</strong><div>{tensionOptions.map((option, index) => <label key={option} className={values['gauge.tension'] === String(index + 1) ? 'selected' : ''}><input type="radio" name="report-tension" value={index + 1} checked={values['gauge.tension'] === String(index + 1)} onChange={() => update((current) => ({ ...current, fields: { ...current.fields, 'gauge.tension': String(index + 1) } }))} />{option}</label>)}</div></div>
      </ReportSection>

      <ReportSection number="06" title="사이즈 · 변형">
        <div className="report-subheading"><h3>도안 사이즈와 완성 사이즈</h3><span>도안 치수는 02 도안 정보와 함께 저장됩니다.</span></div>
        <div className="report-measurement-table"><div className="report-table-head"><span>항목</span><span>도안</span><span>완성</span><span /></div>{report.measurements.map((row) => <div className="report-table-row" key={row.id}><span>{row.label || '측정 항목'}</span><span>{row.pattern || '—'}</span><input aria-label={row.label + ' 완성 치수'} placeholder="완성 치수" value={row.finished} onChange={(event) => updateRow('measurements', row.id, { finished: event.currentTarget.value })} /><span /> </div>)}</div>
        <div className="report-subheading"><h3>변형 사항</h3><button className="secondary-button" onClick={() => update((current) => ({ ...current, modifications: [...current.modifications, makeModification()] }))}><Plus size={15} />변형 추가</button></div>
        {report.modifications.map((modification, index) => <article className="report-entry-card compact" key={modification.id}><div className="report-entry-title"><strong>변형 {String(index + 1).padStart(2, '0')}</strong><button className="report-icon-button" aria-label="변형 삭제" onClick={() => removeRow('modifications', modification.id)}><Trash2 size={15} /></button></div>{rowFields(modification, 'modifications', [{ field: 'section', label: '구간' }, { field: 'original', label: '원본(도안)' }, { field: 'changed', label: '변경 내용' }, { field: 'memo', label: '메모', wide: true }])}</article>)}
      </ReportSection>

      <ReportSection number="07" title="완성 기록">
        <div className="report-subheading"><h3>완성 사진</h3><label className="secondary-button report-photo-add"><Plus size={15} />사진 추가<input type="file" accept="image/*" multiple onChange={(event) => {
          const files = [...(event.currentTarget.files ?? [])]
          event.currentTarget.value = ''
          void Promise.all(files.map(async (file) => ({ id: crypto.randomUUID(), label: file.name.replace(/\.[^.]+$/, ''), dataUrl: await compressPhoto(file) }))).then((photos) => update((current) => ({ ...current, finishedPhotos: [...current.finishedPhotos, ...photos] }))).catch(() => setSaveState('사진을 처리하지 못했습니다.'))
        }} /></label></div>
        <div className="report-finished-photos">{report.finishedPhotos.map((photo) => <article key={photo.id}><img src={photo.dataUrl} alt={photo.label || '완성 사진'} /><input aria-label="사진 설명" value={photo.label} placeholder="정면, 후면, 디테일…" onChange={(event) => update((current) => ({ ...current, finishedPhotos: current.finishedPhotos.map((item) => item.id === photo.id ? { ...item, label: event.currentTarget.value } : item) }))} /><button className="report-icon-button" aria-label="완성 사진 삭제" onClick={() => update((current) => ({ ...current, finishedPhotos: current.finishedPhotos.filter((item) => item.id !== photo.id) }))}><Trash2 size={15} /></button></article>)}</div>
        <div className="report-fields three-columns">
          {field('finished.washed', '세탁 여부', 'select', ['예', '아니오'])}{field('finished.washingMethod', '세탁 방법')}{field('finished.blockingMethod', '블로킹 방법')}
          {field('finished.beforeSize', '세탁 전 크기')}{field('finished.afterSize', '세탁 후 크기')}{field('finished.washMemo', '세탁·블로킹 변화', 'multiline', undefined, true)}
        </div>
        <div className="report-fields three-columns">
          {field('review.difficulty', '난이도', 'select', ['쉬움', '보통', '어려움'])}{field('review.fit', '핏', 'select', ['작음', '적당', '큼'])}{field('review.satisfaction', '전체 만족도', 'select', ['1점', '2점', '3점', '4점', '5점'])}
          {field('review.yarnSatisfaction', '실 만족도', 'select', ['1점', '2점', '3점', '4점', '5점'])}{field('review.patternSatisfaction', '도안 만족도', 'select', ['1점', '2점', '3점', '4점', '5점'])}{field('review.makeAgain', '다시 뜰 의향', 'select', ['있음', '없음'])}
          {field('review.problems', '문제와 해결', 'multiline', undefined, true)}{field('review.nextChanges', '다음에 바꾸고 싶은 점', 'multiline', undefined, true)}{field('review.memo', '완성 메모', 'multiline', undefined, true)}
        </div>
      </ReportSection>
      <footer className="knitting-report-page-footer"><span>도안보고 · 뜨개보고서</span><span>{report.title}</span></footer>
    </div>
  </div>
}
