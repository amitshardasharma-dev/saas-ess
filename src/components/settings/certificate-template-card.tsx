// Certificate template settings (admin, MOS-721 + MOS-748): logo and its size,
// wording, text sizes and font, signatory with an optional signature image, and
// colours for training-completion certificates. The preview is rendered by the
// same server code learners download from, so it matches exactly. Saving
// creates a new version, and every certificate downloaded after that uses it
// (MOS-857), including training completed earlier.
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Award, Upload, Loader2, Save, RotateCcw, Trash2, ImageIcon, RefreshCw, Maximize2, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import toast from 'react-hot-toast'
import {
  LAYOUT_DEFAULTS,
  SIZE_LIMITS,
  resolveLayout,
  type CertificateTemplate,
} from '@/lib/certificates/template-schema'
import { CertificateSignatureInput } from '@/components/settings/certificate-signature-input'

const MAX_LOGO_BYTES = 1024 * 1024

// Rendered with the app's pdf.js canvas (not an <iframe>) so the preview shows on
// every browser, including mobile Safari which won't display PDFs inline.
const PdfCanvas = dynamic(() => import('@/components/documents/pdf/pdf-canvas').then((m) => m.PdfCanvas), {
  ssr: false,
  loading: () => <div className="py-16 text-center text-sm text-muted-foreground">Rendering…</div>,
})

function authHeaders(extra: HeadersInit = {}): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('ess_access_token') : null
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) }
}

/**
 * The editor always works on the flexible layout (MOS-748). A template saved
 * before it gets the default sizes, which match the original design.
 */
function withLayout(t: CertificateTemplate): CertificateTemplate {
  return { ...t, ...resolveLayout(t), signatureImageUrl: t.signatureImageUrl ?? null }
}

/** Send nulls for blank optional fields so the server applies its defaults. */
function toPayload(t: CertificateTemplate): CertificateTemplate {
  const blank = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null)
  return {
    ...t,
    orgName: blank(t.orgName),
    footer: blank(t.footer),
    signatoryName: blank(t.signatoryName),
    signatoryTitle: blank(t.signatoryTitle),
    logoUrl: t.logoUrl || null,
    signatureImageUrl: t.signatureImageUrl || null,
  }
}

type SizeKey = keyof typeof SIZE_LIMITS

const TEXT_SIZES: Array<{ key: SizeKey; label: string }> = [
  { key: 'orgNameSize', label: 'Organisation name' },
  { key: 'titleSize', label: 'Certificate title' },
  { key: 'nameSize', label: 'Recipient name' },
  { key: 'moduleSize', label: 'Module name' },
  { key: 'textSize', label: 'Other text' },
  { key: 'signatureTextSize', label: 'Signatory name & title' },
]

export function CertificateTemplateCard() {
  const [tpl, setTpl] = useState<CertificateTemplate | null>(null)
  const [defaults, setDefaults] = useState<CertificateTemplate | null>(null)
  const [orgName, setOrgName] = useState('')
  const [orgLogoUrl, setOrgLogoUrl] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<ArrayBuffer | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [logoPx, setLogoPx] = useState<{ w: number; h: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/settings/certificate', { headers: authHeaders() })
        if (!res.ok) throw new Error()
        const d = await res.json()
        setTpl(withLayout(d.template))
        setDefaults(d.defaults)
        setOrgName(d.orgName ?? '')
        setOrgLogoUrl(d.orgLogoUrl ?? null)
        setVersion(d.version ?? 0)
      } catch {
        toast.error('Could not load the certificate template')
      }
    })()
  }, [])

  const refreshPreview = useCallback(async (t: CertificateTemplate) => {
    setPreviewing(true)
    try {
      const res = await fetch('/api/settings/certificate/preview', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ template: toPayload(t) }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        setPreviewError(d?.error ?? 'Preview failed')
        return
      }
      setPreview(await res.arrayBuffer())
      setPreviewError(null)
    } catch {
      setPreviewError('Preview failed')
    } finally {
      setPreviewing(false)
    }
  }, [])

  // Re-render the preview shortly after the admin stops typing or dragging.
  useEffect(() => {
    if (!tpl) return
    const h = setTimeout(() => void refreshPreview(tpl), 500)
    return () => clearTimeout(h)
  }, [tpl, refreshPreview])

  // Pixel size of the logo, to warn when it's too small to print sharply.
  const logoUrl = tpl?.logoUrl ?? null
  useEffect(() => {
    setLogoPx(null)
    if (!logoUrl) return
    const img = new Image()
    img.onload = () => setLogoPx({ w: img.naturalWidth, h: img.naturalHeight })
    img.src = logoUrl
  }, [logoUrl])

  const set = <K extends keyof CertificateTemplate>(key: K, value: CertificateTemplate[K]) => {
    setTpl((prev) => (prev ? { ...prev, [key]: value } : prev))
    setDirty(true)
  }

  const onPickLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!/^image\/(png|jpe?g)$/i.test(file.type)) {
      toast.error('Certificates support PNG or JPG logos only. Please convert your logo to PNG and try again.')
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error(`Logo is ${(file.size / 1024 / 1024).toFixed(1)}MB. Please use an image under 1MB.`)
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/settings/certificate/logo', { method: 'POST', headers: authHeaders(), body: fd })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? 'Upload failed')
      set('logoUrl', data.logo_url)
      toast.success('Logo added. Save the template to use it on new certificates.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const save = async () => {
    if (!tpl) return
    setSaving(true)
    try {
      const res = await fetch('/api/settings/certificate', {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ template: toPayload(tpl) }),
      })
      const d = await res.json().catch(() => null)
      if (!res.ok) throw new Error(d?.error ?? 'Save failed')
      setTpl(withLayout(d.template))
      setVersion(d.version)
      setDirty(false)
      toast.success('Certificate template saved. All certificates now use it.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const resetToDefault = () => {
    if (!defaults) return
    setTpl(withLayout({ ...defaults }))
    setDirty(true)
  }

  const resetSizes = () => {
    // Sizes only; the chosen font stays.
    setTpl((prev) => (prev ? { ...prev, ...LAYOUT_DEFAULTS, fontFamily: prev.fontFamily ?? LAYOUT_DEFAULTS.fontFamily } : prev))
    setDirty(true)
  }

  const openFullSize = () => {
    if (!preview) return
    const url = URL.createObjectURL(new Blob([preview], { type: 'application/pdf' }))
    window.open(url, '_blank', 'noopener,noreferrer')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  const orgLogoIsEmbeddable = !!orgLogoUrl && /\.(png|jpe?g)(\?|$)/i.test(orgLogoUrl)
  const L = tpl ? resolveLayout(tpl) : LAYOUT_DEFAULTS
  // ~2 pixels per point keeps a printed logo sharp.
  const logoTooSmall = !!(logoPx && tpl?.logoUrl && logoPx.h < L.logoHeight * 2 && logoPx.w < 1400)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Award className="h-4 w-4 text-muted-foreground" /> Training certificate</CardTitle>
        <CardDescription>
          Design the certificate people receive when they complete a training module. The person&apos;s name, the module and the
          completion date are always filled in automatically. When you save, every certificate uses the new design, including
          certificates for training completed before.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!tpl ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <div className="space-y-6">
              <Section title="Logo">
                <div className="flex items-center gap-3">
                  <div className="flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/30">
                    {tpl.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={tpl.logoUrl} alt="Certificate logo" className="h-full w-full object-contain p-1" />
                    ) : (
                      <ImageIcon className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/40">
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      {uploading ? 'Uploading…' : tpl.logoUrl ? 'Replace' : 'Upload'}
                      <input ref={fileRef} type="file" accept="image/png,image/jpeg" onChange={onPickLogo} disabled={uploading} className="sr-only" data-testid="cert-logo-input" />
                    </label>
                    {orgLogoIsEmbeddable && tpl.logoUrl !== orgLogoUrl ? (
                      <Button type="button" variant="outline" size="sm" onClick={() => set('logoUrl', orgLogoUrl)}>Use organisation logo</Button>
                    ) : null}
                    {tpl.logoUrl ? (
                      <Button type="button" variant="outline" size="sm" onClick={() => set('logoUrl', null)}><Trash2 className="h-4 w-4" /> Remove</Button>
                    ) : null}
                  </div>
                </div>
                <SliderField label="Logo size" sizeKey="logoHeight" value={L.logoHeight} disabled={!tpl.logoUrl} onChange={(v) => set('logoHeight', v)} />
                {logoTooSmall ? (
                  <p className="flex items-start gap-1.5 text-xs text-amber-700">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    This logo is {logoPx!.h}px tall, so it may look blurry when printed this large. Use an image at least {Math.ceil(L.logoHeight * 2)}px tall, or make the logo smaller.
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">PNG or JPG, up to 1MB. Drag the slider to make the logo bigger or smaller.</p>
              </Section>

              <Section title="Wording">
                <Field label="Organisation name" hint={`Leave blank to use "${orgName}".`}>
                  <Input value={tpl.orgName ?? ''} maxLength={80} placeholder={orgName} onChange={(e) => set('orgName', e.target.value)} />
                </Field>
                <Field label="Certificate title">
                  <Input value={tpl.title} maxLength={60} onChange={(e) => set('title', e.target.value)} />
                </Field>
                <Field label="Text above the name">
                  <Input value={tpl.intro} maxLength={120} onChange={(e) => set('intro', e.target.value)} />
                </Field>
                <Field label="Text above the module name">
                  <Input value={tpl.body} maxLength={160} onChange={(e) => set('body', e.target.value)} />
                </Field>
                <Field label="Footer" hint={`Leave blank for "Authorised by ${tpl.orgName?.trim() || orgName}".`}>
                  <Input value={tpl.footer ?? ''} maxLength={120} onChange={(e) => set('footer', e.target.value)} />
                </Field>
              </Section>

              <Section title="Signature">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Signatory name" hint="Optional">
                    <Input value={tpl.signatoryName ?? ''} maxLength={80} placeholder="e.g. Shone Benjamin" onChange={(e) => set('signatoryName', e.target.value)} />
                  </Field>
                  <Field label="Signatory title" hint="Optional">
                    <Input value={tpl.signatoryTitle ?? ''} maxLength={80} placeholder="e.g. Director" onChange={(e) => set('signatoryTitle', e.target.value)} />
                  </Field>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Signature image</Label>
                  <CertificateSignatureInput value={tpl.signatureImageUrl ?? null} onChange={(url) => set('signatureImageUrl', url)} />
                </div>
                <SliderField label="Signature size" sizeKey="signatureHeight" value={L.signatureHeight} disabled={!tpl.signatureImageUrl} onChange={(v) => set('signatureHeight', v)} />
              </Section>

              <Section
                title="Text size & font"
                action={<Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={resetSizes}><RotateCcw className="h-3.5 w-3.5" /> Reset sizes</Button>}
              >
                <div className="space-y-1.5">
                  <Label className="text-xs">Font</Label>
                  <div className="inline-flex rounded-md border bg-muted/30 p-0.5" role="radiogroup" aria-label="Font">
                    {([['sans', 'Modern (sans-serif)'], ['serif', 'Classic (serif)']] as const).map(([v, label]) => (
                      <button
                        key={v}
                        type="button"
                        role="radio"
                        aria-checked={L.fontFamily === v}
                        onClick={() => set('fontFamily', v)}
                        className={`rounded px-3 py-1.5 text-sm ${L.fontFamily === v ? 'bg-white shadow-sm font-medium' : 'text-muted-foreground'} ${v === 'serif' ? 'font-serif' : ''}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                  {TEXT_SIZES.map(({ key, label }) => (
                    <SliderField key={key} label={label} sizeKey={key} value={L[key]} onChange={(v) => set(key, v)} />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Text that would not fit is wrapped or reduced automatically, so it always stays on the page.</p>
              </Section>

              <Section title="Colours">
                <div className="grid grid-cols-3 gap-3">
                  <ColorField label="Accent" value={tpl.accentColor} onChange={(v) => set('accentColor', v)} />
                  <ColorField label="Headings" value={tpl.textColor} onChange={(v) => set('textColor', v)} />
                  <ColorField label="Supporting text" value={tpl.mutedColor} onChange={(v) => set('mutedColor', v)} />
                </div>
              </Section>

              <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                <Button onClick={() => void save()} disabled={saving || !dirty}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save template
                </Button>
                <Button type="button" variant="outline" onClick={resetToDefault}><RotateCcw className="h-4 w-4" /> Reset to default</Button>
                <span className="text-xs text-muted-foreground">
                  {dirty ? 'Unsaved changes' : version ? `Version ${version} in use` : 'Using the default design'}
                </span>
              </div>
            </div>

            <div className="space-y-2 self-start lg:sticky lg:top-4">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm">Preview (sample data)</Label>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="ghost" size="sm" onClick={openFullSize} disabled={!preview}>
                    <Maximize2 className="h-4 w-4" /> Full size
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => void refreshPreview(tpl)} disabled={previewing}>
                    {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
                  </Button>
                </div>
              </div>
              {previewError ? <p className="text-sm text-destructive">{previewError}</p> : null}
              <div className="w-full overflow-hidden rounded-md border bg-muted/20" data-testid="cert-preview">
                {preview ? (
                  <PdfCanvas data={preview} pageWidth={720} />
                ) : (
                  <div className="flex h-full items-center justify-center py-16 text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Rendering…</div>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function SliderField({
  label, sizeKey, value, disabled, onChange,
}: {
  label: string
  sizeKey: SizeKey
  value: number
  disabled?: boolean
  onChange: (v: number) => void
}) {
  const { min, max } = SIZE_LIMITS[sizeKey]
  return (
    <div className={`space-y-1 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex items-center justify-between">
        <Label className="text-xs" htmlFor={`cert-${sizeKey}`}>{label}</Label>
        <span className="font-mono text-xs text-muted-foreground">{value} pt</span>
      </div>
      <input
        id={`cert-${sizeKey}`}
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
        data-testid={`cert-size-${sizeKey}`}
      />
    </div>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <input type="color" aria-label={`${label} colour`} value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-10 cursor-pointer rounded border bg-transparent p-0.5" />
        <span className="font-mono text-xs text-muted-foreground">{value}</span>
      </div>
    </div>
  )
}
