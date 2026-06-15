'use client'

// Phase 7 — audience targeting control for the composer.
//
// Replaces the old "paste a raw UUID" field with real, populated pickers for each of
// the five target types the server resolver understands (see
// @/lib/communications/resolve-recipients): all / role / org_unit / group / user.
//
// Options come from tenant data the caller already has access to:
//   • roles      → USER_ROLES enum
//   • departments→ derived from /api/people (orgUnit)
//   • individuals→ /api/people
//   • groups     → /api/training/groups
//
// It also renders a live recipient-count PREVIEW computed client-side from the same
// people data (counts that mirror the server resolver). Group membership is resolved
// server-side at send time (no member-list endpoint is exposed), so for groups we show
// the chosen group rather than guess a wrong number — honest and contract-safe.
//
// The control is controlled: the parent owns `{ type, value }` and submits it through
// the unchanged /api/communications contract. We never change server behaviour here.

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Users2, Info } from 'lucide-react'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { authHeaders } from '@/services/phase7-client'
import { AUDIENCE_TYPES, ROLE_OPTIONS, type AudienceType } from '@/lib/communications/targets'

interface Person {
  id: string
  name: string
  role: string
  orgUnit: string | null
  isActive: boolean
}

interface Group {
  id: string
  name: string
}

export interface TargetSelection {
  type: AudienceType
  /** null for 'all'; otherwise the role / department / group id / employee id. */
  value: string | null
}

/** Directory data, lifted so the parent can reuse it (e.g. to label targets later). */
export interface Directory {
  people: Person[]
  groups: Group[]
  departments: string[]
}

export function RecipientTargeting({
  selection,
  onChange,
  onDirectoryLoaded,
}: {
  selection: TargetSelection
  onChange: (next: TargetSelection) => void
  onDirectoryLoaded?: (dir: Directory) => void
}) {
  const [people, setPeople] = useState<Person[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(false)
      try {
        // These two endpoints don't use the { data } envelope (people → { people },
        // groups → { groups }), so we read them directly rather than via apiGet.
        const [pRes, gRes] = await Promise.all([
          fetch('/api/people', { headers: authHeaders() }),
          fetch('/api/training/groups', { headers: authHeaders() }),
        ])
        const peopleJson = pRes.ok ? ((await pRes.json()) as { people?: Person[] }) : { people: [] }
        // Groups require the LMS module; a 4xx here is non-fatal — just no group option.
        const groupsJson = gRes.ok ? ((await gRes.json()) as { groups?: Group[] }) : { groups: [] }
        if (cancelled) return
        const ppl = peopleJson.people ?? []
        const grp = (groupsJson.groups ?? []).map((g) => ({ id: g.id, name: g.name }))
        setPeople(ppl)
        setGroups(grp)
        onDirectoryLoaded?.({
          people: ppl,
          groups: grp,
          departments: deriveDepartments(ppl),
        })
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
    // onDirectoryLoaded is intentionally excluded; parents pass a stable callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const departments = useMemo(() => deriveDepartments(people), [people])
  const activePeople = useMemo(() => people.filter((p) => p.isActive), [people])

  const meta = AUDIENCE_TYPES.find((a) => a.type === selection.type) ?? AUDIENCE_TYPES[0]

  // Live count preview — mirrors the server resolver for the countable types.
  const preview = useMemo(
    () => previewCount(selection, activePeople),
    [selection, activePeople],
  )

  const setType = (type: AudienceType) => {
    // Reset the value whenever the type changes ('all' carries no value).
    onChange({ type, value: type === 'all' ? null : '' })
  }
  const setValue = (value: string) => onChange({ ...selection, value })

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Audience type */}
        <div className="space-y-1.5">
          <Label className="text-sm">Audience</Label>
          <Select value={selection.type} onValueChange={(v) => setType(v as AudienceType)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AUDIENCE_TYPES.map((a) => {
                const Icon = a.icon
                return (
                  <SelectItem key={a.type} value={a.type}>
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    {a.label}
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </div>

        {/* Value picker (hidden for 'all') */}
        {meta.needsValue ? (
          <div className="space-y-1.5">
            <Label className="text-sm">{valueLabel(selection.type)}</Label>
            {loading ? (
              <div className="flex h-9 items-center gap-2 rounded-md border border-dashed px-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading options…
              </div>
            ) : (
              <ValuePicker
                type={selection.type}
                value={selection.value ?? ''}
                onValueChange={setValue}
                departments={departments}
                people={activePeople}
                groups={groups}
              />
            )}
          </div>
        ) : (
          <div className="hidden sm:block" aria-hidden />
        )}
      </div>

      {/* Hint + recipient-count preview */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2.5">
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0" />
          {meta.hint}
        </p>
        <RecipientCount loading={loading} error={error} preview={preview} type={selection.type} hasValue={!!selection.value} />
      </div>
    </div>
  )
}

/* ---------- value pickers ---------- */

function ValuePicker({
  type, value, onValueChange, departments, people, groups,
}: {
  type: AudienceType
  value: string
  onValueChange: (v: string) => void
  departments: string[]
  people: Person[]
  groups: Group[]
}) {
  if (type === 'role') {
    return (
      <Picker value={value} onValueChange={onValueChange} placeholder="Choose a role"
        options={ROLE_OPTIONS.map((r) => ({ value: r.value, label: r.label }))} />
    )
  }
  if (type === 'org_unit') {
    return departments.length > 0 ? (
      <Picker value={value} onValueChange={onValueChange} placeholder="Choose a department"
        options={departments.map((d) => ({ value: d, label: d }))} />
    ) : (
      <EmptyPicker text="No departments found yet." />
    )
  }
  if (type === 'group') {
    return groups.length > 0 ? (
      <Picker value={value} onValueChange={onValueChange} placeholder="Choose a group"
        options={groups.map((g) => ({ value: g.id, label: g.name }))} />
    ) : (
      <EmptyPicker text="No saved groups available." />
    )
  }
  // user
  return people.length > 0 ? (
    <Picker value={value} onValueChange={onValueChange} placeholder="Choose a person"
      options={people
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((p) => ({ value: p.id, label: p.orgUnit ? `${p.name} · ${p.orgUnit}` : p.name }))} />
  ) : (
    <EmptyPicker text="No people found." />
  )
}

function Picker({
  value, onValueChange, placeholder, options,
}: {
  value: string
  onValueChange: (v: string) => void
  placeholder: string
  options: { value: string; label: string }[]
}) {
  return (
    <Select value={value || undefined} onValueChange={onValueChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function EmptyPicker({ text }: { text: string }) {
  return (
    <div className="flex h-9 items-center rounded-md border border-dashed bg-muted/40 px-3 text-sm text-muted-foreground">
      {text}
    </div>
  )
}

/* ---------- recipient count chip ---------- */

function RecipientCount({
  loading, error, preview, type, hasValue,
}: {
  loading: boolean
  error: boolean
  preview: number | null
  type: AudienceType
  hasValue: boolean
}) {
  if (loading) {
    return <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Counting…</span>
  }
  if (error) {
    return <span className="text-xs text-muted-foreground">Recipients resolved on send</span>
  }
  // Groups: membership is resolved server-side; show that rather than a wrong count.
  if (type === 'group') {
    return (
      <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        <Users2 className="h-3.5 w-3.5 text-muted-foreground" />
        {hasValue ? 'Group members (resolved on send)' : 'Select a group'}
      </span>
    )
  }
  if (preview === null) {
    return <span className="text-xs text-muted-foreground">Select an audience</span>
  }
  return (
    <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
      <Users2 className="h-3.5 w-3.5 text-muted-foreground" />
      {preview} recipient{preview === 1 ? '' : 's'}
    </span>
  )
}

/* ---------- helpers ---------- */

function deriveDepartments(people: Person[]): string[] {
  const set = new Set<string>()
  for (const p of people) {
    const d = (p.orgUnit ?? '').trim()
    if (d) set.add(d)
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b))
}

function valueLabel(type: AudienceType): string {
  switch (type) {
    case 'role': return 'Role'
    case 'org_unit': return 'Department'
    case 'group': return 'Group'
    case 'user': return 'Person'
    default: return 'Value'
  }
}

/**
 * Client-side preview of how many active people a target resolves to. Mirrors the
 * server resolver for the deterministic types. Returns null when nothing is selected
 * yet, and is intentionally not computed for 'group' (handled by the caller).
 */
function previewCount(selection: TargetSelection, activePeople: Person[]): number | null {
  switch (selection.type) {
    case 'all':
      return activePeople.length
    case 'role':
      return selection.value ? activePeople.filter((p) => p.role === selection.value).length : null
    case 'org_unit':
      return selection.value ? activePeople.filter((p) => (p.orgUnit ?? '') === selection.value).length : null
    case 'user':
      return selection.value ? 1 : null
    case 'group':
    default:
      return null
  }
}
