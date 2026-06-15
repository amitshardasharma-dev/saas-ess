// Organisation compliance overview (hr+): every person's required certificates
// + trainings at a glance — who's complete, who has outstanding items — with an
// expandable per-person breakdown and a CSV export.
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Loader2, AlertCircle, Users, CheckCircle2, CircleAlert, Download, ChevronDown, ChevronRight,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { PersonCompliance, ItemColor } from '@/lib/compliance/register'

function authHeaders(extra: HeadersInit = {}): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('ess_access_token') : null
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) }
}

const TIER: Record<string, string> = { employee: 'Volunteer', manager: 'Staff', hr: 'Staff', admin: 'Admin' }
const CHIP: Record<ItemColor, string> = {
  green: 'bg-green-100 text-green-800 hover:bg-green-100',
  amber: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
  red: 'bg-red-100 text-red-800 hover:bg-red-100',
}

export function RegisterOrg() {
  const [people, setPeople] = useState<PersonCompliance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch('/api/compliance/register?scope=all', { headers: authHeaders() })
      if (!res.ok) throw new Error('load failed')
      const data = await res.json()
      setPeople((data.people ?? []) as PersonCompliance[])
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const counts = useMemo(() => {
    const withReqs = people.filter((p) => p.total > 0)
    return {
      people: withReqs.length,
      compliant: withReqs.filter((p) => p.pending === 0).length,
      outstanding: withReqs.filter((p) => p.pending > 0).length,
    }
  }, [people])

  const downloadCsv = async () => {
    setDownloading(true)
    try {
      const res = await fetch('/api/compliance/register/export', { headers: authHeaders() })
      if (!res.ok) throw new Error('export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'compliance-register.csv'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      // best-effort
    } finally {
      setDownloading(false)
    }
  }

  if (loading) return <Card><CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading organisation compliance…</CardContent></Card>
  if (error) return <Card><CardContent className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground"><AlertCircle className="h-10 w-10 opacity-30" /> Could not load compliance data.</CardContent></Card>

  const rows = people.filter((p) => p.total > 0)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="People with requirements" value={counts.people} tone="blue" Icon={Users} />
        <Stat label="Fully compliant" value={counts.compliant} tone="green" Icon={CheckCircle2} />
        <Stat label="Outstanding" value={counts.outstanding} tone="red" Icon={CircleAlert} />
      </div>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => void downloadCsv()} disabled={downloading || rows.length === 0}>
          {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download CSV
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">No one has compliance requirements yet. Add some under “Requirements”.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Person</th>
                    <th className="px-4 py-3 font-medium">Certificates</th>
                    <th className="px-4 py-3 font-medium">Trainings</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => {
                    const certDone = p.certificates.filter((c) => c.color === 'green').length
                    const trainDone = p.trainings.filter((t) => t.color === 'green').length
                    const expanded = open === p.employee_id
                    return (
                      <ExpandableRow
                        key={p.employee_id}
                        person={p}
                        certDone={certDone}
                        trainDone={trainDone}
                        expanded={expanded}
                        onToggle={() => setOpen(expanded ? null : p.employee_id)}
                      />
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ExpandableRow({ person, certDone, trainDone, expanded, onToggle }: {
  person: PersonCompliance; certDone: number; trainDone: number; expanded: boolean; onToggle: () => void
}) {
  return (
    <>
      <tr className="border-b cursor-pointer hover:bg-muted/40" onClick={onToggle}>
        <td className="px-4 py-3">
          <div className="font-medium text-foreground">{person.name ?? '—'}</div>
          <div className="text-xs text-muted-foreground">{TIER[person.role] ?? person.role}</div>
        </td>
        <td className="px-4 py-3 text-muted-foreground">{certDone}/{person.certificates.length}</td>
        <td className="px-4 py-3 text-muted-foreground">{trainDone}/{person.trainings.length}</td>
        <td className="px-4 py-3">
          {person.pending === 0
            ? <Badge variant="secondary" className={CHIP.green}>Compliant</Badge>
            : <Badge variant="secondary" className={CHIP.red}>{person.pending} pending</Badge>}
        </td>
        <td className="px-4 py-3 text-right text-muted-foreground">{expanded ? <ChevronDown className="ml-auto h-4 w-4" /> : <ChevronRight className="ml-auto h-4 w-4" />}</td>
      </tr>
      {expanded ? (
        <tr className="border-b bg-muted/20">
          <td colSpan={5} className="px-4 py-3">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <DetailList title="Certificates" items={person.certificates.map((c) => ({ name: c.name, color: c.color, label: c.label }))} />
              <DetailList title="Trainings" items={person.trainings.map((t) => ({ name: t.title, color: t.color, label: t.label }))} />
            </div>
          </td>
        </tr>
      ) : null}
    </>
  )
}

function DetailList({ title, items }: { title: string; items: { name: string; color: ItemColor; label: string }[] }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      {items.length === 0 ? (
        <div className="text-xs text-muted-foreground">None required.</div>
      ) : (
        <ul className="space-y-1">
          {items.map((it, i) => (
            <li key={i} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${it.color === 'green' ? 'bg-green-500' : it.color === 'amber' ? 'bg-amber-500' : 'bg-red-500'}`} />
                <span className="truncate text-foreground">{it.name}</span>
              </span>
              <Badge variant="secondary" className={CHIP[it.color]}>{it.label}</Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Stat({ label, value, tone, Icon }: { label: string; value: number; tone: 'blue' | 'green' | 'red'; Icon: React.ComponentType<{ className?: string }> }) {
  const cls = tone === 'green' ? 'bg-green-100 text-green-600' : tone === 'red' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
  return (
    <Card><CardContent className="flex items-center gap-3 py-4">
      <div className={`rounded-lg p-2 ${cls}`}><Icon className="h-5 w-5" /></div>
      <div><div className="text-2xl font-semibold text-foreground">{value}</div><div className="text-xs text-muted-foreground">{label}</div></div>
    </CardContent></Card>
  )
}
