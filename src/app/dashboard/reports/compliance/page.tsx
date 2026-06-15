'use client'

// Phase 7 — Board compliance report (hr+). Certification status joined with
// recertification state, with summary KPIs, status filtering/search, and
// CSV/Excel export. Styling matches the register + training report: max-w-6xl
// shell, Card/Badge/Button primitives, neutral tokens, real states.

import { useEffect, useMemo, useState } from 'react'
import {
  ShieldCheck, AlertCircle, CalendarClock, CheckCircle2, Loader2, Download, Search, RefreshCw,
} from 'lucide-react'
import { apiGet, downloadExport } from '@/services/phase7-client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'

interface Row {
  employee_id: string
  employee_name: string
  department: string | null
  cert_type: string | null
  expiry_date: string | null
  status: string
  recert_status: string | null
  recert_completed_at: string | null
}

type Filter = 'all' | 'valid' | 'expiring' | 'expired'

const STATUS_CHIP: Record<string, string> = {
  valid: 'bg-green-100 text-green-800 hover:bg-green-100',
  expiring: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
  expired: 'bg-red-100 text-red-800 hover:bg-red-100',
  pending: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
}
const RECERT_CHIP: Record<string, string> = {
  assigned: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
  in_progress: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
  completed: 'bg-green-100 text-green-800 hover:bg-green-100',
}

export default function ComplianceReportPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')

  const load = () => {
    setLoading(true)
    setError(false)
    apiGet<Row[]>('/api/reports/compliance')
      .then((r) => setRows(r ?? []))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const counts = useMemo(() => ({
    total: rows.length,
    valid: rows.filter((r) => r.status === 'valid').length,
    expiring: rows.filter((r) => r.status === 'expiring').length,
    expired: rows.filter((r) => r.status === 'expired').length,
    inRecert: rows.filter((r) => r.recert_status && r.recert_status !== 'completed').length,
  }), [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const rank = (s: string) => (s === 'expired' ? 0 : s === 'expiring' ? 1 : 2)
    return rows
      .filter((r) => (filter === 'all' ? true : r.status === filter))
      .filter((r) => !q || `${r.employee_name} ${r.cert_type ?? ''} ${r.department ?? ''}`.toLowerCase().includes(q))
      .sort((a, b) => rank(a.status) - rank(b.status) || a.employee_name.localeCompare(b.employee_name))
  }, [rows, filter, search])

  function exportFile(format: 'csv' | 'xlsx') {
    const p = new URLSearchParams()
    p.set('format', format)
    p.set('labels', JSON.stringify({ employee: 'Volunteer', department: 'Org Unit' }))
    downloadExport(`/api/reports/compliance?${p.toString()}`, `compliance-report.${format === 'xlsx' ? 'xls' : 'csv'}`).catch(() => {})
  }

  const compliantPct = counts.total > 0 ? Math.round((counts.valid / counts.total) * 100) : 0

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Compliance Report</h1>
          <p className="mt-1 text-sm text-muted-foreground">Board-ready certification &amp; recertification status across the organisation.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</Button>
          <Button variant="outline" size="sm" onClick={() => exportFile('csv')} disabled={!rows.length}><Download className="h-4 w-4" /> CSV</Button>
          <Button variant="outline" size="sm" onClick={() => exportFile('xlsx')} disabled={!rows.length}><Download className="h-4 w-4" /> Excel</Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Certificates valid" value={`${counts.valid}`} sub={`${compliantPct}% of ${counts.total}`} tone="green" Icon={CheckCircle2} />
        <Kpi label="Expiring soon" value={`${counts.expiring}`} tone="amber" Icon={CalendarClock} />
        <Kpi label="Expired" value={`${counts.expired}`} tone="red" Icon={AlertCircle} />
        <Kpi label="In recertification" value={`${counts.inRecert}`} tone="blue" Icon={RefreshCw} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'valid', 'expiring', 'expired'] as Filter[]).map((f) => (
          <Badge key={f} variant={filter === f ? 'default' : 'outline'} className="cursor-pointer capitalize" onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : f}
          </Badge>
        ))}
        <div className="relative ml-auto w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search volunteer or certificate…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 pl-9" />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading compliance data…</div>
          ) : error ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground"><AlertCircle className="h-10 w-10 opacity-30" /> Could not load the report.</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground"><ShieldCheck className="h-10 w-10 opacity-30" /> {rows.length === 0 ? 'No certifications recorded.' : 'No certificates match.'}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Volunteer</th>
                    <th className="px-4 py-3 font-medium">Certification</th>
                    <th className="px-4 py-3 font-medium">Expiry</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Recertification</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => (
                    <tr key={`${r.employee_id}-${i}`} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{r.employee_name}</div>
                        <div className="text-xs text-muted-foreground">{r.department ?? '—'}</div>
                      </td>
                      <td className="px-4 py-3 text-foreground">{r.cert_type ?? '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtDate(r.expiry_date)}</td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary" className={STATUS_CHIP[r.status] ?? 'bg-muted text-muted-foreground'}>{cap(r.status)}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        {r.recert_status
                          ? <Badge variant="secondary" className={RECERT_CHIP[r.recert_status] ?? 'bg-muted text-muted-foreground'}>{labelRecert(r.recert_status)}</Badge>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Kpi({ label, value, sub, tone, Icon }: { label: string; value: string; sub?: string; tone: 'green' | 'amber' | 'red' | 'blue'; Icon: React.ComponentType<{ className?: string }> }) {
  const cls = tone === 'green' ? 'bg-green-100 text-green-600' : tone === 'amber' ? 'bg-amber-100 text-amber-600' : tone === 'red' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
  return (
    <Card><CardContent className="flex items-center gap-3 py-4">
      <div className={`rounded-lg p-2 ${cls}`}><Icon className="h-5 w-5" /></div>
      <div><div className="text-2xl font-semibold text-foreground">{value}</div><div className="text-xs text-muted-foreground">{label}{sub ? ` · ${sub}` : ''}</div></div>
    </CardContent></Card>
  )
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso.slice(0, 10) + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}
function cap(s: string): string { return s ? s[0].toUpperCase() + s.slice(1) : s }
function labelRecert(s: string): string { return s === 'in_progress' ? 'In progress' : cap(s) }
