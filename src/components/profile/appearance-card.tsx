// Lets each person choose their interface design. The choice is saved to their
// account, so it follows them to any device; everyone stays on Classic until
// they opt in.
'use client'

import { Check, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useUiTheme } from '@/hooks/use-ui-theme'
import type { UiTheme } from '@/types/auth'

const OPTIONS: Array<{
  value: UiTheme
  name: string
  blurb: string
  /** Miniature of the design, drawn with that design's own colours. */
  swatch: { page: string; card: string; accent: string; line: string; text: string }
}> = [
  {
    value: 'classic',
    name: 'Classic',
    blurb: 'The current look — soft gradients, rounded cards, roomy spacing. Supports dark mode.',
    swatch: { page: '#f1f5f9', card: 'rgba(255,255,255,0.75)', accent: '#0d9488', line: '#e2e8f0', text: '#1e293b' },
  },
  {
    value: 'pro',
    name: 'Professional',
    blurb: 'A dense compliance workbench — flat surfaces, hairline borders, more rows on screen. Light only.',
    swatch: { page: 'lch(94.44% 0.5 282)', card: '#ffffff', accent: '#5e6ad2', line: 'lch(90.55% 0.5 282)', text: 'lch(9.794% 0 282)' },
  },
]

export function AppearanceCard() {
  const { theme, setTheme, saving } = useUiTheme()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Appearance</CardTitle>
        <CardDescription>
          Choose how the portal looks for you. This only changes your own view — nobody else is affected.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {OPTIONS.map((opt) => {
          const active = theme === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => { if (!active) void setTheme(opt.value) }}
              disabled={saving}
              aria-pressed={active}
              className={`group relative rounded-xl border-2 p-3 text-left transition ${
                active ? 'border-primary' : 'border-border hover:border-primary/40'
              }`}
            >
              {/* Miniature preview, rendered in the option's own palette */}
              <div
                className="mb-3 flex h-24 gap-1.5 overflow-hidden rounded-lg p-1.5"
                style={{ background: opt.swatch.page }}
                aria-hidden
              >
                <div className="flex w-1/4 flex-col gap-1 rounded p-1" style={{ background: opt.swatch.card, border: `1px solid ${opt.swatch.line}` }}>
                  <span className="h-1 w-full rounded-full" style={{ background: opt.swatch.accent }} />
                  <span className="h-1 w-3/4 rounded-full" style={{ background: opt.swatch.line }} />
                  <span className="h-1 w-3/4 rounded-full" style={{ background: opt.swatch.line }} />
                </div>
                <div className="flex flex-1 flex-col gap-1 rounded p-1.5" style={{ background: opt.swatch.card, border: `1px solid ${opt.swatch.line}` }}>
                  <span className="h-1.5 w-1/2 rounded-full" style={{ background: opt.swatch.text, opacity: 0.8 }} />
                  <span className="mt-0.5 h-1 w-full rounded-full" style={{ background: opt.swatch.line }} />
                  <span className="h-1 w-full rounded-full" style={{ background: opt.swatch.line }} />
                  <span className="h-1 w-2/3 rounded-full" style={{ background: opt.swatch.line }} />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">{opt.name}</span>
                {active ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">
                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} In use
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{opt.blurb}</p>
            </button>
          )
        })}
      </CardContent>
    </Card>
  )
}
