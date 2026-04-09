# Phase 1: Timesheets Module — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete timesheets module with configurable modes (simple hours, project-based, activity-based), weekly/fortnightly/monthly submission cycles, multi-level approval workflows, and manager review capabilities — fully integrated with the existing ESS system.

**Architecture:** New Supabase tables for timesheet config, projects, timesheets, entries, and approval entries. API routes follow existing patterns (withAuth middleware). UI components mirror leave applications patterns (list → detail → approval). Tenant-level configuration drives mode and cycle behavior.

**Tech Stack:** Next.js 15 App Router, Supabase PostgreSQL, TypeScript, Tailwind CSS, shadcn/ui, withAuth middleware

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/types/timesheet.ts` | Type definitions for timesheets |
| Create | `src/app/api/timesheets/route.ts` | GET list + POST create timesheet |
| Create | `src/app/api/timesheets/[id]/route.ts` | GET detail, PUT update, POST submit |
| Create | `src/app/api/timesheets/[id]/entries/route.ts` | GET/POST/PUT timesheet entries |
| Create | `src/app/api/timesheet-config/route.ts` | GET/POST tenant timesheet config |
| Create | `src/app/api/projects/route.ts` | GET/POST projects list |
| Create | `src/app/dashboard/timesheets/page.tsx` | My timesheets list page |
| Create | `src/app/dashboard/timesheets/new/page.tsx` | Create new timesheet |
| Create | `src/app/dashboard/timesheets/[id]/page.tsx` | Timesheet detail/edit page |
| Create | `src/app/dashboard/team-timesheets/page.tsx` | Manager: team timesheets view |
| Create | `src/components/timesheets/timesheet-grid.tsx` | Weekly grid input component |
| Create | `src/components/timesheets/timesheet-list.tsx` | Timesheet list component for dashboard |
| Create | `src/components/timesheets/timesheet-summary.tsx` | Summary card (total hours, expected, overtime) |
| Create | `src/services/timesheet.ts` | Client-side timesheet service |
| Modify | `src/app/api/pending-approvals/route.ts` | Add timesheet pending approvals |
| Modify | `src/app/api/process-approval/route.ts` | Add timesheet approval processing |
| Modify | `src/app/dashboard/page.tsx` | Add timesheet section to dashboard |
| Modify | `src/services/dashboard-data.ts` | Add timesheet data fetching |
| Modify | `src/types/dashboard.ts` | Add timesheet dashboard types |

---

### Task 1: Define Timesheet Types

**Files:**
- Create: `src/types/timesheet.ts`

- [ ] **Step 1: Create type definitions**

```typescript
// src/types/timesheet.ts

export type TimesheetMode = 'simple_hours' | 'project_based' | 'activity_based'
export type TimesheetCycle = 'weekly' | 'fortnightly' | 'monthly'
export type TimesheetStatus = 'Draft' | 'Submitted' | 'Approved' | 'Rejected' | 'Revision Requested'

export interface TimesheetConfig {
  id: string
  company_id: string
  mode: TimesheetMode
  submission_cycle: TimesheetCycle
  week_start_day: number // 0=Sunday, 1=Monday, etc.
  required_hours_per_day: number
  overtime_enabled: boolean
  projects_enabled: boolean
}

export interface Project {
  id: string
  company_id: string
  name: string
  code: string
  is_active: boolean
  billable: boolean
}

export interface Timesheet {
  id: string
  display_id: string
  employee_id: string
  company_id: string
  period_start: string
  period_end: string
  status: TimesheetStatus
  total_hours: number
  submitted_at: string | null
  created_at: string
  updated_at: string
  employee_name?: string
  employee_no?: string
}

export interface TimesheetEntry {
  id: string
  timesheet_id: string
  entry_date: string
  hours: number
  project_id: string | null
  project_name?: string
  activity_category: string | null
  description: string | null
}

export interface TimesheetApprovalEntry {
  id: string
  timesheet_id: string
  level_no: number
  approver_id: string
  approver_name?: string
  status: 'Pending' | 'Approved' | 'Rejected'
  action_time: string | null
  remarks: string | null
}

// Frontend display type
export interface MyTimesheet {
  id: string
  displayId: string
  periodStart: string
  periodEnd: string
  totalHours: number
  expectedHours: number
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'revision_requested'
  submittedAt: string | null
  createdAt: string
  updatedAt: string
}

// Dashboard summary
export interface TimesheetSummary {
  currentPeriodStart: string
  currentPeriodEnd: string
  currentPeriodStatus: TimesheetStatus | null
  currentPeriodHours: number
  pendingCount: number
  totalSubmitted: number
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/timesheet.ts
git commit -m "feat: add timesheet type definitions"
```

---

### Task 2: Create Timesheet Config API

**Files:**
- Create: `src/app/api/timesheet-config/route.ts`

- [ ] **Step 1: Create the config endpoint**

```typescript
// src/app/api/timesheet-config/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

export const GET = withAuth(async (_request, { companyId }) => {
  // Check if config exists, return defaults if not
  const { data: config } = await supabaseAdmin
    .from('ess_timesheet_configs')
    .select('*')
    .eq('company_id', companyId)
    .single()

  if (config) {
    return NextResponse.json({ config })
  }

  // Return defaults
  return NextResponse.json({
    config: {
      id: null,
      company_id: companyId,
      mode: 'simple_hours',
      submission_cycle: 'weekly',
      week_start_day: 1, // Monday
      required_hours_per_day: 8,
      overtime_enabled: false,
      projects_enabled: false,
    },
  })
})

export const POST = withAuth(async (request, { companyId }) => {
  const body = await request.json()

  const configData = {
    company_id: companyId,
    mode: body.mode || 'simple_hours',
    submission_cycle: body.submission_cycle || 'weekly',
    week_start_day: body.week_start_day ?? 1,
    required_hours_per_day: body.required_hours_per_day ?? 8,
    overtime_enabled: body.overtime_enabled ?? false,
    projects_enabled: body.projects_enabled ?? false,
  }

  // Upsert — update if exists, insert if not
  const { data: existing } = await supabaseAdmin
    .from('ess_timesheet_configs')
    .select('id')
    .eq('company_id', companyId)
    .single()

  let result
  if (existing) {
    const { data, error } = await supabaseAdmin
      .from('ess_timesheet_configs')
      .update(configData)
      .eq('id', existing.id)
      .select()
      .single()
    if (error) throw error
    result = data
  } else {
    const { data, error } = await supabaseAdmin
      .from('ess_timesheet_configs')
      .insert(configData)
      .select()
      .single()
    if (error) throw error
    result = data
  }

  return NextResponse.json({ config: result, message: 'Timesheet config saved' })
}, { minRole: 'admin' })
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/timesheet-config/route.ts
git commit -m "feat: add timesheet config API endpoint"
```

---

### Task 3: Create Projects API

**Files:**
- Create: `src/app/api/projects/route.ts`

- [ ] **Step 1: Create the projects endpoint**

```typescript
// src/app/api/projects/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

export const GET = withAuth(async (_request, { companyId }) => {
  const { data: projects, error } = await supabaseAdmin
    .from('ess_projects')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('name')

  if (error) throw error

  return NextResponse.json({ projects: projects || [] })
})

export const POST = withAuth(async (request, { companyId }) => {
  const body = await request.json()

  const { data, error } = await supabaseAdmin
    .from('ess_projects')
    .insert({
      company_id: companyId,
      name: body.name,
      code: body.code,
      is_active: body.is_active ?? true,
      billable: body.billable ?? false,
    })
    .select()
    .single()

  if (error) throw error

  return NextResponse.json({ project: data, message: 'Project created' })
}, { minRole: 'hr' })
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/projects/route.ts
git commit -m "feat: add projects API endpoint"
```

---

### Task 4: Create Timesheets List/Create API

**Files:**
- Create: `src/app/api/timesheets/route.ts`

- [ ] **Step 1: Create the timesheets list and create endpoint**

```typescript
// src/app/api/timesheets/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

export const GET = withAuth(async (request, { companyId, employee }) => {
  if (!employee) {
    return NextResponse.json({ timesheets: [], summary: null })
  }

  const url = new URL(request.url)
  const teamView = url.searchParams.get('team') === 'true'

  let query = supabaseAdmin
    .from('ess_timesheets')
    .select(`
      id, display_id, employee_id, period_start, period_end,
      status, total_hours, submitted_at, created_at, updated_at,
      ess_employees!inner (full_name, employee_no)
    `)
    .eq('company_id', companyId)
    .order('period_start', { ascending: false })

  if (teamView) {
    // Manager view: get timesheets from direct reports
    const { data: reports } = await supabaseAdmin
      .from('ess_employees')
      .select('id')
      .eq('reports_to', employee.id)

    const reportIds = (reports || []).map(r => r.id)
    if (reportIds.length === 0) {
      return NextResponse.json({ timesheets: [] })
    }
    query = query.in('employee_id', reportIds)
  } else {
    query = query.eq('employee_id', employee.id)
  }

  const { data: timesheets, error } = await query

  if (error) throw error

  const processed = (timesheets || []).map((ts: any) => ({
    id: ts.id,
    display_id: ts.display_id,
    employee_id: ts.employee_id,
    employee_name: ts.ess_employees?.full_name || '',
    employee_no: ts.ess_employees?.employee_no || '',
    period_start: ts.period_start,
    period_end: ts.period_end,
    status: ts.status,
    total_hours: Number(ts.total_hours),
    submitted_at: ts.submitted_at,
    created_at: ts.created_at,
    updated_at: ts.updated_at,
  }))

  return NextResponse.json({ timesheets: processed })
})

export const POST = withAuth(async (request, { companyId, employee }) => {
  if (!employee) {
    return NextResponse.json({ error: 'No employee record' }, { status: 404 })
  }

  const body = await request.json()

  // Generate display ID
  const { count } = await supabaseAdmin
    .from('ess_timesheets')
    .select('*', { count: 'exact', head: true })
    .eq('employee_id', employee.id)

  const displayId = `TS-${new Date().getFullYear()}-${String((count || 0) + 1).padStart(3, '0')}`

  const { data: timesheet, error } = await supabaseAdmin
    .from('ess_timesheets')
    .insert({
      display_id: displayId,
      employee_id: employee.id,
      company_id: companyId,
      period_start: body.period_start,
      period_end: body.period_end,
      status: 'Draft',
      total_hours: 0,
    })
    .select()
    .single()

  if (error) throw error

  return NextResponse.json({
    timesheet,
    message: 'Timesheet created',
    display_id: displayId,
  })
})
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/timesheets/route.ts
git commit -m "feat: add timesheets list and create API"
```

---

### Task 5: Create Timesheet Detail/Submit API

**Files:**
- Create: `src/app/api/timesheets/[id]/route.ts`

- [ ] **Step 1: Create detail, update, and submit endpoint**

```typescript
// src/app/api/timesheets/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

export const GET = withAuth(async (_request, { companyId, employee }, params) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  // Support both UUID and display_id
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

  let query = supabaseAdmin
    .from('ess_timesheets')
    .select(`
      *,
      ess_employees!inner (full_name, employee_no)
    `)
    .eq('company_id', companyId)

  if (isUUID) {
    query = query.eq('id', id)
  } else {
    query = query.eq('display_id', id)
  }

  const { data: timesheet, error } = await query.single()
  if (error || !timesheet) {
    return NextResponse.json({ error: 'Timesheet not found' }, { status: 404 })
  }

  // Get entries
  const { data: entries } = await supabaseAdmin
    .from('ess_timesheet_entries')
    .select(`
      *,
      ess_projects (name, code)
    `)
    .eq('timesheet_id', timesheet.id)
    .order('entry_date')

  // Get approval chain
  const { data: approvals } = await supabaseAdmin
    .from('ess_timesheet_approval_entries')
    .select(`
      *,
      ess_employees!approver_id (full_name, employee_no)
    `)
    .eq('timesheet_id', timesheet.id)
    .order('level_no')

  return NextResponse.json({
    timesheet: {
      ...timesheet,
      employee_name: (timesheet as any).ess_employees?.full_name,
      employee_no: (timesheet as any).ess_employees?.employee_no,
    },
    entries: (entries || []).map((e: any) => ({
      ...e,
      project_name: e.ess_projects?.name || null,
    })),
    approvals: (approvals || []).map((a: any) => ({
      ...a,
      approver_name: a.ess_employees?.full_name || '',
    })),
  })
})

// PUT: Update entries (only for Draft/Revision Requested timesheets)
export const PUT = withAuth(async (request, { employee }, params) => {
  const id = params?.id
  if (!id || !employee) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const { data: timesheet } = await supabaseAdmin
    .from('ess_timesheets')
    .select('id, status, employee_id')
    .eq('id', id)
    .single()

  if (!timesheet) {
    return NextResponse.json({ error: 'Timesheet not found' }, { status: 404 })
  }

  if (timesheet.employee_id !== employee.id) {
    return NextResponse.json({ error: 'Not your timesheet' }, { status: 403 })
  }

  if (!['Draft', 'Revision Requested'].includes(timesheet.status)) {
    return NextResponse.json({ error: 'Timesheet cannot be edited in current status' }, { status: 400 })
  }

  const body = await request.json()
  const entries: Array<{ entry_date: string; hours: number; project_id?: string; activity_category?: string; description?: string }> = body.entries

  // Delete existing entries and re-insert
  await supabaseAdmin
    .from('ess_timesheet_entries')
    .delete()
    .eq('timesheet_id', timesheet.id)

  if (entries && entries.length > 0) {
    const insertData = entries.map(e => ({
      timesheet_id: timesheet.id,
      entry_date: e.entry_date,
      hours: e.hours,
      project_id: e.project_id || null,
      activity_category: e.activity_category || null,
      description: e.description || null,
    }))

    const { error: entryError } = await supabaseAdmin
      .from('ess_timesheet_entries')
      .insert(insertData)

    if (entryError) throw entryError
  }

  // Recalculate total hours
  const totalHours = (entries || []).reduce((sum, e) => sum + Number(e.hours), 0)

  await supabaseAdmin
    .from('ess_timesheets')
    .update({ total_hours: totalHours, updated_at: new Date().toISOString() })
    .eq('id', timesheet.id)

  return NextResponse.json({ message: 'Timesheet updated', total_hours: totalHours })
})

// POST: Submit timesheet for approval
export const POST = withAuth(async (_request, { companyId, employee }, params) => {
  const id = params?.id
  if (!id || !employee) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const { data: timesheet } = await supabaseAdmin
    .from('ess_timesheets')
    .select('id, status, employee_id, total_hours')
    .eq('id', id)
    .single()

  if (!timesheet) {
    return NextResponse.json({ error: 'Timesheet not found' }, { status: 404 })
  }

  if (timesheet.employee_id !== employee.id) {
    return NextResponse.json({ error: 'Not your timesheet' }, { status: 403 })
  }

  if (!['Draft', 'Revision Requested'].includes(timesheet.status)) {
    return NextResponse.json({ error: 'Timesheet already submitted' }, { status: 400 })
  }

  if (timesheet.total_hours <= 0) {
    return NextResponse.json({ error: 'Cannot submit empty timesheet' }, { status: 400 })
  }

  // Update status to Submitted
  await supabaseAdmin
    .from('ess_timesheets')
    .update({
      status: 'Submitted',
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', timesheet.id)

  // Create approval entries from rules
  const { data: rules } = await supabaseAdmin
    .from('ess_approval_rules')
    .select('*')
    .eq('company_id', companyId)
    .eq('rule_type', 'timesheet')
    .eq('is_active', true)
    .order('level_no')

  // If no timesheet-specific rules, use leave rules as fallback
  const effectiveRules = (rules && rules.length > 0) ? rules : []

  // If still no rules, use reporting manager as single-level approver
  if (effectiveRules.length === 0) {
    if (employee.reports_to) {
      await supabaseAdmin.from('ess_timesheet_approval_entries').insert({
        timesheet_id: timesheet.id,
        level_no: 1,
        approver_id: employee.reports_to,
        status: 'Pending',
      })
    }
  } else {
    for (const rule of effectiveRules) {
      let approverId = rule.specific_approver_id

      if (rule.approver_type === 'reporting_manager') {
        approverId = employee.reports_to
      }

      if (approverId) {
        await supabaseAdmin.from('ess_timesheet_approval_entries').insert({
          timesheet_id: timesheet.id,
          level_no: rule.level_no,
          approver_id: approverId,
          status: 'Pending',
        })
      }
    }
  }

  return NextResponse.json({ message: 'Timesheet submitted for approval' })
})
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/timesheets/[id]/route.ts
git commit -m "feat: add timesheet detail, update, and submit API"
```

---

### Task 6: Create Timesheet Entries API

**Files:**
- Create: `src/app/api/timesheets/[id]/entries/route.ts`

- [ ] **Step 1: Create entries endpoint**

```typescript
// src/app/api/timesheets/[id]/entries/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

export const GET = withAuth(async (_request, _ctx, params) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const { data: entries, error } = await supabaseAdmin
    .from('ess_timesheet_entries')
    .select(`
      *,
      ess_projects (name, code)
    `)
    .eq('timesheet_id', id)
    .order('entry_date')

  if (error) throw error

  return NextResponse.json({
    entries: (entries || []).map((e: any) => ({
      ...e,
      project_name: e.ess_projects?.name || null,
    })),
  })
})
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/timesheets/[id]/entries/route.ts
git commit -m "feat: add timesheet entries API"
```

---

### Task 7: Update Pending Approvals & Process Approval for Timesheets

**Files:**
- Modify: `src/app/api/pending-approvals/route.ts`
- Modify: `src/app/api/process-approval/route.ts`

- [ ] **Step 1: Add timesheet approvals to pending-approvals**

Read the current `src/app/api/pending-approvals/route.ts`. After the existing leave and expense approval queries, add a query for timesheet approvals:

```typescript
    // Timesheet approvals
    const { data: timesheetApprovals } = await supabaseAdmin
      .from('ess_timesheet_approval_entries')
      .select(`
        id, level_no, status, remarks,
        ess_timesheets!inner (
          id, display_id, period_start, period_end, total_hours, status,
          employee_id,
          ess_employees!inner (full_name, employee_no)
        )
      `)
      .eq('approver_id', employee.id)
      .eq('status', 'Pending')
```

Then add timesheet items to the combined results array with `type: 'timesheet'`.

- [ ] **Step 2: Add timesheet processing to process-approval**

Read the current `src/app/api/process-approval/route.ts`. Add a `type === 'timesheet'` branch alongside the existing `type === 'expense'` and leave branches. Follow the same pattern:

1. Find the timesheet by display_id
2. Update the approval entry status
3. Check if all levels are done
4. Update main timesheet status accordingly

```typescript
    } else if (type === 'timesheet') {
      const { data: timesheet } = await supabaseAdmin
        .from('ess_timesheets')
        .select('id')
        .eq('display_id', leave_id)
        .single()

      if (!timesheet) {
        return NextResponse.json({ error: 'Timesheet not found' }, { status: 404 })
      }

      await supabaseAdmin
        .from('ess_timesheet_approval_entries')
        .update({
          status: newStatus,
          action_time: new Date().toISOString(),
          remarks: remarks || '',
        })
        .eq('timesheet_id', timesheet.id)
        .eq('approver_id', employee.id)
        .eq('status', 'Pending')

      const { data: allEntries } = await supabaseAdmin
        .from('ess_timesheet_approval_entries')
        .select('status')
        .eq('timesheet_id', timesheet.id)

      if (action === 'reject') {
        await supabaseAdmin
          .from('ess_timesheets')
          .update({ status: 'Rejected', updated_at: new Date().toISOString() })
          .eq('id', timesheet.id)
      } else {
        const allApproved = (allEntries || []).every(e => e.status === 'Approved')
        if (allApproved) {
          await supabaseAdmin
            .from('ess_timesheets')
            .update({ status: 'Approved', updated_at: new Date().toISOString() })
            .eq('id', timesheet.id)
        }
      }
    } else {
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/pending-approvals/route.ts src/app/api/process-approval/route.ts
git commit -m "feat: add timesheet support to approval workflow"
```

---

### Task 8: Create Timesheet Client Service

**Files:**
- Create: `src/services/timesheet.ts`

- [ ] **Step 1: Create the service**

```typescript
// src/services/timesheet.ts

import { TimesheetConfig, Timesheet, TimesheetEntry, Project, MyTimesheet } from '@/types/timesheet'

const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('ess_access_token') : null

const authHeaders = (): HeadersInit => {
  const token = getToken()
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export const timesheetService = {
  async getConfig(): Promise<TimesheetConfig> {
    const res = await fetch('/api/timesheet-config', { headers: authHeaders() })
    if (!res.ok) throw new Error('Failed to fetch config')
    const data = await res.json()
    return data.config
  },

  async getTimesheets(teamView = false): Promise<Timesheet[]> {
    const url = teamView ? '/api/timesheets?team=true' : '/api/timesheets'
    const res = await fetch(url, { headers: authHeaders() })
    if (!res.ok) throw new Error('Failed to fetch timesheets')
    const data = await res.json()
    return data.timesheets || []
  },

  async getTimesheet(id: string): Promise<{ timesheet: Timesheet; entries: TimesheetEntry[]; approvals: any[] }> {
    const res = await fetch(`/api/timesheets/${id}`, { headers: authHeaders() })
    if (!res.ok) throw new Error('Failed to fetch timesheet')
    return res.json()
  },

  async createTimesheet(periodStart: string, periodEnd: string): Promise<{ timesheet: Timesheet; display_id: string }> {
    const res = await fetch('/api/timesheets', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ period_start: periodStart, period_end: periodEnd }),
    })
    if (!res.ok) throw new Error('Failed to create timesheet')
    return res.json()
  },

  async updateEntries(timesheetId: string, entries: Omit<TimesheetEntry, 'id' | 'timesheet_id'>[]): Promise<void> {
    const res = await fetch(`/api/timesheets/${timesheetId}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ entries }),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'Failed to update entries')
    }
  },

  async submitTimesheet(timesheetId: string): Promise<void> {
    const res = await fetch(`/api/timesheets/${timesheetId}`, {
      method: 'POST',
      headers: authHeaders(),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'Failed to submit timesheet')
    }
  },

  async getProjects(): Promise<Project[]> {
    const res = await fetch('/api/projects', { headers: authHeaders() })
    if (!res.ok) return []
    const data = await res.json()
    return data.projects || []
  },

  // Helper: calculate period dates based on config
  getCurrentPeriod(config: TimesheetConfig): { start: string; end: string } {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth()

    if (config.submission_cycle === 'monthly') {
      const start = new Date(year, month, 1)
      const end = new Date(year, month + 1, 0) // last day of month
      return { start: fmt(start), end: fmt(end) }
    }

    if (config.submission_cycle === 'fortnightly') {
      const day = now.getDate()
      if (day <= 15) {
        return { start: fmt(new Date(year, month, 1)), end: fmt(new Date(year, month, 15)) }
      }
      return { start: fmt(new Date(year, month, 16)), end: fmt(new Date(year, month + 1, 0)) }
    }

    // Weekly (default)
    const dayOfWeek = now.getDay()
    const diff = (dayOfWeek - config.week_start_day + 7) % 7
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - diff)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 6)
    return { start: fmt(weekStart), end: fmt(weekEnd) }
  },

  // Helper: get dates in a period
  getPeriodDates(start: string, end: string): string[] {
    const dates: string[] = []
    const current = new Date(start)
    const endDate = new Date(end)
    while (current <= endDate) {
      dates.push(fmt(current))
      current.setDate(current.getDate() + 1)
    }
    return dates
  },
}

function fmt(d: Date): string {
  return d.toISOString().split('T')[0]
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/timesheet.ts
git commit -m "feat: add timesheet client service"
```

---

### Task 9: Create Timesheet Grid Component

**Files:**
- Create: `src/components/timesheets/timesheet-grid.tsx`

- [ ] **Step 1: Create the weekly grid component**

This is the main input component for timesheets. It renders differently based on the configured mode (simple_hours, project_based, activity_based).

```typescript
// src/components/timesheets/timesheet-grid.tsx

'use client'

import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/timesheets/timesheet-grid.tsx
git commit -m "feat: add timesheet grid input component"
```

---

### Task 10: Create Timesheet Summary Component

**Files:**
- Create: `src/components/timesheets/timesheet-summary.tsx`

- [ ] **Step 1: Create summary card**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/timesheets/timesheet-summary.tsx
git commit -m "feat: add timesheet summary component"
```

---

### Task 11: Create Timesheet List Component

**Files:**
- Create: `src/components/timesheets/timesheet-list.tsx`

- [ ] **Step 1: Create list component**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/timesheets/timesheet-list.tsx
git commit -m "feat: add timesheet list component"
```

---

### Task 12: Create Timesheets List Page

**Files:**
- Create: `src/app/dashboard/timesheets/page.tsx`

- [ ] **Step 1: Create the my timesheets page**

```typescript
// src/app/dashboard/timesheets/page.tsx

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { TimesheetList } from '@/components/timesheets/timesheet-list'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth'
import { timesheetService } from '@/services/timesheet'
import { Timesheet, TimesheetConfig } from '@/types/timesheet'
import { Plus, Timer } from 'lucide-react'
import toast from 'react-hot-toast'

export default function TimesheetsPage() {
  const router = useRouter()
  const { user, isAuthenticated, checkAuth } = useAuthStore()
  const [timesheets, setTimesheets] = useState<Timesheet[]>([])
  const [config, setConfig] = useState<TimesheetConfig | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { checkAuth() }, [checkAuth])

  useEffect(() => {
    if (isAuthenticated && user) {
      loadData()
    }
  }, [isAuthenticated, user])

  const loadData = async () => {
    try {
      setLoading(true)
      const [ts, cfg] = await Promise.all([
        timesheetService.getTimesheets(),
        timesheetService.getConfig(),
      ])
      setTimesheets(ts)
      setConfig(cfg)
    } catch (error) {
      toast.error('Failed to load timesheets')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateNew = async () => {
    if (!config) return
    try {
      const { start, end } = timesheetService.getCurrentPeriod(config)

      // Check if a timesheet already exists for this period
      const existing = timesheets.find(
        ts => ts.period_start === start && ts.period_end === end
      )
      if (existing) {
        router.push(`/dashboard/timesheets/${existing.id}`)
        return
      }

      const result = await timesheetService.createTimesheet(start, end)
      toast.success(`Timesheet ${result.display_id} created`)
      router.push(`/dashboard/timesheets/${result.timesheet.id}`)
    } catch (error) {
      toast.error('Failed to create timesheet')
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
                  <Timer className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-foreground">My Timesheets</h1>
                  <p className="text-muted-foreground text-sm">Submit and track your timesheets</p>
                </div>
              </div>
              <Button onClick={handleCreateNew} disabled={!config}>
                <Plus className="h-4 w-4 mr-2" /> New Timesheet
              </Button>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {loading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse h-16 bg-muted rounded-xl" />
              ))}
            </div>
          ) : (
            <TimesheetList timesheets={timesheets} />
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/dashboard/timesheets/page.tsx
git commit -m "feat: add my timesheets list page"
```

---

### Task 13: Create Timesheet Detail/Edit Page

**Files:**
- Create: `src/app/dashboard/timesheets/[id]/page.tsx`

- [ ] **Step 1: Create the timesheet detail page**

This page shows the timesheet grid for editing (if Draft/Revision Requested) or viewing (if Submitted/Approved/Rejected). It includes save, submit, and approval chain display.

```typescript
// src/app/dashboard/timesheets/[id]/page.tsx

'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { TimesheetGrid } from '@/components/timesheets/timesheet-grid'
import { TimesheetSummary } from '@/components/timesheets/timesheet-summary'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/stores/auth'
import { timesheetService } from '@/services/timesheet'
import { Timesheet, TimesheetEntry, TimesheetConfig, Project, TimesheetApprovalEntry } from '@/types/timesheet'
import { ArrowLeft, Save, Send, CheckCircle, XCircle, Clock, Timer } from 'lucide-react'
import toast from 'react-hot-toast'

export default function TimesheetDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user, isAuthenticated, checkAuth } = useAuthStore()
  const [timesheet, setTimesheet] = useState<Timesheet | null>(null)
  const [entries, setEntries] = useState<TimesheetEntry[]>([])
  const [approvals, setApprovals] = useState<TimesheetApprovalEntry[]>([])
  const [config, setConfig] = useState<TimesheetConfig | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [pendingEntries, setPendingEntries] = useState<Omit<TimesheetEntry, 'id' | 'timesheet_id'>[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { checkAuth() }, [checkAuth])

  useEffect(() => {
    if (isAuthenticated && user && params.id) {
      loadData()
    }
  }, [isAuthenticated, user, params.id])

  const loadData = async () => {
    try {
      setLoading(true)
      const [tsData, cfg, projs] = await Promise.all([
        timesheetService.getTimesheet(params.id as string),
        timesheetService.getConfig(),
        timesheetService.getProjects(),
      ])
      setTimesheet(tsData.timesheet)
      setEntries(tsData.entries)
      setApprovals(tsData.approvals || [])
      setConfig(cfg)
      setProjects(projs)
    } catch {
      toast.error('Failed to load timesheet')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!timesheet) return
    try {
      setSaving(true)
      await timesheetService.updateEntries(timesheet.id, pendingEntries)
      toast.success('Timesheet saved')
      await loadData()
    } catch (error: any) {
      toast.error(error.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = async () => {
    if (!timesheet) return
    try {
      setSubmitting(true)
      // Save first, then submit
      if (pendingEntries.length > 0) {
        await timesheetService.updateEntries(timesheet.id, pendingEntries)
      }
      await timesheetService.submitTimesheet(timesheet.id)
      toast.success('Timesheet submitted for approval')
      await loadData()
    } catch (error: any) {
      toast.error(error.message || 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  const isEditable = timesheet && ['Draft', 'Revision Requested'].includes(timesheet.status)
  const dates = timesheet && config ? timesheetService.getPeriodDates(timesheet.period_start, timesheet.period_end) : []

  if (!isAuthenticated || !user) return null

  if (loading) {
    return (
      <DashboardLayout>
        <div className="min-h-screen fluid-bg flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
        </div>
      </DashboardLayout>
    )
  }

  if (!timesheet || !config) {
    return (
      <DashboardLayout>
        <div className="min-h-screen fluid-bg flex items-center justify-center">
          <p className="text-muted-foreground">Timesheet not found</p>
        </div>
      </DashboardLayout>
    )
  }

  const statusColors: Record<string, string> = {
    Draft: 'bg-gray-100 text-gray-800',
    Submitted: 'bg-amber-100 text-amber-800',
    Approved: 'bg-green-100 text-green-800',
    Rejected: 'bg-red-100 text-red-800',
    'Revision Requested': 'bg-orange-100 text-orange-800',
  }

  return (
    <DashboardLayout>
      <div className="min-h-screen fluid-bg">
        <div className="border-b border-border bg-background/50 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/timesheets')}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                  <div className="flex items-center space-x-2">
                    <h1 className="text-2xl font-bold">{timesheet.display_id}</h1>
                    <Badge className={statusColors[timesheet.status]}>{timesheet.status}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {new Date(timesheet.period_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {' — '}
                    {new Date(timesheet.period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              </div>
              {isEditable && (
                <div className="flex space-x-2">
                  <Button variant="outline" onClick={handleSave} disabled={saving}>
                    <Save className="h-4 w-4 mr-2" />{saving ? 'Saving...' : 'Save Draft'}
                  </Button>
                  <Button onClick={handleSubmit} disabled={submitting}>
                    <Send className="h-4 w-4 mr-2" />{submitting ? 'Submitting...' : 'Submit'}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          <TimesheetSummary
            totalHours={timesheet.total_hours}
            periodDays={dates.length}
            config={config}
          />

          <TimesheetGrid
            config={config}
            dates={dates}
            entries={entries}
            projects={projects}
            disabled={!isEditable}
            onChange={setPendingEntries}
          />

          {/* Approval Chain */}
          {approvals.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Approval Chain</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {approvals.map((a) => {
                    const Icon = a.status === 'Approved' ? CheckCircle : a.status === 'Rejected' ? XCircle : Clock
                    const color = a.status === 'Approved' ? 'text-green-600' : a.status === 'Rejected' ? 'text-red-600' : 'text-amber-500'
                    return (
                      <div key={a.id} className="flex items-center space-x-3 p-3 rounded-lg border">
                        <div className={`flex items-center justify-center w-8 h-8 rounded-full bg-muted font-semibold text-sm`}>
                          {a.level_no}
                        </div>
                        <Icon className={`h-5 w-5 ${color}`} />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{a.approver_name || 'Approver'}</p>
                          <p className="text-xs text-muted-foreground">{a.status}</p>
                        </div>
                        {a.remarks && <p className="text-xs text-muted-foreground italic">"{a.remarks}"</p>}
                        {a.action_time && (
                          <p className="text-xs text-muted-foreground">
                            {new Date(a.action_time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/dashboard/timesheets/[id]/page.tsx
git commit -m "feat: add timesheet detail and edit page"
```

---

### Task 14: Create Team Timesheets Page (Manager View)

**Files:**
- Create: `src/app/dashboard/team-timesheets/page.tsx`

- [ ] **Step 1: Create team timesheets page**

```typescript
// src/app/dashboard/team-timesheets/page.tsx

'use client'

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { TimesheetList } from '@/components/timesheets/timesheet-list'
import { useAuthStore } from '@/stores/auth'
import { timesheetService } from '@/services/timesheet'
import { Timesheet } from '@/types/timesheet'
import { Users } from 'lucide-react'
import toast from 'react-hot-toast'

export default function TeamTimesheetsPage() {
  const { user, isAuthenticated, checkAuth } = useAuthStore()
  const [timesheets, setTimesheets] = useState<Timesheet[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { checkAuth() }, [checkAuth])

  useEffect(() => {
    if (isAuthenticated && user) {
      loadData()
    }
  }, [isAuthenticated, user])

  const loadData = async () => {
    try {
      setLoading(true)
      const ts = await timesheetService.getTimesheets(true)
      setTimesheets(ts)
    } catch {
      toast.error('Failed to load team timesheets')
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
                <h1 className="text-2xl font-bold text-foreground">Team Timesheets</h1>
                <p className="text-muted-foreground text-sm">Review your team's timesheet submissions</p>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {loading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse h-16 bg-muted rounded-xl" />
              ))}
            </div>
          ) : (
            <TimesheetList timesheets={timesheets} title="Team Timesheets" showEmployee />
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/dashboard/team-timesheets/page.tsx
git commit -m "feat: add team timesheets page for managers"
```

---

### Task 15: Integrate Timesheets into Dashboard

**Files:**
- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/services/dashboard-data.ts`
- Modify: `src/types/dashboard.ts`

- [ ] **Step 1: Add MyTimesheet type to dashboard types**

In `src/types/dashboard.ts`, add at the end of the file:

```typescript
export interface DashboardTimesheet {
  id: string
  displayId: string
  periodStart: string
  periodEnd: string
  totalHours: number
  status: string
}
```

- [ ] **Step 2: Add timesheet fetch to dashboard-data.ts**

In `src/services/dashboard-data.ts`, add a new function after the existing fetch functions:

```typescript
const fetchMyTimesheets = async (): Promise<DashboardTimesheet[]> => {
  try {
    const response = await fetch('/api/timesheets', { headers: authHeaders() })
    if (!response.ok) return []
    const data = await response.json()
    return (data.timesheets || []).slice(0, 5).map((ts: any) => ({
      id: ts.id,
      displayId: ts.display_id,
      periodStart: ts.period_start,
      periodEnd: ts.period_end,
      totalHours: ts.total_hours,
      status: ts.status,
    }))
  } catch {
    return []
  }
}
```

Also add `DashboardTimesheet` to the imports from `@/types/dashboard`.

Add to `employeeDashboardService`:

```typescript
  async getMyTimesheets(): Promise<DashboardTimesheet[]> {
    return await fetchMyTimesheets()
  },
```

- [ ] **Step 3: Add timesheets section to dashboard page**

In `src/app/dashboard/page.tsx`:

1. Import `DashboardTimesheet` from `@/types/dashboard`
2. Import `TimesheetList` from `@/components/timesheets/timesheet-list`
3. Add state: `const [myTimesheets, setMyTimesheets] = useState<DashboardTimesheet[]>([])`
4. Add to `loadDashboardData` parallel fetch: `employeeDashboardService.getMyTimesheets()`
5. Set timesheets state from result
6. In the grid section, after the expense claims section, add a timesheet list section wrapped with `isModuleEnabled('timesheets')`

- [ ] **Step 4: Commit**

```bash
git add src/types/dashboard.ts src/services/dashboard-data.ts src/app/dashboard/page.tsx
git commit -m "feat: integrate timesheets into main dashboard"
```

---

### Task 16: Create Supabase Migration SQL

**Files:**
- Create: `supabase/migrations/001_timesheets.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Timesheet configuration per company
CREATE TABLE IF NOT EXISTS ess_timesheet_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES ess_companies(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'simple_hours' CHECK (mode IN ('simple_hours', 'project_based', 'activity_based')),
  submission_cycle TEXT NOT NULL DEFAULT 'weekly' CHECK (submission_cycle IN ('weekly', 'fortnightly', 'monthly')),
  week_start_day INTEGER NOT NULL DEFAULT 1 CHECK (week_start_day BETWEEN 0 AND 6),
  required_hours_per_day NUMERIC(4,2) NOT NULL DEFAULT 8,
  overtime_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  projects_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id)
);

-- Projects for project-based timesheets
CREATE TABLE IF NOT EXISTS ess_projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES ess_companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  billable BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Timesheets (header per submission period)
CREATE TABLE IF NOT EXISTS ess_timesheets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  display_id TEXT NOT NULL,
  employee_id UUID NOT NULL REFERENCES ess_employees(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES ess_companies(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Submitted', 'Approved', 'Rejected', 'Revision Requested')),
  total_hours NUMERIC(6,2) NOT NULL DEFAULT 0,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Timesheet entries (individual time entries)
CREATE TABLE IF NOT EXISTS ess_timesheet_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  timesheet_id UUID NOT NULL REFERENCES ess_timesheets(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  hours NUMERIC(4,2) NOT NULL DEFAULT 0 CHECK (hours >= 0 AND hours <= 24),
  project_id UUID REFERENCES ess_projects(id),
  activity_category TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Timesheet approval entries (same pattern as leave/expense)
CREATE TABLE IF NOT EXISTS ess_timesheet_approval_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  timesheet_id UUID NOT NULL REFERENCES ess_timesheets(id) ON DELETE CASCADE,
  level_no INTEGER NOT NULL,
  approver_id UUID NOT NULL REFERENCES ess_employees(id),
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  action_time TIMESTAMPTZ,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_timesheets_employee ON ess_timesheets(employee_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_company ON ess_timesheets(company_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_status ON ess_timesheets(status);
CREATE INDEX IF NOT EXISTS idx_timesheets_period ON ess_timesheets(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_timesheet ON ess_timesheet_entries(timesheet_id);
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_date ON ess_timesheet_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_timesheet_approvals_timesheet ON ess_timesheet_approval_entries(timesheet_id);
CREATE INDEX IF NOT EXISTS idx_timesheet_approvals_approver ON ess_timesheet_approval_entries(approver_id);
CREATE INDEX IF NOT EXISTS idx_projects_company ON ess_projects(company_id);

-- RLS Policies
ALTER TABLE ess_timesheet_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_timesheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_timesheet_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_timesheet_approval_entries ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Commit**

```bash
mkdir -p supabase/migrations
git add supabase/migrations/001_timesheets.sql
git commit -m "feat: add timesheet database migration"
```

---

### Task 17: Build Verification

- [ ] **Step 1: Verify TypeScript compilation**

Run: `cd /Volumes/ssd2/projects/saas-ess && npx tsc --noEmit 2>&1 | grep -v "supabase\|SupabaseAuth\|signIn" | head -20`

- [ ] **Step 2: Start dev server and verify pages load**

Run: `npx next dev --turbopack --port 3001`

Verify:
- `/dashboard/timesheets` renders the list page
- `/dashboard/timesheets/new` creates a timesheet (after migration)
- Sidebar shows Timesheets when module is enabled
- Team Timesheets page renders for managers

- [ ] **Step 3: Commit any fixes**

```bash
git add -A && git commit -m "fix: resolve build issues for timesheets module"
```
