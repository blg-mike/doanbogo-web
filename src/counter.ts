export function clampCounterValue(value: number) {
  return Math.min(99, Math.max(0, value))
}

export function counterValueFromInput(rawValue: string, currentValue: number) {
  const trimmed = rawValue.trim()
  const parsed = Number(trimmed)
  return trimmed && Number.isInteger(parsed) ? clampCounterValue(parsed) : currentValue
}
