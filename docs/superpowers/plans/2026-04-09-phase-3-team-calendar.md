# Phase 3: Team Leave Calendar & Balances — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a team leave calendar (monthly grid + list toggle) and team leave balances table for managers, plus dashboard integration showing team absences this week.

**Architecture:** No new database tables. Two new API endpoints query existing `ess_leave_applications` and `ess_leave_allocations` for the manager's direct reports. New pages and components for calendar grid and balances table.

**Tech Stack:** Next.js 15 App Router, Supabase, TypeScript, Tailwind CSS, shadcn/ui, withAuth middleware

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/types/team-calendar.ts` | Type definitions |
| Create | `src/app/api/team-calendar/route.ts` | GET team leave data for calendar |
| Create | `src/app/api/team-balances/route.ts` | GET team leave balances |
| Create | `src/services/team-calendar.ts` | Client service |
| Create | `src/components/team/calendar-grid.tsx` | Monthly calendar grid |
| Create | `src/components/team/calendar-list.tsx` | List view of absences |
| Create | `src/components/team/team-balances-table.tsx` | Balances table |
| Create | `src/app/dashboard/team-calendar/page.tsx` | Team calendar page |
| Create | `src/app/dashboard/team-balances/page.tsx` | Team balances page |
| Modify | `src/app/dashboard/page.tsx` | Add team absences card for managers |

---

### Task 1: Define Types

**Files:**
- Create: `src/types/team-calendar.ts`

- [ ] **Step 1: Create types**

```typescript
// src/types/team-calendar.ts

export interface TeamLeaveEntry {
  id: string
  employeeId: string
  employeeName: string
  leaveType: string
  leaveTypeColor: string
  fromDate: string
  toDate: string
  totalDays: number
  status: 'Pending Approval' | 'Approved'
  halfDay: boolean
}

export interface TeamMemberBalance {
  employeeId: string
  employeeName: string
  employeeNo: string
  department: string | null
  balances: Array<{
    leaveType: string
    allocated: number
    taken: number
    remaining: number
  }>
}

export interface CalendarDay {
  date: string
  leaves: Array<{
    employeeId: string
    employeeName: string
    leaveType: string
    color: string
    status: string
    halfDay: boolean
  }>
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/team-calendar.ts
git commit -m "feat: add team calendar type definitions"
```

---

### Task 2: Create Team Calendar API

**Files:**
- Create: `src/app/api/team-calendar/route.ts`

- [ ] **Step 1: Create endpoint**

```typescript
// src/app/api/team-calendar/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

export const GET = withAuth(async (request, { companyId, employee }) => {
  if (!employee) {
    return NextResponse.json({ leaves: [] })
  }

  const url = new URL(request.url)
  const year = parseInt(url.searchParams.get('year') || String(new Date().getFullYear()))
  const month = parseInt(url.searchParams.get('month') || String(new Date().getMonth() + 1))

  // Get direct reports
  const { data: reports } = await supabaseAdmin
    .from('ess_employees')
    .select('id, full_name, employee_no')
    .eq('reports_to', employee.id)

  if (!reports || reports.length === 0) {
    return NextResponse.json({ leaves: [], employees: [] })
  }

  const reportIds = reports.map(r => r.id)

  // Calculate month date range
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${lastDay}`

  // Get leave applications overlapping this month
  const { data: leaves, error } = await supabaseAdmin
    .from('ess_leave_applications')
    .select(`
      id, display_id, employee_id, from_date, till_date, total_days, half_day, status,
      ess_leave_types!inner (name, code)
    `)
    .in('employee_id', reportIds)
    .in('status', ['Approved', 'Pending Approval'])
    .lte('from_date', monthEnd)
    .gte('till_date', monthStart)

  if (error) throw error

  // Color mapping
  const colors: Record<string, string> = {
    'Annual Leave': '#3b82f6',
    'Sick Leave': '#ef4444',
    'Personal Leave': '#8b5cf6',
    'Maternity Leave': '#ec4899',
    'Paternity Leave': '#06b6d4',
    'Compassionate Leave': '#f59e0b',
    'Study Leave': '#10b981',
    'Emergency Leave': '#f97316',
    'Casual Leave': '#6366f1',
    'Unpaid Leave': '#64748b',
  }

  const employeeMap = new Map(reports.map(r => [r.id, r.full_name]))

  const processed = (leaves || []).map((l: any) => ({
    id: l.display_id || l.id,
    employeeId: l.employee_id,
    employeeName: employeeMap.get(l.employee_id) || '',
    leaveType: l.ess_leave_types?.name || '',
    leaveTypeColor: colors[l.ess_leave_types?.name] || '#6b7280',
    fromDate: l.from_date,
    toDate: l.till_date,
    totalDays: Number(l.total_days),
    status: l.status,
    halfDay: l.half_day || false,
  }))

  return NextResponse.json({
    leaves: processed,
    employees: reports.map(r => ({ id: r.id, name: r.full_name, employeeNo: r.employee_no })),
    month,
    year,
  })
}, { minRole: 'manager' })
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/team-calendar/route.ts
git commit -m "feat: add team calendar API endpoint"
```

---

### Task 3: Create Team Balances API

**Files:**
- Create: `src/app/api/team-balances/route.ts`

- [ ] **Step 1: Create endpoint**

```typescript
// src/app/api/team-balances/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

export const GET = withAuth(async (_request, { companyId, employee }) => {
  if (!employee) {
    return NextResponse.json({ members: [] })
  }

  // Get direct reports
  const { data: reports } = await supabaseAdmin
    .from('ess_employees')
    .select('id, full_name, employee_no, department')
    .eq('reports_to', employee.id)

  if (!reports || reports.length === 0) {
    return NextResponse.json({ members: [] })
  }

  const reportIds = reports.map(r => r.id)
  const currentYear = new Date().getFullYear()

  // Get leave types for company
  const { data: leaveTypes } = await supabaseAdmin
    .from('ess_leave_types')
    .select('id, name, eligible_days')
    .eq('company_id', companyId)

  // Get approved leave applications for current year
  const { data: leaveApps } = await supabaseAdmin
    .from('ess_leave_applications')
    .select('employee_id, leave_type_id, total_days')
    .in('employee_id', reportIds)
    .eq('status', 'Approved')
    .gte('from_date', `${currentYear}-01-01`)
    .lte('from_date', `${currentYear}-12-31`)

  // Build balance per employee
  const members = reports.map(emp => {
    const balances = (leaveTypes || [])
      .filter(lt => (lt.eligible_days || 0) > 0)
      .map(lt => {
        const taken = (leaveApps || [])
          .filter(a => a.employee_id === emp.id && a.leave_type_id === lt.id)
          .reduce((sum, a) => sum + Number(a.total_days), 0)

        return {
          leaveType: lt.name,
          allocated: lt.eligible_days || 0,
          taken,
          remaining: Math.max(0, (lt.eligible_days || 0) - taken),
        }
      })

    return {
      employeeId: emp.id,
      employeeName: emp.full_name,
      employeeNo: emp.employee_no,
      department: emp.department,
      balances,
    }
  })

  return NextResponse.json({ members })
}, { minRole: 'manager' })
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/team-balances/route.ts
git commit -m "feat: add team balances API endpoint"
```

---

### Task 4: Create Client Service

**Files:**
- Create: `src/services/team-calendar.ts`

- [ ] **Step 1: Create service**

```typescript
// src/services/team-calendar.ts

import { TeamLeaveEntry, TeamMemberBalance } from '@/types/team-calendar'

const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('ess_access_token') : null
const authHeaders = (): HeadersInit => {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export const teamCalendarService = {
  async getTeamLeaves(year: number, month: number): Promise<{
    leaves: TeamLeaveEntry[]
    employees: Array<{ id: string; name: string; employeeNo: string }>
  }> {
    const res = await fetch(`/api/team-calendar?year=${year}&month=${month}`, { headers: authHeaders() })
    if (!res.ok) return { leaves: [], employees: [] }
    return res.json()
  },

  async getTeamBalances(): Promise<TeamMemberBalance[]> {
    const res = await fetch('/api/team-balances', { headers: authHeaders() })
    if (!res.ok) return []
    const data = await res.json()
    return data.members || []
  },
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/team-calendar.ts
git commit -m "feat: add team calendar client service"
```

---

### Task 5: Create Calendar Grid Component

**Files:**
- Create: `src/components/team/calendar-grid.tsx`

- [ ] **Step 1: Create component**

A monthly calendar grid with employee rows and day columns. Each cell shows colored indicators for leave entries. Includes:
- Month/year navigation (prev/next)
- Employee names as row headers
- Day numbers as column headers with weekend highlighting
- Colored dots/blocks for leave entries (approved = solid, pending = striped/outline)
- Half-day indicators (half-height blocks)
- Click on cell shows leave details tooltip
- Legend showing leave type colors

```typescript
// src/components/team/calendar-grid.tsx

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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/team/calendar-grid.tsx
git commit -m "feat: add team leave calendar grid component"
```

---

### Task 6: Create Calendar List Component

**Files:**
- Create: `src/components/team/calendar-list.tsx`

- [ ] **Step 1: Create component**

```typescript
// src/components/team/calendar-list.tsx

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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/team/calendar-list.tsx
git commit -m "feat: add team leave calendar list component"
```

---

### Task 7: Create Team Balances Table Component

**Files:**
- Create: `src/components/team/team-balances-table.tsx`

- [ ] **Step 1: Create component**

```typescript
// src/components/team/team-balances-table.tsx

'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users } from 'lucide-react'
import { TeamMemberBalance } from '@/types/team-calendar'

interface TeamBalancesTableProps {
  members: TeamMemberBalance[]
}

export function TeamBalancesTable({ members }: TeamBalancesTableProps) {
  if (members.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No direct reports found</p>
        </CardContent>
      </Card>
    )
  }

  // Collect all leave types across members
  const allLeaveTypes = Array.from(
    new Set(members.flatMap(m => m.balances.map(b => b.leaveType)))
  )

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Users className="h-5 w-5 text-primary" />
          Team Leave Balances ({new Date().getFullYear()})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3 font-medium text-muted-foreground sticky left-0 bg-background">Employee</th>
                {allLeaveTypes.map(lt => (
                  <th key={lt} className="text-center py-2 px-2 font-medium text-muted-foreground" colSpan={3}>
                    <div className="text-xs">{lt}</div>
                    <div className="flex text-[10px] text-muted-foreground/70 mt-0.5">
                      <span className="flex-1">Alloc</span>
                      <span className="flex-1">Taken</span>
                      <span className="flex-1">Left</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.employeeId} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="py-2 px-3 sticky left-0 bg-background">
                    <div className="font-medium">{m.employeeName}</div>
                    <div className="text-xs text-muted-foreground">{m.department || m.employeeNo}</div>
                  </td>
                  {allLeaveTypes.map(lt => {
                    const bal = m.balances.find(b => b.leaveType === lt)
                    const remaining = bal?.remaining ?? 0
                    const lowBalance = remaining <= 2 && (bal?.allocated ?? 0) > 0
                    return (
                      <td key={lt} className="text-center py-2" colSpan={3}>
                        <div className="flex text-xs">
                          <span className="flex-1">{bal?.allocated ?? 0}</span>
                          <span className="flex-1 text-muted-foreground">{bal?.taken ?? 0}</span>
                          <span className={`flex-1 font-semibold ${lowBalance ? 'text-red-500' : 'text-green-600'}`}>
                            {remaining}
                          </span>
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/team/team-balances-table.tsx
git commit -m "feat: add team leave balances table component"
```

---

### Task 8: Create Team Calendar Page

**Files:**
- Create: `src/app/dashboard/team-calendar/page.tsx`

- [ ] **Step 1: Create page with calendar/list toggle**

```typescript
// src/app/dashboard/team-calendar/page.tsx

'use client'

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { CalendarGrid } from '@/components/team/calendar-grid'
import { CalendarList } from '@/components/team/calendar-list'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth'
import { teamCalendarService } from '@/services/team-calendar'
import { TeamLeaveEntry } from '@/types/team-calendar'
import { CalendarDays, LayoutGrid, List } from 'lucide-react'
import toast from 'react-hot-toast'

export default function TeamCalendarPage() {
  const { user, isAuthenticated, checkAuth } = useAuthStore()
  const [leaves, setLeaves] = useState<TeamLeaveEntry[]>([])
  const [employees, setEmployees] = useState<Array<{ id: string; name: string; employeeNo: string }>>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)

  useEffect(() => { checkAuth() }, [checkAuth])

  useEffect(() => {
    if (isAuthenticated && user) loadData()
  }, [isAuthenticated, user, year, month])

  const loadData = async () => {
    try {
      setLoading(true)
      const data = await teamCalendarService.getTeamLeaves(year, month)
      setLeaves(data.leaves)
      setEmployees(data.employees)
    } catch {
      toast.error('Failed to load team calendar')
    } finally {
      setLoading(false)
    }
  }

  if (!isAuthenticated || !user) return null

  return (
    <DashboardLayout>
      <div className="min-h-screen fluid-bg">
        <div className="border-b border-border bg-background/50 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-primary/10 rounded-xl">
                  <CalendarDays className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">Team Leave Calendar</h1>
                  <p className="text-muted-foreground text-sm">View your team's leave schedule</p>
                </div>
              </div>
              <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                <Button
                  variant={view === 'grid' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setView('grid')}
                >
                  <LayoutGrid className="h-4 w-4 mr-1" /> Calendar
                </Button>
                <Button
                  variant={view === 'list' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setView('list')}
                >
                  <List className="h-4 w-4 mr-1" /> List
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {loading ? (
            <div className="animate-pulse h-64 bg-muted rounded-xl" />
          ) : view === 'grid' ? (
            <CalendarGrid
              leaves={leaves}
              employees={employees}
              year={year}
              month={month}
              onMonthChange={(y, m) => { setYear(y); setMonth(m) }}
            />
          ) : (
            <CalendarList leaves={leaves} />
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/dashboard/team-calendar/page.tsx
git commit -m "feat: add team leave calendar page"
```

---

### Task 9: Create Team Balances Page

**Files:**
- Create: `src/app/dashboard/team-balances/page.tsx`

- [ ] **Step 1: Create page**

```typescript
// src/app/dashboard/team-balances/page.tsx

'use client'

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { TeamBalancesTable } from '@/components/team/team-balances-table'
import { useAuthStore } from '@/stores/auth'
import { teamCalendarService } from '@/services/team-calendar'
import { TeamMemberBalance } from '@/types/team-calendar'
import { Users } from 'lucide-react'
import toast from 'react-hot-toast'

export default function TeamBalancesPage() {
  const { user, isAuthenticated, checkAuth } = useAuthStore()
  const [members, setMembers] = useState<TeamMemberBalance[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { checkAuth() }, [checkAuth])

  useEffect(() => {
    if (isAuthenticated && user) loadData()
  }, [isAuthenticated, user])

  const loadData = async () => {
    try {
      setLoading(true)
      const data = await teamCalendarService.getTeamBalances()
      setMembers(data)
    } catch {
      toast.error('Failed to load team balances')
    } finally {
      setLoading(false)
    }
  }

  if (!isAuthenticated || !user) return null

  return (
    <DashboardLayout>
      <div className="min-h-screen fluid-bg">
        <div className="border-b border-border bg-background/50 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-primary/10 rounded-xl">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Team Leave Balances</h1>
                <p className="text-muted-foreground text-sm">View your team's leave allocation and usage</p>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {loading ? (
            <div className="animate-pulse h-48 bg-muted rounded-xl" />
          ) : (
            <TeamBalancesTable members={members} />
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/dashboard/team-balances/page.tsx
git commit -m "feat: add team leave balances page"
```

---

### Task 10: Dashboard Integration + Build Verification

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Add team absences card for managers**

In the dashboard page, after the existing approval sections, add a card for managers showing how many team members are off this week. This should:
1. Check if user has manager role with `hasMinRole(userRole, 'manager')`
2. Check if leave module is enabled with `isModuleEnabled('leave')`
3. Fetch team calendar data for current month
4. Count leaves overlapping current week
5. Show a small summary card with team absence count and link to team calendar

- [ ] **Step 2: Verify dev server starts**

```bash
npx next dev --turbopack --port 3001
```

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat: add team absences summary to manager dashboard"
```
