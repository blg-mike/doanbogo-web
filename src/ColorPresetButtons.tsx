import { t, type LocaleKey } from './locales'
import { FUNCTIONAL_COLOR_PRESETS } from './designTokens'

export function ColorPresetButtons({ value, onChange, label, className, presets = FUNCTIONAL_COLOR_PRESETS }: {
  value: string
  onChange: (color: string) => void
  label: string
  className: string
  presets?: readonly { name: string; color: string }[]
}) {
  const isKnownColor = presets.some((preset) => preset.color.toLowerCase() === value.toLowerCase())
  const options = isKnownColor ? presets : [{ name: '현재 색상', color: value }, ...presets]
  return <div className={className} role="group" aria-label={label}>
    {options.map((preset) => <button
      key={preset.color}
      type="button"
      aria-label={t(preset.name as LocaleKey)}
      aria-pressed={preset.color.toLowerCase() === value.toLowerCase()}
      title={t(preset.name as LocaleKey)}
      style={{ backgroundColor: preset.color }}
      onClick={() => onChange(preset.color)}
    />)}
  </div>
}
