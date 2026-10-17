import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'

const markup = readFileSync(new URL('./index.html', import.meta.url), 'utf8')
const pages = readFileSync(new URL('./pages.js', import.meta.url), 'utf8')
const behavior = readFileSync(new URL('./homepage.js', import.meta.url), 'utf8')

// Minimal DOM boundary: these tests verify behavior, not browser layout or rendering.
function loadHomepage({ language = 'ko-KR', saved = null, storageUnavailable = false, reduced = false, hash = '' } = {}) {
  const documentEvents = {}
  const mediaEvents = {}
  const windowEvents = {}
  const location = { hash, pathname: '/homepage.html', search: '' }
  const history = { replaceState: (_state, _title, url) => { if (url.startsWith('#')) location.hash = url } }
  const storage = new Map(saved ? [['doanbogo.homepage.language.v1', saved]] : [])
  const document = { documentElement: {}, visibilityState: 'visible', activeElement: null, createElement: () => element() }
  function element(dataset = {}, attributes = {}) {
    const classes = new Set()
    const listeners = {}
    return {
      dataset, attributes, children: [], className: '', hidden: false, inert: false,
      getAttribute: (name) => attributes[name] ?? null,
      setAttribute: (name, value) => { attributes[name] = value },
      toggleAttribute: (name, enabled) => { if (enabled) attributes[name] = ''; else delete attributes[name] },
      classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name) },
      replaceChildren(...children) { this.children = children; this.textContent = children.map((child) => child.textContent).join('') },
      addEventListener: (name, listener) => { listeners[name] = listener },
      fire: (name, event = {}) => listeners[name]?.(event),
      focus() { document.activeElement = this },
      scrollIntoView(options) { this.scrollIntoViewOptions = options },
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
  const infoPages = ['about', 'guide', 'features', 'faq', 'terms', 'privacy'].map((infoPage) => element({ infoPage }))
  const homeContent = element()
  const headings = new Map(['hero-title', 'feature-title', 'how-title', 'faq-title', 'about-title', 'guide-title', 'features-page-title', 'faq-page-title', 'terms-title', 'privacy-title'].map((id) => [id, element()]))
  const sectionTargets = new Map(['features', 'how', 'faq'].map((id) => [id, element()]))
  const legalTargets = new Map(['terms', 'privacy'].map((type) => [type, element()]))
  const legalSources = new Map(['ko', 'en', 'ja', 'de', 'da', 'nb', 'fi'].flatMap((locale) => ['terms', 'privacy'].map((type) => [`legal-${type}-${locale}`, Object.assign(element(), { innerHTML: `${type}-${locale}` })])))
  const translated = [...markup.matchAll(/data-i18n="([^"]+)"/g)].map((match) => element({ i18n: match[1] }))
  const alternate = [...markup.matchAll(/data-i18n-alt="([^"]+)"/g)].map((match) => element({ i18nAlt: match[1] }))
  const aria = [...markup.matchAll(/data-i18n-aria-label="([^"]+)"/g)].map((match) => element({ i18nAriaLabel: match[1] }))
  document.querySelectorAll = (selector) => ({ '[data-i18n]': translated, '[data-i18n-alt]': alternate, '[data-i18n-aria-label]': aria, '.language-picker select': selects, '[data-info-page]': infoPages })[selector]
  document.querySelector = (selector) => {
    if (selector === '.menu-toggle') return button
    if (selector === '.brand') return brand
    const legalMatch = /^\[data-legal-document="(terms|privacy)"\]$/.exec(selector)
    if (legalMatch) return legalTargets.get(legalMatch[1])
    if (!metas.has(selector)) metas.set(selector, element())
    return metas.get(selector)
  }
  document.getElementById = (id) => id === 'mobile-menu' ? menu : id === 'home-content' ? homeContent : headings.get(id) || sectionTargets.get(id) || legalSources.get(id) || element()
  document.addEventListener = (name, listener) => { documentEvents[name] = listener }
  const mobile = { matches: true, addEventListener: (name, listener) => { mediaEvents[name] = listener } }
  const context = vm.createContext({
    document, navigator: { language, languages: [language] },
    window: { location, history, scrollTo: vi.fn(), addEventListener: (name, listener) => { windowEvents[name] = listener }, matchMedia: (query) => query.includes('reduced-motion') ? { matches: reduced } : mobile },
    localStorage: {
      getItem: (key) => { if (storageUnavailable) throw new Error('Unavailable'); return storage.get(key) ?? null },
      setItem: (key, value) => { if (storageUnavailable) throw new Error('Unavailable'); storage.set(key, value) },
    },
    setTimeout, clearTimeout,
  })
  vm.runInContext(pages, context)
  vm.runInContext(behavior, context)
  return { document, button, menu, brand, link, selects, translated, alternate, aria, messages: vm.runInContext('messages', context), pageMessages: context.window.pageMessages, metas, mobile, mediaEvents, documentEvents, windowEvents, location, history, homeContent, infoPages, headings, sectionTargets, legalTargets, storage }
}

afterEach(() => vi.useRealTimers())

describe('portable homepage behavior', () => {
  it('provides complete translated copy for every informational route', () => {
    const page = loadHomepage()
    const keys = Object.keys(page.pageMessages.ko)
    for (const locale of ['ko', 'en', 'ja', 'de', 'da', 'nb', 'fi']) {
      expect(keys.every((key) => typeof page.pageMessages[locale][key] === 'string' && page.pageMessages[locale][key].trim().length > 0)).toBe(true)
    }
  })

  it.each(['ko', 'en', 'ja', 'de', 'da', 'nb', 'fi'])('translates every visible field and synchronizes both selectors: %s', (locale) => {
    const page = loadHomepage()
    page.selects[0].value = locale
    page.selects[0].fire('change')
    expect(page.document.documentElement.lang).toBe(locale)
    expect(page.selects.every((select) => select.value === locale)).toBe(true)
    expect(page.translated.every((field) => typeof field.textContent === 'string' && field.textContent.length > 0)).toBe(true)
    expect(page.translated.every((field) => !field.textContent.includes('\n'))).toBe(true)
    expect(page.alternate.every((field) => field.alt?.length > 0)).toBe(true)
    expect(page.aria.every((field) => field.getAttribute('aria-label')?.length > 0)).toBe(true)
    expect(page.translated.find((field) => field.dataset.i18n === 'faqTwoA').textContent).toBe(page.pageMessages[locale].faqTwoA)
    expect(page.translated.find((field) => field.dataset.i18n === 'faqFourA').textContent).toBe(page.pageMessages[locale].faqFourA)
    expect(page.document.title.startsWith(locale === 'ko' ? '니트피크' : 'KnitPeek')).toBe(true)
    expect(page.translated.find((field) => field.dataset.i18n === 'brandName').textContent).toBe(locale === 'ko' ? '니트피크' : 'KnitPeek')
    expect(page.document.title).toBe(page.metas.get('meta[property="og:title"]').content)
  })

  it.each([
    ['ko', ['도안은 편하게,', '뜨개는 더 즐겁게.']],
    ['en', ['Stay with your pattern.', 'Pick up your knitting.']],
    ['ja', ['編み図は見やすく、', '編み物はもっと楽しく。']],
    ['de', ['Das Muster im Blick.', 'Reihe für Reihe weiter.']],
    ['da', ['Hold styr på opskriften.', 'Strik videre i dit tempo.']],
    ['nb', ['Ha oppskriften nær.', 'Strikk videre i ditt tempo.']],
    ['fi', ['Pidä ohje käden ulottuvilla.', 'Jatka neulomista.']],
  ])('keeps the hero slogan on two fixed lines for %s', (locale, expectedLines) => {
    const page = loadHomepage({ language: locale })
    const titleLines = page.translated.filter((field) => /^heroTitleLine/.test(field.dataset.i18n))
    expect(titleLines.map((field) => field.textContent)).toEqual(expectedLines)
  })

  it.each(['ko', 'en', 'ja', 'de', 'da', 'nb', 'fi'])('keeps every composed homepage title on its authored lines for %s', (locale) => {
    const page = loadHomepage({ language: locale })
    const fixedTitleKeys = ['featureTitle', 'howTitle', 'recordTitle', 'closingTitle']
    expect(Object.entries(page.messages[locale]).filter(([, value]) => typeof value === 'string' && value.includes('\n')).map(([key]) => key)).toEqual(fixedTitleKeys)
    for (const key of fixedTitleKeys) {
      const title = page.translated.find((field) => field.dataset.i18n === key)
      const lines = String(page.messages[locale][key]).split('\n')
      expect(title.children.map((line) => line.textContent)).toEqual(lines)
      expect(title.children.every((line) => line.className === 'homepage-title-line')).toBe(true)
      expect(title.getAttribute('aria-label')).toBe(lines.join(' '))
    }
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

  it('opens guide routes directly, focuses the new heading, and restores the home on section hashes', () => {
    const page = loadHomepage()
    page.location.hash = '#page/guide'
    page.windowEvents.hashchange()
    expect(page.homeContent.hidden).toBe(true)
    expect(page.infoPages.find((item) => item.dataset.infoPage === 'guide').hidden).toBe(false)
    expect(page.document.activeElement).toBe(page.headings.get('guide-title'))
    page.location.hash = '#features'
    page.windowEvents.hashchange()
    expect(page.homeContent.hidden).toBe(false)
    expect(page.document.activeElement).toBe(page.headings.get('feature-title'))
    expect(page.sectionTargets.get('features').scrollIntoViewOptions).toEqual({ block: 'start' })
  })

  it('opens a legal route from a direct hash and focuses its title', () => {
    const page = loadHomepage({ hash: '#page/terms' })
    expect(page.homeContent.hidden).toBe(true)
    expect(page.infoPages.find((item) => item.dataset.infoPage === 'terms').hidden).toBe(false)
    expect(page.document.activeElement).toBe(page.headings.get('terms-title'))
    expect(page.document.title).toContain('이용약관')
  })

  it('loads the selected translated legal document and redirects unknown pages home', () => {
    const page = loadHomepage()
    page.selects[0].value = 'de'
    page.selects[0].fire('change')
    page.location.hash = '#page/privacy'
    page.windowEvents.hashchange()
    expect(page.legalTargets.get('privacy').innerHTML).toBe('privacy-de')
    page.location.hash = '#page/missing'
    page.windowEvents.hashchange()
    expect(page.location.hash).toBe('#top')
    expect(page.homeContent.hidden).toBe(false)
  })
})
