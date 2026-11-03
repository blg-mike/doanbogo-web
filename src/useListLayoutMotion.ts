import { useLayoutEffect, useRef, type RefObject } from 'react'

type ItemRect = { left: number; top: number }
type MotionState = {
  initialized: boolean
  resetKey: string
  signature: string
  rects: Map<string, ItemRect>
  animations: Map<string, Animation>
}

const ITEM_SELECTOR = '[data-layout-motion-key]'
const SKIP_SELECTOR = '[data-layout-motion-skip], .is-reordering, .is-swiped, .dragging-source'

function cancelAnimations(state: MotionState) {
  for (const animation of state.animations.values()) animation.cancel()
  state.animations.clear()
}

function getItems(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>(ITEM_SELECTOR)]
    .map((element) => ({ element, key: element.dataset.layoutMotionKey ?? '' }))
    .filter((item) => item.key)
}

function getCoordinateRoot(root: HTMLElement) {
  return root.querySelector<HTMLElement>('[data-layout-motion-container]') ?? root
}

function readItemRect(element: HTMLElement, coordinateRoot: HTMLElement): ItemRect {
  const rect = element.getBoundingClientRect()
  const rootRect = coordinateRoot.getBoundingClientRect()
  const scaleX = coordinateRoot.offsetWidth ? rootRect.width / coordinateRoot.offsetWidth : 1
  const scaleY = coordinateRoot.offsetHeight ? rootRect.height / coordinateRoot.offsetHeight : 1
  return {
    left: rect.left - rootRect.left + coordinateRoot.scrollLeft * scaleX,
    top: rect.top - rootRect.top + coordinateRoot.scrollTop * scaleY,
  }
}

function readRects(coordinateRoot: HTMLElement, items: ReturnType<typeof getItems>) {
  const rects = new Map<string, ItemRect>()
  for (const { element, key } of items) {
    rects.set(key, readItemRect(element, coordinateRoot))
  }
  return rects
}

function shouldSkip(element: HTMLElement) {
  return element.matches(SKIP_SELECTOR) || element.closest(SKIP_SELECTOR) !== null
}

/** Adds short positional feedback only when the keyed item order or membership changes. */
export function useListLayoutMotion<T extends HTMLElement>(
  itemKeys: readonly string[],
  resetKey: string,
  enabled = true,
  skipNextKeysRef?: { current: Set<string> },
  skipPositionMotion = false,
): RefObject<T | null> {
  const rootRef = useRef<T | null>(null)
  const stateRef = useRef<MotionState>({
    initialized: false,
    resetKey,
    signature: '',
    rects: new Map(),
    animations: new Map(),
  })
  const signature = JSON.stringify(itemKeys)

  useLayoutEffect(() => {
    const state = stateRef.current
    const root = rootRef.current
    if (!enabled || !root) {
      cancelAnimations(state)
      skipNextKeysRef?.current.clear()
      state.initialized = false
      state.resetKey = resetKey
      state.signature = signature
      state.rects.clear()
      return
    }

    const items = getItems(root)
    const coordinateRoot = getCoordinateRoot(root)
    if (!state.initialized || state.resetKey !== resetKey) {
      cancelAnimations(state)
      skipNextKeysRef?.current.clear()
      state.initialized = true
      state.resetKey = resetKey
      state.signature = signature
      state.rects = readRects(coordinateRoot, items)
      return
    }
    if (state.signature === signature) return

    const previousRects = new Map(state.rects)
    for (const { key, element } of items) {
      if (!state.animations.has(key)) continue
      previousRects.set(key, readItemRect(element, coordinateRoot))
    }
    cancelAnimations(state)
    const nextRects = readRects(coordinateRoot, items)

    const reduceMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!reduceMotion) {
      const rootRect = coordinateRoot.getBoundingClientRect()
      const scaleX = coordinateRoot.offsetWidth ? rootRect.width / coordinateRoot.offsetWidth : 1
      const scaleY = coordinateRoot.offsetHeight ? rootRect.height / coordinateRoot.offsetHeight : 1
      for (const { element, key } of items) {
        if (shouldSkip(element) || skipNextKeysRef?.current.has(key)) continue
        const previous = previousRects.get(key)
        const current = nextRects.get(key)
        if (!current) continue
        if (previous && skipPositionMotion) continue
        const computed = getComputedStyle(element)
        const baseTransform = computed.transform === 'none' ? '' : computed.transform
        const opacity = computed.opacity || '1'
        const baseFrame = baseTransform || 'translate(0px, 0px)'
        const keyframes: Keyframe[] = previous
          ? [{ transform: `translate(${(previous.left - current.left) / (scaleX || 1)}px, ${(previous.top - current.top) / (scaleY || 1)}px) ${baseFrame}` }, { transform: baseFrame }]
          : [{ opacity: 0, transform: `translate(0px, 4px) ${baseFrame}` }, { opacity, transform: baseFrame }]
        const animation = element.animate(keyframes, { duration: 140, easing: 'ease-out' })
        state.animations.set(key, animation)
        animation.onfinish = () => {
          if (state.animations.get(key) === animation) state.animations.delete(key)
        }
      }
    }

    skipNextKeysRef?.current.clear()
    state.signature = signature
    state.resetKey = resetKey
    state.rects = nextRects
  }, [enabled, resetKey, signature, skipNextKeysRef, skipPositionMotion])

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!enabled || !root || typeof ResizeObserver === 'undefined') return
    const coordinateRoot = getCoordinateRoot(root)
    const observedSizes = new WeakMap<Element, { width: number; height: number }>()
    let frame = 0
    const refreshRects = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        if (rootRef.current !== root) return
        const state = stateRef.current
        cancelAnimations(state)
        state.rects = readRects(getCoordinateRoot(root), getItems(root))
      })
    }
    const observer = new ResizeObserver((entries) => {
      let changed = false
      for (const entry of entries) {
        const size = { width: entry.contentRect.width, height: entry.contentRect.height }
        const previous = observedSizes.get(entry.target)
        if (previous && (Math.abs(previous.width - size.width) > 0.5 || Math.abs(previous.height - size.height) > 0.5)) changed = true
        observedSizes.set(entry.target, size)
      }
      if (changed) refreshRects()
    })
    observer.observe(coordinateRoot)
    for (const { element } of getItems(root)) observer.observe(element)
    window.addEventListener('resize', refreshRects)
    window.visualViewport?.addEventListener('resize', refreshRects)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', refreshRects)
      window.visualViewport?.removeEventListener('resize', refreshRects)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [enabled, resetKey, signature])

  useLayoutEffect(() => () => cancelAnimations(stateRef.current), [])

  return rootRef
}
