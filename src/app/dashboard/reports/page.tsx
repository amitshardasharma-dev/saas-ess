'use client'

// Phase 7 — Reports landing.

import Link from 'next/link'

export default function ReportsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Reports</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Link href="/dashboard/reports/training" className="rounded border p-5 hover:bg-gray-50">
          <h2 className="font-medium">Training Report</h2>
          <p className="text-sm text-gray-500">Volunteer progress, filters, CSV/Excel export.</p>
        </Link>
        <Link href="/dashboard/reports/compliance" className="rounded border p-5 hover:bg-gray-50">
          <h2 className="font-medium">Compliance Report</h2>
          <p className="text-sm text-gray-500">Board-ready cert + recert status export.</p>
        </Link>
      </div>
    </div>
  )
}
