function escapeHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

function inlineMarkdown(value) {
  const token = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g
  let result = ''
  let cursor = 0
  for (const match of value.matchAll(token)) {
    result += escapeHtml(value.slice(cursor, match.index))
    if (match[1] !== undefined) result += `<strong>${escapeHtml(match[1])}</strong>`
    else if (match[2] !== undefined) result += `<code>${escapeHtml(match[2])}</code>`
    else if (/^https:\/\//i.test(match[4])) result += `<a href="${escapeHtml(match[4])}">${escapeHtml(match[3])}</a>`
    else result += escapeHtml(match[3])
    cursor = match.index + match[0].length
  }
  return result + escapeHtml(value.slice(cursor))
}

function tableCells(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((cell) => cell.trim().replaceAll('\\|', '|'))
}

export function renderMarkdown(markdown) {
  const lines = markdown.replaceAll('\r\n', '\n').split('\n')
  const html = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index].trim()
    if (!line) { index += 1; continue }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line)
    if (heading) {
      const level = heading[1].length
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`)
      index += 1
      continue
    }
    if (/^---+$/.test(line)) { html.push('<hr>'); index += 1; continue }
    if (/^\|.*\|$/.test(line)) {
      const rows = []
      while (index < lines.length && /^\s*\|.*\|\s*$/.test(lines[index])) rows.push(tableCells(lines[index++]))
      const header = rows.shift() || []
      const body = rows.filter((row) => !row.every((cell) => /^:?-{3,}:?$/.test(cell)))
      html.push(`<table><thead><tr>${header.map((cell) => `<th scope="col">${inlineMarkdown(cell)}</th>`).join('')}</tr></thead><tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`)
      continue
    }
    if (/^>\s?/.test(line)) {
      const quote = []
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^\s*>\s?/, '').trim())
      html.push(`<blockquote><p>${inlineMarkdown(quote.join(' '))}</p></blockquote>`)
      continue
    }
    const listItem = /^\s*(?:[-*+]\s+|\d+\.\s+)(.+)$/.exec(lines[index])
    if (listItem) {
      const ordered = /^\s*\d+\./.test(lines[index])
      const tag = ordered ? 'ol' : 'ul'
      const items = []
      while (index < lines.length) {
        const current = /^\s*(?:[-*+]\s+|\d+\.\s+)(.+)$/.exec(lines[index])
        if (!current || /^\s*\d+\./.test(lines[index]) !== ordered) break
        items.push(`<li>${inlineMarkdown(current[1])}</li>`)
        index += 1
      }
      html.push(`<${tag}>${items.join('')}</${tag}>`)
      continue
    }
    const paragraph = [line]
    index += 1
    while (index < lines.length && lines[index].trim() && !/^(?:#{1,3}\s|---+$|\s*>\s?|\s*\||\s*(?:[-*+]\s+|\d+\.\s+))/.test(lines[index])) paragraph.push(lines[index++].trim())
    html.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`)
  }
  return html.join('\n')
}
