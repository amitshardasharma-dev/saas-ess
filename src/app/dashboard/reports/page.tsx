'use client'

// Phase 7 — Reports landing: a board-ready overview dashboard (hr+). Pulls live
// data from the compliance register, compliance + training reports and the
// recertification engine into KPIs and a status breakdown, then links to the
// detailed Training and Compliance reports. Styling matches the rest of the app.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  BarChart3, ShieldCheck, FileSpreadsheet, GraduationCap, Users, CalendarClock,
  AlertCircle, RefreshCw, ChevronRight, Loader2,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

function authHeaders(extra: HeadersInit = {}): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('ess_access_token') : null
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) }
}
const getJson = async (path: string) => {
  try {
    const r = await fetch(path, { headers: authHeaders() })
    if (!r.ok) return null
    return await r.json()
  } catch { return null }
}

interface Stats {
  people: number
  compliant: number
  certValid: number
  certExpiring: number
  certExpired: number
  trainTotal: number
  trainComplete: number
  recertOpen: number
}

export default function ReportsPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      const [reg, comp, train, recert] = await Promise.all([
        getJson('/api/compliance/register?scope=all'),
        getJson('/api/reports/compliance'),
        getJson('/api/reports/training'),
        getJson('/api/recertification'),
      ])
      const people = (reg?.people ?? []) as { total: number; pending: number }[]
      const withReqs = people.filter((p) => p.total > 0)
      const certRows = (Array.isArray(comp) ? comp : comp?.data ?? comp?.rows ?? []) as { status: string }[]
      const summary = train?.data?.summary ?? {}
      const recerts = (recert?.data ?? recert?.recertifications ?? []) as { status: string }[]
      setStats({
        people: withReqs.length,
        compliant: withReqs.filter((p) => p.pending === 0).length,
        certValid: certRows.filter((r) => r.status === 'valid').length,
        certExpiring: certRows.filter((r) => r.status === 'expiring').length,
        certExpired: certRows.filter((r) => r.status === 'expired').length,
        trainTotal: Number(summary.total ?? 0),
        trainComplete: Number(summary.completed ?? 0),
        recertOpen: recerts.filter((r) => r.status !== 'completed').length,
      })
      setLoading(false)
    })()
  }, [])

  const compliantPct = useMemo(() => (stats && stats.people > 0 ? Math.round((stats.compliant / stats.people) * 100) : 0), [stats])
  const trainPct = useMemo(() => (stats && stats.trainTotal > 0 ? Math.round((stats.trainComplete / stats.trainTotal) * 100) : 0), [stats])
  const certTotal = stats ? stats.certValid + stats.certExpiring + stats.certExpired : 0

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">Training &amp; compliance at a glance — board-ready, from live data.</p>
      </div>

      {loading ? (
        <Card><CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading overview…</CardContent></Card>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Volunteers compliant" value={`${stats!.compliant}/${stats!.people}`} sub={`${compliantPct}%`} tone="green" Icon={Users} />
            <Kpi label="Certificates expiring soon" value={`${stats!.certExpiring}`} tone="amber" Icon={CalendarClock} />
            <Kpi label="Certificates expired" value={`${stats!.certExpired}`} tone="red" Icon={AlertCircle} />
            <Kpi label="Open recertifications" value={`${stats!.recertOpen}`} tone="blue" Icon={RefreshCw} />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Compliance status breakdown */}
            <Card>
              <CardContent className="space-y-3 py-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><ShieldCheck className="h-4 w-4 text-muted-foreground" /> Certificate status</div>
                <div className="flex h-3 overflow-hidden rounded-full bg-muted">
                  <Seg n={stats!.certValid} total={certTotal} cls="bg-green-500" />
                  <Seg n={stats!.certExpiring} total={certTotal} cls="bg-amber-500" />
                  <Seg n={stats!.certExpired} total={certTotal} cls="bg-red-500" />
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                  <Legend cls="bg-green-500" label="Valid" n={stats!.certValid} />
                  <Legend cls="bg-amber-500" label="Expiring" n={stats!.certExpiring} />
                  <Legend cls="bg-red-500" label="Expired" n={stats!.certExpired} />
                </div>
              </CardContent>
            </Card>

            {/* Training completion */}
            <Card>
              <CardContent className="space-y-3 py-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><GraduationCap className="h-4 w-4 text-muted-foreground" /> Training completion</div>
                <div className="flex items-end justify-between">
                  <div className="text-3xl font-semibold text-foreground">{trainPct}%</div>
                  <div className="text-xs text-muted-foreground">{stats!.trainComplete} of {stats!.trainTotal} assignments complete</div>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${trainPct}%` }} /></div>
              </CardContent>
            </Card>
          </div>

          {/* Detailed reports */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ReportLink href="/dashboard/reports/training" Icon={FileSpreadsheet} title="Training Report" desc="Per-volunteer progress, filters, charts and CSV/Excel export." />
            <ReportLink href="/dashboard/reports/compliance" Icon={BarChart3} title="Compliance Report" desc="Board-ready certificate + recertification status and export." />
          </div>
        </>
      )}
    </div>
  )
}

function Kpi({ label, value, sub, tone, Icon }: { label: string; value: string; sub?: string; tone: 'green' | 'amber' | 'red' | 'blue'; Icon: React.ComponentType<{ className?: string }> }) {
  const cls = tone === 'green' ? 'bg-green-100 text-green-600' : tone === 'amber' ? 'bg-amber-100 text-amber-600' : tone === 'red' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
  return (
    <Card><CardContent className="flex items-center gap-3 py-4">
      <div className={`rounded-lg p-2 ${cls}`}><Icon className="h-5 w-5" /></div>
      <div><div className="text-2xl font-semibold text-foreground">{value}{sub ? <span className="ml-1 text-sm font-normal text-muted-foreground">{sub}</span> : null}</div><div className="text-xs text-muted-foreground">{label}</div></div>
    </CardContent></Card>
  )
}

function Seg({ n, total, cls }: { n: number; total: number; cls: string }) {
  if (!total || !n) return null
  return <div className={cls} style={{ width: `${(n / total) * 100}%` }} />
}
function Legend({ cls, label, n }: { cls: string; label: string; n: number }) {
  return <span className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${cls}`} /> {label} <span className="font-medium text-foreground">{n}</span></span>
}
function ReportLink({ href, Icon, title, desc }: { href: string; Icon: React.ComponentType<{ className?: string }>; title: string; desc: string }) {
  return (
    <Link href={href}>
      <Card className="group transition-colors hover:border-primary/40 hover:bg-muted/30">
        <CardContent className="flex items-start gap-4 py-5">
          <div className="rounded-lg bg-primary/10 p-2.5 text-primary"><Icon className="h-6 w-6" /></div>
          <div className="min-w-0 flex-1">
            <div className="font-medium text-foreground">{title}</div>
            <p className="mt-0.5 text-sm text-muted-foreground">{desc}</p>
          </div>
          <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </CardContent>
      </Card>
    </Link>
  )
}
