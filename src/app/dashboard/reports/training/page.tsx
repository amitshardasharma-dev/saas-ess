'use client'

// Phase 7 — Training report dashboard. Filters (department/module/status) + a simple
// completion bar chart (Recharts) + CSV/Excel export with label-resolved headers.

import { useEffect, useMemo, useState } from 'react'
import { apiGet, downloadExport } from '@/services/phase7-client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

interface Row {
  employee_id: string
  employee_name: string
  department: string | null
  module_id: string | null
  module_title: string | null
  status: string
  progress_pct: number | null
  completed_at: string | null
  quiz_score: number | null
}

export default function TrainingReportPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [department, setDepartment] = useState('')
  const [status, setStatus] = useState('')

  function query(): string {
    const p = new URLSearchParams()
    if (department) p.set('department', department)
    if (status) p.set('status', status)
    return p.toString()
  }

  async function load() {
    const qs = query()
    try {
      setRows(await apiGet<Row[]>(`/api/reports/training${qs ? `?${qs}` : ''}`))
    } catch {
      setRows([])
    }
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [department, status])

  const chartData = useMemo(() => {
    const buckets: Record<string, number> = {}
    for (const r of rows) buckets[r.status] = (buckets[r.status] ?? 0) + 1
    return Object.entries(buckets).map(([name, count]) => ({ name, count }))
  }, [rows])

  function exportFile(format: 'csv' | 'xlsx') {
    const p = new URLSearchParams(query())
    p.set('format', format)
    // Pass tenant labels through so headers are resolved (caller-provided defaults).
    p.set('labels', JSON.stringify({ employee: 'Volunteer', department: 'Org Unit' }))
    downloadExport(`/api/reports/training?${p.toString()}`, `training-report.${format === 'xlsx' ? 'xls' : 'csv'}`).catch(
      () => {},
    )
  }

  const departments = Array.from(new Set(rows.map((r) => r.department).filter(Boolean))) as string[]
  const statuses = Array.from(new Set(rows.map((r) => r.status)))

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Training Report</h1>
        <div className="flex gap-2">
          <button className="rounded border px-3 py-2 text-sm" onClick={() => exportFile('csv')}>
            Export CSV
          </button>
          <button className="rounded border px-3 py-2 text-sm" onClick={() => exportFile('xlsx')}>
            Export Excel
          </button>
        </div>
      </div>

      <div className="flex gap-4">
        <select className="rounded border px-3 py-2 text-sm" value={department} onChange={(e) => setDepartment(e.target.value)}>
          <option value="">All org units</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select className="rounded border px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="h-64 w-full rounded border p-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <XAxis dataKey="name" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="count" fill="#2563eb" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="py-2">Volunteer</th>
            <th>Org Unit</th>
            <th>Module</th>
            <th>Status</th>
            <th>Progress</th>
            <th>Quiz</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.employee_id}-${r.module_id}-${i}`} className="border-b">
              <td className="py-2">{r.employee_name}</td>
              <td>{r.department ?? '—'}</td>
              <td>{r.module_title ?? r.module_id ?? '—'}</td>
              <td>{r.status}</td>
              <td>{r.progress_pct != null ? `${r.progress_pct}%` : '—'}</td>
              <td>{r.quiz_score != null ? r.quiz_score : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="text-sm text-gray-500">No data for the selected filters.</p>}
    </div>
  )
}
