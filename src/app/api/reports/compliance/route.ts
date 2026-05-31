// src/app/api/reports/compliance/route.ts
//
// Phase 7 — Board compliance report combining cert status + recert state. JSON by
// default; CSV/XLSX when ?format=csv|xlsx. Staff/Admin only.

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth-middleware'
import { buildComplianceReport, type ComplianceReportRow } from '@/lib/reports/training'
import { buildExport, type ExportColumn, type ExportFormat } from '@/lib/export'

function columns(labels: Record<string, string>): ExportColumn<ComplianceReportRow>[] {
  return [
    { header: labels.employee ?? 'Volunteer', value: (r) => r.employee_name },
    { header: labels.department ?? 'Org Unit', value: (r) => r.department },
    { header: labels.cert ?? 'Certification', value: (r) => r.cert_type },
    { header: labels.expiry ?? 'Expiry Date', value: (r) => r.expiry_date },
    { header: labels.status ?? 'Status', value: (r) => r.status },
    { header: labels.recert ?? 'Recert Status', value: (r) => r.recert_status },
    { header: labels.recertDone ?? 'Recert Completed', value: (r) => r.recert_completed_at },
  ]
}

export const GET = withAuth(async (req: NextRequest, { companyId }) => {
  const rows = await buildComplianceReport(companyId)
  const url = new URL(req.url)
  const format = url.searchParams.get('format') as ExportFormat | null
  if (format === 'csv' || format === 'xlsx') {
    let labels: Record<string, string> = {}
    try {
      labels = JSON.parse(url.searchParams.get('labels') ?? '{}') as Record<string, string>
    } catch {
      labels = {}
    }
    const { body, contentType, filename } = buildExport(columns(labels), rows, format, 'compliance-report')
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
