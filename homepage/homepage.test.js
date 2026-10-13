import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'

const markup = readFileSync(new URL('./index.html', import.meta.url), 'utf8')
const behavior = readFileSync(new URL('./homepage.js', import.meta.url), 'utf8')

// Minimal DOM boundary: these tests verify behavior, not browser layout or rendering.
function loadHomepage({ language = 'ko-KR', saved = null, storageUnavailable = false, reduced = false } = {}) {
  const documentEvents = {}
  const mediaEvents = {}
  const storage = new Map(saved ? [['doanbogo.homepage.language.v1', saved]] : [])
  const document = { documentElement: {}, visibilityState: 'visible', activeElement: null }
  function element(dataset = {}, attributes = {}) {
    const classes = new Set()
    const listeners = {}
    return {
      dataset, attributes, hidden: false, inert: false,
      getAttribute: (name) => attributes[name] ?? null,
      setAttribute: (name, value) => { attributes[name] = value },
      toggleAttribute: (name, enabled) => { if (enabled) attributes[name] = ''; else delete attributes[name] },
      classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name) },
      addEventListener: (name, listener) => { listeners[name] = listener },
      fire: (name, event = {}) => listeners[name]?.(event),
      focus() { document.activeElement = this },
      contains: (target) => target === link,
      getBoundingClientRect: () => ({ width: 390 }),
    }
  }
  const link = element()
  link.closest = (selector) => selector === 'a' ? link : null
  const menu = element({}, { 'aria-hidden': 'true' })
  menu.hidden = menu.inert = true
  const button = element({}, { 'aria-expanded': 'false' })
  const brand = element()
  const selects = [element(), element()]
  const metas = new Map()
  const translated = [...markup.matchAll(/data-i18n="([^"]+)"/g)].map((match) => element({ i18n: match[1] }))
  const alternate = [...markup.matchAll(/data-i18n-alt="([^"]+)"/g)].map((match) => element({ i18nAlt: match[1] }))
  const aria = [...markup.matchAll(/data-i18n-aria-label="([^"]+)"/g)].map((match) => element({ i18nAriaLabel: match[1] }))
  document.querySelectorAll = (selector) => ({ '[data-i18n]': translated, '[data-i18n-alt]': alternate, '[data-i18n-aria-label]': aria, '.language-picker select': selects })[selector]
  document.querySelector = (selector) => {
    if (selector === '.menu-toggle') return button
    if (selector === '.brand') return brand
    if (!metas.has(selector)) metas.set(selector, element())
    return metas.get(selector)
  }
  document.getElementById = (id) => id === 'mobile-menu' ? menu : element()
  document.addEventListener = (name, listener) => { documentEvents[name] = listener }
  const mobile = { matches: true, addEventListener: (name, listener) => { mediaEvents[name] = listener } }
  const context = vm.createContext({
    document, navigator: { language, languages: [language] },
    window: { matchMedia: (query) => query.includes('reduced-motion') ? { matches: reduced } : mobile },
    localStorage: {
      getItem: (key) => { if (storageUnavailable) throw new Error('Unavailable'); return storage.get(key) ?? null },
      setItem: (key, value) => { if (storageUnavailable) throw new Error('Unavailable'); storage.set(key, value) },
    },
    setTimeout, clearTimeout,
  })
  vm.runInContext(behavior, context)
  return { document, button, menu, brand, link, selects, translated, alternate, metas, mobile, mediaEvents, documentEvents, storage }
}

afterEach(() => vi.useRealTimers())

describe('portable homepage behavior', () => {
  it.each(['ko', 'en', 'ja', 'de', 'da', 'nb', 'fi'])('translates every visible field and synchronizes both selectors: %s', (locale) => {
    const page = loadHomepage()
    page.selects[0].value = locale
    page.selects[0].fire('change')
    expect(page.document.documentElement.lang).toBe(locale)
    expect(page.selects.every((select) => select.value === locale)).toBe(true)
    expect(page.translated.every((field) => typeof field.textContent === 'string' && field.textContent.length > 0)).toBe(true)
    expect(page.translated.every((field) => !field.textContent.includes('\n'))).toBe(true)
    expect(page.alternate.every((field) => field.alt?.length > 0)).toBe(true)
    expect(page.document.title).toBe(page.metas.get('meta[property="og:title"]').content)
  })

  it('detects supported device languages and falls back to Korean', () => {
    expect(loadHomepage({ language: 'de-DE' }).document.documentElement.lang).toBe('de')
    expect(loadHomepage({ language: 'fr-FR' }).document.documentElement.lang).toBe('ko')
  })

  it('restores the saved preference after a simulated reload', () => {
    const page = loadHomepage()
    page.selects[1].value = 'fi'
    page.selects[1].fire('change')
    const saved = page.storage.get('doanbogo.homepage.language.v1')
    expect(loadHomepage({ language: 'en-US', saved }).document.documentElement.lang).toBe('fi')
    page.selects[0].value = 'auto'
    page.selects[0].fire('change')
    expect(page.selects[1].value).toBe('auto')
    expect(loadHomepage({ language: 'de-DE', saved: page.storage.get('doanbogo.homepage.language.v1') }).document.documentElement.lang).toBe('de')
  })

  it('keeps language selection usable when browser storage is unavailable', () => {
    const page = loadHomepage({ storageUnavailable: true })
    page.selects[0].value = 'ja'
    page.selects[0].fire('change')
    expect(page.document.documentElement.lang).toBe('ja')
  })

  it('blocks closed-menu access immediately and cancels an interrupted close', () => {
    vi.useFakeTimers()
    const page = loadHomepage()
    page.button.fire('click', { detail: 1 })
    expect(page.menu.hidden).toBe(false)
    expect(page.menu.inert).toBe(false)
    page.button.fire('click', { detail: 1 })
    expect(page.menu.inert).toBe(true)
    expect(page.menu.getAttribute('aria-hidden')).toBe('true')
    page.button.fire('click', { detail: 1 })
    vi.advanceTimersByTime(300)
    expect(page.menu.hidden).toBe(false)
    expect(page.button.getAttribute('aria-expanded')).toBe('true')
    page.button.fire('click', { detail: 1 })
    vi.advanceTimersByTime(180)
    expect(page.menu.hidden).toBe(true)
  })

  it('closes on Escape with focus return and keeps the close label translated', () => {
    const page = loadHomepage()
    page.button.fire('click', { detail: 0 })
    expect(page.menu.getAttribute('data-instant')).toBe('')
    page.selects[0].value = 'en'
    page.selects[0].fire('change')
    expect(page.button.getAttribute('aria-label')).toBe('Close menu')
    page.documentEvents.keydown({ key: 'Escape' })
    expect(page.menu.hidden).toBe(true)
    expect(page.document.activeElement).toBe(page.button)
    expect(page.button.getAttribute('aria-label')).toBe('Open menu')
  })

  it('skips motion when reduced motion is preferred and closes after desktop resize', () => {
    const page = loadHomepage({ reduced: true })
    page.button.fire('click', { detail: 1 })
    expect(page.menu.getAttribute('data-instant')).toBe('')
    page.button.fire('click', { detail: 1 })
    expect(page.menu.hidden).toBe(true)
    page.button.fire('click', { detail: 1 })
    page.mobile.matches = false
    page.mediaEvents.change()
    expect(page.menu.hidden).toBe(true)
    expect(page.document.activeElement).toBe(page.brand)
  })

  it('closes on a menu link without trapping keyboard focus in the hidden navigation', () => {
    const page = loadHomepage()
    page.button.fire('click', { detail: 0 })
    page.link.focus()
    page.menu.fire('click', { detail: 0, target: page.link })
    expect(page.menu.hidden).toBe(true)
    expect(page.menu.inert).toBe(true)
    expect(page.document.activeElement).toBe(page.button)
  })
})
