// Volunteer self-service "Add certificate" form. Posts to the self-scoped
// /api/profile/certifications endpoint (employee_id is forced server-side to the
// caller — never sent from here), then, if a file was chosen, uploads the
// evidence to /api/profile/certifications/:id/file. On success it toasts and asks
// the parent to refresh the list. Matches the profile-settings form pattern:
// Card + Label + Input + native select + a primary submit button, with inline
// validation and a disabled/loading state.
'use client'

import { useMemo, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Calendar, Loader2, Plus, Paperclip, X } from 'lucide-react'
import toast from 'react-hot-toast'

export interface CertTypeOption {
  id: string
  name: string
  validity_months: number | null
  /** When true, the cert type requires a supporting document (e.g. a scan). */
  requires_file?: boolean
}

interface AddCertificateProps {
  certTypes: CertTypeOption[]
  /** Called after a successful create so the parent can refresh its list. */
  onCreated: () => void
  /** Localized noun for a single certification (e.g. "certification"). */
  certNoun?: string
}

// Accept common evidence formats; mirrors the 20MB server limit.
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*'
const MAX_BYTES = 20 * 1024 * 1024

function authHeaders(extra: HeadersInit = {}): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('ess_access_token') : null
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) }
}

export function AddCertificate({ certTypes, onCreated, certNoun = 'certificate' }: AddCertificateProps) {
  const [certTypeId, setCertTypeId] = useState('')
  const [title, setTitle] = useState('')
  const [completionDate, setCompletionDate] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<{ certTypeId?: string; file?: string }>({})
  const fileInputRef = useRef<HTMLInputElement>(null)

  const selectedType = useMemo(
    () => certTypes.find((t) => t.id === certTypeId) ?? null,
    [certTypes, certTypeId],
  )
  const fileRequired = Boolean(selectedType?.requires_file)

  const reset = () => {
    setCertTypeId('')
    setTitle('')
    setCompletionDate('')
    setFile(null)
    setErrors({})
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    if (f && f.size > MAX_BYTES) {
      setErrors((prev) => ({ ...prev, file: 'File must be under 20MB' }))
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    setErrors((prev) => ({ ...prev, file: undefined }))
    setFile(f)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const nextErrors: { certTypeId?: string; file?: string } = {}
    if (!certTypeId) nextErrors.certTypeId = 'Please choose a type'
    if (fileRequired && !file) nextErrors.file = 'This certificate requires a document'
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      toast.error(nextErrors.certTypeId ?? nextErrors.file ?? 'Please complete the form')
      return
    }

    setSubmitting(true)
    try {
      // 1) Create the certification record (metadata).
      const res = await fetch('/api/profile/certifications', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          cert_type_id: certTypeId,
          // Default the title to the chosen type's name when left blank.
          title: title.trim() || selectedType?.name || 'Certificate',
          completion_date: completionDate || null,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? 'Could not add certificate')

      const newId: string | undefined = data?.certification?.id
      // 2) If a document was attached, upload it to the new cert.
      if (file && newId) {
        const fd = new FormData()
        fd.append('file', file)
        const up = await fetch(`/api/profile/certifications/${newId}/file`, {
          method: 'POST',
          headers: authHeaders(),
          body: fd,
        })
        if (!up.ok) {
          const upErr = await up.json().catch(() => null)
          // The record was created; only the file failed — say so, don't lose it.
          toast.error(upErr?.error ?? 'Saved, but the document upload failed. Attach it from the list.')
          reset()
          onCreated()
          return
        }
      }

      toast.success(`${capitalize(certNoun)} added`)
      reset()
      onCreated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add certificate')
    } finally {
      setSubmitting(false)
    }
  }

  const noTypes = certTypes.length === 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Plus className="h-4 w-4 text-muted-foreground" /> Add a {certNoun}
        </CardTitle>
        <CardDescription>
          Record a {certNoun} you&apos;ve completed and upload a copy. We&apos;ll track its expiry for you.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {noTypes ? (
          <p className="text-sm text-muted-foreground">
            There are no {certNoun} types set up yet. Please check back later.
          </p>
        ) : (
          <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm">
                Type<span className="ml-0.5 text-destructive">*</span>
              </Label>
              <select
                value={certTypeId}
                onChange={(e) => {
                  setCertTypeId(e.target.value)
                  if (errors.certTypeId) setErrors((p) => ({ ...p, certTypeId: undefined }))
                }}
                className={`flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                  errors.certTypeId ? 'border-destructive' : 'border-input'
                }`}
              >
                <option value="">Select a type…</option>
                {certTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.requires_file ? ' (document required)' : ''}
                  </option>
                ))}
              </select>
              {errors.certTypeId ? (
                <p className="text-xs text-destructive">{errors.certTypeId}</p>
              ) : selectedType ? (
                <p className="text-xs text-muted-foreground">
                  {selectedType.validity_months
                    ? `Valid for ${selectedType.validity_months} month${selectedType.validity_months === 1 ? '' : 's'} from completion.`
                    : 'No expiry.'}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Completion date</Label>
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="date"
                  value={completionDate}
                  onChange={(e) => setCompletionDate(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-sm">Title</Label>
              <Input
                value={title}
                placeholder={selectedType?.name ? `e.g. ${selectedType.name}` : 'Optional — defaults to the type name'}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            {/* Document upload */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-sm">
                Document {fileRequired ? <span className="text-destructive">*</span> : <span className="text-muted-foreground">(optional)</span>}
              </Label>
              {file ? (
                <div className="flex items-center justify-between gap-3 rounded-md border border-input bg-muted/30 px-3 py-2">
                  <span className="flex min-w-0 items-center gap-2 text-sm">
                    <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate text-foreground">{file.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">({formatBytes(file.size)})</span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFile(null)
                      if (fileInputRef.current) fileInputRef.current.value = ''
                    }}
                  >
                    <X className="h-4 w-4" /> Remove
                  </Button>
                </div>
              ) : (
                <label
                  className={`flex cursor-pointer items-center gap-2 rounded-md border border-dashed bg-transparent px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/40 ${
                    errors.file ? 'border-destructive' : 'border-input'
                  }`}
                >
                  <Paperclip className="h-4 w-4" />
                  Choose a file (PDF or image, up to 20MB)
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPT}
                    onChange={onPickFile}
                    className="sr-only"
                  />
                </label>
              )}
              {errors.file ? <p className="text-xs text-destructive">{errors.file}</p> : null}
            </div>

            <div className="sm:col-span-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Adding…
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" /> Add {certNoun}
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
