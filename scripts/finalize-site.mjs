import { access, copyFile, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const site = resolve(root, 'site')
const app = resolve(site, 'app')
for (const filename of ['google33404f39a80451a4.html', 'naver1f644b8cc6ed553b658077693132e8fb.html', 'robots.txt', 'sitemap.xml']) {
  await copyFile(resolve(root, 'public', filename), resolve(site, filename))
}
const [homepage, appHtml, manifest] = await Promise.all([
  readFile(resolve(site, 'index.html'), 'utf8'),
  readFile(resolve(app, 'index.html'), 'utf8'),
  readFile(resolve(app, 'manifest.webmanifest'), 'utf8').then(JSON.parse),
])
if (!homepage.includes('name="knitpeek-app-url" content="/app/"') || !homepage.includes('location.replace(appUrl + window.location.hash)')) throw new Error('Homepage app route is not configured for /app/.')
if (!homepage.includes('<link rel="canonical" href="https://knitpeek.pages.dev/">')) throw new Error('Cloudflare homepage canonical URL is missing.')
if (manifest.start_url !== '/app/' || manifest.scope !== '/app/' || !appHtml.includes('/app/manifest.webmanifest')) throw new Error('The app PWA manifest is not scoped to /app/.')
for (const path of appHtml.matchAll(/(?:src|href)="(\/app\/[^"]+)"/g)) await access(resolve(site, path[1].slice('/'.length)))
for (const icon of manifest.icons) await access(resolve(app, icon.src))
await access(resolve(app, 'sw.js'))
await access(resolve(site, 'naver1f644b8cc6ed553b658077693132e8fb.html'))
const analyticsSnippet = `<!-- Cloudflare Web Analytics --><script type='module' src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "d2e427151c4b4346877074b9e67d3c93"}'></script><!-- End Cloudflare Web Analytics -->`
const gaMeasurementId = process.env.VITE_GA_MEASUREMENT_ID ?? ''
if (gaMeasurementId && !/^G-[A-Z0-9]+$/.test(gaMeasurementId)) throw new Error('VITE_GA_MEASUREMENT_ID must be a GA4 measurement ID.')
if (gaMeasurementId) await access(resolve(app, 'analytics.js'))
const gaSnippet = gaMeasurementId
  ? `<script>window.KNITPEEK_GA_MEASUREMENT_ID=${JSON.stringify(gaMeasurementId)}</script><script defer src="/app/analytics.js"></script>`
  : ''
await Promise.all([
  writeFile(resolve(site, 'index.html'), homepage.replace('</head>', `  ${gaSnippet}\n</head>`).replace('</body>', `  ${analyticsSnippet}\n</body>`), 'utf8'),
  writeFile(resolve(app, 'index.html'), appHtml.replace('</head>', `  ${gaSnippet}\n</head>`).replace('</body>', `  ${analyticsSnippet}\n</body>`), 'utf8'),
])
await writeFile(resolve(root, 'site/_headers'), `/*
  Cache-Control: no-cache

/app/assets/*
  ! Cache-Control
  Cache-Control: public, max-age=31536000, immutable
`)
console.log('Created site/_headers')
