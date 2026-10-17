import { Languages } from 'lucide-react'
import { languageNames, t, useLanguagePreference, type LanguagePreference } from './locales/index'

export default function WorkspaceLanguageSelect({ className = '' }: { className?: string }) {
  const { preference, setPreference } = useLanguagePreference()
  return <label className={'workspace-language-select ' + className}>
    <Languages size={17} aria-hidden="true" />
    <select aria-label={t('앱 언어')} title={t('앱 언어')} value={preference} onChange={(event) => void setPreference(event.currentTarget.value as LanguagePreference)}>
      <option value="auto">{t('기기 언어 사용')}</option>
      {Object.entries(languageNames).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
    </select>
  </label>
}
