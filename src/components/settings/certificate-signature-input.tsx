// Signature image for the training certificate (MOS-748), e.g. the Director's.
// Upload a PNG/JPG, or draw it here; a drawn signature is trimmed to the ink
// and uploaded as a transparent PNG.
'use client'

import { useRef, useState } from 'react'
import { Loader2, PenLine, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SignaturePad, type SignaturePadHandle } from '@/components/documents/signing/signature-pad'
import toast from 'react-hot-toast'

const MAX_BYTES = 1024 * 1024

function authHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('ess_access_token') : null
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** Crop a drawn signature to its ink (plus a little padding) as a PNG blob. */
async function trimToInk(dataUrl: string): Promise<Blob | null> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = reject
    i.src = dataUrl
  })
  const src = document.createElement('canvas')
  src.width = img.width
  src.height = img.height
  const ctx = src.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(img, 0, 0)
  const { data, width, height } = ctx.getImageData(0, 0, src.width, src.height)
  let minX = width, minY = height, maxX = -1, maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  const pad = 6
  const sx = Math.max(0, minX - pad)
  const sy = Math.max(0, minY - pad)
  const sw = Math.min(width, maxX + pad + 1) - sx
  const sh = Math.min(height, maxY + pad + 1) - sy
  const out = document.createElement('canvas')
  out.width = sw
  out.height = sh
  out.getContext('2d')?.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh)
  return new Promise((resolve) => out.toBlob((b) => resolve(b), 'image/png'))
}

export function CertificateSignatureInput({ value, onChange }: { value: string | null; onChange: (url: string | null) => void }) {
  const [drawing, setDrawing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const padRef = useRef<SignaturePadHandle>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const upload = async (file: File) => {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/settings/certificate/signature', { method: 'POST', headers: authHeaders(), body: fd })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? 'Upload failed')
      onChange(data.signature_url)
      setDrawing(false)
      toast.success('Signature added. Save the template to use it on new certificates.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return
    if (!/^image\/(png|jpe?g)$/i.test(file.type)) {
      toast.error('Certificates support PNG or JPG signatures only. Please convert the image to PNG and try again.')
      return
    }
    if (file.size > MAX_BYTES) {
      toast.error(`Signature image is ${(file.size / 1024 / 1024).toFixed(1)}MB. Please use an image under 1MB.`)
      return
    }
    await upload(file)
  }

  const applyDrawn = async () => {
    const dataUrl = padRef.current?.toDataUrl()
    if (!dataUrl) { toast.error('Draw the signature first'); return }
    const blob = await trimToInk(dataUrl)
    if (!blob) { toast.error('Draw the signature first'); return }
    await upload(new File([blob], 'signature.png', { type: 'image/png' }))
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-14 w-40 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="Signature" className="h-full w-full object-contain p-1" data-testid="cert-signature-img" />
          ) : (
            <span className="text-xs text-muted-foreground">No signature</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/40">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? 'Uploading…' : value ? 'Replace image' : 'Upload image'}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg" onChange={onPickFile} disabled={uploading} className="sr-only" data-testid="cert-signature-input" />
          </label>
          <Button type="button" variant="outline" size="sm" onClick={() => setDrawing((d) => !d)} disabled={uploading}>
            <PenLine className="h-4 w-4" /> {drawing ? 'Cancel drawing' : 'Draw signature'}
          </Button>
          {value ? (
            <Button type="button" variant="outline" size="sm" onClick={() => onChange(null)}>
              <Trash2 className="h-4 w-4" /> Remove
            </Button>
          ) : null}
        </div>
      </div>
      {drawing ? (
        <div className="space-y-2 rounded-md border bg-muted/20 p-3">
          <p className="text-xs text-muted-foreground">Sign in the box with a mouse, trackpad or finger.</p>
          <SignaturePad ref={padRef} width={500} height={170} />
          <Button type="button" size="sm" onClick={() => void applyDrawn()} disabled={uploading}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Use this signature
          </Button>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Printed above the signature line. A PNG with a transparent background looks best; a clear photo or scan on white paper also works (PNG or JPG, up to 1MB).
      </p>
    </div>
  )
}
