// src/lib/documents/markdown-pdf.ts
//
// Server-side generation of a simple, signable PDF from a document's authored
// markdown body. Used when an in-app authored ("requires signature") document
// needs a real PDF artifact so a volunteer can actually sign it (the e-sign
// pipeline stamps onto a source PDF — see src/services/esign.ts).
//
// This is deliberately NOT a faithful markdown renderer (the rich inline view
// lives in @/lib/communications/markdown for the portal). It strips markdown to
// readable plain text, wraps it to the page width, paginates, and leaves room at
// the bottom of the LAST page for a signature — mirroring tests' makePdf().
//
// Lives in lib (not a route) so it can be imported by API handlers without
// turning a non-handler into a route export.

// pdf-lib is imported dynamically inside generateDocumentPdf (mirrors
// src/services/esign.ts) — keeps it off the hot path and sidesteps the
// cjs/esm dual-type resolution that trips a static import.
type PdfFontLike = { widthOfTextAtSize(text: string, size: number): number }

const PAGE_WIDTH = 595 // A4 @ 72dpi
const PAGE_HEIGHT = 842
const MARGIN = 60
const TITLE_SIZE = 18
const BODY_SIZE = 12
const LINE_GAP = 6
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2

/** Strip the small markdown subset to plain, printable text lines. */
function markdownToPlainLines(md: string): string[] {
  const out: string[] = []
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  for (const raw of lines) {
    let line = raw.trimEnd()
    // Headings: drop leading #'s.
    line = line.replace(/^#{1,6}\s+/, '')
    // List bullets: normalise to "•  ".
    line = line.replace(/^[-*]\s+/, '•  ')
    // Inline emphasis / code markers -> plain text.
    line = line.replace(/\*\*([^*]+)\*\*/g, '$1')
    line = line.replace(/_([^_]+)_/g, '$1')
    line = line.replace(/`([^`]+)`/g, '$1')
    // Links [text](url) -> "text (url)".
    line = line.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1 ($2)')
    out.push(line)
  }
  return out
}

/**
 * Word-wrap a single logical line to fit `maxWidth` at the given font/size.
 * WinAnsi-only: pdf-lib's StandardFonts cannot encode arbitrary unicode, so we
 * replace anything outside the printable Latin-1 range with '?'. An empty input
 * yields one empty line (preserves paragraph spacing).
 */
function wrapLine(text: string, font: PdfFontLike, size: number, maxWidth: number): string[] {
  const safe = text.replace(/[^\x20-\x7E•]/g, '?').replace(/•/g, '-')
  if (safe.trim() === '') return ['']
  const words = safe.split(/\s+/)
  const wrapped: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate
    } else {
      if (current) wrapped.push(current)
      // A single word longer than the line: hard-break it by characters.
      if (font.widthOfTextAtSize(word, size) > maxWidth) {
        let chunk = ''
        for (const ch of word) {
          if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth) {
            if (chunk) wrapped.push(chunk)
            chunk = ch
          } else {
            chunk += ch
          }
        }
        current = chunk
      } else {
        current = word
      }
    }
  }
  if (current) wrapped.push(current)
  return wrapped.length ? wrapped : ['']
}

/**
 * Render `title` + plain-text `bodyMarkdown` into a multi-page PDF and reserve a
 * signature line near the bottom of the final page. Returns the PDF bytes.
 */
export async function generateDocumentPdf(
  title: string,
  bodyMarkdown: string
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')

  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const lineHeight = BODY_SIZE + LINE_GAP
  // Keep clear of a reserved signature block at the bottom of every page.
  const bottomLimit = MARGIN + 60

  const pageSize: [number, number] = [PAGE_WIDTH, PAGE_HEIGHT]
  let page = pdf.addPage(pageSize)
  let cursorY = PAGE_HEIGHT - MARGIN

  const newPage = () => {
    page = pdf.addPage(pageSize)
    cursorY = PAGE_HEIGHT - MARGIN
  }

  // Title (wrapped, bold).
  const titleText = (title || 'Document').trim() || 'Document'
  for (const tl of wrapLine(titleText, bold, TITLE_SIZE, CONTENT_WIDTH)) {
    if (cursorY < bottomLimit) newPage()
    page.drawText(tl, { x: MARGIN, y: cursorY, size: TITLE_SIZE, font: bold, color: rgb(0, 0, 0) })
    cursorY -= TITLE_SIZE + LINE_GAP
  }
  cursorY -= LINE_GAP

  // Body.
  const plain = markdownToPlainLines(bodyMarkdown || '')
  for (const logical of plain) {
    for (const visual of wrapLine(logical, font, BODY_SIZE, CONTENT_WIDTH)) {
      if (cursorY < bottomLimit) newPage()
      if (visual) {
        page.drawText(visual, { x: MARGIN, y: cursorY, size: BODY_SIZE, font, color: rgb(0.1, 0.1, 0.1) })
      }
      cursorY -= lineHeight
    }
  }

  // Signature line near the bottom of the LAST page (room for the e-sign stamp).
  const sigY = MARGIN + 24
  page.drawText('Signature:', { x: MARGIN, y: sigY, size: BODY_SIZE, font, color: rgb(0, 0, 0) })
  page.drawLine({
    start: { x: MARGIN + 70, y: sigY },
    end: { x: MARGIN + 320, y: sigY },
    thickness: 0.75,
    color: rgb(0.4, 0.4, 0.4),
  })

  return pdf.save()
}
