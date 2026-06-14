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
