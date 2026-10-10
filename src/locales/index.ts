import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { getPreference, savePreference } from '../storage'
import { da } from './da'
import { de } from './de'
import { en } from './en'
import { fi } from './fi'
import { ja } from './ja'
import { ko, type LocaleKey } from './ko'
import { nb } from './nb'
import { extendedTranslations } from './extended'
import { generatedTranslations } from './generated'
import { specializedTranslations } from './specialized'

export type { LocaleKey } from './ko'

export type LocaleId = 'ko' | 'en' | 'ja' | 'de' | 'da' | 'nb' | 'fi'
export type LanguagePreference = LocaleId | 'auto'
export const languageNames: Record<LocaleId, string> = {
  ko: '한국어', en: 'English', ja: '日本語', de: 'Deutsch', da: 'Dansk', nb: 'Norsk (bokmål)', fi: 'Suomi',
}

const dictionaries: Record<LocaleId, Partial<Record<LocaleKey, string>>> = {
  ko,
  en: { ...en, ...extendedTranslations.en, ...generatedTranslations.en, ...specializedTranslations.en },
  ja: { ...ja, ...extendedTranslations.ja, ...generatedTranslations.ja, ...specializedTranslations.ja },
  de: { ...de, ...extendedTranslations.de, ...generatedTranslations.de, ...specializedTranslations.de },
  da: { ...da, ...extendedTranslations.da, ...generatedTranslations.da, ...specializedTranslations.da },
  nb: { ...nb, ...extendedTranslations.nb, ...generatedTranslations.nb, ...specializedTranslations.nb },
  fi: { ...fi, ...extendedTranslations.fi, ...generatedTranslations.fi, ...specializedTranslations.fi },
}
const htmlLocales: Record<LocaleId, string> = { ko: 'ko', en: 'en', ja: 'ja', de: 'de', da: 'da', nb: 'nb', fi: 'fi' }
const listeners = new Set<() => void>()
let activeLocale: LocaleId = 'ko'
let languagePreference: LanguagePreference = 'auto'
let initialized = false
let initializePromise: Promise<void> | undefined

function publish(preference: LanguagePreference) {
  languagePreference = preference
  activeLocale = preference === 'auto' ? detectLocale() : preference
  if (typeof document !== 'undefined') document.documentElement.lang = htmlLocales[activeLocale]
  for (const listener of listeners) listener()
}

export function resolveBrowserLocale(candidates: readonly string[]): LocaleId {
  for (const candidate of candidates) {
    const language = candidate?.toLowerCase().split('-')[0]
    if (language === 'no') return 'nb'
    if (language === 'ko' || language === 'en' || language === 'ja' || language === 'de' || language === 'da' || language === 'nb' || language === 'fi') return language
  }
  return 'ko'
}

function detectLocale(): LocaleId {
  if (typeof navigator === 'undefined') return 'ko'
  return resolveBrowserLocale(navigator.languages?.length ? navigator.languages : [navigator.language])
}

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === 'auto' || typeof value === 'string' && Object.hasOwn(languageNames, value)
}

export function initializeLocale() {
  if (!initializePromise) {
    initializePromise = getPreference('language')
      .then((saved) => publish(isLanguagePreference(saved) ? saved : 'auto'))
      .catch(() => publish('auto'))
      .then(() => { initialized = true })
  }
  return initializePromise
}

export async function setLanguagePreference(preference: LanguagePreference) {
  if (!isLanguagePreference(preference)) return
  await savePreference('language', preference)
  publish(preference)
}

export async function reloadLanguagePreference() {
  const saved = await getPreference('language').catch(() => undefined)
  publish(isLanguagePreference(saved) ? saved : 'auto')
}

export function t(key: LocaleKey, values?: Record<string, string | number>): string {
  const message = dictionaries[activeLocale][key] ?? ko[key] ?? key
  return values ? interpolateMessage(message, values) : message
}

export function translateMessage(message: string) {
  return dictionaries[activeLocale][message as LocaleKey] ?? message
}

export function interpolateMessage(message: string, values: Record<string, string | number>) {
  return message.replace(/\{([\w]+)\}/g, (match, name: string) => String(values[name] ?? match))
}

export function hasCompleteLocale(locale: LocaleId) {
  return missingLocaleKeys(locale).length === 0
}

export function missingLocaleKeys(locale: LocaleId) {
  return Object.keys(ko).filter((key) => typeof dictionaries[locale][key as LocaleKey] !== 'string')
}

export function hasMatchingLocalePlaceholders(locale: LocaleId) {
  return Object.entries(ko).every(([key]) => {
    const expected = [...key.matchAll(/\{([\w]+)\}/g)].map((match) => match[1]).sort().join(',')
    const actual = [...(dictionaries[locale][key as LocaleKey] ?? '').matchAll(/\{([\w]+)\}/g)].map((match) => match[1]).sort().join(',')
    return expected === actual
  })
}

export function getLocale() { return activeLocale }
export function getLanguagePreference() { return languagePreference }
export function subscribeLocale(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener) }

export function useLocale() {
  return useSyncExternalStore(subscribeLocale, getLocale, () => 'ko')
}

export function useLanguagePreference() {
  const locale = useLocale()
  return { locale, preference: languagePreference, setPreference: setLanguagePreference }
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(initialized)
  useEffect(() => { void initializeLocale().then(() => setReady(true)) }, [])
  return ready ? children : null
}

export function formatDate(value: number | Date, options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }) {
  return new Intl.DateTimeFormat(htmlLocales[activeLocale], options).format(value)
}

export function formatDateTime(value: number | Date, options: Intl.DateTimeFormatOptions = { dateStyle: 'short', timeStyle: 'short' }) {
  return new Intl.DateTimeFormat(htmlLocales[activeLocale], options).format(value)
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(htmlLocales[activeLocale], options).format(value)
}

export function formatRelativeTime(amount: number, unit: Intl.RelativeTimeFormatUnit) {
  return new Intl.RelativeTimeFormat(htmlLocales[activeLocale], { numeric: 'auto' }).format(-amount, unit)
}

export function formatDayCount(value: number) {
  const units: Record<LocaleId, { one: string; other: string }> = {
    ko: { one: '일', other: '일' }, en: { one: 'day', other: 'days' }, ja: { one: '日', other: '日' },
    de: { one: 'Tag', other: 'Tage' }, da: { one: 'dag', other: 'dage' }, nb: { one: 'dag', other: 'dager' }, fi: { one: 'päivä', other: 'päivää' },
  }
  const unit = new Intl.PluralRules(htmlLocales[activeLocale]).select(value) === 'one' ? units[activeLocale].one : units[activeLocale].other
  return activeLocale === 'ko' || activeLocale === 'ja' ? `${formatNumber(value)}${unit}` : `${formatNumber(value)} ${unit}`
}
