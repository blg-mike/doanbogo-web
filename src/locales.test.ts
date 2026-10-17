import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getLocale, getLocaleMessageVariants, hasCompleteLocale, hasMatchingLocalePlaceholders, interpolateMessage, isDefaultMeasurementLabel, isLanguagePreference, missingLocaleKeys, reloadLanguagePreference, resolveBrowserLocale, setLanguagePreference } from './locales'
import { getPreference } from './storage'

afterEach(() => vi.unstubAllGlobals())

describe('locale selection', () => {
  it('chooses the first supported browser language and falls back to Korean', () => {
    expect(resolveBrowserLocale(['fr-FR', 'ja-JP', 'en-US'])).toBe('ja')
    expect(resolveBrowserLocale(['no-NO'])).toBe('nb')
    expect(resolveBrowserLocale(['sv-SE', 'zh-CN'])).toBe('ko')
  })

  it('accepts only the supported locale codes and auto mode', () => {
    expect(isLanguagePreference('auto')).toBe(true)
    expect(isLanguagePreference('fi')).toBe(true)
    expect(isLanguagePreference('fr')).toBe(false)
    expect(isLanguagePreference(undefined)).toBe(false)
  })

  it('provides a complete dictionary for every supported language', () => {
    for (const locale of ['ko', 'en', 'ja', 'de', 'da', 'nb', 'fi'] as const) {
      const missing = missingLocaleKeys(locale)
      expect(hasCompleteLocale(locale), `${locale}: ${missing.join(', ')}`).toBe(true)
      expect(hasMatchingLocalePlaceholders(locale), locale).toBe(true)
    }
  })

  it('recognizes the translated default measurement names without matching custom names', () => {
    for (const label of ['기장', 'Bust circumference', '着丈', 'Ärmellänge', 'Ærmelængde', 'Ermelengde', 'Hihan pituus']) {
      expect(isDefaultMeasurementLabel(label), label).toBe(true)
    }
    expect(isDefaultMeasurementLabel('사용자 지정 총장')).toBe(false)
  })

  it('provides every localized label variant for finished-measurement presets', () => {
    for (const key of ['가슴둘레', '총장', '어깨너비', '암홀', '목깊이'] as const) {
      expect(getLocaleMessageVariants(key)).toHaveLength(7)
      expect(getLocaleMessageVariants(key).every(Boolean)).toBe(true)
    }
  })

  it('uses the Korean and international product names in the Viewer brand line', () => {
    expect(getLocaleMessageVariants('YY공동제작')).toEqual(['니트피크', 'KnitPeek', 'KnitPeek', 'KnitPeek', 'KnitPeek', 'KnitPeek', 'KnitPeek'])
  })

  it('interpolates names and numbers without changing the source value', () => {
    expect(interpolateMessage('{project}: {count}', { project: 'Mio Cardigan', count: 12 })).toBe('Mio Cardigan: 12')
  })

  it('persists a manual choice and applies browser detection in auto mode', async () => {
    const documentStub = { documentElement: { lang: '' }, title: '' } as Document
    vi.stubGlobal('document', documentStub)
    vi.stubGlobal('navigator', { language: 'en-GB', languages: ['en-GB'] })

    await setLanguagePreference('ko')
    expect(documentStub.title).toBe('니트피크')

    await setLanguagePreference('ja')
    expect(getLocale()).toBe('ja')
    expect(documentStub.documentElement.lang).toBe('ja')
    expect(documentStub.title).toBe('KnitPeek')
    expect(await getPreference('language')).toBe('ja')

    await reloadLanguagePreference()
    expect(getLocale()).toBe('ja')

    await setLanguagePreference('auto')
    expect(getLocale()).toBe('en')
    expect(documentStub.documentElement.lang).toBe('en')
    expect(documentStub.title).toBe('KnitPeek')
    expect(await getPreference('language')).toBe('auto')
  })
})
