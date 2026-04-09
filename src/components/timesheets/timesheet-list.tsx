// src/components/timesheets/timesheet-list.tsx

'use client'

import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Timer, CheckCircle, XCircle, Clock, Send } from 'lucide-react'
import { Timesheet } from '@/types/timesheet'

interface TimesheetListProps {
  timesheets: Timesheet[]
  title?: string
  showEmployee?: boolean
  maxItems?: number
}

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  Draft: { label: 'Draft', color: 'bg-gray-100 text-gray-800', icon: Clock },
  Submitted: { label: 'Submitted', color: 'bg-amber-100 text-amber-800', icon: Send },
  Approved: { label: 'Approved', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  Rejected: { label: 'Rejected', color: 'bg-red-100 text-red-800', icon: XCircle },
  'Revision Requested': { label: 'Revision', color: 'bg-orange-100 text-orange-800', icon: Clock },
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function TimesheetList({ timesheets, title = 'My Timesheets', showEmployee = false, maxItems }: TimesheetListProps) {
  const router = useRouter()
  const items = maxItems ? timesheets.slice(0, maxItems) : timesheets

  return (
    <Card className="flowing-card">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Timer className="h-5 w-5 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Timer className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No timesheets found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map(ts => {
              const status = statusConfig[ts.status] || statusConfig.Draft
              const StatusIcon = status.icon
              return (
                <div
                  key={ts.id}
                  onClick={() => router.push(`/dashboard/timesheets/${ts.id}`)}
                  className="flex items-center justify-between p-3 rounded-xl border border-border/50 hover:bg-accent/50 cursor-pointer transition-all"
                >
                  <div className="flex items-center space-x-3">
                    <StatusIcon className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">{ts.display_id}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(ts.period_start)} — {formatDate(ts.period_end)}
                        {showEmployee && ts.employee_name && ` · ${ts.employee_name}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-semibold">{ts.total_hours}h</span>
                    <Badge variant="outline" className={`text-xs ${status.color}`}>
                      {status.label}
                    </Badge>
                  </div>
                </div>
              )
            })}
            {maxItems && timesheets.length > maxItems && (
              <button
                onClick={() => router.push('/dashboard/timesheets')}
                className="w-full text-center text-sm text-primary hover:underline py-2"
              >
                View all {timesheets.length} timesheets
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
