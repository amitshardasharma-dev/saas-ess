// /dashboard/compliance — Staff/Admin compliance dashboard with green/amber/red
// indicators. Expiring + overdue are surfaced at the top. Entity names are
// label-driven via useLabels. Client Component (mirrors other dashboard pages:
// bearer token from localStorage, fetch the API). Access is enforced server-side
// (scope=all requires hr+); a 403 renders a friendly message.
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useLabels } from '@/hooks/use-labels'
import { calcStatus, daysUntil, type CertStatus } from '@/lib/compliance/expiry'
import { CertBadge } from '@/components/compliance/cert-badge'

interface Row {
  id: string
  employee_name: string | null
  cert_type_name: string | null
  title: string
  expiry_date: string | null
  status: CertStatus
  days_until_expiry: number | null
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'forbidden' }
  | { kind: 'error' }
  | { kind: 'ok'; rows: Row[] }

function rank(status: CertStatus): number {
  return status === 'expired' ? 0 : status === 'expiring' ? 1 : 2
}

export default function ComplianceDashboardPage() {
  const { t } = useLabels()
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  useEffect(() => {
    let active = true
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('ess_access_token') : null

    fetch('/api/certifications?scope=all', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async (res) => {
        if (!active) return
        if (res.status === 403) {
          setState({ kind: 'forbidden' })
          return
        }
        if (!res.ok) {
          setState({ kind: 'error' })
          return
        }
        const data = await res.json()
        const rows: Row[] = (data.certifications || []).map((c: Record<string, unknown>) => {
          const expiry = (c.expiry_date as string | null) ?? null
          const status = (c.status as CertStatus) ?? calcStatus(expiry)
          return {
            id: c.id as string,
            employee_name: (c.employee_name as string | null) ?? null,
            cert_type_name: (c.cert_type_name as string | null) ?? null,
            title: (c.title as string) ?? '',
            expiry_date: expiry,
            status,
            days_until_expiry: (c.days_until_expiry as number | null) ?? daysUntil(expiry),
          }
        })
        setState({ kind: 'ok', rows })
      })
      .catch(() => {
        if (active) setState({ kind: 'error' })
      })

    return () => {
      active = false
    }
  }, [])

  const sorted = useMemo(() => {
    if (state.kind !== 'ok') return []
    return [...state.rows].sort((a, b) => {
      if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status)
      const da = a.days_until_expiry ?? Number.POSITIVE_INFINITY
      const db = b.days_until_expiry ?? Number.POSITIVE_INFINITY
      return da - db
    })
  }, [state])

  const counts = useMemo(() => {
    if (state.kind !== 'ok') return { expired: 0, expiring: 0, valid: 0 }
    return {
      expired: state.rows.filter((r) => r.status === 'expired').length,
      expiring: state.rows.filter((r) => r.status === 'expiring').length,
      valid: state.rows.filter((r) => r.status === 'valid').length,
    }
  }, [state])

  if (state.kind === 'loading') {
    return <main style={{ padding: 24 }}>Loading…</main>
  }
  if (state.kind === 'forbidden') {
    return <main style={{ padding: 24 }}>You do not have access to the compliance dashboard.</main>
  }
  if (state.kind === 'error') {
    return <main style={{ padding: 24 }}>Could not load compliance data.</main>
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Compliance</h1>
      <section style={{ display: 'flex', gap: 16, margin: '16px 0' }}>
        <SummaryCard label="Overdue" value={counts.expired} color="#991b1b" />
        <SummaryCard label="Expiring Soon" value={counts.expiring} color="#854d0e" />
        <SummaryCard label="Valid" value={counts.valid} color="#166534" />
      </section>

      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={cellStyle}>{t('person')}</th>
            <th style={cellStyle}>{t('certification')}</th>
            <th style={cellStyle}>Expiry</th>
            <th style={cellStyle}>Status</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.id}>
              <td style={cellStyle}>{row.employee_name ?? '—'}</td>
              <td style={cellStyle}>{row.cert_type_name ?? row.title}</td>
              <td style={cellStyle}>{row.expiry_date ?? '—'}</td>
              <td style={cellStyle}>
                <CertBadge status={row.status} />
              </td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td style={cellStyle} colSpan={4}>
                No {t('certification', { plural: true }).toLowerCase()} found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  )
}

const cellStyle: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  padding: '8px 12px',
  textAlign: 'left',
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, minWidth: 120 }}>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 13, color: '#6b7280' }}>{label}</div>
    </div>
  )
}
