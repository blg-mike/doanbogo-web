import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const designPath = path.join(projectRoot, 'design_system.md')
const tokenPath = path.join(projectRoot, 'src', 'designTokens.ts')
const cssPath = path.join(projectRoot, 'src', 'index.css')
const designSystem = readFileSync(designPath, 'utf8')
const tokens = readFileSync(tokenPath, 'utf8')
const css = readFileSync(cssPath, 'utf8')
const expected = {
  primary: '#4B6334',
  secondary: '#4F6B7A',
  tertiary: '#3D705C',
  background: '#FBF9F5',
  surface: '#FFFFFF',
  surfaceSubtle: '#F4F1EC',
  text: '#2C2B27',
  textSecondary: '#6E6A64',
  textMuted: '#918B84',
  border: '#E4DED6',
  divider: '#ECE6DF',
  danger: '#B9473F',
  warning: '#B88732',
  progress: '#D46A4C',
}

const errors = []
for (const [name, color] of Object.entries(expected)) {
  if (!tokens.toLowerCase().includes(color.toLowerCase())) errors.push(`src/designTokens.ts is missing ${name} ${color}`)
  if (!css.toLowerCase().includes(`--color-${name.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase())}: ${color.toLowerCase()}`)) errors.push(`src/index.css is missing ${name} token ${color}`)
  if (!designSystem.toLowerCase().includes(color.toLowerCase())) errors.push(`design_system.md is missing ${name} ${color}`)
}

const legacyColors = /#(?:2673e8|815b52|8266c2|df8545|ed3f8a)\b/i
for (const sourceFile of ['src/index.css', 'src/App.css', 'src/Home.css', 'src/Chart.css', 'src/ChartEditor.tsx', 'src/Viewer.tsx', 'src/smartCounter.ts']) {
  const content = readFileSync(path.join(projectRoot, sourceFile), 'utf8')
  if (legacyColors.test(content)) errors.push(`${sourceFile} still contains a retired core UI color`)
}

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
