// src/app/api/reports/training/route.ts
//
// Phase 7 — training report. JSON by default; CSV/XLSX export when ?format=csv|xlsx.
// Filters: employeeId, department, moduleId, status — applied by the builder and
// honoured identically for the JSON view and every export, so an exported file is
// exactly what the admin sees on screen.
//
// JSON shape: { data: { rows, summary } } — the summary is the in-memory roll-up
// that drives the dashboard stat cards + per-module breakdown (kept in lockstep
// with the rows). Staff/Admin only (minRole 'hr').
//
// Export headers are label-resolvable by the caller via ?labels= overrides; the
// defaults are sensible, tenant-neutral column names. The Quiz columns are dropped
// from the export when no row in the (filtered) set carries a score, so we never
// ship a permanently-empty column.

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth-middleware'
import {
  buildTrainingReport,
  summarizeTrainingReport,
  type TrainingReportRow,
} from '@/lib/reports/training'
import { buildExport, type ExportColumn, type ExportFormat } from '@/lib/export'

function columns(
  labels: Record<string, string>,
  includeQuiz: boolean,
): ExportColumn<TrainingReportRow>[] {
  const cols: ExportColumn<TrainingReportRow>[] = [
    { header: labels.employee ?? 'Volunteer', value: (r) => r.employee_name },
    { header: labels.employeeNo ?? 'Volunteer ID', value: (r) => r.employee_no },
    { header: labels.department ?? 'Org Unit', value: (r) => r.department },
    { header: labels.module ?? 'Module', value: (r) => r.module_title ?? r.module_id },
    { header: labels.status ?? 'Status', value: (r) => statusLabel(r.status) },
    { header: labels.progress ?? 'Progress %', value: (r) => r.progress_pct },
    { header: labels.lastActivity ?? 'Last Activity', value: (r) => formatDate(r.last_activity) },
    { header: labels.completed ?? 'Completed At', value: (r) => formatDate(r.completed_at) },
  ]
  if (includeQuiz) {
    cols.push(
      { header: labels.quiz ?? 'Quiz Score', value: (r) => r.quiz_score },
      {
        header: labels.quizResult ?? 'Quiz Result',
        value: (r) => (r.quiz_passed == null ? null : r.quiz_passed ? 'Pass' : 'Fail'),
      },
    )
  }
  return cols
}

/** Human-readable status for exports (the raw enum is snake_case). */
function statusLabel(status: string): string {
  switch (status) {
    case 'complete':
      return 'Complete'
    case 'in_progress':
      return 'In progress'
    case 'not_started':
      return 'Not started'
    default:
      return status
  }
}

/** YYYY-MM-DD for spreadsheet-friendly dates; empty string when absent. */
function formatDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

export const GET = withAuth(
  async (req: NextRequest, { companyId }) => {
    const url = new URL(req.url)
    const filters = {
      employeeId: url.searchParams.get('employeeId') ?? undefined,
      department: url.searchParams.get('department') ?? undefined,
      moduleId: url.searchParams.get('moduleId') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
    }
    const rows = await buildTrainingReport(companyId, filters)

    const format = url.searchParams.get('format') as ExportFormat | null
    if (format === 'csv' || format === 'xlsx') {
      let labels: Record<string, string> = {}
      try {
        labels = JSON.parse(url.searchParams.get('labels') ?? '{}') as Record<string, string>
      } catch {
        labels = {}
      }
      const includeQuiz = rows.some((r) => r.quiz_score != null)
      const { body, contentType, filename } = buildExport(
        columns(labels, includeQuiz),
        rows,
        format,
        'training-report',
      )
      return new NextResponse(body, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      })
    }

    return NextResponse.json({ data: { rows, summary: summarizeTrainingReport(rows) } })
  },
  { minRole: 'hr' },
)
