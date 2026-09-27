// Signing order editor (MOS-720), shown above the field designer. The admin lists
// who signs and in what order; each field on the document is then assigned to one
// of these signers. Reorder by dragging a row or with the up/down buttons.
'use client'

import { useRef } from 'react'
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { SignerRole } from '@/types/esign'
import { RECIPIENT_ROLE } from '@/types/esign'
import type { SignerOption } from '@/services/esign-client'

/** Colour per signer, shared with the field boxes on the canvas. */
export const ROLE_COLORS = [
  { box: 'border-teal-500 bg-teal-500/15 text-teal-800', chip: 'bg-teal-100 text-teal-800 border-teal-300' },
  { box: 'border-violet-500 bg-violet-500/15 text-violet-800', chip: 'bg-violet-100 text-violet-800 border-violet-300' },
  { box: 'border-orange-500 bg-orange-500/15 text-orange-800', chip: 'bg-orange-100 text-orange-800 border-orange-300' },
  { box: 'border-sky-500 bg-sky-500/15 text-sky-800', chip: 'bg-sky-100 text-sky-800 border-sky-300' },
  { box: 'border-rose-500 bg-rose-500/15 text-rose-800', chip: 'bg-rose-100 text-rose-800 border-rose-300' },
  { box: 'border-lime-600 bg-lime-500/15 text-lime-800', chip: 'bg-lime-100 text-lime-800 border-lime-300' },
  { box: 'border-amber-500 bg-amber-500/15 text-amber-800', chip: 'bg-amber-100 text-amber-800 border-amber-300' },
  { box: 'border-fuchsia-500 bg-fuchsia-500/15 text-fuchsia-800', chip: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300' },
]

export function roleColor(roles: SignerRole[], key: string) {
  const i = Math.max(0, roles.findIndex((r) => r.key === key))
  return ROLE_COLORS[i % ROLE_COLORS.length]
}

export const DEFAULT_ROLES: SignerRole[] = [{ key: RECIPIENT_ROLE, label: 'Recipient', assignee: { type: 'recipient' } }]

export function SigningOrderPanel({
  roles,
  onChange,
  activeRole,
  onActiveRoleChange,
  people,
  fieldCounts,
}: {
  roles: SignerRole[]
  onChange: (roles: SignerRole[]) => void
  activeRole: string
  onActiveRoleChange: (key: string) => void
  people: SignerOption[]
  fieldCounts: Record<string, number>
}) {
  const dragFrom = useRef<number | null>(null)

  const move = (from: number, to: number) => {
    if (to < 0 || to >= roles.length || from === to) return
    const next = roles.slice()
    const [r] = next.splice(from, 1)
    next.splice(to, 0, r)
    onChange(next)
  }
  const update = (i: number, patch: Partial<SignerRole>) => onChange(roles.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const add = () => {
    let n = roles.length
    let key = `signer_${n}`
    while (roles.some((r) => r.key === key)) key = `signer_${++n}`
    const role: SignerRole = { key, label: 'Authorised Officer', assignee: { type: 'employee', employeeId: '' } }
    // New named signers go first by default — the usual "officer signs first" pattern.
    onChange([role, ...roles])
    onActiveRoleChange(key)
  }
  const remove = (i: number) => {
    const key = roles[i].key
    onChange(roles.filter((_, j) => j !== i))
    if (activeRole === key) onActiveRoleChange(RECIPIENT_ROLE)
  }

  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4 text-muted-foreground" /> Signing order</p>
          <p className="text-xs text-muted-foreground">
            {roles.length > 1
              ? 'Signers sign in this order. Each person is invited when the person before them has signed.'
              : 'Only the person receiving the document signs. Add a signer (e.g. an authorised officer) to require more signatures.'}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={add} disabled={roles.length >= 8}>
          <Plus className="h-4 w-4" /> Add signer
        </Button>
      </div>

      <ol className="space-y-2" aria-label="Signing order">
        {roles.map((r, i) => {
          const c = roleColor(roles, r.key)
          const isRecipient = r.assignee.type === 'recipient'
          const selected = activeRole === r.key
          return (
            <li
              key={r.key}
              draggable
              onDragStart={() => { dragFrom.current = i }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragFrom.current !== null) move(dragFrom.current, i); dragFrom.current = null }}
              className={`flex flex-wrap items-center gap-2 rounded-lg border p-2 ${selected ? 'ring-2 ring-primary/60' : ''}`}
              data-testid={`signer-row-${r.key}`}
            >
              <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" aria-hidden />
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${c.chip}`} aria-label={`Step ${i + 1}`}>{i + 1}</span>
              <Input
                value={r.label}
                maxLength={60}
                onChange={(e) => update(i, { label: e.target.value })}
                className="h-8 w-44"
                aria-label={`Signer ${i + 1} name`}
              />
              {isRecipient ? (
                <span className="text-xs text-muted-foreground">The person receiving the document</span>
              ) : (
                <>
                  <select
                    className="h-8 min-w-[12rem] rounded-md border border-input bg-white px-2 text-sm"
                    value={r.assignee.type === 'employee' ? r.assignee.employeeId : ''}
                    aria-label={`Who signs as ${r.label}`}
                    onChange={(e) => {
                      const p = people.find((x) => x.id === e.target.value)
                      update(i, { assignee: { type: 'employee', employeeId: e.target.value, name: p?.name ?? null } })
                    }}
                  >
                    <option value="">Choose a person…</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}{p.designation ? ` — ${p.designation}` : ''}{p.staff ? '' : ' (volunteer)'}</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground" title="Sign once and the signature is applied to every copy">
                    <input type="checkbox" checked={!!r.signOnce} onChange={(e) => update(i, { signOnce: e.target.checked })} className="h-3.5 w-3.5" />
                    Signs once for all copies
                  </label>
                </>
              )}
              <span className="text-xs text-muted-foreground">{fieldCounts[r.key] ?? 0} field{(fieldCounts[r.key] ?? 0) === 1 ? '' : 's'}</span>
              <div className="ml-auto flex items-center gap-1">
                <Button type="button" size="sm" variant={selected ? 'default' : 'ghost'} onClick={() => onActiveRoleChange(r.key)} className="h-8 text-xs">
                  {selected ? 'Placing fields' : 'Place fields'}
                </Button>
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={`Move ${r.label} up`}>
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => move(i, i + 1)} disabled={i === roles.length - 1} aria-label={`Move ${r.label} down`}>
                  <ArrowDown className="h-4 w-4" />
                </Button>
                {!isRecipient ? (
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove(i)} aria-label={`Remove ${r.label}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
