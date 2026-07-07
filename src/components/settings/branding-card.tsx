// Tenant branding settings (admin): organisation name + logo, shown in the
// portal sidebar. Saves name to ess_companies.settings.brand_name and uploads
// the logo via /api/settings/logo. Updates the branding cache so the sidebar
// reflects the change immediately.
'use client'

import { useEffect, useRef, useState } from 'react'
import { Building, Upload, Loader2, Save } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import toast from 'react-hot-toast'

function authHeaders(extra: HeadersInit = {}): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('ess_access_token') : null
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) }
}

function cacheBranding(name: string, logoUrl: string | null) {
  try { localStorage.setItem('ess_branding', JSON.stringify({ name, logoUrl })) } catch { /* non-fatal */ }
}

export function BrandingCard() {
  const [name, setName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/settings', { headers: authHeaders() })
        if (res.ok) {
          const s = (await res.json())?.settings ?? {}
          setCompanyName(s.company_name ?? '')
          setName((s.brand_name && String(s.brand_name)) || s.company_name || '')
          setLogoUrl(s.logo_url ?? null)
        }
      } finally { setLoading(false) }
    })()
  }, [])

  const saveName = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings', { method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ brand_name: name.trim() || null }) })
      if (!res.ok) throw new Error()
      cacheBranding(name.trim() || companyName || 'ESS Portal', logoUrl)
      toast.success('Branding saved')
    } catch { toast.error('Could not save') } finally { setSaving(false) }
  }

  const onPickLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/settings/logo', { method: 'POST', headers: authHeaders(), body: fd })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? 'Upload failed')
      setLogoUrl(data.logo_url)
      cacheBranding(name.trim() || companyName || 'ESS Portal', data.logo_url)
      toast.success('Logo updated')
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Upload failed') } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Building className="h-4 w-4 text-muted-foreground" /> Branding</CardTitle>
        <CardDescription>Your organisation name and logo, shown to volunteers and staff in the portal.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : (
          <>
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/30">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="Logo" className="h-full w-full object-contain p-1" />
                ) : (
                  <Building className="h-7 w-7 text-muted-foreground" />
                )}
              </div>
              <div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/40">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {uploading ? 'Uploading…' : 'Upload logo'}
                  <input ref={fileRef} type="file" accept="image/*" onChange={onPickLogo} disabled={uploading} className="sr-only" />
                </label>
                <p className="mt-1 text-xs text-muted-foreground">PNG or SVG, up to 3MB.</p>
              </div>
            </div>

            <div className="space-y-1.5 max-w-md">
              <Label className="text-sm">Organisation name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={companyName || 'e.g. Birch Foundation'} />
            </div>

            <Button onClick={() => void saveName()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save branding
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
