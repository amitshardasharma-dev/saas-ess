import { screen } from '@testing-library/react'
import { render } from '../test-utils'
import { TimesheetSummary } from '@/components/timesheets/timesheet-summary'

const baseConfig = {
  id: '1', company_id: 'c1', mode: 'simple_hours' as const,
  submission_cycle: 'weekly' as const, week_start_day: 1,
  required_hours_per_day: 8, overtime_enabled: false, projects_enabled: false,
}

describe('TimesheetSummary', () => {
  it('shows total hours', () => {
    render(<TimesheetSummary totalHours={32} periodDays={5} config={baseConfig} />)
    expect(screen.getByText('32')).toBeInTheDocument()
  })

  it('shows expected hours based on config', () => {
    render(<TimesheetSummary totalHours={40} periodDays={5} config={baseConfig} />)
    expect(screen.getByText('40h')).toBeInTheDocument()
  })

  it('shows overtime card when overtime_enabled', () => {
    const config = { ...baseConfig, overtime_enabled: true }
    render(<TimesheetSummary totalHours={50} periodDays={5} config={config} />)
    expect(screen.getByText('Overtime')).toBeInTheDocument()
    expect(screen.getByText('10h')).toBeInTheDocument()
  })

  it('hides overtime card when overtime_enabled is false', () => {
    render(<TimesheetSummary totalHours={50} periodDays={5} config={baseConfig} />)
    expect(screen.queryByText('Overtime')).not.toBeInTheDocument()
  })
})
