import { useLayoutEffect, useRef, useState, type HTMLAttributes } from 'react'
import './AnimatedNumber.css'

type MotionDirection = 'auto' | 'up' | 'down'

export interface AnimatedNumberProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  value: number
  format?: (value: number) => string
  duration?: number
  stagger?: number
  direction?: MotionDirection
  /** Changes such as switching documents or units should snap to the new value. */
  resetKey?: string | number
}

type Token = { kind: 'digit'; key: string; digit: number; positionFromRight: number } | { kind: 'text'; key: string; text: string }

const ROLL_CYCLES = 3
const MIDDLE_CYCLE = 10

function tokenize(text: string): Token[] {
  const positions = new Map<number, number>()
  let digitPosition = 0
  for (let index = text.length - 1; index >= 0; index--) {
    const char = text[index]
    if (char >= '0' && char <= '9') positions.set(index, digitPosition++)
  }

  return text.split('').map((char, index) => {
    const positionFromRight = positions.get(index)
    if (positionFromRight !== undefined) return { kind: 'digit', key: `digit-${positionFromRight}`, digit: Number(char), positionFromRight }
    return { kind: 'text', key: `text-${index}`, text: char }
  })
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true)

  useLayoutEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(preference.matches)
    update()
    preference.addEventListener('change', update)
    return () => preference.removeEventListener('change', update)
  }, [])

  return reduced
}

function getVisibleIndex(strip: HTMLElement, fallback: number) {
  const height = strip.parentElement?.getBoundingClientRect().height ?? 0
  if (height <= 0) return fallback
  const transform = getComputedStyle(strip).transform
  if (!transform || transform === 'none') return fallback
  try {
    return -new DOMMatrixReadOnly(transform).m42 / height
  } catch {
    const matrix = /^matrix\([^,]+,[^,]+,[^,]+,[^,]+,\s*[^,]+,\s*(-?[\d.]+)\)$/.exec(transform)
    return matrix ? -Number(matrix[1]) / height : fallback
  }
}

function targetIndex(current: number, digit: number, direction: Exclude<MotionDirection, 'auto'>) {
  if (direction === 'up') {
    const lower = Math.floor(current)
    return lower + ((digit - (lower % 10) + 10) % 10)
  }
  const upper = Math.ceil(current)
  return upper - (((upper % 10) - digit + 10) % 10)
}

function RollingDigit({ digit, positionFromRight, animate, animateFromZero, direction, duration, stagger, resetKey, reduced }: {
  digit: number
  positionFromRight: number
  animate: boolean
  animateFromZero: boolean
  direction: Exclude<MotionDirection, 'auto'>
  duration: number
  stagger: number
  resetKey: string | number | undefined
  reduced: boolean
}) {
  const viewportRef = useRef<HTMLSpanElement>(null)
  const stripRef = useRef<HTMLSpanElement>(null)
  const indexRef = useRef(MIDDLE_CYCLE + digit)
  const previousDigitRef = useRef<number | null>(null)
  const resetKeyRef = useRef(resetKey)
  const animateFromZeroRef = useRef(animateFromZero)
  const settleTimerRef = useRef<number | undefined>(undefined)

  useLayoutEffect(() => {
    const strip = stripRef.current
    const viewport = viewportRef.current
    if (!strip || !viewport) return
    window.clearTimeout(settleTimerRef.current)

    const center = MIDDLE_CYCLE + digit
    const resetChanged = resetKeyRef.current !== resetKey
    const previousDigit = previousDigitRef.current
    if (previousDigit === null) {
      if (animateFromZeroRef.current && !resetChanged && !reduced) {
        const target = targetIndex(MIDDLE_CYCLE, digit, direction)
        const delay = Math.max(0, positionFromRight * stagger)
        strip.style.transition = 'none'
        strip.style.transform = `translate3d(0, -${MIDDLE_CYCLE}em, 0)`
        void viewport.offsetHeight
        strip.style.transition = `transform ${Math.max(0, duration)}ms cubic-bezier(.3,.75,.1,1) ${delay}ms`
        strip.style.transform = `translate3d(0, -${target}em, 0)`
        strip.setAttribute('data-rolling', '')
        indexRef.current = target
        settleTimerRef.current = window.setTimeout(() => {
          if (!stripRef.current) return
          strip.style.transition = 'none'
          strip.style.transform = `translate3d(0, -${center}em, 0)`
          strip.removeAttribute('data-rolling')
          indexRef.current = center
        }, Math.max(0, duration) + delay + 40)
      } else {
        strip.style.transition = 'none'
        strip.style.transform = `translate3d(0, -${center}em, 0)`
        strip.removeAttribute('data-rolling')
        indexRef.current = center
      }
    } else if (resetChanged || reduced || !animate) {
      strip.style.transition = 'none'
      strip.style.transform = `translate3d(0, -${center}em, 0)`
      strip.removeAttribute('data-rolling')
      indexRef.current = center
    } else if (previousDigit !== digit) {
      const visible = getVisibleIndex(strip, indexRef.current)
      const target = targetIndex(visible, digit, direction)
      const delay = Math.max(0, positionFromRight * stagger)
      strip.style.transition = 'none'
      strip.style.transform = `translate3d(0, -${visible}em, 0)`
      void viewport.offsetHeight
      strip.style.transition = `transform ${Math.max(0, duration)}ms cubic-bezier(.3,.75,.1,1) ${delay}ms`
      strip.style.transform = `translate3d(0, -${target}em, 0)`
      strip.setAttribute('data-rolling', '')
      indexRef.current = target
      settleTimerRef.current = window.setTimeout(() => {
        if (!stripRef.current) return
        strip.style.transition = 'none'
        strip.style.transform = `translate3d(0, -${center}em, 0)`
        strip.removeAttribute('data-rolling')
        indexRef.current = center
      }, Math.max(0, duration) + delay + 40)
    }

    previousDigitRef.current = digit
    resetKeyRef.current = resetKey
    return () => window.clearTimeout(settleTimerRef.current)
  }, [animate, digit, direction, duration, positionFromRight, reduced, resetKey, stagger])

  useLayoutEffect(() => () => window.clearTimeout(settleTimerRef.current), [])

  return <span ref={viewportRef} className="kp-animated-number__digit" aria-hidden="true"><span ref={stripRef} className="kp-animated-number__strip">{Array.from({ length: ROLL_CYCLES * 10 }, (_, index) => <span key={index}>{index % 10}</span>)}</span></span>
}

/** Rolls only changed digits; the formatted accessible value remains one text node. */
export function AnimatedNumber({
  value,
  format = (number) => number.toLocaleString(),
  duration = 180,
  stagger = 18,
  direction = 'auto',
  resetKey,
  className,
  style,
  'aria-live': ariaLive = 'off',
  'aria-atomic': ariaAtomic = true,
  ...rest
}: AnimatedNumberProps) {
  const reduced = useReducedMotion()
  const text = format(value)
  const previous = useRef({ value, text, resetKey })
  // oxlint-disable-next-line react/refs -- Compare the last committed value to derive one render's transient roll direction.
  const resetChanged = previous.current.resetKey !== resetKey
  // oxlint-disable-next-line react/refs -- A formatting or document reset snaps instead of rolling.
  const formattingChanged = previous.current.text !== text && previous.current.value === value
  // oxlint-disable-next-line react/refs -- Animation state is derived from the last committed value, then advanced in the layout effect below.
  const animate = previous.current.value !== value && !resetChanged && !formattingChanged && !reduced && duration > 0
  // oxlint-disable-next-line react/refs -- Direction follows the change between committed numeric values.
  const resolvedDirection = direction === 'auto' ? value >= previous.current.value ? 'up' : 'down' : direction
  const tokens = tokenize(text)
  // oxlint-disable-next-line react/refs -- The previous committed formatting determines which newly mounted digit should roll in.
  const previousDigitCount = (previous.current.text.match(/[0-9]/g) ?? []).length

  useLayoutEffect(() => {
    previous.current = { value, text, resetKey }
  }, [resetKey, text, value])

  return <span className={['kp-animated-number', className].filter(Boolean).join(' ')} style={style} aria-live={ariaLive} aria-atomic={ariaAtomic} {...rest}>
    <span className="kp-animated-number__accessible">{text}</span>
    <span className="kp-animated-number__visual" aria-hidden="true">{tokens.map((token) => token.kind === 'digit'
      ? <RollingDigit key={token.key} digit={token.digit} positionFromRight={token.positionFromRight} animate={animate} animateFromZero={animate && token.positionFromRight >= previousDigitCount} direction={resolvedDirection} duration={duration} stagger={stagger} resetKey={resetKey} reduced={reduced} />
      : <span className="kp-animated-number__text" key={token.key}>{token.text}</span>)}</span>
  </span>
}
