function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Tiny markdown: **bold**, "- " bullets, ## headings, [citations] as chips, line breaks. */
export function toHtml(text: string) {
  const lines = esc(text).split('\n')
  const out: string[] = []
  let inList = false
  for (const raw of lines) {
    let line = raw
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]\n]{3,80})\]/g, '<span class="cite">$1</span>')
    if (line.startsWith('## ')) line = `<h4>${line.slice(3)}</h4>`
    else if (line.startsWith('# ')) line = `<h4>${line.slice(2)}</h4>`
    if (line.startsWith('- ')) {
      if (!inList) { out.push('<ul>'); inList = true }
      out.push(`<li>${line.slice(2)}</li>`)
    } else {
      if (inList) { out.push('</ul>'); inList = false }
      out.push(line === '' ? '<div class="gap"></div>' : line.startsWith('<h4>') ? line : `<p>${line}</p>`)
    }
  }
  if (inList) out.push('</ul>')
  return out.join('')
}

export default function Markdown({ text }: { text: string }) {
  return <div className="md" dangerouslySetInnerHTML={{ __html: toHtml(text) }} />
}
