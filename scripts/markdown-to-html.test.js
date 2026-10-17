import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './markdown-to-html.mjs'

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

})
