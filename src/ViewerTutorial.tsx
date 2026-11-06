import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { t } from './locales'
import { viewerTutorialPlacement, viewerTutorialSteps } from './ViewerTutorialUtils'
import './ViewerTutorial.css'

type Props = {
  mode: 'welcome' | 'steps'
  step: number
  onStart: () => void
  onLater: () => void
  onPrevious: () => void
  onNext: () => void
  onSkip: () => void
  onComplete: () => void
}

function findTutorialTarget(key: string) {
  return [...document.querySelectorAll<HTMLElement>(`[data-viewer-tutorial-target="${key}"]`)].find((element) => {
    const style = getComputedStyle(element)
    return element.getClientRects().length > 0 && style.display !== 'none' && style.visibility !== 'hidden'
  }) ?? null
}

function revealInViewer(element: HTMLElement) {
  for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
    const rect = element.getBoundingClientRect()
    const bounds = parent.getBoundingClientRect()
    const style = getComputedStyle(parent)
    const horizontal = /auto|scroll/.test(style.overflowX) && parent.scrollWidth > parent.clientWidth
    const vertical = /auto|scroll/.test(style.overflowY) && parent.scrollHeight > parent.clientHeight
    if (horizontal && (rect.left < bounds.left || rect.right > bounds.right)) {
      parent.scrollBy({ left: rect.left < bounds.left ? rect.left - bounds.left : rect.right - bounds.right, behavior: 'auto' })
    }
    if (vertical && (rect.top < bounds.top || rect.bottom > bounds.bottom)) {
      parent.scrollBy({ top: rect.top < bounds.top ? rect.top - bounds.top : rect.bottom - bounds.bottom, behavior: 'auto' })
    }
  }
}

function Preview({ step }: { step: number }) {
  if (step === 3) return <div className="viewer-tutorial-preview-menu" aria-hidden="true">
    <strong>{t('진행선 메뉴')}</strong>
    <span>{t('마커 표시')}</span><span>{t('진행선 스타일')}</span><span>{t('참고선 추가')}</span><span>{t('진행선 삭제')}</span>
  </div>
  if (step === 4) return <div className="viewer-tutorial-preview-menu viewer-tutorial-preview-style" aria-hidden="true">
    <strong>{t('집중선 설정')}</strong>
    <span className="viewer-tutorial-preview-check">✓ {t('집중선')}</span>
    <span>{t('집중 강도')} <i /></span><span>{t('집중선 두께')} <i /></span>
  </div>
  return null
}

export default function ViewerTutorial({ mode, step, onStart, onLater, onPrevious, onNext, onSkip, onComplete }: Props) {
  const panelRef = useRef<HTMLElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  const [position, setPosition] = useState({ left: 12, top: 12, diameter: 0, x: 0, y: 0, side: 'center' as 'top' | 'bottom' | 'center' })
  const currentStep = viewerTutorialSteps[step]

  useEffect(() => {
    const containsTarget = (target: EventTarget | null) => target instanceof Node && Boolean(panelRef.current?.contains(target))
    const trap = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        if (mode === 'welcome') onLater()
        else onSkip()
        return
      }
      if (!containsTarget(event.target)) {
        event.preventDefault()
        event.stopImmediatePropagation()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return
      const controls = [...panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled])')]
      if (!controls.length) return
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && (document.activeElement === first || !panelRef.current.contains(document.activeElement))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    const blockOutsidePointer = (event: Event) => {
      if (containsTarget(event.target)) return
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    const blockOutsideWheel = (event: WheelEvent) => {
      if (containsTarget(event.target)) return
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    const focus = () => {
      if (mode === 'welcome') panelRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus()
      else nextRef.current?.focus()
    }
    const frame = requestAnimationFrame(focus)
    window.addEventListener('keydown', trap, true)
    document.addEventListener('pointerdown', blockOutsidePointer, true)
    document.addEventListener('touchmove', blockOutsidePointer, { capture: true, passive: false })
    document.addEventListener('click', blockOutsidePointer, true)
    document.addEventListener('contextmenu', blockOutsidePointer, true)
    window.addEventListener('wheel', blockOutsideWheel, { capture: true, passive: false })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', trap, true)
      document.removeEventListener('pointerdown', blockOutsidePointer, true)
      document.removeEventListener('touchmove', blockOutsidePointer, true)
      document.removeEventListener('click', blockOutsidePointer, true)
      document.removeEventListener('contextmenu', blockOutsidePointer, true)
      window.removeEventListener('wheel', blockOutsideWheel, true)
    }
  }, [mode, step, onLater, onSkip])

  useLayoutEffect(() => {
    if (mode !== 'steps' || !currentStep) return
    let frame = 0
    let attempts = 0
    let observer: ResizeObserver | undefined
    const panel = panelRef.current
    const update = () => {
      const target = findTutorialTarget(currentStep[2])
      if (!target && attempts++ < 8) {
        frame = requestAnimationFrame(update)
        return
      }
      if (target) revealInViewer(target)
      frame = requestAnimationFrame(() => {
        const rect = target?.getBoundingClientRect() ?? null
        const bubble = panel?.getBoundingClientRect()
        const placement = viewerTutorialPlacement(rect, bubble?.width ?? 340, bubble?.height ?? 280, window.innerWidth, window.innerHeight)
        setPosition({ ...placement, x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2, y: rect ? rect.top + rect.height / 2 : window.innerHeight / 2 })
      })
      if (target && panel && typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(() => {
          const nextRect = target.getBoundingClientRect()
          const bubble = panel.getBoundingClientRect()
          const next = viewerTutorialPlacement(nextRect, bubble.width, bubble.height, window.innerWidth, window.innerHeight)
          setPosition({ ...next, x: nextRect.left + nextRect.width / 2, y: nextRect.top + nextRect.height / 2 })
        })
        observer.observe(target)
        observer.observe(panel)
      }
    }
    update()
    window.addEventListener('resize', update)
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    document.addEventListener('scroll', update, true)
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('scroll', update)
      document.removeEventListener('scroll', update, true)
    }
  }, [currentStep, mode])

  if (typeof document === 'undefined') return null
  if (mode === 'welcome') return createPortal(<div className="viewer-tutorial-welcome-backdrop">
    <section ref={panelRef} className="viewer-tutorial-welcome" role="dialog" aria-modal="true" aria-labelledby="viewer-tutorial-welcome-title">
      <span className="viewer-tutorial-kicker">{t('처음 사용하는 분을 위한 안내')}</span>
      <h2 id="viewer-tutorial-welcome-title">{t('뷰어 사용법을 알아볼까요?')}</h2>
      <p>{t('주요 버튼을 짚어 보며 화면에서 하는 일을 안내해 드릴게요. 도안이나 작업 내용은 바뀌지 않습니다.')}</p>
      <div className="viewer-tutorial-actions"><button type="button" className="viewer-tutorial-secondary" onClick={onLater}>{t('나중에')}</button><button type="button" className="viewer-tutorial-primary" onClick={onStart}>{t('시작하기')}</button></div>
    </section>
  </div>, document.body)
  if (!currentStep) return null

  const spotlightStyle: CSSProperties = {
    left: `${position.x - position.diameter / 2}px`,
    top: `${position.y - position.diameter / 2}px`,
    width: `${position.diameter}px`,
    height: `${position.diameter}px`,
  }
  const backdropStyle = {
    '--tutorial-x': `${position.x}px`,
    '--tutorial-y': `${position.y}px`,
    '--tutorial-radius': `${position.diameter / 2}px`,
  } as CSSProperties

  return createPortal(<div className="viewer-tutorial-layer">
    <div className="viewer-tutorial-dim" style={backdropStyle} aria-hidden="true" />
    {position.diameter > 0 && <div className="viewer-tutorial-spotlight" style={spotlightStyle} aria-hidden="true" />}
    <section ref={panelRef} className="viewer-tutorial-callout" data-placement={position.side} style={{ left: position.left, top: position.top }} role="dialog" aria-modal="true" aria-labelledby="viewer-tutorial-title" aria-describedby="viewer-tutorial-description">
      <span className="viewer-tutorial-kicker">{t('뷰어 사용법')} · {t('{current}/{total}', { current: step + 1, total: viewerTutorialSteps.length })}</span>
      <h2 id="viewer-tutorial-title" aria-live="polite">{t(currentStep[0])}</h2>
      <p id="viewer-tutorial-description">{t(currentStep[1])}</p>
      <Preview step={step} />
      <div className="viewer-tutorial-footer"><span>{t('건너뛰려면 Esc를 누르세요.')}</span><div className="viewer-tutorial-actions">
        <button type="button" className="viewer-tutorial-icon-button" aria-label={t('이전')} title={t('이전')} disabled={step === 0} onClick={onPrevious}><ChevronLeft size={18} /></button>
        <button ref={nextRef} type="button" className="viewer-tutorial-primary" onClick={step === viewerTutorialSteps.length - 1 ? onComplete : onNext}>{step === viewerTutorialSteps.length - 1 ? t('완료') : t('다음')}<ChevronRight size={16} /></button>
        <button type="button" className="viewer-tutorial-icon-button" aria-label={t('건너뛰기')} title={t('건너뛰기')} onClick={onSkip}><X size={17} /></button>
      </div></div>
    </section>
  </div>, document.body)
}
