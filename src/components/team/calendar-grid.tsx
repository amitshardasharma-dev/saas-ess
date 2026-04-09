'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { TeamLeaveEntry } from '@/types/team-calendar'

interface CalendarGridProps {
  leaves: TeamLeaveEntry[]
  employees: Array<{ id: string; name: string }>
  year: number
  month: number
  onMonthChange: (year: number, month: number) => void
}

export function CalendarGrid({ leaves, employees, year, month, onMonthChange }: CalendarGridProps) {
  const [hoveredCell, setHoveredCell] = useState<string | null>(null)

  const daysInMonth = new Date(year, month, 0).getDate()
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  const monthName = new Date(year, month - 1).toLocaleDateString('en', { month: 'long', year: 'numeric' })

  const prevMonth = () => {
    const m = month === 1 ? 12 : month - 1
    const y = month === 1 ? year - 1 : year
    onMonthChange(y, m)
  }

  const nextMonth = () => {
    const m = month === 12 ? 1 : month + 1
    const y = month === 12 ? year + 1 : year
    onMonthChange(y, m)
  }

  const getLeaveForCell = (employeeId: string, day: number) => {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return leaves.filter(l => l.employeeId === employeeId && dateStr >= l.fromDate && dateStr <= l.toDate)
  }

  const isWeekend = (day: number) => {
    const d = new Date(year, month - 1, day)
    return d.getDay() === 0 || d.getDay() === 6
  }

  // Collect unique leave types for legend
  const leaveTypes = new Map<string, string>()
  leaves.forEach(l => leaveTypes.set(l.leaveType, l.leaveTypeColor))

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarDays className="h-5 w-5 text-primary" />
            Team Leave Calendar
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={prevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-semibold text-sm min-w-[140px] text-center">{monthName}</span>
            <Button variant="outline" size="sm" onClick={nextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {/* Legend */}
        <div className="flex flex-wrap gap-3 mt-2">
          {Array.from(leaveTypes.entries()).map(([type, color]) => (
            <div key={type} className="flex items-center gap-1 text-xs">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: color }} />
              <span className="text-muted-foreground">{type}</span>
            </div>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                <th className="text-left py-2 px-2 sticky left-0 bg-background z-10 min-w-[120px] border-b">Employee</th>
                {days.map(d => (
                  <th
                    key={d}
                    className={`text-center py-2 px-0.5 min-w-[28px] border-b ${isWeekend(d) ? 'bg-muted/50' : ''}`}
                  >
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(year, month - 1, d).toLocaleDateString('en', { weekday: 'narrow' })}
                    </div>
                    <div>{d}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => (
                <tr key={emp.id} className="border-b last:border-0">
                  <td className="py-1.5 px-2 sticky left-0 bg-background z-10 font-medium truncate max-w-[120px]" title={emp.name}>
                    {emp.name}
                  </td>
                  {days.map(d => {
                    const cellLeaves = getLeaveForCell(emp.id, d)
                    const cellKey = `${emp.id}-${d}`
                    return (
                      <td
                        key={d}
                        className={`py-1.5 px-0.5 text-center relative ${isWeekend(d) ? 'bg-muted/50' : ''}`}
                        onMouseEnter={() => setHoveredCell(cellLeaves.length > 0 ? cellKey : null)}
                        onMouseLeave={() => setHoveredCell(null)}
                      >
                        {cellLeaves.length > 0 && (
                          <div className="flex flex-col gap-0.5 items-center">
                            {cellLeaves.map((l, i) => (
                              <div
                                key={i}
                                className={`w-5 rounded-sm ${l.halfDay ? 'h-1.5' : 'h-3'} ${l.status === 'Pending Approval' ? 'opacity-50' : ''}`}
                                style={{ backgroundColor: l.leaveTypeColor }}
                                title={`${l.employeeName}: ${l.leaveType} (${l.status})`}
                              />
                            ))}
                          </div>
                        )}
                        {/* Tooltip */}
                        {hoveredCell === cellKey && cellLeaves.length > 0 && (
                          <div className="absolute z-20 bottom-full left-1/2 -translate-x-1/2 mb-1 bg-popover text-popover-foreground border rounded-lg shadow-lg p-2 min-w-[160px] text-left">
                            {cellLeaves.map((l, i) => (
                              <div key={i} className="flex items-center gap-1.5 py-0.5">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: l.leaveTypeColor }} />
                                <span>{l.leaveType}</span>
                                {l.halfDay && <span className="text-muted-foreground">(½ day)</span>}
                                {l.status === 'Pending Approval' && <span className="text-amber-500">(pending)</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {employees.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No direct reports found</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
