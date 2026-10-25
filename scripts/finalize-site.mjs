import { access, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const site = resolve(root, 'site')
const app = resolve(site, 'app')
const [homepage, appHtml, manifest] = await Promise.all([
  readFile(resolve(site, 'index.html'), 'utf8'),
  readFile(resolve(app, 'index.html'), 'utf8'),
  readFile(resolve(app, 'manifest.webmanifest'), 'utf8').then(JSON.parse),
])
if (!homepage.includes('name="knitpeek-app-url" content="/app/"') || !homepage.includes('location.replace(appUrl + window.location.hash)')) throw new Error('Homepage app route is not configured for /app/.')
if (manifest.start_url !== '/app/' || manifest.scope !== '/app/' || !appHtml.includes('/app/manifest.webmanifest')) throw new Error('The app PWA manifest is not scoped to /app/.')
for (const path of appHtml.matchAll(/(?:src|href)="(\/app\/[^"]+)"/g)) await access(resolve(site, path[1].slice('/'.length)))
for (const icon of manifest.icons) await access(resolve(app, icon.src))
await access(resolve(app, 'sw.js'))
await writeFile(resolve(root, 'site/_headers'), `/*
  Cache-Control: no-cache

/app/assets/*
  ! Cache-Control
  Cache-Control: public, max-age=31536000, immutable
`)
console.log('Created site/_headers')
