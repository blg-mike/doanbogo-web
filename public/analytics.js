;(() => {
  const id = window.KNITPEEK_GA_MEASUREMENT_ID
  if (!/^G-[A-Z0-9]+$/.test(id || '') || location.hostname !== 'knitpeek.pages.dev') return

  const consentKey = 'knitpeek.analytics.consent.v1'
  const lifetime = 180 * 24 * 60 * 60 * 1000
  const events = new Set([
    'page_view', 'homepage_section_viewed', 'homepage_section_engaged', 'homepage_scroll_reached',
    'cta_clicked', 'language_changed', 'support_clicked', 'import_started', 'import_completed',
    'import_failed', 'viewer_opened', 'feature_used', 'report_created', 'gauge_calculation_applied',
    'report_export_completed', 'share',
  ])
  const strings = {
    ko: ['분석 도구 사용을 허용할까요?', '방문 경로와 기능 사용 통계를 개선 목적으로 수집합니다. 도안, 파일명, 프로젝트 내용은 수집하지 않습니다.', '허용', '거부', '분석 설정'],
    en: ['Allow analytics?', 'We collect visit sources and feature usage to improve KnitPeek. Patterns, file names, and project content are not collected.', 'Allow', 'Decline', 'Analytics settings'],
    ja: ['利用状況の分析を許可しますか？', 'KnitPeekの改善のため、訪問元と機能の利用状況を収集します。編み図、ファイル名、プロジェクト内容は収集しません。', '許可', '拒否', '分析設定'],
    de: ['Analyse erlauben?', 'Wir erfassen Besuchsquellen und Funktionsnutzung, um KnitPeek zu verbessern. Muster, Dateinamen und Projektinhalte werden nicht erfasst.', 'Erlauben', 'Ablehnen', 'Analyse-Einstellungen'],
    da: ['Tillad analyse?', 'Vi indsamler besøgskilder og brug af funktioner for at forbedre KnitPeek. Mønstre, filnavne og projektindhold indsamles ikke.', 'Tillad', 'Afvis', 'Analyseindstillinger'],
    nb: ['Tillat analyse?', 'Vi samler inn besøkskilder og funksjonsbruk for å forbedre KnitPeek. Mønstre, filnavn og prosjektinnhold samles ikke inn.', 'Tillat', 'Avslå', 'Analyseinnstillinger'],
    fi: ['Sallitaanko analytiikka?', 'Keräämme käyntilähteitä ja toimintojen käyttöä KnitPeekin parantamiseksi. Emme kerää malleja, tiedostonimiä tai projektien sisältöä.', 'Salli', 'Estä', 'Analytiikka-asetukset'],
  }
  const locale = () => strings[document.documentElement.lang] ? document.documentElement.lang : 'en'
  const text = (index) => strings[locale()][index]
  let consent = null
  let panelOpen = false
  let initialized = false
  let bound = false
  let lastPageSignature = ''
  let observedPageSignature = ''
  let lastLanguage = locale()
  let viewedSections = new Set()
  let engagedSections = new Set()
  let sectionIntervals = new Set()
  let scrollThresholds = new Set()

  try {
    const saved = JSON.parse(localStorage.getItem(consentKey) || 'null')
    if (saved && typeof saved.allow === 'boolean' && saved.expiresAt > Date.now()) consent = saved.allow
    else localStorage.removeItem(consentKey)
  } catch {}

  function analytics() {
    if (typeof window.gtag === 'function') return window.gtag
    window.dataLayer = window.dataLayer || []
    window.gtag = function () { window.dataLayer.push(arguments) }
    window.gtag('js', new Date())
    return window.gtag
  }

  function cleanPath() {
    const hash = location.hash.replace(/^#\/?/, '')
    if (location.pathname.startsWith('/app')) {
      const parts = hash.split(/[/?#]/).filter(Boolean)
      const route = parts[0] || 'projects'
      if (route === 'viewer') return { path: '/app/viewer', type: 'viewer', title: 'KnitPeek Viewer' }
      if (route === 'report') return { path: '/app/report', type: 'report', title: 'KnitPeek Report' }
      if (route === 'chart') return { path: '/app/chart', type: 'chart', title: 'KnitPeek Chart' }
      if (route === 'projects' && parts.length > 1) return { path: '/app/projects/detail', type: 'projects', title: 'KnitPeek Projects' }
      return { path: '/app/' + (['projects', 'reports'].includes(route) ? route : 'projects'), type: route === 'reports' ? 'report_list' : 'projects', title: route === 'reports' ? 'KnitPeek Reports' : 'KnitPeek Projects' }
    }
    const info = hash.match(/^page\/(about|guide|features|faq|terms|privacy)$/)?.[1]
    if (info) return { path: '/legal/' + info, type: info === 'terms' || info === 'privacy' ? 'legal' : 'homepage_info', title: 'KnitPeek ' + info }
    return { path: '/', type: 'homepage', title: 'KnitPeek' }
  }

  function campaign() {
    const result = {}
    const params = new URLSearchParams(location.search)
    for (const key of ['source', 'medium', 'campaign', 'content', 'term']) {
      const value = params.get('utm_' + key)
      const digitCount = (value?.match(/\d/g) || []).length
      if (value && value.length <= 100 && !/[@/\\?:]/.test(value) && !/\d{8,}/.test(value) && digitCount < 9 && /^[a-zA-Z0-9._ -]+$/.test(value)) result['utm_' + key] = value.trim().replace(/\s+/g, '_')
    }
    return result
  }

  function pageView() {
    if (consent !== true) return false
    const page = cleanPath()
    const signature = page.path + '|' + page.type
    if (signature === lastPageSignature) return false
    lastPageSignature = signature
    const params = new URLSearchParams(campaign())
    const referrer = document.referrer ? new URL(document.referrer).origin : ''
    const pageLocation = location.origin + page.path + (params.size ? '?' + params.toString() : '')
    window.gtag('config', id, {
      page_title: page.title,
      page_location: pageLocation,
      page_referrer: referrer,
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    })
    window.KnitPeekAnalytics.track('page_view', {
      page_title: page.title,
      page_location: pageLocation,
      page_referrer: referrer,
      page_type: page.type,
      ...campaign(),
    })
    return true
  }

  function loadTag() {
    if (initialized) {
      window.gtag('consent', 'update', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' })
      return
    }
    initialized = true
    const tag = analytics()
    tag('consent', 'update', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' })
    const script = document.createElement('script')
    script.async = true
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id)
    document.head.append(script)
    pageView()
  }

  function track(name, params = {}) {
    if (consent !== true || !events.has(name) || typeof window.gtag !== 'function') return
    const allowed = {
      page_view: ['page_title', 'page_location', 'page_referrer', 'page_type', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'],
      homepage_section_viewed: ['section_id'], homepage_section_engaged: ['section_id'], homepage_scroll_reached: ['percent_scrolled'],
      cta_clicked: ['cta_id', 'location'], language_changed: ['language', 'previous_language'], support_clicked: ['location'],
      import_started: ['file_type'], import_completed: ['file_type'], import_failed: ['file_type', 'error_code'], viewer_opened: ['document_type'],
      feature_used: ['feature_name', 'action'], report_created: [], gauge_calculation_applied: ['gauge_target', 'wash_stage'],
      report_export_completed: ['format'], share: ['method', 'content_type'],
    }[name]
    const values = {
      page_type: ['homepage', 'homepage_info', 'legal', 'projects', 'report', 'viewer', 'chart', 'report_list'],
      section_id: ['hero', 'features', 'record-band', 'faq', 'closing-cta'],
      percent_scrolled: [25, 50, 75, 90],
      cta_id: ['start_now', 'open_projects'],
      location: ['header', 'mobile_nav', 'hero', 'record_band', 'closing', 'info_page', 'footer', 'homepage', 'homepage_info', 'legal', 'projects', 'report', 'viewer', 'chart', 'report_list'],
      language: ['ko', 'en', 'ja', 'de', 'da', 'nb', 'fi', 'auto'],
      previous_language: ['ko', 'en', 'ja', 'de', 'da', 'nb', 'fi'],
      file_type: ['pdf', 'photos'],
      error_code: ['invalid_or_storage', 'storage_quota', 'import_failed', 'save_failed', 'image_decode', 'unsupported_image', 'file_read', 'image_convert', 'empty_input'],
      document_type: ['pdf', 'photos'],
      feature_name: ['progress_line', 'counter', 'timer', 'annotation', 'chart', 'report', 'gauge_calculator'],
      action: ['activate', 'start', 'pause', 'step', 'pen', 'highlight', 'erase', 'text', 'select_region', 'highlight_region', 'toggle', 'open', 'apply', 'export'],
      gauge_target: ['primary', 'additional'],
      wash_stage: ['before', 'after'],
      format: ['pdf'],
      method: ['native', 'clipboard'],
      content_type: ['pattern_file', 'report_caption'],
    }
    const safe = {}
    for (const [key, value] of Object.entries(params)) {
      if (!allowed.includes(key) || !(typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')) continue
      if (typeof value === 'string' && (value.length > 150 || value.includes('@'))) continue
      if (values[key] && !values[key].includes(value)) continue
      if (key === 'page_title' && !/^KnitPeek(?: (?:Viewer|Report|Chart|Projects|Reports|about|guide|features|faq|terms|privacy))?$/.test(value)) continue
      if (key === 'page_location' && !/^https:\/\/knitpeek\.pages\.dev\/(?:|app\/(?:projects(?:\/detail)?|reports|report|viewer|chart)|legal\/(?:about|guide|features|faq|terms|privacy))(?:\?utm_[a-z]+=[^&]{1,100}(?:&utm_[a-z]+=[^&]{1,100})*)?$/.test(value)) continue
      if (key === 'page_referrer' && value && (() => { try { const url = new URL(value); return url.origin !== value || !['http:', 'https:'].includes(url.protocol) } catch { return true } })()) continue
      if (key.startsWith('utm_') && !/^[a-zA-Z0-9._-]{1,100}$/.test(value)) continue
      safe[key] = value
    }
    window.gtag('event', name, safe)
  }

  function saveConsent(allow) {
    consent = allow
    try { localStorage.setItem(consentKey, JSON.stringify({ allow, expiresAt: Date.now() + lifetime })) } catch {}
    if (allow) {
      loadTag()
      pageView()
      observeHome()
    }
    else {
      if (typeof window.gtag === 'function') window.gtag('consent', 'update', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' })
      lastPageSignature = ''
      resetPageMetrics()
      for (const cookie of document.cookie.split(';')) {
        const name = cookie.split('=')[0].trim()
        if (name === '_ga' || name.startsWith('_ga_')) {
          document.cookie = name + '=; Max-Age=0; path=/; SameSite=Lax'
          document.cookie = name + '=; Max-Age=0; path=/; domain=' + location.hostname + '; SameSite=Lax'
        }
      }
    }
    panelOpen = false
    renderUi()
  }

  function renderUi() {
    let root = document.getElementById('knitpeek-analytics-consent')
    if (!root) {
      root = document.createElement('aside')
      root.id = 'knitpeek-analytics-consent'
      root.setAttribute('aria-live', 'polite')
      document.body.append(root)
    }
    const visible = consent === null || panelOpen
    root.hidden = !visible
    if (visible) {
      root.innerHTML = '<div class="kp-analytics-card" role="dialog" aria-label="' + text(4) + '"><div class="kp-analytics-copy"><strong>' + text(0) + '</strong><p>' + text(1) + '</p></div><div class="kp-analytics-actions"><button type="button" data-kp-consent="allow">' + text(2) + '</button><button type="button" data-kp-consent="deny">' + text(3) + '</button></div></div>'
    }
  }

  window.KnitPeekAnalytics = {
    track,
    settings: () => { panelOpen = true; renderUi(); document.querySelector('#knitpeek-analytics-consent button')?.focus() },
  }
  const style = document.createElement('style')
  style.textContent = '#knitpeek-analytics-consent{position:fixed;z-index:2000;inset:auto 16px 16px;display:flex;justify-content:center;font:14px/1.5 system-ui,sans-serif}#knitpeek-analytics-consent[hidden]{display:none}.kp-analytics-card{box-sizing:border-box;width:min(720px,100%);display:flex;align-items:center;gap:20px;padding:18px 20px;border:1px solid #dce5e1;border-radius:16px;background:#fff;color:#17221d;box-shadow:0 8px 32px #10231b2b}.kp-analytics-copy{flex:1}.kp-analytics-copy strong{font-size:15px}.kp-analytics-copy p{margin:4px 0 0;color:#52645c;font-size:13px}.kp-analytics-actions{display:flex;gap:8px}.kp-analytics-actions button{min-height:44px;padding:0 16px;border:1px solid #00865d;border-radius:8px;background:#fff;color:#006c4a;font:inherit;cursor:pointer}.kp-analytics-actions button[data-kp-consent=allow]{background:#00865d;color:#fff}@media(max-width:560px){#knitpeek-analytics-consent{inset:auto 10px 10px}.kp-analytics-card{align-items:stretch;flex-direction:column;gap:12px;padding:16px}.kp-analytics-actions button{flex:1}}'
  document.head.append(style)

  function exposeSettingsButtons(root = document) {
    if (root instanceof Element && root.matches('[data-analytics-settings]')) root.hidden = false
    root.querySelectorAll?.('[data-analytics-settings]').forEach((button) => { button.hidden = false })
  }

  function bindUi() {
    if (bound) return
    bound = true
    renderUi()
    exposeSettingsButtons()
    new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => {
      if (node instanceof Element) exposeSettingsButtons(node)
    }))).observe(document.body, { childList: true, subtree: true })
    document.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null
      const choice = target?.closest('[data-kp-consent]')?.getAttribute('data-kp-consent')
      if (choice) saveConsent(choice === 'allow')
      if (target?.closest('[data-analytics-settings]')) { event.preventDefault(); window.KnitPeekAnalytics.settings() }
      const cta = target?.closest('[data-analytics-cta], [data-app-route]')
      if (cta) {
        const location = cta.getAttribute('data-analytics-location') || (cta.closest('.header-actions') ? 'header' : cta.closest('.mobile-nav') ? 'mobile_nav' : cta.closest('.hero-actions') ? 'hero' : cta.closest('.closing-copy') ? 'closing' : cta.closest('.info-page-links') ? 'info_page' : 'footer')
        const route = cta.getAttribute('data-app-route')
        track('cta_clicked', { cta_id: cta.getAttribute('data-analytics-cta') || (route === '' ? 'start_now' : 'open_projects'), location })
      }
      if (target?.closest('[data-analytics-support], a[href*="buymeacoffee.com"]')) track('support_clicked', { location: cleanPath().type })
      const input = target?.closest('input[type="file"]')
      if (input) track('import_started', { file_type: input.accept.includes('pdf') ? 'pdf' : 'photos' })
    }, true)
    document.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null
      const feature = target?.closest('[data-analytics-feature]')
      if (feature) track('feature_used', { feature_name: feature.getAttribute('data-analytics-feature'), action: feature.getAttribute('data-analytics-action') || 'activate' })
    }, true)
    document.addEventListener('change', (event) => {
      const target = event.target
      if (target instanceof HTMLSelectElement && target.closest('.language-picker, .workspace-language-select')) {
        const previousLanguage = lastLanguage
        const selectedLanguage = target.value
        window.setTimeout(() => {
          const nextLanguage = selectedLanguage === 'auto' ? locale() : selectedLanguage
          track('language_changed', { language: nextLanguage, previous_language: previousLanguage })
          lastLanguage = nextLanguage
        }, 0)
      }
    }, true)
    observedPageSignature = cleanPath().path + '|' + cleanPath().type
    const routeChange = () => {
      const current = cleanPath()
      const signature = current.path + '|' + current.type
      if (signature !== observedPageSignature) {
        observedPageSignature = signature
        resetPageMetrics()
        pageView()
        observeHome()
      }
    }
    window.addEventListener('hashchange', routeChange)
    window.addEventListener('popstate', routeChange)
    observeHome()
  }

  let observer
  function resetPageMetrics() {
    observer?.disconnect()
    observer = undefined
    sectionIntervals.forEach((timer) => clearInterval(timer))
    sectionIntervals = new Set()
    viewedSections = new Set()
    engagedSections = new Set()
    scrollThresholds = new Set()
  }

  function observeHome() {
    observer?.disconnect()
    sectionIntervals.forEach((timer) => clearInterval(timer))
    sectionIntervals = new Set()
    if (consent !== true || cleanPath().type !== 'homepage') return
    const sections = [...document.querySelectorAll('.hero, #features, .record-band, #faq, .closing-cta')].filter((section) => !section.closest('[hidden]'))
    if (!sections.length || !('IntersectionObserver' in window)) return
    const states = new WeakMap()
    observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      const sectionId = entry.target.id || entry.target.classList[0]
      const state = states.get(entry.target) || { visible: false, activeMs: 0, timer: null }
      const visible = entry.isIntersecting && entry.intersectionRatio >= 0.5
      state.visible = visible
      if (visible && consent === true) {
        if (state.timer === null && (!viewedSections.has(sectionId) || !engagedSections.has(sectionId))) {
          state.timer = setInterval(() => {
            if (state.visible && document.visibilityState === 'visible' && consent === true) state.activeMs += 500
            if (state.activeMs >= 1000 && !viewedSections.has(sectionId)) {
              viewedSections.add(sectionId)
              track('homepage_section_viewed', { section_id: sectionId })
            }
            if (state.activeMs >= 10000) {
              engagedSections.add(sectionId)
              track('homepage_section_engaged', { section_id: sectionId })
              clearInterval(state.timer)
              sectionIntervals.delete(state.timer)
              state.timer = null
            }
          }, 500)
          sectionIntervals.add(state.timer)
        }
      }
      states.set(entry.target, state)
    }), { threshold: [0.5] })
    sections.forEach((section) => observer.observe(section))
  }

  window.addEventListener('scroll', () => {
    if (consent !== true || cleanPath().type !== 'homepage') return
    const available = document.documentElement.scrollHeight - window.innerHeight
    if (available <= 0) return
    const percent = Math.floor(window.scrollY / available * 100)
    for (const value of [25, 50, 75, 90]) {
      if (percent >= value && !scrollThresholds.has(value)) {
        scrollThresholds.add(value)
        track('homepage_scroll_reached', { percent_scrolled: value })
      }
    }
  }, { passive: true })
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', bindUi, { once: true })
  else bindUi()
  if (consent === true) { loadTag(); pageView() }
  new MutationObserver(() => { if (panelOpen || consent === null) renderUi() }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
})()
