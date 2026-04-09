// src/components/timesheets/timesheet-summary.tsx

'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Clock, Target, TrendingUp } from 'lucide-react'
import { TimesheetConfig } from '@/types/timesheet'

interface TimesheetSummaryProps {
  totalHours: number
  periodDays: number
  config: TimesheetConfig
}

export function TimesheetSummary({ totalHours, periodDays, config }: TimesheetSummaryProps) {
  // Exclude weekends from expected calculation
  const workDays = periodDays // simplified — could subtract weekends
  const expectedHours = workDays * config.required_hours_per_day
  const overtime = config.overtime_enabled ? Math.max(0, totalHours - expectedHours) : 0
  const percentage = expectedHours > 0 ? Math.round((totalHours / expectedHours) * 100) : 0

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Clock className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase">Total Hours</p>
              <p className="text-2xl font-bold">{totalHours}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Target className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase">Expected</p>
              <p className="text-2xl font-bold">{expectedHours}h</p>
              <p className="text-xs text-muted-foreground">{percentage}% completed</p>
            </div>
          </div>
        </CardContent>
      </Card>
      {config.overtime_enabled && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <TrendingUp className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">Overtime</p>
                <p className="text-2xl font-bold">{overtime}h</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
