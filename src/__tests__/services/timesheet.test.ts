import { timesheetService } from '@/services/timesheet'
import { TimesheetConfig } from '@/types/timesheet'

// Base config used across tests
const baseConfig: TimesheetConfig = {
  submission_cycle: 'weekly',
  week_start_day: 1, // Monday
  entry_mode: 'daily',
  allow_overtime: false,
  require_project: false,
}

describe('getCurrentPeriod', () => {
  it('weekly config returns a 7-day range starting on Monday', () => {
    const config: TimesheetConfig = { ...baseConfig, submission_cycle: 'weekly', week_start_day: 1 }
    const result = timesheetService.getCurrentPeriod(config)

    // Both values should be valid ISO date strings (YYYY-MM-DD)
    expect(result.start).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(result.end).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    // end should be exactly 6 days after start
    const start = new Date(result.start)
    const end = new Date(result.end)
    const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    expect(diffDays).toBe(6)

    // start should be a Monday (day index 1)
    expect(start.getDay()).toBe(1)
  })

  it('weekly config with Sunday start (week_start_day=0) starts on Sunday', () => {
    const config: TimesheetConfig = { ...baseConfig, submission_cycle: 'weekly', week_start_day: 0 }
    const result = timesheetService.getCurrentPeriod(config)

    const start = new Date(result.start)
    expect(start.getDay()).toBe(0) // Sunday

    const end = new Date(result.end)
    const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    expect(diffDays).toBe(6)
  })

  it('monthly config returns first-to-last day of current month', () => {
    const config: TimesheetConfig = { ...baseConfig, submission_cycle: 'monthly' }
    const result = timesheetService.getCurrentPeriod(config)

    expect(result.start).toMatch(/^\d{4}-\d{2}-01$/)
    expect(result.end).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    // start should be day 1
    const start = new Date(result.start)
    expect(start.getDate()).toBe(1)

    // end should be the last day of the month (next month's day 0 = this month's last)
    const end = new Date(result.end)
    const lastDay = new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate()
    expect(end.getDate()).toBe(lastDay)

    // Both should be in the same month/year
    expect(start.getFullYear()).toBe(end.getFullYear())
    expect(start.getMonth()).toBe(end.getMonth())
  })

  it('fortnightly config returns either 1–15 or 16–end of month', () => {
    const config: TimesheetConfig = { ...baseConfig, submission_cycle: 'fortnightly' }
    const result = timesheetService.getCurrentPeriod(config)

    const now = new Date()
    const day = now.getDate()

    if (day <= 15) {
      expect(result.start).toMatch(/^\d{4}-\d{2}-01$/)
      expect(result.end).toMatch(/^\d{4}-\d{2}-15$/)
    } else {
      expect(result.start).toMatch(/^\d{4}-\d{2}-16$/)
      // end should be last day of month
      const end = new Date(result.end)
      const lastDay = new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate()
      expect(end.getDate()).toBe(lastDay)
    }

    expect(result.start).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(result.end).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('getPeriodDates', () => {
  it('returns correct number of dates for a 7-day week', () => {
    const dates = timesheetService.getPeriodDates('2026-04-06', '2026-04-12')
    expect(dates).toHaveLength(7)
    expect(dates[0]).toBe('2026-04-06')
    expect(dates[6]).toBe('2026-04-12')
  })

  it('returns a single date when start equals end', () => {
    const dates = timesheetService.getPeriodDates('2026-04-09', '2026-04-09')
    expect(dates).toHaveLength(1)
    expect(dates[0]).toBe('2026-04-09')
  })

  it('handles month boundaries correctly (March into April)', () => {
    const dates = timesheetService.getPeriodDates('2026-03-30', '2026-04-02')
    expect(dates).toHaveLength(4)
    expect(dates[0]).toBe('2026-03-30')
    expect(dates[1]).toBe('2026-03-31')
    expect(dates[2]).toBe('2026-04-01')
    expect(dates[3]).toBe('2026-04-02')
  })

  it('handles month boundaries crossing February (leap year)', () => {
    const dates = timesheetService.getPeriodDates('2024-02-27', '2024-03-01')
    expect(dates).toHaveLength(4)
    expect(dates[0]).toBe('2024-02-27')
    expect(dates[1]).toBe('2024-02-28')
    expect(dates[2]).toBe('2024-02-29') // 2024 is a leap year
    expect(dates[3]).toBe('2024-03-01')
  })

  it('returns correct dates for a first-half fortnightly period', () => {
    const dates = timesheetService.getPeriodDates('2026-04-01', '2026-04-15')
    expect(dates).toHaveLength(15)
    expect(dates[0]).toBe('2026-04-01')
    expect(dates[14]).toBe('2026-04-15')
  })

  it('all returned values are valid YYYY-MM-DD strings', () => {
    const dates = timesheetService.getPeriodDates('2026-01-29', '2026-02-04')
    expect(dates).toHaveLength(7)
    dates.forEach(d => {
      expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
    expect(dates[2]).toBe('2026-01-31')
    expect(dates[3]).toBe('2026-02-01')
  })
})
