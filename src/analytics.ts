export type AnalyticsEvent =
  | 'import_completed'
  | 'import_failed'
  | 'viewer_opened'
  | 'feature_used'
  | 'report_created'
  | 'gauge_calculation_applied'
  | 'report_export_completed'
  | 'share'

declare global {
  interface Window {
    KnitPeekAnalytics?: {
      track: (name: string, parameters?: Record<string, string | number | boolean>) => void
      settings: () => void
    }
  }
}

export function trackAnalytics(name: AnalyticsEvent, parameters: Record<string, string | number | boolean> = {}) {
  if (import.meta.env.VITE_PORTABLE) return
  window.KnitPeekAnalytics?.track(name, parameters)
}

export function openAnalyticsSettings() {
  if (import.meta.env.VITE_PORTABLE) return
  window.KnitPeekAnalytics?.settings()
}
