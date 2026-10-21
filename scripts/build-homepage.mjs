import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderMarkdown } from './markdown-to-html.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const templatePath = resolve(root, 'homepage/index.html')
const outputPath = resolve(root, 'portable/homepage.html')
const [template, stylesheet, pages, behavior, logo, viewer, favicon, generatedIcons, pretendard] = await Promise.all([
  readFile(templatePath, 'utf8'),
  readFile(resolve(root, 'homepage/homepage.css'), 'utf8'),
  readFile(resolve(root, 'homepage/pages.js'), 'utf8'),
  readFile(resolve(root, 'homepage/homepage.js'), 'utf8'),
  readFile(resolve(root, 'src/assets/yy-logo.png')),
  readFile(resolve(root, 'homepage/assets/viewer.png')),
  readFile(resolve(root, 'src/assets/yy-favicon.png')),
  readFile(resolve(root, 'homepage/assets/generated-icons.png')),
  readFile(resolve(root, 'src/assets/fonts/PretendardVariable.woff2')),
])
const legalLocales = ['ko', 'en', 'ja', 'de', 'da', 'nb', 'fi']
const legalTypes = ['terms', 'privacy']
const legalDocuments = await Promise.all(legalTypes.flatMap((type) => legalLocales.map(async (locale) => {
  const markdown = await readFile(resolve(root, '..', 'docs', `${type}-${locale}.md`), 'utf8')
  return `<template id="legal-${type}-${locale}">${renderMarkdown(markdown)}</template>`
})))
const embeddedStylesheet = stylesheet.replace(
  'url("./assets/generated-icons.png")',
  `url("data:image/png;base64,${generatedIcons.toString('base64')}")`,
).replace('url("@@PRETENDARD_FONT@@")', `url("data:font/woff2;base64,${pretendard.toString('base64')}")`)
if (embeddedStylesheet === stylesheet) throw new Error('The generated icon sprite reference was not found in the homepage stylesheet.')
if (embeddedStylesheet.includes('@@PRETENDARD_FONT@@')) throw new Error('The local Pretendard font reference was not embedded in the homepage stylesheet.')

const craftImages = await Promise.all([
  ['KNITTING_HANDS', 'knitting-hands.webp'],
  ['PATTERN_PHOTO', 'pattern-and-knitting.webp'],
  ['PAUSE_PHOTO', 'knitting-pause.webp'],
  ['FINISHED_PHOTO', 'finished-knit.webp'],
].map(async ([key, file]) => [`@@${key}@@`, `data:image/webp;base64,${(await readFile(resolve(root, 'homepage/assets', file))).toString('base64')}`]))

const replacements = [
  ...craftImages,
  ['@@LOGO@@', `data:image/png;base64,${logo.toString('base64')}`],
  ['@@VIEWER_IMAGE@@', `data:image/png;base64,${viewer.toString('base64')}`],
  ['@@FAVICON@@', `data:image/png;base64,${favicon.toString('base64')}`],
]

let html = template
  .replace('<link rel="stylesheet" href="./homepage.css">', `<style>\n${embeddedStylesheet}\n</style>`)
  .replace('<script src="./pages.js"></script>', `<script>\n${pages}\n</script>`)
  .replace('<script src="./homepage.js"></script>', `<script>\n${behavior}\n</script>`)
  .replace('@@LEGAL_DOCUMENTS@@', legalDocuments.join('\n'))
for (const [placeholder, value] of replacements) html = html.replaceAll(placeholder, value)

if (/@@[A-Z_]+@@|(?:src|href)="\.\/(?:homepage|pages)\.(?:css|js)"|generated-icons\.png/.test(html)) {
  throw new Error('The homepage still has an external asset reference or unresolved asset placeholder.')
}

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, html, 'utf8')
console.log(`Created portable/homepage.html (${(Buffer.byteLength(html) / 1024).toFixed(1)} KiB)`)
