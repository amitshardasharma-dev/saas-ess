// MOS-748 — flexible certificate layout.
//
// Pure planning step (no pdf-lib) so it can be unit-tested: given the page, the
// text, the image sizes and the admin's size settings, return where every line
// and image goes. Blocks are stacked top to bottom with the original layout's
// spacing. If the admin makes things too big for the page, the spacing tightens
// first and then everything scales down together, so nothing ever overflows.
import type { ResolvedLayout } from './template-schema'

export type FontKey = 'regular' | 'bold' | 'italic'
export type ColorKey = 'accent' | 'dark' | 'grey'

export interface Metrics {
  width(text: string, font: FontKey, size: number): number
}

export interface PlanInput {
  page: { width: number; height: number }
  metrics: Metrics
  layout: ResolvedLayout
  text: {
    org: string | null
    title: string
    intro: string | null
    name: string
    body: string | null
    module: string
    date: string
    signatoryName: string | null
    signatoryTitle: string | null
    footer: string | null
  }
  /** Natural pixel size of the embedded images (for aspect ratio), if any. */
  logo: { width: number; height: number } | null
  signature: { width: number; height: number } | null
}

export interface PlannedText {
  kind: 'text'
  key: string
  lines: Array<{ text: string; x: number; y: number }>
  font: FontKey
  size: number
  color: ColorKey
}
export interface PlannedImage { kind: 'image'; key: 'logo' | 'signature'; x: number; y: number; width: number; height: number }
export interface PlannedRule { kind: 'rule'; x1: number; x2: number; y: number }
export type PlannedItem = PlannedText | PlannedImage | PlannedRule

const ASCENT = 0.78
const DESCENT = 0.22
const LINE_HEIGHT = 1.18

/** Room kept clear inside the decorative frame (the inner frame sits at 32pt). */
const TOP_MARGIN = 48
const BOTTOM_MARGIN = 46
const SIDE_MARGIN = 70

/**
 * Greedy word-wrap into at most `maxLines`, shrinking the size until every line
 * fits the width. Single-line text (names, dates) only ever shrinks.
 */
export function wrapText(
  text: string,
  font: FontKey,
  size: number,
  maxWidth: number,
  maxLines: number,
  m: Metrics
): { lines: string[]; size: number } {
  const clean = text.trim().replace(/\s+/g, ' ')
  if (!clean) return { lines: [], size }
  const fitOneLine = (t: string, s: number) => {
    const w = m.width(t, font, s)
    return w > maxWidth ? Math.max(1, (s * maxWidth) / w) : s
  }
  if (maxLines <= 1) return { lines: [clean], size: fitOneLine(clean, size) }

  const words = clean.split(' ')
  const MIN = Math.min(size, 6)
  for (let s = size; s >= MIN; s -= 0.5) {
    const lines: string[] = []
    let current = ''
    for (const w of words) {
      const next = current ? `${current} ${w}` : w
      if (!current || m.width(next, font, s) <= maxWidth) current = next
      else { lines.push(current); current = w }
    }
    if (current) lines.push(current)
    if (lines.length <= maxLines && lines.every((l) => m.width(l, font, s) <= maxWidth)) return { lines, size: s }
  }
  // Still too long at the smallest size: one line, shrunk to fit.
  return { lines: [clean], size: fitOneLine(clean, MIN) }
}

interface Block {
  key: string
  height: number
  /** Space above this block at scale 1 (ignored for the first block). */
  gap: number
  text?: { lines: string[]; font: FontKey; size: number; color: ColorKey }
  image?: { width: number; height: number }
}

export function planFlexibleLayout(input: PlanInput): PlannedItem[] {
  const { page, metrics: m, layout: L, text: t } = input
  const W = page.width
  const contentWidth = W - SIDE_MARGIN * 2
  const items: PlannedItem[] = []
  const centerX = (line: string, font: FontKey, size: number) => (W - m.width(line, font, size)) / 2

  // ---- Signature area, anchored to the bottom -----------------------------
  const S = L.signatureTextSize
  const below: Array<{ key: string; text: string; font: FontKey; size: number; color: ColorKey; gap: number }> = []
  if (t.signatoryName) below.push({ key: 'signatoryName', text: t.signatoryName, font: 'bold', size: S, color: 'dark', gap: 6 })
  if (t.signatoryTitle) below.push({ key: 'signatoryTitle', text: t.signatoryTitle, font: 'regular', size: Math.max(7, S - 1), color: 'grey', gap: below.length ? 4 : 6 })
  if (t.footer) below.push({ key: 'footer', text: t.footer, font: 'regular', size: Math.max(7, t.signatoryName ? S - 2 : S - 1), color: 'grey', gap: below.length ? 10 : 6 })

  // Fit each line to the page width (single line, shrink if needed).
  const belowFitted = below.map((b) => {
    const w = wrapText(b.text, b.font, b.size, contentWidth, 1, m)
    return { ...b, lines: w.lines, size: w.size }
  })
  const stackBelow = belowFitted.reduce((acc, b) => acc + b.gap + b.size * (ASCENT + DESCENT), 0)
  const lineY = Math.max(120, BOTTOM_MARGIN + stackBelow)

  let sigW = 0
  let sigH = 0
  if (input.signature && input.signature.width > 0 && input.signature.height > 0) {
    const aspect = input.signature.width / input.signature.height
    sigH = L.signatureHeight
    sigW = sigH * aspect
    if (sigW > 360) { sigW = 360; sigH = sigW / aspect }
    // Never let the signature take more than ~40% of the page height.
    const maxTop = page.height * 0.42
    if (lineY + 3 + sigH > maxTop) { sigH = Math.max(12, maxTop - lineY - 3); sigW = sigH * aspect }
  }

  const ruleHalf = Math.max(130, Math.min(210, sigW / 2 + 20))
  items.push({ kind: 'rule', x1: W / 2 - ruleHalf, x2: W / 2 + ruleHalf, y: lineY })
  if (sigH > 0) items.push({ kind: 'image', key: 'signature', x: (W - sigW) / 2, y: lineY + 3, width: sigW, height: sigH })

  let cursor = lineY
  for (const b of belowFitted) {
    const baseline = cursor - b.gap - b.size * ASCENT
    items.push({ kind: 'text', key: b.key, font: b.font, size: b.size, color: b.color, lines: b.lines.map((l) => ({ text: l, x: centerX(l, b.font, b.size), y: baseline })) })
    cursor = baseline - b.size * DESCENT
  }

  // ---- Main content, stacked between the top margin and the signature area ----
  const topY = page.height - TOP_MARGIN
  const bottomY = lineY + (sigH > 0 ? 3 + sigH : 0) + 22
  const available = topY - bottomY

  const build = (scale: number): Block[] => {
    const blocks: Block[] = []
    if (input.logo && input.logo.width > 0 && input.logo.height > 0) {
      const aspect = input.logo.width / input.logo.height
      let h = L.logoHeight * scale
      let w = h * aspect
      if (w > contentWidth) { w = contentWidth; h = w / aspect }
      blocks.push({ key: 'logo', height: h, gap: 0, image: { width: w, height: h } })
    }
    const addText = (key: string, raw: string | null, font: FontKey, size: number, color: ColorKey, maxLines: number, gap: number) => {
      if (!raw || !raw.trim()) return
      const w = wrapText(raw, font, size * scale, contentWidth, maxLines, m)
      if (!w.lines.length) return
      const height = w.size * (ASCENT + DESCENT) + (w.lines.length - 1) * w.size * LINE_HEIGHT
      blocks.push({ key, height, gap, text: { lines: w.lines, font, size: w.size, color } })
    }
    addText('org', t.org, 'bold', L.orgNameSize, 'accent', 2, 19)
    addText('title', t.title, 'bold', L.titleSize, 'dark', 2, 29)
    addText('intro', t.intro, 'italic', L.textSize, 'grey', 2, 36)
    addText('name', t.name, 'bold', L.nameSize, 'dark', 1, 18)
    addText('body', t.body, 'italic', L.textSize, 'grey', 2, 27)
    addText('module', t.module, 'bold', L.moduleSize, 'accent', 2, 20)
    addText('date', t.date, 'regular', Math.max(7, L.textSize - 1), 'grey', 1, 35)
    return blocks
  }

  // Fit: tighten spacing first (down to 55%), then scale everything down
  // together. Past 40% scale, spacing may squeeze further so the content can
  // never run into the signature area, however big the settings.
  const MIN_GAP = 0.55
  const MAX_GAP = 1.25
  let blocks = build(1)
  let gapScale = 1
  for (let scale = 1; ; scale -= 0.04) {
    blocks = build(scale)
    const sumH = blocks.reduce((a, b) => a + b.height, 0)
    const sumG = blocks.slice(1).reduce((a, b) => a + b.gap, 0)
    const floor = scale > 0.4 ? MIN_GAP : 0.1
    if (sumH + sumG * floor <= available || scale <= 0.12) {
      gapScale = sumG > 0 ? Math.min(MAX_GAP, Math.max(0, (available - sumH) / sumG)) : 1
      break
    }
  }
  const sumH = blocks.reduce((a, b) => a + b.height, 0)
  const sumG = blocks.slice(1).reduce((a, b) => a + b.gap, 0)
  const spare = Math.max(0, available - sumH - sumG * gapScale)

  let top = topY - spare / 2
  blocks.forEach((b, i) => {
    if (i > 0) top -= b.gap * gapScale
    if (b.image) {
      items.push({ kind: 'image', key: 'logo', x: (W - b.image.width) / 2, y: top - b.image.height, width: b.image.width, height: b.image.height })
    } else if (b.text) {
      const { font, size, color } = b.text
      const lines = b.text.lines.map((l, j) => ({ text: l, x: centerX(l, font, size), y: top - size * ASCENT - j * size * LINE_HEIGHT }))
      items.push({ kind: 'text', key: b.key, font, size, color, lines })
    }
    top -= b.height
  })

  return items
}
