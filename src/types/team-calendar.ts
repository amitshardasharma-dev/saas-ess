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
