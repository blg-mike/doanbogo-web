import { useState } from 'react'
import { ArrowLeft, CircleDot, Grid3X3, Rows3, Ruler, Scissors, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { createCrochetChart, createKnittingChart } from './charts'
import { saveChart } from './storage'
import type { ChartCraft, ChartUnit } from './types'
import './Chart.css'

export default function ChartCreate() {
  const navigate = useNavigate()
  const [craft, setCraft] = useState<ChartCraft | null>(null)
  const [width, setWidth] = useState(20)
  const [height, setHeight] = useState(20)
  const [gaugeStitches, setGaugeStitches] = useState(18)
  const [gaugeRows, setGaugeRows] = useState(24)
  const [unit, setUnit] = useState<ChartUnit>('in')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const basis = unit === 'in' ? 4 : 10
  const physicalWidth = width / gaugeStitches * basis
  const physicalHeight = height / gaugeRows * basis
  const unitLabel = unit === 'in' ? 'in' : 'cm'

  function changeUnit(next: ChartUnit) {
    if (next === unit) return
    const factor = next === 'cm' ? 10 / 10.16 : 10.16 / 10
    setGaugeStitches(Math.max(1, Math.round(gaugeStitches * factor)))
    setGaugeRows(Math.max(1, Math.round(gaugeRows * factor)))
    setUnit(next)
  }

  async function makeChart() {
    setBusy(true)
    setError('')
    try {
      const chart = craft === 'crochet'
        ? createCrochetChart()
        : createKnittingChart(width, height, unit, gaugeStitches, gaugeRows)
      await saveChart(chart)
      navigate('/chart/' + chart.id)
    } catch {
      setError('차트를 저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.')
      setBusy(false)
    }
  }

  return (
    <main className="chart-create-shell">
      <header className="chart-create-header">
        <button className="chart-back" onClick={() => craft ? setCraft(null) : navigate('/')} aria-label="뒤로"><ArrowLeft size={20} /></button>
        <strong>차트 만들기</strong><span />
      </header>
      <section className="chart-create-content">
        {!craft ? <>
          <p className="chart-eyebrow">새로운 도안</p><h1>어떤 도안을 만들까요?</h1>
          <div className="craft-options">
            <button className="craft-card" onClick={() => setCraft('crochet')}><span className="craft-icon crochet-icon"><Scissors size={31} /></span><span><strong>코바늘 도안</strong><small>기호를 자유롭게 놓아 나만의 도안을 만들어요.</small></span><b>›</b></button>
            <button className="craft-card" onClick={() => setCraft('knitting')}><span className="craft-icon knitting-icon"><Grid3X3 size={31} /></span><span><strong>대바늘 도안</strong><small>색상 차트를 만들고 격자에 색을 채워요.</small></span><b>›</b></button>
          </div>
        </> : craft === 'crochet' ? <>
          <p className="chart-eyebrow">코바늘</p><h1>Free Form 차트</h1>
          <div className="chart-choice selected"><span className="choice-symbol">⌘</span><span><strong>기호를 자유롭게 배치</strong><small>캔버스 위에 코바늘 기호를 놓고 도안을 구성합니다.</small></span><CircleDot size={18} /></div>
          <p className="chart-hint"><Sparkles size={17} /> 빈 캔버스에서 시작해요. 필요한 기호를 직접 배치할 수 있습니다.</p>
          {error && <p className="chart-error">{error}</p>}
          <button className="primary-button chart-next" disabled={busy} onClick={() => void makeChart()}>{busy ? '만드는 중…' : '차트 만들기'}</button>
        </> : <>
          <p className="chart-eyebrow">대바늘 · Colors</p><h1>차트 설정</h1>
          <div className="chart-choice selected"><span className="choice-symbol"><Rows3 size={20} /></span><span><strong>색상 차트</strong><small>내 색상으로 빈 격자 도안을 만들어요.</small></span><CircleDot size={18} /></div>
          <div className="chart-fixed-choices"><span><b>실 색상</b>내 색상으로 시작</span><span><b>작업 방식</b>원형으로 뜨기</span><span><b>시작 방식</b>빈 차트로 시작</span></div>
          <div className="chart-settings-panel">
            <div className="chart-panel-heading"><Ruler size={17} /><strong>격자와 게이지</strong></div>
            <div className="chart-number-grid">
              <label>가로 <span>코</span><input type="number" min={1} max={200} value={width} onChange={(event) => setWidth(Math.min(200, Math.max(1, Number(event.target.value) || 1)))} /></label>
              <label>세로 <span>단</span><input type="number" min={1} max={200} value={height} onChange={(event) => setHeight(Math.min(200, Math.max(1, Number(event.target.value) || 1)))} /></label>
            </div>
            <div className="chart-number-grid">
              <label>게이지 <span>코 / {unit === 'in' ? '4 in' : '10 cm'}</span><input type="number" min={1} max={200} value={gaugeStitches} onChange={(event) => setGaugeStitches(Math.min(200, Math.max(1, Number(event.target.value) || 1)))} /></label>
              <label>게이지 <span>단 / {unit === 'in' ? '4 in' : '10 cm'}</span><input type="number" min={1} max={200} value={gaugeRows} onChange={(event) => setGaugeRows(Math.min(200, Math.max(1, Number(event.target.value) || 1)))} /></label>
            </div>
            <label className="chart-unit-field">완성 크기 단위<select value={unit} onChange={(event) => changeUnit(event.target.value as ChartUnit)}><option value="in">inch (in)</option><option value="cm">센티미터 (cm)</option></select></label>
            <div className="chart-size-result"><span>예상 완성 크기</span><strong>{physicalWidth.toFixed(1)} × {physicalHeight.toFixed(1)} {unitLabel}</strong></div>
            <small className="chart-size-note">입력한 게이지와 코·단 수를 기준으로 계산합니다.</small>
          </div>
          {error && <p className="chart-error">{error}</p>}
          <button className="primary-button chart-next" disabled={busy} onClick={() => void makeChart()}>{busy ? '만드는 중…' : '차트 만들기'}</button>
        </>}
      </section>
    </main>
  )
}
