import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { formatDate, formatNumber, t } from './locales'
import type { DocumentWorkTimeDay } from './types'
import { formatWorkTimeHoursMinutes } from './workTime'
import WorkTimeRecordPanel from './WorkTimeRecordPanel'

type Props = {
  documentId: string
  totalWorkTimeMs: number
  workTimeDays: DocumentWorkTimeDay[]
  onAddWorkTime: (date: string, elapsedMs: number) => Promise<{ totalWorkTimeMs: number; workTimeDays: DocumentWorkTimeDay[] }>
  onTotalsChange: (totalWorkTimeMs: number, workTimeDays: DocumentWorkTimeDay[]) => void
}

function durationText(milliseconds: number) {
  const { hours, minutes } = formatWorkTimeHoursMinutes(milliseconds)
  return t('{hours}시간 {minutes}분', { hours: formatNumber(Number(hours)), minutes: formatNumber(Number(minutes)) })
}

function dayDate(date: string) {
  return new Date(date + 'T12:00:00')
}

export default function ReportWorkTime({ documentId, totalWorkTimeMs, workTimeDays, onAddWorkTime, onTotalsChange }: Props) {
  const [open, setOpen] = useState(false)
  return <>
    <button type="button" className="report-worktime-card" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
      <span className="report-worktime-title">{t('작업 시간')}</span>
      <strong className="report-worktime-total">{durationText(totalWorkTimeMs)}</strong>
      <span className="report-worktime-hint">{t('타이머에서 자동 기록')}</span>
      {workTimeDays.length > 0 && <span className="report-worktime-recent">{[...workTimeDays].sort((left, right) => right.date.localeCompare(left.date)).slice(0, 2).map((day) => <span key={day.date}><time dateTime={day.date}>{formatDate(dayDate(day.date), { month: 'numeric', day: 'numeric' })}</time><b>{durationText(day.elapsedMs)}</b></span>)}</span>}
      <span className="report-worktime-open">{t('작업시간 기록 보기')} <ChevronRight size={15} aria-hidden="true" /></span>
    </button>
    {open && <WorkTimeRecordPanel documentId={documentId} initialTotalWorkTimeMs={totalWorkTimeMs} initialWorkTimeDays={workTimeDays} onClose={() => setOpen(false)} onAddWorkTime={onAddWorkTime} onTotalsChange={onTotalsChange} />}
  </>
}
