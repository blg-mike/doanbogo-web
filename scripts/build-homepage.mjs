import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const templatePath = resolve(root, 'homepage/index.html')
const outputPath = resolve(root, 'portable/homepage.html')
const [template, stylesheet, behavior, logo, viewer, favicon, generatedIcons] = await Promise.all([
  readFile(templatePath, 'utf8'),
  readFile(resolve(root, 'homepage/homepage.css'), 'utf8'),
  readFile(resolve(root, 'homepage/homepage.js'), 'utf8'),
  readFile(resolve(root, 'src/assets/yy-logo.png')),
  readFile(resolve(root, 'homepage/assets/viewer.png')),
  readFile(resolve(root, 'src/assets/yy-favicon.png')),
  readFile(resolve(root, 'homepage/assets/generated-icons.png')),
])
const embeddedStylesheet = stylesheet.replace(
  'url("./assets/generated-icons.png")',
  `url("data:image/png;base64,${generatedIcons.toString('base64')}")`,
)
if (embeddedStylesheet === stylesheet) throw new Error('The generated icon sprite reference was not found in the homepage stylesheet.')

const replacements = [
  ['@@LOGO@@', `data:image/png;base64,${logo.toString('base64')}`],
  ['@@VIEWER_IMAGE@@', `data:image/png;base64,${viewer.toString('base64')}`],
  ['@@FAVICON@@', `data:image/png;base64,${favicon.toString('base64')}`],
]

let html = template
  .replace('<link rel="stylesheet" href="./homepage.css">', `<style>\n${embeddedStylesheet}\n</style>`)
  .replace('<script src="./homepage.js"></script>', `<script>\n${behavior}\n</script>`)
for (const [placeholder, value] of replacements) html = html.replaceAll(placeholder, value)

if (/@@[A-Z_]+@@|(?:src|href)="\.\/homepage\.(?:css|js)"|generated-icons\.png/.test(html)) {
  throw new Error('The homepage still has an external asset reference or unresolved asset placeholder.')
}

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, html, 'utf8')
console.log(`Created portable/homepage.html (${(Buffer.byteLength(html) / 1024).toFixed(1)} KiB)`)
