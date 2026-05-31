// src/app/api/reports/training/route.ts
//
// Phase 7 — training report. JSON by default; CSV/XLSX export when ?format=csv|xlsx.
// Filters: employeeId, department, moduleId, status. Staff/Admin only.
// Export headers are label-resolvable by the caller via ?labels= overrides; defaults
// are sensible, tenant-neutral column names.

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth-middleware'
import { buildTrainingReport, type TrainingReportRow } from '@/lib/reports/training'
import { buildExport, type ExportColumn, type ExportFormat } from '@/lib/export'

function columns(labels: Record<string, string>): ExportColumn<TrainingReportRow>[] {
  return [
    { header: labels.employee ?? 'Volunteer', value: (r) => r.employee_name },
    { header: labels.department ?? 'Org Unit', value: (r) => r.department },
    { header: labels.module ?? 'Module', value: (r) => r.module_title ?? r.module_id },
    { header: labels.status ?? 'Status', value: (r) => r.status },
    { header: labels.progress ?? 'Progress %', value: (r) => r.progress_pct },
    { header: labels.completed ?? 'Completed At', value: (r) => r.completed_at },
    { header: labels.quiz ?? 'Quiz Score', value: (r) => r.quiz_score },
  ]
}

export const GET = withAuth(async (req: NextRequest, { companyId }) => {
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
    const { body, contentType, filename } = buildExport(columns(labels), rows, format, 'training-report')
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  }

  return NextResponse.json({ data: rows })
}, { minRole: 'hr' })
