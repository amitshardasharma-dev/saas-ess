// Visual field designer (tenant/hr): renders the actual PDF and lets the tenant
// drop, drag, and resize fields (signature + smart text/date fields) exactly where
// they want on any page. Positions are captured as normalized ratios — the same
// coordinates the server-side embedder consumes — so what you place is where it
// lands. Reuses PdfCanvas for rendering; client-only.
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import toast from 'react-hot-toast'
import { PenLine, Type, Calendar, Hash, Mail, User, Trash2, Save, Loader2, MousePointer2, Phone, MapPin } from 'lucide-react'
import type { DocumentField, FieldDefinitionInput, FieldKind, SignerRole, SigningConfig } from '@/types/esign'
import { RECIPIENT_ROLE } from '@/types/esign'
import { FIELD_CATALOG, PALETTE_KINDS } from '@/lib/esign/field-catalog'
import { esignService, SigningInProgressError, type SignerOption } from '@/services/esign-client'
import { SigningOrderPanel, DEFAULT_ROLES, roleColor } from '@/components/documents/signing/signing-order-panel'
import type { PdfPageDims } from '@/components/documents/pdf/pdf-canvas'

const PdfCanvas = dynamic(() => import('@/components/documents/pdf/pdf-canvas').then((m) => m.PdfCanvas), {
  ssr: false,
  loading: () => <div className="py-16 text-center text-sm text-muted-foreground">Loading document…</div>,
})

type Tool = 'signature' | FieldKind

interface Placed {
  key: string // local id
  fieldKey: string
  kind: FieldKind
  type: DocumentField['type']
  label: string
  required: boolean
  page: number
  x: number // ratios
  y: number
  w: number
  h: number
  /** MOS-720: which signer fills this field. */
  signerRole: string
}

const SIGNATURE_SIZE = { w: 0.26, h: 0.07 }

const KIND_ICON: Record<string, typeof Type> = {
  signature: PenLine, full_name: User, first_name: User, last_name: User,
  email: Mail, phone: Phone, address: MapPin, employee_no: Hash, dob: Calendar,
  date: Calendar, number: Hash, id_number: Hash, custom: Type,
}

let seq = 0
const uid = () => `f_${Date.now().toString(36)}_${(seq++).toString(36)}`

export function FieldDesigner({
  documentId,
  versionId,
  pdfData,
  initialFields,
  initialSigningConfig = null,
  onSaved,
}: {
  documentId: string
  versionId: string
  pdfData: ArrayBuffer | Uint8Array
  initialFields: DocumentField[]
  initialSigningConfig?: SigningConfig | null
  onSaved?: () => void
}) {
  const [roles, setRoles] = useState<SignerRole[]>(() =>
    initialSigningConfig && initialSigningConfig.roles.length > 1 ? initialSigningConfig.roles : DEFAULT_ROLES,
  )
  const [activeRole, setActiveRole] = useState<string>(RECIPIENT_ROLE)
  const [people, setPeople] = useState<SignerOption[]>([])
  useEffect(() => { void esignService.getSignerOptions().then(setPeople) }, [])
  const [fields, setFields] = useState<Placed[]>(() =>
    initialFields.map((f) => ({
      key: uid(),
      fieldKey: f.field_key,
      kind: f.kind ?? 'custom',
      type: f.type,
      label: f.label,
      required: f.required,
      page: f.page ?? 1,
      x: f.x_ratio ?? 0.1,
      y: f.y_ratio ?? 0.1,
      w: f.width_ratio ?? 0.28,
      h: f.height_ratio ?? 0.035,
      signerRole: f.signer_role || RECIPIENT_ROLE,
    })),
  )
  const [tool, setTool] = useState<Tool | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const markDirty = () => setDirty(true)

  const addField = useCallback((t: Tool, page: number, xRatio: number, yRatio: number) => {
    const isSig = t === 'signature'
    const cat = isSig ? null : FIELD_CATALOG[t as FieldKind]
    const size = isSig ? SIGNATURE_SIZE : cat!.size
    const kind: FieldKind = isSig ? 'custom' : (t as FieldKind)
    const label = isSig ? 'Signature' : cat!.label
    const type = isSig ? 'signature' : cat!.type
    const key = uid()
    const n = fields.length + 1
    setFields((prev) => [
      ...prev,
      {
        key, fieldKey: `${isSig ? 'signature' : kind}_${n}`, kind, type, label, required: true,
        page,
        x: Math.min(1 - size.w, Math.max(0, xRatio - size.w / 2)),
        y: Math.min(1 - size.h, Math.max(0, yRatio - size.h / 2)),
        w: size.w, h: size.h,
        signerRole: activeRole,
      },
    ])
    setSelected(key)
    markDirty()
  }, [fields.length, activeRole])

  const updateField = useCallback((key: string, patch: Partial<Placed>) => {
    setFields((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)))
    markDirty()
  }, [])

  const removeField = useCallback((key: string) => {
    setFields((prev) => prev.filter((f) => f.key !== key))
    setSelected((s) => (s === key ? null : s))
    markDirty()
  }, [])

  // Delete key removes the selected field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected && !(e.target as HTMLElement).closest('input,textarea')) {
        e.preventDefault()
        removeField(selected)
      }
      if (e.key === 'Escape') setTool(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, removeField])

  const multi = roles.length > 1
  const fieldCounts = fields.reduce<Record<string, number>>((acc, f) => { acc[f.signerRole] = (acc[f.signerRole] ?? 0) + 1; return acc }, {})

  const changeRoles = (next: SignerRole[]) => {
    setRoles(next)
    // Fields of a removed signer go back to the recipient.
    const keys = new Set(next.map((r) => r.key))
    setFields((prev) => prev.map((f) => (keys.has(f.signerRole) ? f : { ...f, signerRole: RECIPIENT_ROLE })))
    markDirty()
  }

  /** Problems that would leave a signer unable to sign; null when OK. */
  const orderProblem = (): string | null => {
    if (!multi) return null
    for (const r of roles) {
      if (!r.label.trim()) return 'Give every signer a name'
      if (r.assignee.type === 'employee' && !r.assignee.employeeId) return `Choose who signs as "${r.label}"`
      if (!fields.some((f) => f.signerRole === r.key && f.type === 'signature')) return `Add a signature box for "${r.label}"`
    }
    return null
  }

  const save = async (restart = false) => {
    const problem = orderProblem()
    if (problem) { toast.error(problem); return }
    setSaving(true)
    try {
      const payload: FieldDefinitionInput[] = fields.map((f, i) => ({
        fieldKey: f.fieldKey, label: f.label, type: f.type, kind: f.kind, required: f.required,
        page: f.page, xRatio: f.x, yRatio: f.y, widthRatio: f.w, heightRatio: f.h, sortOrder: i,
        signerRole: multi ? f.signerRole : RECIPIENT_ROLE,
      }))
      const signingConfig: SigningConfig | null = multi ? { roles: roles.map((r) => ({ ...r, label: r.label.trim() })) } : null
      await esignService.saveFields(documentId, versionId, payload, { signingConfig, restart })
      setDirty(false)
      toast.success(fields.length ? `Saved ${fields.length} field${fields.length === 1 ? '' : 's'}${multi ? ` and ${roles.length} signers` : ''}` : 'Fields cleared')
      onSaved?.()
    } catch (e) {
      if (e instanceof SigningInProgressError) {
        if (window.confirm(`${e.message}\n\nRestart signing and save?`)) {
          setSaving(false)
          return save(true)
        }
        return
      }
      toast.error(e instanceof Error ? e.message : 'Could not save fields')
    } finally {
      setSaving(false)
    }
  }

  const sel = fields.find((f) => f.key === selected) ?? null

  const renderOverlay = useCallback(
    (dims: PdfPageDims) => (
      <>
        {fields.filter((f) => f.page === dims.pageNumber).map((f) => (
          <FieldBox
            key={f.key}
            field={f}
            dims={dims}
            selected={selected === f.key}
            onSelect={() => setSelected(f.key)}
            onChange={(patch) => updateField(f.key, patch)}
            colorClass={multi ? roleColor(roles, f.signerRole).box : undefined}
            roleLabel={multi ? roles.find((r) => r.key === f.signerRole)?.label : undefined}
          />
        ))}
      </>
    ),
    [fields, selected, updateField, removeField, multi, roles],
  )

  return (
    <div className="space-y-4">
    <SigningOrderPanel
      roles={roles}
      onChange={changeRoles}
      activeRole={activeRole}
      onActiveRoleChange={setActiveRole}
      people={people}
      fieldCounts={fieldCounts}
    />
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* Palette — a wrapping toolbar on mobile, a sidebar on desktop */}
      <aside className="lg:w-52 lg:shrink-0">
        <div className="space-y-2 rounded-xl border bg-white p-3 lg:sticky lg:top-4">
          <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add a field</p>
          <div className="flex flex-wrap gap-1.5 lg:flex-col lg:gap-1">
            <ToolButton active={tool === 'signature'} icon={PenLine} label="Signature" onClick={() => setTool((t) => (t === 'signature' ? null : 'signature'))} accent />
            {PALETTE_KINDS.map((k) => (
              <ToolButton key={k} active={tool === k} icon={KIND_ICON[k]} label={FIELD_CATALOG[k].palette} onClick={() => setTool((t) => (t === k ? null : k))} />
            ))}
          </div>
          <p className="flex items-start gap-1.5 px-1 pt-1 text-[11px] leading-snug text-muted-foreground">
            <MousePointer2 className="mt-0.5 h-3 w-3 shrink-0" />
            {tool ? 'Tap the document to place it. Drag to move, corner to resize.' : 'Pick a field, then tap the document to place it.'}
          </p>
        </div>
      </aside>

      {/* Canvas */}
      <div className="min-w-0 flex-1">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">{fields.length} field{fields.length === 1 ? '' : 's'} placed{dirty ? ' · unsaved' : ''}</p>
          <Button size="sm" onClick={() => void save()} disabled={saving || !dirty} data-testid="save-fields">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save fields
          </Button>
        </div>
        <div className={`rounded-xl border bg-muted/20 p-3 ${tool ? 'cursor-crosshair' : ''}`}>
          <PdfCanvas
            data={pdfData}
            pageWidth={760}
            renderOverlay={renderOverlay}
            onPageClick={(dims, x, y) => { if (tool) addField(tool, dims.pageNumber, x, y) }}
          />
        </div>
      </div>

      {/* Properties */}
      <aside className="lg:w-60 lg:shrink-0">
        <div className="rounded-xl border bg-white p-4 lg:sticky lg:top-4">
          {sel ? (
            <div className="space-y-4">
              <p className="text-sm font-semibold">Field properties</p>
              <div className="space-y-1.5">
                <Label className="text-xs">Label</Label>
                <Input value={sel.label} onChange={(e) => updateField(sel.key, { label: e.target.value })} />
              </div>
              {sel.type !== 'signature' ? (
                <div className="space-y-1.5">
                  <Label className="text-xs">Field kind (auto-fill)</Label>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
                    value={sel.kind}
                    onChange={(e) => {
                      const kind = e.target.value as FieldKind
                      const cat = FIELD_CATALOG[kind]
                      updateField(sel.key, { kind, type: cat.type, label: sel.label || cat.label })
                    }}
                  >
                    {PALETTE_KINDS.map((k) => (<option key={k} value={k}>{FIELD_CATALOG[k].palette}</option>))}
                  </select>
                </div>
              ) : null}
              {multi ? (
                <div className="space-y-1.5">
                  <Label className="text-xs">Filled in by</Label>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
                    value={sel.signerRole}
                    onChange={(e) => updateField(sel.key, { signerRole: e.target.value })}
                    aria-label="Filled in by"
                  >
                    {roles.map((r, i) => (<option key={r.key} value={r.key}>{i + 1}. {r.label}</option>))}
                  </select>
                </div>
              ) : null}
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={sel.required} onCheckedChange={(v) => updateField(sel.key, { required: v === true })} /> Required
              </label>
              <p className="text-xs text-muted-foreground">Page {sel.page}</p>
              <Button variant="outline" size="sm" className="w-full text-destructive" onClick={() => removeField(sel.key)}>
                <Trash2 className="h-4 w-4" /> Remove field
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Select a placed field to edit its label, mark it required, or remove it.</p>
          )}
        </div>
      </aside>
    </div>
    </div>
  )
}

function ToolButton({ active, icon: Icon, label, onClick, accent }: { active: boolean; icon: typeof Type; label: string; onClick: () => void; accent?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-auto items-center gap-2 rounded-lg border px-2.5 py-2 text-sm transition lg:w-full lg:border-0 ${
        active ? 'border-primary bg-primary text-primary-foreground' : accent ? 'border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100' : 'border-input hover:bg-muted'
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" /> {label}
    </button>
  )
}

function FieldBox({
  field, dims, selected, onSelect, onChange, colorClass, roleLabel,
}: {
  field: Placed
  dims: PdfPageDims
  selected: boolean
  onSelect: () => void
  onChange: (patch: Partial<Placed>) => void
  colorClass?: string
  roleLabel?: string
}) {
  const drag = useRef<{ mode: 'move' | 'resize'; startX: number; startY: number; ox: number; oy: number; ow: number; oh: number } | null>(null)
  const isSig = field.type === 'signature'

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    const dx = (e.clientX - drag.current.startX) / dims.width
    const dy = (e.clientY - drag.current.startY) / dims.height
    if (drag.current.mode === 'move') {
      onChange({
        x: Math.min(1 - field.w, Math.max(0, drag.current.ox + dx)),
        y: Math.min(1 - field.h, Math.max(0, drag.current.oy + dy)),
      })
    } else {
      onChange({
        w: Math.min(1 - field.x, Math.max(0.04, drag.current.ow + dx)),
        h: Math.min(1 - field.y, Math.max(0.02, drag.current.oh + dy)),
      })
    }
  }
  const start = (mode: 'move' | 'resize') => (e: React.PointerEvent) => {
    e.stopPropagation()
    onSelect()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { mode, startX: e.clientX, startY: e.clientY, ox: field.x, oy: field.y, ow: field.w, oh: field.h }
  }
  const end = (e: React.PointerEvent) => {
    if (drag.current) { try { (e.target as HTMLElement).releasePointerCapture(e.pointerId) } catch {} drag.current = null }
  }

  const Icon = KIND_ICON[isSig ? 'signature' : field.kind] ?? Type
  return (
    <div
      data-field-box
      onPointerDown={start('move')}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      className={`absolute flex select-none items-center gap-1 overflow-hidden rounded border-2 px-1 text-[11px] font-medium ${
        colorClass
          ? colorClass
          : isSig
            ? 'border-teal-500 bg-teal-500/15 text-teal-800'
            : 'border-indigo-500 bg-indigo-500/10 text-indigo-800'
      } ${selected ? 'ring-2 ring-offset-1 ring-primary' : ''}`}
      style={{ left: field.x * dims.width, top: field.y * dims.height, width: field.w * dims.width, height: field.h * dims.height, cursor: 'move' }}
      title={roleLabel ? `${field.label} — ${roleLabel}` : field.label}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate">{field.label}{field.required ? ' *' : ''}</span>
      {/* resize handle */}
      <span
        onPointerDown={start('resize')}
        onPointerMove={onPointerMove}
        onPointerUp={end}
        className="absolute bottom-0 right-0 h-3 w-3 cursor-nwse-resize rounded-sm bg-primary/70"
      />
    </div>
  )
}
