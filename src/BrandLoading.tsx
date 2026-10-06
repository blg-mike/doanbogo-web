import { useEffect, useState } from 'react'
import { addVisibleLoadingTime, getNextLoadingDelay, selectBrandLoadingCopy, type BrandLoadingKind } from './brandLoadingState'

type BrandLoadingProps = {
  kind: BrandLoadingKind
  requestId: string
  layout?: 'screen' | 'pane' | 'overlay' | 'report'
  messageOverride?: string
}

export default function BrandLoading(props: BrandLoadingProps) {
  return <TimedBrandLoading key={props.requestId} {...props} />
}

function TimedBrandLoading({ layout = 'pane', messageOverride, requestId }: BrandLoadingProps) {
  const [elapsedMs, setElapsedMs] = useState(0)
  const [paused, setPaused] = useState(() => document.visibilityState === 'hidden')
  const [selectedCopy, setSelectedCopy] = useState(() => selectBrandLoadingCopy(Math.random()))

  useEffect(() => {
    let accumulatedMs = 0
    let activeSince = document.visibilityState === 'hidden' ? null : performance.now()
    let timer: number | undefined

    const scheduleNextMilestone = () => {
      if (activeSince === null) return
      if (timer !== undefined) window.clearTimeout(timer)
      const elapsed = addVisibleLoadingTime(accumulatedMs, activeSince, performance.now())
      const delay = getNextLoadingDelay(elapsed)
      if (delay === null) return
      timer = window.setTimeout(() => {
        timer = undefined
        if (activeSince === null) return
        accumulatedMs = addVisibleLoadingTime(accumulatedMs, activeSince, performance.now())
        activeSince = performance.now()
        setElapsedMs(accumulatedMs)
        if (accumulatedMs >= 2400) setSelectedCopy((previous) => selectBrandLoadingCopy(Math.random(), previous))
        scheduleNextMilestone()
      }, delay)
    }

    const handleVisibilityChange = () => {
      const now = performance.now()
      if (document.visibilityState === 'hidden') {
        accumulatedMs = addVisibleLoadingTime(accumulatedMs, activeSince, now)
        activeSince = null
        if (timer !== undefined) window.clearTimeout(timer)
        timer = undefined
        setElapsedMs(accumulatedMs)
        setPaused(true)
        return
      }
      if (activeSince !== null) return
      activeSince = now
      setPaused(false)
      scheduleNextMilestone()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    scheduleNextMilestone()
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [requestId])

  const message = messageOverride ?? selectedCopy
  const visible = messageOverride !== undefined || elapsedMs >= 400
  const className = 'brand-loading brand-loading--' + layout + (visible ? ' brand-loading--visible' : ' brand-loading--waiting')
  const content = !visible ? null : messageOverride !== undefined
    ? <span className="brand-loading-error" role="alert">{messageOverride}</span>
    : <>
      <span className="sr-only" role="status" aria-live="polite">불러오는 중</span>
      <svg className="brand-loading-symbol" viewBox="0 0 48 48" aria-hidden="true">
        <path className="brand-loading-needle" d="M7 36 40 11M7 29h35m0 0-5-4" />
        <path className="brand-loading-stitch brand-loading-stitch-1" d="M7 29c0-10 8-10 8 0" />
        <path className="brand-loading-stitch brand-loading-stitch-2" d="M15 29c0-10 8-10 8 0" />
        <path className="brand-loading-stitch brand-loading-stitch-3" d="M23 29c0-10 8-10 8 0" />
        <path className="brand-loading-stitch brand-loading-stitch-4" d="M31 29c0-10 8-10 8 0" />
      </svg>
      <span className="brand-loading-copy" aria-hidden="true">{message}</span>
    </>

  if (layout === 'screen') return <main className={className} aria-busy="true" data-paused={paused}>{content}</main>
  return <div className={className} aria-busy="true" data-paused={paused}>{content}</div>
}
