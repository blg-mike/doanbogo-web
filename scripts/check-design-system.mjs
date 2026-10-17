import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const designPath = path.join(projectRoot, 'design_system.md')
const tokenPath = path.join(projectRoot, 'src', 'designTokens.ts')
const cssPath = path.join(projectRoot, 'src', 'index.css')
const homepageCssPath = path.join(projectRoot, 'homepage', 'homepage.css')
const designSystem = readFileSync(designPath, 'utf8')
const tokens = readFileSync(tokenPath, 'utf8')
const css = readFileSync(cssPath, 'utf8')
const homepageCss = readFileSync(homepageCssPath, 'utf8')
const expected = {
  primary: '#21A366',
  primaryText: '#111111',
  primaryHover: '#107C41',
  primaryPressed: '#0B5A30',
  primarySoft: '#E7F5EC',
  secondary: '#111111',
  secondaryHover: '#303030',
  secondarySoft: '#FFFFFF',
  tertiary: '#107C41',
  tertiarySoft: '#E7F5EC',
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceSubtle: '#FFFFFF',
  viewerBackground: '#E9E6DF',
  text: '#111111',
  textSecondary: '#525650',
  textMuted: '#777C76',
  border: '#CFCFC8',
  divider: '#E4E2DC',
  danger: '#B9473F',
  dangerSoft: '#F7E9E6',
  warning: '#B88732',
  warningSoft: '#F6EEDC',
  progress: '#21A366',
}

const errors = []
for (const [name, color] of Object.entries({ secondarySoft: '#FFFFFF', surface: '#FFFFFF', surfaceSubtle: '#FFFFFF' })) {
  const variable = `--color-${name.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase())}: ${color.toLowerCase()}`
  if (!new RegExp(`\\b${name}:\\s*['"]${color}['"]`, 'i').test(tokens)) errors.push(`src/designTokens.ts must keep ${name} white`)
  if (!css.toLowerCase().includes(variable.toLowerCase())) errors.push(`src/index.css must keep ${name} white`)
  if (!homepageCss.toLowerCase().includes(variable.toLowerCase())) errors.push(`homepage/homepage.css must keep ${name} white`)
}
for (const [name, color] of Object.entries(expected)) {
  if (!tokens.toLowerCase().includes(color.toLowerCase())) errors.push(`src/designTokens.ts is missing ${name} ${color}`)
  if (!css.toLowerCase().includes(`--color-${name.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase())}: ${color.toLowerCase()}`)) errors.push(`src/index.css is missing ${name} token ${color}`)
  if (!designSystem.toLowerCase().includes(color.toLowerCase())) errors.push(`design_system.md is missing ${name} ${color}`)
}
for (const name of ['primary', 'primaryText', 'primaryHover', 'primaryPressed', 'primarySoft', 'secondary', 'secondaryHover', 'secondarySoft', 'tertiary', 'tertiarySoft', 'background', 'surface', 'surfaceSubtle', 'text', 'textSecondary', 'textMuted', 'border', 'divider', 'progress']) {
  const color = expected[name]
  const variable = `--color-${name.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase())}: ${color.toLowerCase()}`
  if (!homepageCss.toLowerCase().includes(variable)) errors.push(`homepage/homepage.css is missing ${name} token ${color}`)
}

const legacyColors = /#(?:2673e8|815b52|8266c2|df8545|ed3f8a)\b/i
for (const sourceFile of ['src/index.css', 'src/App.css', 'src/Home.css', 'src/Chart.css', 'src/ChartEditor.tsx', 'src/Viewer.tsx', 'src/smartCounter.ts']) {
  const content = readFileSync(path.join(projectRoot, sourceFile), 'utf8')
  if (legacyColors.test(content)) errors.push(`${sourceFile} still contains a retired core UI color`)
}

const functionalColors = tokens.split('export const FUNCTIONAL_COLOR_PRESETS =')[1]?.split('export const ANNOTATION_COLOR_PRESETS =')[0] ?? ''
for (const color of ['#2C2B27', '#C85E4B', '#557A95', '#5C8167', '#7A6A94', '#7D7A76']) {
  if (!functionalColors.includes(color)) errors.push(`Functional color ${color} was changed`)
}
const counterColors = tokens.split('export const DEFAULT_COUNTER_COLORS =')[1] ?? ''
for (const color of ['#557A95', '#5C8167', '#D46A4C']) {
  if (!counterColors.includes(color)) errors.push(`Default counter color ${color} was changed`)
}
if (!tokens.includes("DEFAULT_VERTICAL_GUIDE_COLOR = '#4F6B7A'")) errors.push('The vertical guide default color was changed')
if (!existsSync(path.join(projectRoot, 'src', 'assets', 'fonts', 'PretendardVariable.woff2'))) errors.push('The local Pretendard font is missing')
if (!existsSync(path.join(projectRoot, 'src', 'assets', 'fonts', 'LICENSE.txt'))) errors.push('The Pretendard license is missing')

const rootDesignPath = path.resolve(projectRoot, '..', 'design_system.md')
if (existsSync(rootDesignPath) && readFileSync(rootDesignPath, 'utf8') !== designSystem) {
  errors.push('Repository design_system.md differs from the project root design_system.md')
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join('\n'))
  process.exitCode = 1
} else {
  console.log('Design system tokens and repository guidance are aligned.')
}
