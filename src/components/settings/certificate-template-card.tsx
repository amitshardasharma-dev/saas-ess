// Certificate template settings (admin, MOS-721): logo, wording, colours and
// signatory for training-completion certificates. The preview is rendered by
// the same server code learners download from, so it matches exactly. Saving
// creates a new version; certificates already issued keep their version.
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Award, Upload, Loader2, Save, RotateCcw, Trash2, ImageIcon, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import toast from 'react-hot-toast'
import type { CertificateTemplate } from '@/lib/certificates/template'

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
  }
}

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
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/settings/certificate', { headers: authHeaders() })
        if (!res.ok) throw new Error()
        const d = await res.json()
        setTpl(d.template)
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

  // Re-render the preview shortly after the admin stops typing.
  useEffect(() => {
    if (!tpl) return
    const h = setTimeout(() => void refreshPreview(tpl), 600)
    return () => clearTimeout(h)
  }, [tpl, refreshPreview])

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
      setTpl(d.template)
      setVersion(d.version)
      setDirty(false)
      toast.success('Certificate template saved. New certificates will use it.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const resetToDefault = () => {
    if (!defaults) return
    setTpl({ ...defaults })
    setDirty(true)
  }

  const orgLogoIsEmbeddable = !!orgLogoUrl && /\.(png|jpe?g)(\?|$)/i.test(orgLogoUrl)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Award className="h-4 w-4 text-muted-foreground" /> Training certificate</CardTitle>
        <CardDescription>
          Design the certificate people receive when they complete a training module. The person&apos;s name, the module and the
          completion date are always filled in automatically. Changes apply to new certificates only; certificates already issued keep
          their original design.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!tpl ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm">Logo</Label>
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
                <p className="text-xs text-muted-foreground">PNG or JPG, up to 1MB. A wide logo works best; it is scaled to fit 200 × 52 pt.</p>
              </div>

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

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Signatory name" hint="Optional">
                  <Input value={tpl.signatoryName ?? ''} maxLength={80} placeholder="e.g. Shone Benjamin" onChange={(e) => set('signatoryName', e.target.value)} />
                </Field>
                <Field label="Signatory title" hint="Optional">
                  <Input value={tpl.signatoryTitle ?? ''} maxLength={80} placeholder="e.g. Volunteer Coordinator" onChange={(e) => set('signatoryTitle', e.target.value)} />
                </Field>
              </div>
              <Field label="Footer" hint={`Leave blank for "Authorised by ${tpl.orgName?.trim() || orgName}".`}>
                <Input value={tpl.footer ?? ''} maxLength={120} onChange={(e) => set('footer', e.target.value)} />
              </Field>

              <div className="grid grid-cols-3 gap-3">
                <ColorField label="Accent" value={tpl.accentColor} onChange={(v) => set('accentColor', v)} />
                <ColorField label="Headings" value={tpl.textColor} onChange={(v) => set('textColor', v)} />
                <ColorField label="Supporting text" value={tpl.mutedColor} onChange={(v) => set('mutedColor', v)} />
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-2">
                <Button onClick={() => void save()} disabled={saving || !dirty}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save template
                </Button>
                <Button type="button" variant="outline" onClick={resetToDefault}><RotateCcw className="h-4 w-4" /> Reset to default</Button>
                <span className="text-xs text-muted-foreground">
                  {dirty ? 'Unsaved changes' : version ? `Version ${version} in use` : 'Using the default design'}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Preview (sample data)</Label>
                <Button type="button" variant="ghost" size="sm" onClick={() => void refreshPreview(tpl)} disabled={previewing}>
                  {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
                </Button>
              </div>
              {previewError ? <p className="text-sm text-destructive">{previewError}</p> : null}
              <div className="w-full overflow-hidden rounded-md border bg-muted/20" data-testid="cert-preview">
                {preview ? (
                  <PdfCanvas data={preview} pageWidth={640} />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Rendering…</div>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
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
