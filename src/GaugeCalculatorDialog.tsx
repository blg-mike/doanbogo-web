import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Check, Ruler, X } from 'lucide-react'
import { formatNumber, t } from './locales'
import { calculateGaugePer10Cm, type GaugeCalculatorResult, type GaugeCalculatorTarget } from './reportGaugeCalculator'
import type { GaugeSide } from './reportFormatting'

type GaugeOption = { sampleIndex: number | null; label: string }

type Props = {
  gaugeOptions: GaugeOption[]
  onClose: () => void
  onApply: (target: GaugeCalculatorTarget, result: GaugeCalculatorResult) => void
}

export default function GaugeCalculatorDialog({ gaugeOptions, onClose, onApply }: Props) {
  const [stitches, setStitches] = useState('10')
  const [rows, setRows] = useState('10')
  const [widthCm, setWidthCm] = useState('10')
  const [heightCm, setHeightCm] = useState('10')
  const [sampleIndex, setSampleIndex] = useState<number | null>(null)
  const [side, setSide] = useState<GaugeSide>('before')
  const [result, setResult] = useState<GaugeCalculatorResult | null>(null)
  const [error, setError] = useState('')
  const dialogRef = useRef<HTMLElement>(null)
  const firstInputRef = useRef<HTMLInputElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    firstInputRef.current?.focus()
    return () => openerRef.current?.focus()
  }, [])

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)') ?? [])]
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  function updateInput(setValue: (value: string) => void, value: string) {
    setValue(value)
    setResult(null)
    setError('')
  }

  function calculate() {
    const calculated = calculateGaugePer10Cm({
      stitches: Number(stitches),
      rows: Number(rows),
      widthCm: Number(widthCm),
      heightCm: Number(heightCm),
    })
    if (!calculated) {
      setResult(null)
      setError(t('코·단은 1 이상의 정수로, 폭·높이는 0보다 크게 입력해 주세요.'))
      return
    }
    setResult(calculated)
    setError('')
  }

  function apply() {
    if (!result) return
    onApply({ sampleIndex, side }, result)
  }

  return <div className="modal-backdrop gauge-calculator-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section ref={dialogRef} className="modal-card gauge-calculator-dialog" role="dialog" aria-modal="true" aria-labelledby="gauge-calculator-title" onKeyDown={handleKeyDown}>
      <header className="modal-heading gauge-calculator-header">
        <div>
          <h2 id="gauge-calculator-title"><Ruler size={19} aria-hidden="true" />{t('게이지 계산기')}</h2>
          <p>{t('스와치의 코 수, 단 수와 실측 크기를 입력하면 10cm당 게이지를 계산합니다.')}</p>
        </div>
        <button type="button" className="icon-button" aria-label={t('게이지 계산기 닫기')} onClick={onClose}><X size={18} /></button>
      </header>
      <div className="gauge-calculator-layout">
        <section className="gauge-calculator-inputs" aria-label={t('게이지 계산기 입력')}>
          <div className="gauge-calculator-fields">
            <label className="report-field">{t('적용할 게이지')}
              <select value={sampleIndex === null ? 'primary' : String(sampleIndex)} onChange={(event) => setSampleIndex(event.currentTarget.value === 'primary' ? null : Number(event.currentTarget.value))}>
                {gaugeOptions.map((option) => <option key={option.sampleIndex ?? 'primary'} value={option.sampleIndex === null ? 'primary' : String(option.sampleIndex)}>{option.label}</option>)}
              </select>
            </label>
            <label className="report-field">{t('세탁 시점')}
              <select value={side} onChange={(event) => setSide(event.currentTarget.value as GaugeSide)}>
                <option value="before">{t('세탁 전')}</option>
                <option value="after">{t('세탁 후')}</option>
              </select>
            </label>
          </div>
          <div className="gauge-calculator-fields">
            <label className="report-field">{t('스와치 코 수')}
              <span className="gauge-calculator-input-wrap"><input ref={firstInputRef} type="number" min="1" step="1" inputMode="numeric" value={stitches} onChange={(event) => updateInput(setStitches, event.currentTarget.value)} /><small>{t('코')}</small></span>
            </label>
            <label className="report-field">{t('스와치 단 수')}
              <span className="gauge-calculator-input-wrap"><input type="number" min="1" step="1" inputMode="numeric" value={rows} onChange={(event) => updateInput(setRows, event.currentTarget.value)} /><small>{t('단')}</small></span>
            </label>
            <label className="report-field">{t('스와치 폭')}
              <span className="gauge-calculator-input-wrap"><input type="number" min="0.01" step="any" inputMode="decimal" value={widthCm} onChange={(event) => updateInput(setWidthCm, event.currentTarget.value)} /><small>cm</small></span>
            </label>
            <label className="report-field">{t('스와치 높이')}
              <span className="gauge-calculator-input-wrap"><input type="number" min="0.01" step="any" inputMode="decimal" value={heightCm} onChange={(event) => updateInput(setHeightCm, event.currentTarget.value)} /><small>cm</small></span>
            </label>
          </div>
          {error && <p className="gauge-calculator-error" role="alert">{error}</p>}
          <div className="gauge-calculator-actions">
            <button type="button" className="primary-button" onClick={calculate}>{t('계산하기')}</button>
          </div>
        </section>
        <section className="gauge-calculator-result" aria-live="polite">
          <h3>{t('게이지 결과')}</h3>
          {result ? <>
            <p><span>{t('10cm당 코 수')}</span><strong>{formatNumber(result.stitchesPer10Cm)} <small>{t('코')}</small></strong></p>
            <p><span>{t('10cm당 단 수')}</span><strong>{formatNumber(result.rowsPer10Cm)} <small>{t('단')}</small></strong></p>
          </> : <p className="gauge-calculator-empty">{t('계산 결과가 여기에 표시됩니다.')}</p>}
          <button type="button" className="primary-button gauge-calculator-apply" disabled={!result} onClick={apply}><Check size={16} />{t('적용하기')}</button>
        </section>
      </div>
    </section>
  </div>
}
