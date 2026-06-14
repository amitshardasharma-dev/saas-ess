// src/lib/communications/markdown.ts
//
// Phase 7 rich-text choice: a tiny, dependency-free Markdown -> HTML converter.
// Rationale (MERGE_NOTES): the brief allows "a lightweight markdown editor"; adding a
// full editor dependency (e.g. @tiptap/react) is avoidable for memo composition and
// keeps the merge surface clean (no new package.json deps). The compose page uses a
// markdown textarea + live preview rendered through this function.
//
// Supports: headings (#..######), bold (**x**), italic (_x_), inline code (`x`),
// links [text](url), unordered lists (- / *), and paragraphs. Input is escaped first
// so user content cannot inject markup; only the whitelisted transforms emit tags.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function inline(text: string): string {
  let t = escapeHtml(text)
  // Links: [text](http/https url) — only allow safe schemes.
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, label: string, url: string) => {
    return `<a href="${url}" rel="noopener noreferrer" target="_blank">${label}</a>`
  })
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  t = t.replace(/_([^_]+)_/g, '<em>$1</em>')
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>')
  return t
}

/** Convert a small subset of Markdown to safe HTML. */
export function mdToHtml(md: string): string {
  if (!md) return ''
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let inList = false
  let paragraph: string[] = []

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      out.push(`<p>${inline(paragraph.join(' '))}</p>`)
      paragraph = []
    }
  }
  const closeList = () => {
    if (inList) {
      out.push('</ul>')
      inList = false
    }
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    const listItem = /^[-*]\s+(.*)$/.exec(line)

    if (line.trim() === '') {
      flushParagraph()
      closeList()
      continue
    }
    if (heading) {
      flushParagraph()
      closeList()
      const level = heading[1].length
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`)
      continue
    }
    if (listItem) {
      flushParagraph()
      if (!inList) {
        out.push('<ul>')
        inList = true
      }
      out.push(`<li>${inline(listItem[1])}</li>`)
      continue
    }
    paragraph.push(line.trim())
  }
  flushParagraph()
  closeList()
  return out.join('')
}
