'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  User as UserIcon, Mail, Phone, MapPin, Calendar, Building, Briefcase, IdCard,
  ShieldAlert, Camera, Lock, Eye, EyeOff, CheckCircle2, AlertCircle, Loader2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import toast from 'react-hot-toast'

interface Profile {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  address: string | null
  date_of_birth: string | null
  gender: string | null
  department: string | null
  designation: string | null
  employee_no: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  emergency_contact_relationship: string | null
  photo_url: string | null
}

type Editable = Pick<
  Profile,
  'full_name' | 'phone' | 'address' | 'date_of_birth' | 'gender'
  | 'emergency_contact_name' | 'emergency_contact_phone' | 'emergency_contact_relationship'
>

const REQUIRED: (keyof Editable)[] = ['phone', 'emergency_contact_name', 'emergency_contact_phone']

function authHeaders(extra: HeadersInit = {}): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('ess_access_token') : null
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) }
}

export function ProfileSettings() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [form, setForm] = useState<Editable | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [complete, setComplete] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof Editable, string>>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/profile', { headers: authHeaders() })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Failed to load')
      const p = data.profile as Profile
      setProfile(p)
      setComplete(Boolean(data.complete))
      setForm({
        full_name: p.full_name ?? '',
        phone: p.phone ?? '',
        address: p.address ?? '',
        date_of_birth: p.date_of_birth ?? '',
        gender: p.gender ?? '',
        emergency_contact_name: p.emergency_contact_name ?? '',
        emergency_contact_phone: p.emergency_contact_phone ?? '',
        emergency_contact_relationship: p.emergency_contact_relationship ?? '',
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load profile')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const set = (k: keyof Editable, v: string) => {
    setForm((f) => (f ? { ...f, [k]: v } : f))
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }))
  }

  const save = async () => {
    if (!form) return
    const next: Partial<Record<keyof Editable, string>> = {}
    for (const k of REQUIRED) if (!String(form[k] ?? '').trim()) next[k] = 'Required'
    if (Object.keys(next).length) {
      setErrors(next)
      toast.error('Please fill in the required fields')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Save failed')
      setComplete(Boolean(data.complete))
      toast.success('Profile saved')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  if (loading || !form || !profile) {
    return (
      <Card><CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading your profile…
      </CardContent></Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Completion banner */}
      <Card className={complete ? 'border-green-200 bg-green-50/60' : 'border-amber-200 bg-amber-50/60'}>
        <CardContent className="flex items-center gap-3 py-4">
          {complete ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
          )}
          <p className="text-sm">
            {complete
              ? 'Your profile is complete — the onboarding step is marked done.'
              : 'Add your contact details and an emergency contact to complete this onboarding step.'}
          </p>
        </CardContent>
      </Card>

      <AvatarCard profile={profile} onChange={load} />

      {/* Personal details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><UserIcon className="h-4 w-4 text-muted-foreground" /> Personal details</CardTitle>
          <CardDescription>Keep your contact information up to date.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Full name" value={form.full_name ?? ''} onChange={(v) => set('full_name', v)} icon={UserIcon} />
          <ReadOnly label="Email" value={profile.email} icon={Mail} />
          <Field label="Phone" required error={errors.phone} value={form.phone ?? ''} onChange={(v) => set('phone', v)} icon={Phone} placeholder="04xx xxx xxx" />
          <SelectField label="Gender" value={form.gender ?? ''} onChange={(v) => set('gender', v)} options={['', 'Female', 'Male', 'Non-binary', 'Prefer not to say']} />
          <Field label="Date of birth" type="date" value={form.date_of_birth ?? ''} onChange={(v) => set('date_of_birth', v)} icon={Calendar} />
          <Field label="Address" value={form.address ?? ''} onChange={(v) => set('address', v)} icon={MapPin} placeholder="Street, suburb, state, postcode" />
        </CardContent>
      </Card>

      {/* Emergency contact */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><ShieldAlert className="h-4 w-4 text-muted-foreground" /> Emergency contact</CardTitle>
          <CardDescription>Who we should contact in an emergency.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Contact name" required error={errors.emergency_contact_name} value={form.emergency_contact_name ?? ''} onChange={(v) => set('emergency_contact_name', v)} icon={UserIcon} />
          <Field label="Contact phone" required error={errors.emergency_contact_phone} value={form.emergency_contact_phone ?? ''} onChange={(v) => set('emergency_contact_phone', v)} icon={Phone} />
          <Field label="Relationship" value={form.emergency_contact_relationship ?? ''} onChange={(v) => set('emergency_contact_relationship', v)} placeholder="e.g. Parent, Partner, Friend" />
        </CardContent>
      </Card>

      {/* Role info (read-only) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Building className="h-4 w-4 text-muted-foreground" /> Your role</CardTitle>
          <CardDescription>Managed by Birch Foundation staff.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <ReadOnly label="Program / department" value={profile.department} icon={Building} />
          <ReadOnly label="Role" value={profile.designation} icon={Briefcase} />
          <ReadOnly label="Volunteer ID" value={profile.employee_no} icon={IdCard} />
        </CardContent>
      </Card>

      {/* Sticky save bar */}
      <div className="sticky bottom-0 -mx-6 border-t bg-background/95 px-6 py-3 backdrop-blur">
        <div className="flex items-center justify-end gap-3">
          <span className="text-xs text-muted-foreground">Required fields are marked with *</span>
          <Button onClick={save} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : 'Save changes'}
          </Button>
        </div>
      </div>

      <SecurityCard />
    </div>
  )
}

/* ---------- field primitives ---------- */

function Field({
  label, value, onChange, icon: Icon, type = 'text', required, error, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void
  icon?: React.ComponentType<{ className?: string }>; type?: string
  required?: boolean; error?: string; placeholder?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">
        {label}{required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      <div className="relative">
        {Icon ? <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /> : null}
        <Input
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={`${Icon ? 'pl-9' : ''} ${error ? 'border-destructive' : ''}`}
        />
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {options.map((o) => <option key={o} value={o}>{o === '' ? 'Select…' : o}</option>)}
      </select>
    </div>
  )
}

function ReadOnly({ label, value, icon: Icon }: { label: string; value: string | null; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm text-muted-foreground">{label}</Label>
      <div className="flex h-9 items-center gap-2 rounded-md border border-dashed bg-muted/40 px-3 text-sm text-foreground">
        {Icon ? <Icon className="h-4 w-4 text-muted-foreground" /> : null}
        <span className="truncate">{value || '—'}</span>
      </div>
    </div>
  )
}

/* ---------- avatar ---------- */

function AvatarCard({ profile, onChange }: { profile: Profile; onChange: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const initials = (profile.full_name ?? '?').split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase()

  const upload = async (file: File) => {
    if (!file.type.startsWith('image/')) return toast.error('Please choose an image')
    if (file.size > 5 * 1024 * 1024) return toast.error('Image must be under 5MB')
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file); fd.append('is_private', '0'); fd.append('folder', 'Home')
      const res = await fetch('/api/profile/upload-photo', { method: 'POST', headers: authHeaders(), body: fd })
      if (!res.ok) throw new Error('Upload failed')
      toast.success('Photo updated'); onChange()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed')
    } finally { setUploading(false) }
  }

  return (
    <Card>
      <CardContent className="flex items-center gap-5 py-5">
        <div className="relative">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xl font-semibold text-primary">
            {profile.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.photo_url} alt={profile.full_name ?? 'avatar'} className="h-full w-full object-cover" />
            ) : initials}
          </div>
          {uploading ? (
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : null}
        </div>
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{profile.full_name}</p>
          <p className="truncate text-sm text-muted-foreground">{profile.designation || 'Volunteer'} · {profile.department || '—'}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Camera className="h-4 w-4" /> Change photo
          </Button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f) }} />
        </div>
      </CardContent>
    </Card>
  )
}

/* ---------- security (password) ---------- */

function SecurityCard() {
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)

  const change = async (e: React.FormEvent) => {
    e.preventDefault()
    if (next.length < 8) return toast.error('Password must be at least 8 characters')
    if (next !== confirm) return toast.error('Passwords do not match')
    setSaving(true)
    try {
      const res = await fetch('/api/profile/change-password', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ new_password: next }),
      })
      if (!res.ok) throw new Error('Failed')
      setNext(''); setConfirm(''); toast.success('Password changed')
    } catch {
      toast.error('Could not change password')
    } finally { setSaving(false) }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Lock className="h-4 w-4 text-muted-foreground" /> Password</CardTitle>
        <CardDescription>Choose a strong password of at least 8 characters.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={change} className="grid grid-cols-1 gap-4 sm:max-w-md">
          <div className="space-y-1.5">
            <Label className="text-sm">New password</Label>
            <div className="relative">
              <Input type={show ? 'text' : 'password'} value={next} onChange={(e) => setNext(e.target.value)} className="pr-10" />
              <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Confirm new password</Label>
            <Input type={show ? 'text' : 'password'} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          <div>
            <Button type="submit" variant="outline" disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Updating…</> : 'Update password'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
