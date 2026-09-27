// In-context signing surface: renders the PDF and overlays each placed field at
// its exact position — text/date/checkbox inputs the signer fills inline, and
// signature boxes they click to sign. One captured signature is shown in every
// signature box (and the embedder stamps it at each). Client-only.
'use client'

import dynamic from 'next/dynamic'
import { PenLine } from 'lucide-react'
import type { DocumentField } from '@/types/esign'
import type { PdfPageDims } from '@/components/documents/pdf/pdf-canvas'

const PdfCanvas = dynamic(() => import('@/components/documents/pdf/pdf-canvas').then((m) => m.PdfCanvas), {
  ssr: false,
  loading: () => <div className="py-16 text-center text-sm text-muted-foreground">Loading document…</div>,
})

interface SignOverlayProps {
  pdfData: ArrayBuffer | Uint8Array
  fields: DocumentField[]
  values: Record<string, string | boolean>
  onValueChange: (fieldKey: string, value: string | boolean) => void
  signerName: string
  signatureDataUrl: string | null
  signatureType: 'drawn' | 'typed' | null
  onRequestSignature: () => void
  pageWidth?: number
  /**
   * MOS-720 (signing order): the role the viewer is filling. When set, only that
   * role's fields are editable; other signers' fields show what they entered, or
   * who still has to fill them. Undefined = every field is the viewer's (classic).
   */
  editableRole?: string | null
  lockedValues?: Record<string, unknown>
  roleSignatures?: Record<string, { signerName: string; signatureType: 'typed' | 'drawn'; signatureDataUrl: string | null }>
  roleLabels?: Record<string, string>
}

export function SignOverlay(props: SignOverlayProps) {
  const { pdfData, fields, pageWidth = 820 } = props

  const renderOverlay = (dims: PdfPageDims) => (
    <>
      {fields.filter((f) => f.page === dims.pageNumber).map((f) => (
        <FieldControl key={f.id} field={f} dims={dims} {...props} />
      ))}
    </>
  )

  return (
    <div className="rounded-xl border bg-muted/20 p-3">
      <PdfCanvas data={pdfData} pageWidth={pageWidth} renderOverlay={renderOverlay} />
    </div>
  )
}

function FieldControl({
  field, dims, values, onValueChange, signerName, signatureDataUrl, signatureType, onRequestSignature,
  editableRole, lockedValues, roleSignatures, roleLabels,
}: SignOverlayProps & { field: DocumentField; dims: PdfPageDims }) {
  const style: React.CSSProperties = {
    left: (field.x_ratio ?? 0) * dims.width,
    top: (field.y_ratio ?? 0) * dims.height,
    width: (field.width_ratio ?? 0.25) * dims.width,
    height: (field.height_ratio ?? 0.04) * dims.height,
  }
  const fontSize = Math.max(9, Math.min(15, style.height ? (style.height as number) * 0.55 : 12))

  const role = field.signer_role || 'recipient'
  if (editableRole !== undefined && role !== editableRole) {
    const who = roleLabels?.[role] ?? 'another signer'
    if (field.type === 'signature') {
      const sig = roleSignatures?.[role]
      return (
        <div data-field-box data-readonly className="absolute flex items-center justify-center overflow-hidden rounded border border-slate-300 bg-slate-50/80" style={style} title={sig ? `Signed by ${sig.signerName} (${who})` : `To be signed by ${who}`}>
          {sig ? (
            sig.signatureType === 'drawn' && sig.signatureDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={sig.signatureDataUrl} alt={`Signature of ${sig.signerName}`} className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="truncate px-1 font-[cursive] text-slate-900" style={{ fontSize: fontSize * 1.2 }}>{sig.signerName}</span>
            )
          ) : (
            <span className="truncate px-1 text-[10px] text-slate-500">{who} signs here</span>
          )}
        </div>
      )
    }
    const v = lockedValues?.[field.field_key]
    const text = field.type === 'checkbox' ? (v === true ? '✓' : '') : v === undefined || v === null ? '' : String(v)
    return (
      <div data-field-box data-readonly className="absolute flex items-center overflow-hidden rounded border border-slate-300 bg-slate-50/80 px-1 text-slate-700" style={{ ...style, fontSize }} title={text ? `${field.label} (${who})` : `${field.label} — completed by ${who}`}>
        {text ? <span className="truncate">{text}</span> : <span className="truncate text-[10px] text-slate-400">{who}</span>}
      </div>
    )
  }

  if (field.type === 'signature') {
    const signed = signatureType === 'drawn' ? !!signatureDataUrl : signatureType === 'typed'
    return (
      <button
        type="button"
        data-field-box
        onClick={onRequestSignature}
        className={`absolute flex items-center justify-center overflow-hidden rounded border-2 transition ${
          signed ? 'border-teal-500 bg-white/70' : 'border-dashed border-amber-500 bg-amber-100/60 hover:bg-amber-100'
        }`}
        style={style}
        title="Click to sign"
      >
        {signed ? (
          signatureType === 'drawn' && signatureDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={signatureDataUrl} alt="Signature" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="truncate px-1 font-[cursive] text-slate-900" style={{ fontSize: fontSize * 1.2 }}>{signerName}</span>
          )
        ) : (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-700"><PenLine className="h-3 w-3" /> Sign</span>
        )}
      </button>
    )
  }

  if (field.type === 'checkbox') {
    return (
      <label data-field-box className="absolute flex items-center justify-center rounded border-2 border-indigo-400 bg-white/70" style={style}>
        <input
          type="checkbox"
          checked={values[field.field_key] === true}
          onChange={(e) => onValueChange(field.field_key, e.target.checked)}
          className="h-4 w-4"
          aria-label={field.label}
        />
      </label>
    )
  }

  // text / date
  return (
    <input
      data-field-box
      type={field.type === 'date' ? 'date' : 'text'}
      value={String(values[field.field_key] ?? '')}
      onChange={(e) => onValueChange(field.field_key, e.target.value)}
      placeholder={field.label}
      aria-label={field.label}
      className="absolute rounded border-2 border-indigo-400 bg-white/80 px-1 text-slate-900 outline-none focus:border-indigo-600 focus:bg-white"
      style={{ ...style, fontSize }}
    />
  )
}
