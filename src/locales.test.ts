import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getLocale, hasCompleteLocale, hasMatchingLocalePlaceholders, interpolateMessage, isLanguagePreference, missingLocaleKeys, reloadLanguagePreference, resolveBrowserLocale, setLanguagePreference } from './locales'
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

  it('interpolates names and numbers without changing the source value', () => {
    expect(interpolateMessage('{project}: {count}', { project: 'Mio Cardigan', count: 12 })).toBe('Mio Cardigan: 12')
  })

  it('persists a manual choice and applies browser detection in auto mode', async () => {
    const documentStub = { documentElement: { lang: '' } } as Document
    vi.stubGlobal('document', documentStub)
    vi.stubGlobal('navigator', { language: 'en-GB', languages: ['en-GB'] })

    await setLanguagePreference('ja')
    expect(getLocale()).toBe('ja')
    expect(documentStub.documentElement.lang).toBe('ja')
    expect(await getPreference('language')).toBe('ja')

    await reloadLanguagePreference()
    expect(getLocale()).toBe('ja')

    await setLanguagePreference('auto')
    expect(getLocale()).toBe('en')
    expect(documentStub.documentElement.lang).toBe('en')
    expect(await getPreference('language')).toBe('auto')
  })
})
