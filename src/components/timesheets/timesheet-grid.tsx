// src/components/timesheets/timesheet-grid.tsx

'use client'

import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Trash2 } from 'lucide-react'
import { TimesheetConfig, TimesheetEntry, Project } from '@/types/timesheet'

interface TimesheetGridProps {
  config: TimesheetConfig
  dates: string[]
  entries: TimesheetEntry[]
  projects: Project[]
  disabled: boolean
  onChange: (entries: Omit<TimesheetEntry, 'id' | 'timesheet_id'>[]) => void
}

export function TimesheetGrid({ config, dates, entries, projects, disabled, onChange }: TimesheetGridProps) {
  // For simple mode: one row of hours per day
  // For project mode: one row per project
  // For activity mode: rows with descriptions

  const [rows, setRows] = useState<Array<{
    projectId: string | null
    activityCategory: string | null
    description: string | null
    hours: Record<string, number> // date -> hours
  }>>([])

  useEffect(() => {
    if (entries.length > 0) {
      // Group entries by project/activity
      const grouped = new Map<string, typeof rows[0]>()
      for (const entry of entries) {
        const key = entry.project_id || entry.activity_category || '_default'
        if (!grouped.has(key)) {
          grouped.set(key, {
            projectId: entry.project_id,
            activityCategory: entry.activity_category,
            description: entry.description,
            hours: {},
          })
        }
        grouped.get(key)!.hours[entry.entry_date] = entry.hours
      }
      setRows(Array.from(grouped.values()))
    } else if (rows.length === 0) {
      setRows([{ projectId: null, activityCategory: null, description: null, hours: {} }])
    }
  }, [entries])

  const updateHours = (rowIndex: number, date: string, value: number) => {
    const newRows = [...rows]
    newRows[rowIndex] = { ...newRows[rowIndex], hours: { ...newRows[rowIndex].hours, [date]: value } }
    setRows(newRows)
    emitChange(newRows)
  }

  const addRow = () => {
    setRows([...rows, { projectId: null, activityCategory: null, description: null, hours: {} }])
  }

  const removeRow = (index: number) => {
    const newRows = rows.filter((_, i) => i !== index)
    setRows(newRows.length > 0 ? newRows : [{ projectId: null, activityCategory: null, description: null, hours: {} }])
    emitChange(newRows)
  }

  const updateRowMeta = (index: number, field: string, value: string) => {
    const newRows = [...rows]
    newRows[index] = { ...newRows[index], [field]: value || null }
    setRows(newRows)
    emitChange(newRows)
  }

  const emitChange = (currentRows: typeof rows) => {
    const flatEntries: Omit<TimesheetEntry, 'id' | 'timesheet_id'>[] = []
    for (const row of currentRows) {
      for (const date of dates) {
        const hours = row.hours[date] || 0
        if (hours > 0) {
          flatEntries.push({
            entry_date: date,
            hours,
            project_id: row.projectId,
            activity_category: row.activityCategory,
            description: row.description,
          })
        }
      }
    }
    onChange(flatEntries)
  }

  const formatDay = (dateStr: string) => {
    const d = new Date(dateStr)
    return { day: d.toLocaleDateString('en', { weekday: 'short' }), date: d.getDate() }
  }

  const getRowTotal = (row: typeof rows[0]) => {
    return dates.reduce((sum, d) => sum + (row.hours[d] || 0), 0)
  }

  const getDayTotal = (date: string) => {
    return rows.reduce((sum, r) => sum + (r.hours[date] || 0), 0)
  }

  const grandTotal = rows.reduce((sum, r) => sum + getRowTotal(r), 0)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Time Entries</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                {config.mode === 'project_based' && <th className="text-left py-2 px-2 min-w-[150px]">Project</th>}
                {config.mode === 'activity_based' && <th className="text-left py-2 px-2 min-w-[200px]">Activity</th>}
                {dates.map(d => {
                  const { day, date } = formatDay(d)
                  const isWeekend = new Date(d).getDay() === 0 || new Date(d).getDay() === 6
                  return (
                    <th key={d} className={`text-center py-2 px-1 min-w-[70px] ${isWeekend ? 'bg-muted/50' : ''}`}>
                      <div className="text-xs text-muted-foreground">{day}</div>
                      <div className="font-semibold">{date}</div>
                    </th>
                  )
                })}
                <th className="text-center py-2 px-2 min-w-[60px] font-bold">Total</th>
                {!disabled && <th className="w-8"></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b">
                  {config.mode === 'project_based' && (
                    <td className="py-2 px-2">
                      <select
                        className="w-full border rounded px-2 py-1 text-sm bg-background"
                        value={row.projectId || ''}
                        onChange={e => updateRowMeta(rowIndex, 'projectId', e.target.value)}
                        disabled={disabled}
                      >
                        <option value="">Select project</option>
                        {projects.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </td>
                  )}
                  {config.mode === 'activity_based' && (
                    <td className="py-2 px-2">
                      <Input
                        placeholder="Activity description"
                        value={row.description || ''}
                        onChange={e => updateRowMeta(rowIndex, 'description', e.target.value)}
                        disabled={disabled}
                        className="text-sm h-8"
                      />
                    </td>
                  )}
                  {dates.map(d => {
                    const isWeekend = new Date(d).getDay() === 0 || new Date(d).getDay() === 6
                    return (
                      <td key={d} className={`py-2 px-1 ${isWeekend ? 'bg-muted/50' : ''}`}>
                        <Input
                          type="number"
                          min="0"
                          max="24"
                          step="0.5"
                          value={row.hours[d] || ''}
                          onChange={e => updateHours(rowIndex, d, parseFloat(e.target.value) || 0)}
                          disabled={disabled}
                          className="text-center text-sm h-8 w-full"
                          placeholder="0"
                        />
                      </td>
                    )
                  })}
                  <td className="py-2 px-2 text-center font-semibold">{getRowTotal(row)}</td>
                  {!disabled && (
                    <td className="py-2">
                      {rows.length > 1 && (
                        <Button variant="ghost" size="sm" onClick={() => removeRow(rowIndex)} className="h-8 w-8 p-0">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {/* Day totals */}
              <tr className="bg-muted/30 font-semibold">
                {(config.mode !== 'simple_hours') && <td className="py-2 px-2 text-right">Daily Total</td>}
                {dates.map(d => (
                  <td key={d} className="py-2 px-1 text-center">{getDayTotal(d)}</td>
                ))}
                <td className="py-2 px-2 text-center text-primary font-bold">{grandTotal}</td>
                {!disabled && <td></td>}
              </tr>
            </tbody>
          </table>
        </div>

        {!disabled && config.mode !== 'simple_hours' && (
          <Button variant="outline" size="sm" onClick={addRow} className="mt-3">
            <Plus className="h-4 w-4 mr-1" /> Add Row
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
