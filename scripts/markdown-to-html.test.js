import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './markdown-to-html.mjs'

const locales = ['ko', 'en', 'ja', 'de', 'da', 'nb', 'fi']
const legalRoot = new URL('../../docs/', import.meta.url)

describe('legal Markdown conversion', () => {
  it('keeps headings, lists, emphasis, links, and tables readable', () => {
    const html = renderMarkdown('# Terms\n\n**bold** and `code` with [policy](https://example.com).\n\n1. First\n2. Second\n\n| A | B |\n| --- | --- |\n| one | two |')
    expect(html).toContain('<h1>Terms</h1>')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<code>code</code>')
    expect(html).toContain('<a href="https://example.com">policy</a>')
    expect(html).toContain('<ol><li>First</li><li>Second</li></ol>')
    expect(html).toContain('<th scope="col">A</th>')
    expect(html).toContain('<td>two</td>')
  })

  it('escapes raw HTML and does not activate non-HTTPS links', () => {
    const html = renderMarkdown('<script>alert(1)</script> [unsafe](javascript:alert(1))')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('href="javascript:')
    expect(html).toContain('unsafe')
  })

  it.each(['terms', 'privacy'])('keeps all seven %s documents structurally aligned with the English source', (kind) => {
    const source = readFileSync(new URL(`${kind}-en.md`, legalRoot), 'utf8')
    const headings = source.match(/^#{1,3}\s/gm) || []
    const tables = source.match(/^\s*\|.*\|\s*$/gm) || []
    const links = [...source.matchAll(/\[[^\]]+\]\((https:\/\/[^)]+)\)/g)].map((match) => match[1]).sort()
    for (const locale of locales) {
      const markdown = readFileSync(new URL(`${kind}-${locale}.md`, legalRoot), 'utf8')
      expect(markdown.match(/^#{1,3}\s/gm) || []).toHaveLength(headings.length)
      expect(markdown.match(/^\s*\|.*\|\s*$/gm) || []).toHaveLength(tables.length)
      expect([...markdown.matchAll(/\[[^\]]+\]\((https:\/\/[^)]+)\)/g)].map((match) => match[1]).sort()).toEqual(links)
    }
  })
})
