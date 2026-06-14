'use client'

// Phase 7 — Board compliance report. Cert status joined with recert state + export.

import { useEffect, useState } from 'react'
import { apiGet, downloadExport } from '@/services/phase7-client'

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

export default function ComplianceReportPage() {
  const [rows, setRows] = useState<Row[]>([])

  useEffect(() => {
    apiGet<Row[]>('/api/reports/compliance').then(setRows).catch(() => setRows([]))
  }, [])

  function exportFile(format: 'csv' | 'xlsx') {
    const p = new URLSearchParams()
    p.set('format', format)
    p.set('labels', JSON.stringify({ employee: 'Volunteer', department: 'Org Unit' }))
    downloadExport(`/api/reports/compliance?${p.toString()}`, `compliance-report.${format === 'xlsx' ? 'xls' : 'csv'}`).catch(
      () => {},
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Compliance Report</h1>
        <div className="flex gap-2">
          <button className="rounded border px-3 py-2 text-sm" onClick={() => exportFile('csv')}>
            Export CSV
          </button>
          <button className="rounded border px-3 py-2 text-sm" onClick={() => exportFile('xlsx')}>
            Export Excel
          </button>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="py-2">Volunteer</th>
            <th>Org Unit</th>
            <th>Certification</th>
            <th>Expiry</th>
            <th>Status</th>
            <th>Recert</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.employee_id}-${i}`} className="border-b">
              <td className="py-2">{r.employee_name}</td>
              <td>{r.department ?? '—'}</td>
              <td>{r.cert_type ?? '—'}</td>
              <td>{r.expiry_date ?? '—'}</td>
              <td>{r.status}</td>
              <td>{r.recert_status ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="text-sm text-gray-500">No certifications recorded.</p>}
    </div>
  )
}
