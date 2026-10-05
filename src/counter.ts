export function clampCounterValue(value: number, min = 0, max = 99) {
  return Math.min(max, Math.max(min, value))
}

export function counterValueFromInput(rawValue: string, currentValue: number, min = 0, max = 99) {
  const trimmed = rawValue.trim()
  const parsed = Number(trimmed)
  return trimmed && Number.isInteger(parsed) ? clampCounterValue(parsed, min, max) : currentValue
}
