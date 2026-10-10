import { t, translateMessage, useLocale, type LocaleKey } from './locales/index'
import { useMemo, useState } from 'react'
import { ArrowLeft, Check, Clipboard, X } from 'lucide-react'
import type { KnittingReport } from './types'
import { buildInstagramCaption, optionalCaptionFields, recommendedCaptionFields, type InstagramCaptionField } from './instagramCaption'

type Props = { report: KnittingReport; onClose: () => void; onCopied: () => void }

const labels: Record<InstagramCaptionField, LocaleKey> = {
  pattern: '도안명 / 디자이너', size: '뜬 사이즈', yarn: '사용 실', usage: '사용량', needles: '사용 바늘',
  modifications: '도안에서 수정한 부분', oneLine: '한줄 기록', gauge: '게이지', measurements: '완성 실측', fit: '핏', yarnMemo: '실 메모',
}

export default function InstagramCaptionDialog({ report, onClose, onCopied }: Props) {
  const locale = useLocale()
  const [selected, setSelected] = useState<InstagramCaptionField[]>(recommendedCaptionFields)
  const [step, setStep] = useState<'select' | 'preview'>('select')
  const [caption, setCaption] = useState('')
  const [error, setError] = useState('')
  // The builder calls t() from the active locale; locale changes must regenerate the unedited preview.
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- locale is an external translation input to the builder.
  const generated = useMemo(() => buildInstagramCaption(report, selected), [report, selected, locale])

  function toggle(field: InstagramCaptionField) {
    setSelected((current) => current.includes(field) ? current.filter((item) => item !== field) : [...current, field])
  }

  function goBack() {
    if (step === 'preview' && caption !== generated && !window.confirm(t('선택을 바꾸면 편집한 문구가 새 문구로 바뀝니다. 계속할까요?'))) return
    setStep('select')
  }

  async function copy() {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(caption)
      else {
        const textarea = document.createElement('textarea')
        textarea.value = caption
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.append(textarea)
        textarea.select()
        const copied = document.execCommand('copy')
        textarea.remove()
        if (!copied) throw new Error(t('문구를 선택해 직접 복사해 주세요.'))
      }
      onCopied()
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? translateMessage(cause.message) : t('복사하지 못했습니다. 문구를 선택해 직접 복사해 주세요.'))
    }
  }

  function continueToPreview() {
    setCaption(generated)
    setError('')
    setStep('preview')
  }

  return <div className="modal-backdrop instagram-caption-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="modal-card instagram-caption-dialog" role="dialog" aria-modal="true" aria-label={t("IG 문구 복사")}>
      <div className="modal-heading"><div><p className="eyebrow">{t('Instagram 문구')}</p><h2>{step === 'select' ? t('포함할 내용 선택') : t('문구 미리보기')}</h2><small>{step === 'select' ? t('공유할 정보만 골라 문구를 만들어요.') : t('복사 전에 문구를 자유롭게 수정할 수 있어요.')}</small></div><button type="button" className="icon-button" aria-label={t("닫기")} onClick={onClose}><X size={17} /></button></div>
      {step === 'select' ? <div className="instagram-caption-choices">
        <fieldset><legend>{t("공유 추천")}</legend>{recommendedCaptionFields.map((field) => <label key={field}><input type="checkbox" checked={selected.includes(field)} onChange={() => toggle(field)} /><span>{t(labels[field])}</span></label>)}</fieldset>
        <fieldset><legend>{t("추가 정보 ")}<small>{t("선택")}</small></legend>{optionalCaptionFields.map((field) => <label key={field}><input type="checkbox" checked={selected.includes(field)} onChange={() => toggle(field)} /><span>{t(labels[field])}</span></label>)}</fieldset>
      </div> : <><textarea aria-label={t("Instagram 문구")} value={caption} onChange={(event) => { setCaption(event.currentTarget.value); setError('') }} /><div className={'instagram-caption-count' + (caption.length > 2200 ? ' over' : '')}>{caption.length} / 2200</div></>}
      {caption.length > 2200 && step === 'preview' && <p className="instagram-caption-warning" role="status">{t("Instagram 권장 글자 수를 넘었습니다. 복사 전 문구를 줄여 주세요.")}</p>}
      {error && <p className="instagram-report-error" role="alert">{error}</p>}
      <div className="instagram-report-actions">{step === 'select' ? <><button type="button" className="secondary-button" onClick={onClose}>{t("취소")}</button><button type="button" className="primary-button" onClick={continueToPreview}>{t("문구 미리보기 ")}<ArrowLeft className="instagram-caption-next" size={15} /></button></> : <><button type="button" className="secondary-button" onClick={goBack}><ArrowLeft size={15} />{t("항목 변경")}</button><button type="button" className="primary-button" onClick={() => void copy()}><Clipboard size={15} />{t("문구 복사 ")}<Check size={14} /></button></>}</div>
    </section>
  </div>
}
