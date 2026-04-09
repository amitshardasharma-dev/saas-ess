'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { List, Calendar } from 'lucide-react'
import { TeamLeaveEntry } from '@/types/team-calendar'

interface CalendarListProps {
  leaves: TeamLeaveEntry[]
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function CalendarList({ leaves }: CalendarListProps) {
  const sorted = [...leaves].sort((a, b) => a.fromDate.localeCompare(b.fromDate))

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <List className="h-5 w-5 text-primary" />
          Team Absences
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Calendar className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No absences this month</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map(l => (
              <div key={l.id} className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center space-x-3">
                  <div className="w-3 h-8 rounded-full" style={{ backgroundColor: l.leaveTypeColor }} />
                  <div>
                    <p className="font-medium text-sm">{l.employeeName}</p>
                    <p className="text-xs text-muted-foreground">
                      {l.leaveType} · {formatDate(l.fromDate)} — {formatDate(l.toDate)}
                      {l.halfDay && ' (½ day)'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{l.totalDays}d</span>
                  <Badge
                    variant="outline"
                    className={l.status === 'Approved' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}
                  >
                    {l.status === 'Approved' ? 'Approved' : 'Pending'}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
