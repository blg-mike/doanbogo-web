import { useEffect, useMemo, useState } from 'react'
import { Download, X } from 'lucide-react'
import type { KnittingReport } from './types'
import { createInstagramReportImage, type InstagramReportImageItem } from './instagramReportImage'

type Props = { report: KnittingReport; onClose: () => void }

function localDate(timestamp: number) {
  return new Date(timestamp).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })
}

function filePart(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 70) || '뜨개기록'
}

export default function InstagramReportDialog({ report, onClose }: Props) {
  const photos = useMemo(() => report.workPhotos.slice().sort((left, right) => left.activityDate.localeCompare(right.activityDate) || left.uploadedAt - right.uploadedAt), [report.workPhotos])
  const finals = useMemo(() => [
    ...(report.representativePhoto ? [{ id: 'representative', label: '대표 사진', dataUrl: report.representativePhoto }] : []),
    ...report.finishedPhotos.filter((photo) => photo.dataUrl).map((photo) => ({ ...photo, id: 'finished:' + photo.id })),
  ], [report.finishedPhotos, report.representativePhoto])
  const [selected, setSelected] = useState<string[]>(() => photos.slice(0, 8).map((photo) => photo.id))
  const [finalId, setFinalId] = useState(() => finals[0]?.id ?? '')
  const [previewUrl, setPreviewUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  function togglePhoto(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 8 ? [...current, id] : current)
    setError('')
  }

  async function createPreview() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const items: InstagramReportImageItem[] = photos.filter((photo) => selected.includes(photo.id)).map((photo) => ({
        id: 'work:' + photo.id, dataUrl: photo.dataUrl, label: photo.label, activityDate: photo.activityDate,
      }))
      const finalPhoto = finals.find((photo) => photo.id === finalId)
      if (finalPhoto) items.push({ ...finalPhoto, activityDate: '', final: true })
      const blob = await createInstagramReportImage(report.title, items)
      setPreviewUrl(URL.createObjectURL(blob))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '이미지를 만들지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  function downloadImage() {
    if (!previewUrl) return
    const anchor = document.createElement('a')
    anchor.href = previewUrl
    anchor.download = filePart(report.title) + '_인스타.jpg'
    anchor.click()
  }

  return <div className="modal-backdrop instagram-report-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="modal-card instagram-report-dialog" role="dialog" aria-modal="true" aria-label="인스타 이미지 만들기">
      <div className="modal-heading"><div><p className="eyebrow">INSTAGRAM EXPORT</p><h2>인스타 이미지 만들기</h2><small>작업 사진을 날짜순으로 배치하고 완성 사진을 마지막에 붙입니다.</small></div><button className="icon-button" aria-label="닫기" disabled={busy} onClick={onClose}><X size={20} /></button></div>
      <div className="instagram-report-content">
        <div className="instagram-report-photo-list">
          <div className="report-subheading"><h3>작업 과정 사진 <small>{selected.length}/8</small></h3></div>
          {photos.length ? photos.map((photo) => <label className="instagram-report-photo-choice" key={photo.id}>
            <input type="checkbox" checked={selected.includes(photo.id)} disabled={!selected.includes(photo.id) && selected.length >= 8} onChange={() => togglePhoto(photo.id)} />
            <img src={photo.dataUrl} alt="" />
            <span><strong>{photo.activityDate || '날짜 미설정'}</strong><small>{photo.label || '설명 없음'} · 업로드 {localDate(photo.uploadedAt)}</small></span>
          </label>) : <p className="instagram-report-empty">등록된 작업 과정 사진이 없습니다.</p>}
          <label className="report-field instagram-report-final">마지막 완성 사진
            <select value={finalId} onChange={(event) => setFinalId(event.currentTarget.value)}>
              <option value="">선택 안 함</option>
              {finals.map((photo) => <option key={photo.id} value={photo.id}>{photo.label || '완성 사진'}</option>)}
            </select>
          </label>
          <small className="instagram-report-limit">정사각형을 포함한 1080×1350 JPEG 한 장으로 저장합니다. 사진은 최대 9장입니다.</small>
        </div>
        <div className="instagram-report-preview">
          {previewUrl ? <img src={previewUrl} alt="인스타용 합성 이미지 미리보기" /> : <div><span>1080 × 1350</span><small>사진을 선택한 뒤 이미지 만들기를 눌러 주세요.</small></div>}
        </div>
      </div>
      {error && <p className="instagram-report-error" role="alert">{error}</p>}
      <div className="instagram-report-actions">
        <button type="button" className="secondary-button" disabled={busy} onClick={() => void createPreview()}>{busy ? '이미지 만드는 중…' : '이미지 만들기'}</button>
        <button type="button" className="primary-button" disabled={!previewUrl || busy} onClick={downloadImage}><Download size={16} />이미지 다운로드</button>
      </div>
    </section>
  </div>
}
