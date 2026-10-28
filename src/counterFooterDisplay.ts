export function counterFooterName(name: string) {
  return name.replace(/[-\u00ad]?\s*(?:카운터|counter|カウンター|zähler|tæller|teller|laskuri)$/i, '').trim() || name
}
