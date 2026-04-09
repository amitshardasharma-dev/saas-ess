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
