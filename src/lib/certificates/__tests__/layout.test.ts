import { planFlexibleLayout, wrapText, type Metrics, type PlannedItem, type PlannedText } from '@/lib/certificates/layout'
import { LAYOUT_DEFAULTS, SIZE_LIMITS, type ResolvedLayout } from '@/lib/certificates/template-schema'

// Roughly Helvetica-like widths: good enough to exercise wrapping and fitting.
const metrics: Metrics = { width: (t, f, s) => t.length * s * (f === 'bold' ? 0.58 : 0.5) }
const page = { width: 842, height: 595 }
const text = {
  org: 'BIRCH FOUNDATION',
  title: 'Certificate of Completion',
  intro: 'This is to certify that',
  name: 'Virnie Bagonbon',
  body: 'has successfully completed the training module',
  module: '“Volunteer Induction”',
  date: 'Completed on 22 September 2026',
  signatoryName: 'SHONE BENJAMIN',
  signatoryTitle: 'DIRECTOR',
  footer: 'Authorised by Birch Foundation',
}

const plan = (layout: Partial<ResolvedLayout>, extra: Partial<Parameters<typeof planFlexibleLayout>[0]> = {}) =>
  planFlexibleLayout({ page, metrics, layout: { ...LAYOUT_DEFAULTS, ...layout }, text, logo: { width: 1024, height: 1024 }, signature: { width: 600, height: 200 }, ...extra })

const byKey = (items: PlannedItem[], key: string) => items.find((i) => (i.kind === 'text' || i.kind === 'image') && i.key === key)

/** Every text line and image sits inside the page frame and fits the width. */
function expectInsideFrame(items: PlannedItem[]) {
  for (const i of items) {
    if (i.kind === 'image') {
      expect(i.y).toBeGreaterThanOrEqual(40)
      expect(i.y + i.height).toBeLessThanOrEqual(page.height - 40)
      expect(i.x).toBeGreaterThanOrEqual(40)
      expect(i.x + i.width).toBeLessThanOrEqual(page.width - 40)
    } else if (i.kind === 'text') {
      for (const l of i.lines) {
        expect(l.y - i.size * 0.22).toBeGreaterThanOrEqual(40)
        expect(l.y + i.size * 0.78).toBeLessThanOrEqual(page.height - 40)
        expect(l.x).toBeGreaterThanOrEqual(40)
        expect(l.x + metrics.width(l.text, i.font, i.size)).toBeLessThanOrEqual(page.width - 40)
      }
    }
  }
}

/** Main content blocks run top to bottom without overlapping. */
function expectStackedInOrder(items: PlannedItem[]) {
  const order = ['logo', 'org', 'title', 'intro', 'name', 'body', 'module', 'date']
  const spans = order
    .map((k) => byKey(items, k))
    .filter(Boolean)
    .map((i) => {
      if (i!.kind === 'image') return { top: i!.y + i!.height, bottom: i!.y }
      const t = i as PlannedText
      return { top: t.lines[0].y + t.size * 0.78, bottom: t.lines[t.lines.length - 1].y - t.size * 0.22 }
    })
  for (let k = 1; k < spans.length; k++) expect(spans[k].top).toBeLessThanOrEqual(spans[k - 1].bottom + 0.01)
  const rule = items.find((i) => i.kind === 'rule')!
  const sig = byKey(items, 'signature')
  const sigTop = sig && sig.kind === 'image' ? sig.y + sig.height : (rule as { y: number }).y
  expect(spans[spans.length - 1].bottom).toBeGreaterThan(sigTop)
}

describe('flexible certificate layout (MOS-748)', () => {
  it('keeps the original sizes by default and fits everything', () => {
    const items = plan({})
    expect((byKey(items, 'title') as PlannedText).size).toBe(34)
    expect((byKey(items, 'name') as PlannedText).size).toBe(30)
    const logo = byKey(items, 'logo') as { height: number }
    expect(logo.height).toBeCloseTo(52)
    expectInsideFrame(items)
    expectStackedInOrder(items)
  })

  it('makes the logo bigger when asked', () => {
    const items = plan({ logoHeight: 120 })
    const h = (byKey(items, 'logo') as { height: number }).height
    // At most a small reduction, only if needed to keep the spacing.
    expect(h).toBeGreaterThan(108)
    expect(h).toBeLessThanOrEqual(120)
    expectInsideFrame(items)
    expectStackedInOrder(items)
  })

  it('never overflows with every size at its maximum', () => {
    const max = Object.fromEntries(Object.entries(SIZE_LIMITS).map(([k, v]) => [k, v.max])) as unknown as Partial<ResolvedLayout>
    const items = plan(max)
    expectInsideFrame(items)
    expectStackedInOrder(items)
  })

  it('still fits with maximum sizes and long wording', () => {
    const max = Object.fromEntries(Object.entries(SIZE_LIMITS).map(([k, v]) => [k, v.max])) as unknown as Partial<ResolvedLayout>
    const items = planFlexibleLayout({
      page, metrics, layout: { ...LAYOUT_DEFAULTS, ...max },
      text: { ...text, title: 'Certificate of Outstanding Achievement in Volunteering', name: 'Maximilian Alexander Featherstonehaugh-Wolfeschlegel', module: '“Safeguarding, Child Protection & Working With Vulnerable People”' },
      logo: { width: 400, height: 1200 }, signature: { width: 200, height: 400 },
    })
    expectInsideFrame(items)
    expectStackedInOrder(items)
  })

  it('works with the smallest sizes and no images', () => {
    const min = Object.fromEntries(Object.entries(SIZE_LIMITS).map(([k, v]) => [k, v.min])) as unknown as Partial<ResolvedLayout>
    const items = plan(min, { logo: null, signature: null })
    expect(byKey(items, 'logo')).toBeUndefined()
    expect(byKey(items, 'signature')).toBeUndefined()
    expectInsideFrame(items)
    expectStackedInOrder(items)
  })

  it('places the signature image above the rule, centred', () => {
    const items = plan({ signatureHeight: 60 })
    const sig = byKey(items, 'signature') as { x: number; y: number; width: number; height: number }
    const rule = items.find((i) => i.kind === 'rule') as { y: number; x1: number; x2: number }
    expect(sig.height).toBeCloseTo(60)
    expect(sig.y).toBeGreaterThan(rule.y)
    expect(sig.x + sig.width / 2).toBeCloseTo(page.width / 2)
    const name = byKey(items, 'signatoryName') as PlannedText
    expect(name.lines[0].y).toBeLessThan(rule.y)
  })

  it('fits the issue and expiry date line on one line', () => {
    const items = planFlexibleLayout({
      page, metrics, layout: LAYOUT_DEFAULTS,
      text: { ...text, date: 'Issue date: 22 September 2026   ·   Expiry date: 22 September 2027' },
      logo: { width: 1024, height: 1024 }, signature: { width: 600, height: 200 },
    })
    const date = byKey(items, 'date') as PlannedText
    expect(date.lines).toHaveLength(1)
    expect(date.size).toBe(LAYOUT_DEFAULTS.textSize - 1)
    expectInsideFrame(items)
    expectStackedInOrder(items)
  })

  it('keeps the learner name on one line', () => {
    const items = plan({ nameSize: 56 }, { text: { ...text, name: 'Maximilian Alexander Featherstonehaugh-Wolfeschlegel Junior' } })
    expect((byKey(items, 'name') as PlannedText).lines).toHaveLength(1)
    expectInsideFrame(items)
  })
})

describe('wrapText', () => {
  it('wraps a long title onto two lines before shrinking', () => {
    const r = wrapText('Certificate of Outstanding Achievement in Volunteering', 'bold', 40, 700, 2, metrics)
    expect(r.lines.length).toBe(2)
    expect(r.size).toBe(40)
  })
  it('shrinks a single line to fit', () => {
    const r = wrapText('A very long single line of text that will not fit', 'bold', 40, 400, 1, metrics)
    expect(r.lines).toHaveLength(1)
    expect(r.size).toBeLessThan(40)
  })
})
