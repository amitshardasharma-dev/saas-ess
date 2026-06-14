'use client'

import { useEffect, useState } from 'react'
import { FileText, Users } from 'lucide-react'
import Link from 'next/link'
import { Toaster } from 'react-hot-toast'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuthStore } from '@/stores/auth'

// Volunteer-facing portal home (Birch base case).
import { VolunteerHome } from '@/components/dashboard/volunteer-home'

// Staff/admin dashboard components (module-gated — leave/expense/timesheets/docs).
import { EmployeeStatsCards } from '@/components/dashboard/employee-stats-cards'
import { MyLeaveApplications } from '@/components/dashboard/my-leave-applications'
import { MyExpenseClaims } from '@/components/dashboard/my-expense-claims'
import { LeaveBalanceComponent } from '@/components/dashboard/leave-balance'
import { PendingApprovalsSummary } from '@/components/dashboard/pending-approvals-summary'
import { PendingExpenseApprovals } from '@/components/dashboard/pending-expense-approvals'
import { useModules } from '@/hooks/use-modules'
import { UserRole, hasMinRole } from '@/types/roles'
import { TimesheetList } from '@/components/timesheets/timesheet-list'

// Team calendar service
import { teamCalendarService } from '@/services/team-calendar'

// Employee dashboard data and types
import { employeeDashboardService } from '@/services/dashboard-data'
import {
	MyLeaveApplication,
	MyExpenseClaim,
	LeaveBalance,
	EmployeeDashboardStats,
	PayslipData,
	DashboardTimesheet,
	PendingAcknowledgment
} from '@/types/dashboard'
import type { TimesheetStatus } from '@/types/timesheet'

export default function DashboardPage() {
	const { user, isAuthenticated, checkAuth, isLoading } = useAuthStore()

	const userRole = (user?.role || 'employee') as UserRole
	// Staff (hr/manager) and admin keep the legacy module-driven dashboard;
	// volunteers get the clean portal home. Roles are stable values — only the
	// display labels collapse hr/manager to "Staff" (see types/roles).
	const isStaff = hasMinRole(userRole, 'manager')

	useEffect(() => {
		checkAuth()
	}, [checkAuth])

	if (isLoading) {
		return (
			<div className="mx-auto w-full max-w-5xl space-y-6 p-6">
				<div className="space-y-2">
					<div className="h-7 w-56 animate-pulse rounded bg-muted" />
					<div className="h-4 w-72 animate-pulse rounded bg-muted" />
				</div>
			</div>
		)
	}

	if (!isAuthenticated || !user) {
		return null
	}

	const firstName = user.full_name?.trim().split(/\s+/)[0]

	return (
		<>
			<Toaster position="top-center" />
			{isStaff ? (
				<StaffDashboard userRole={userRole} />
			) : (
				<VolunteerHome firstName={firstName} />
			)}
		</>
	)
}

// ── Staff / admin dashboard ──────────────────────────────────────────────────
// Preserves the existing module-gated behavior (leave / expense / timesheets /
// documents / approvals / team absences). Rendered inside the shared reference
// container — no fluid-bg / DashboardLayout shell (the route-group layout already
// supplies the sidebar chrome).
function StaffDashboard({ userRole }: { userRole: UserRole }) {
	const { user, isAuthenticated } = useAuthStore()
	const { isModuleEnabled } = useModules()

	const [dashboardStats, setDashboardStats] = useState<EmployeeDashboardStats | null>(null)
	const [myLeaveApplications, setMyLeaveApplications] = useState<MyLeaveApplication[]>([])
	const [myExpenseClaims, setMyExpenseClaims] = useState<MyExpenseClaim[]>([])
	const [, setMyPayslips] = useState<PayslipData[]>([])
	const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([])
	const [myTimesheets, setMyTimesheets] = useState<DashboardTimesheet[]>([])
	const [pendingAcks, setPendingAcks] = useState<PendingAcknowledgment[]>([])
	const [isDashboardLoading, setIsDashboardLoading] = useState(true)
	const [teamAbsencesThisWeek, setTeamAbsencesThisWeek] = useState<number>(0)

	useEffect(() => {
		if (isAuthenticated && user) {
			loadDashboardData()
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isAuthenticated, user])

	const loadDashboardData = async () => {
		try {
			setIsDashboardLoading(true)

			const [stats, applications, claims, payslips, balances, timesheets, acks] = await Promise.all([
				employeeDashboardService.getEmployeeDashboardStats(),
				employeeDashboardService.getMyLeaveApplications(),
				employeeDashboardService.getMyExpenseClaims(),
				employeeDashboardService.getMyPayslips(),
				employeeDashboardService.getLeaveBalances(),
				employeeDashboardService.getMyTimesheets(),
				employeeDashboardService.getPendingAcknowledgments()
			])

			if (stats && typeof stats === 'object' && !(stats as unknown as Record<string, unknown>).message && !(stats as unknown as Record<string, unknown>).workflow_state) {
				setDashboardStats(stats)
			} else {
				setDashboardStats(null)
			}

			setMyLeaveApplications(Array.isArray(applications) ? applications : [])
			setMyExpenseClaims(Array.isArray(claims) ? claims : [])
			setMyPayslips(Array.isArray(payslips) ? payslips : [])
			setLeaveBalances(Array.isArray(balances) ? balances : [])
			setMyTimesheets(Array.isArray(timesheets) ? timesheets : [])
			setPendingAcks(Array.isArray(acks) ? acks : [])

			// Team absences for managers with the leave module enabled.
			if (hasMinRole(userRole, 'manager') && isModuleEnabled('leave')) {
				try {
					const now = new Date()
					const year = now.getFullYear()
					const month = now.getMonth() + 1
					const teamData = await teamCalendarService.getTeamLeaves(year, month)

					const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
					const dayOfWeek = today.getDay()
					const diffToMon = (dayOfWeek === 0 ? -6 : 1 - dayOfWeek)
					const weekStart = new Date(today)
					weekStart.setDate(today.getDate() + diffToMon)
					const weekEnd = new Date(weekStart)
					weekEnd.setDate(weekStart.getDate() + 6)

					const weekStartStr = weekStart.toISOString().slice(0, 10)
					const weekEndStr = weekEnd.toISOString().slice(0, 10)

					const uniqueEmployees = new Set<string>()
					for (const leave of teamData.leaves) {
						if (leave.fromDate <= weekEndStr && leave.toDate >= weekStartStr) {
							uniqueEmployees.add(leave.employeeId)
						}
					}
					setTeamAbsencesThisWeek(uniqueEmployees.size)
				} catch {
					// Non-critical: silently ignore team calendar errors
				}
			}
		} catch (error) {
			console.error('Failed to load dashboard data:', error)
			setDashboardStats(null)
			setMyLeaveApplications([])
			setMyExpenseClaims([])
			setMyPayslips([])
			setLeaveBalances([])
			setMyTimesheets([])
			setPendingAcks([])
		} finally {
			setIsDashboardLoading(false)
		}
	}

	return (
		<div className="mx-auto w-full max-w-5xl space-y-6 p-6">
			<div>
				<h1 className="text-2xl font-semibold text-foreground">
					Welcome back{user?.full_name ? `, ${user.full_name.trim().split(/\s+/)[0]}` : ''}
				</h1>
				<p className="mt-1 text-sm text-muted-foreground">Your tasks and activity at a glance.</p>
			</div>

			{isDashboardLoading ? (
				<div className="space-y-6" aria-busy="true">
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{Array.from({ length: 6 }).map((_, i) => (
							<Card key={i} className="py-5">
								<CardContent className="space-y-3">
									<div className="h-8 w-16 animate-pulse rounded bg-muted" />
									<div className="h-4 w-24 animate-pulse rounded bg-muted" />
								</CardContent>
							</Card>
						))}
					</div>
				</div>
			) : (
				<div className="space-y-6">
					{/* Statistics Cards — leave/expense oriented; only when those modules are on */}
					{dashboardStats && (isModuleEnabled('leave') || isModuleEnabled('expense')) && (
						<EmployeeStatsCards stats={dashboardStats} />
					)}

					{/* Leave Balance Overview */}
					{isModuleEnabled('leave') && <LeaveBalanceComponent balances={leaveBalances} />}

					{/* My Applications & Claims — each gated by its module */}
					{(isModuleEnabled('leave') || isModuleEnabled('expense')) && (
						<div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
							{isModuleEnabled('leave') && <MyLeaveApplications applications={myLeaveApplications} />}
							{isModuleEnabled('expense') && <MyExpenseClaims claims={myExpenseClaims} />}
						</div>
					)}

					{/* Timesheets */}
					{isModuleEnabled('timesheets') && (
						<TimesheetList
							timesheets={myTimesheets.map(ts => ({
								id: ts.id,
								display_id: ts.displayId,
								period_start: ts.periodStart,
								period_end: ts.periodEnd,
								total_hours: ts.totalHours,
								status: ts.status as unknown as TimesheetStatus,
								employee_id: '',
								company_id: '',
								submitted_at: null,
								created_at: '',
								updated_at: '',
							}))}
							maxItems={5}
						/>
					)}

					{/* Pending Acknowledgments */}
					{isModuleEnabled('documents') && pendingAcks.length > 0 && (
						<Card className="border-l-4 border-amber-500">
							<CardContent className="flex items-center justify-between">
								<div className="flex items-center gap-3">
									<span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
										<FileText className="h-5 w-5" />
									</span>
									<div>
										<p className="font-semibold text-foreground">Pending Acknowledgments</p>
										<p className="text-sm text-muted-foreground">
											{pendingAcks.length} document{pendingAcks.length !== 1 ? 's' : ''} require your acknowledgment
										</p>
									</div>
								</div>
								<Link href="/dashboard/documents" className="text-sm font-medium text-primary hover:underline">
									View Documents →
								</Link>
							</CardContent>
						</Card>
					)}

					{/* Approval Sections — gated by their modules (leave / expense) */}
					{(isModuleEnabled('leave') || isModuleEnabled('expense')) && (
						<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
							{isModuleEnabled('leave') && <PendingApprovalsSummary />}
							{isModuleEnabled('expense') && <PendingExpenseApprovals />}
						</div>
					)}

					{/* Team Absences This Week — Managers only */}
					{hasMinRole(userRole, 'manager') && isModuleEnabled('leave') && (
						<Card className="border-l-4 border-primary">
							<CardHeader className="pb-2">
								<CardTitle className="flex items-center gap-2 text-base">
									<Users className="h-5 w-5 text-primary" />
									Team Absences This Week
								</CardTitle>
								<CardDescription>Employees on leave during the current week</CardDescription>
							</CardHeader>
							<CardContent className="flex items-center justify-between">
								<div>
									<span className="text-4xl font-bold text-foreground">{teamAbsencesThisWeek}</span>
									<span className="ml-2 text-sm text-muted-foreground">
										{teamAbsencesThisWeek === 1 ? 'employee' : 'employees'} off
									</span>
								</div>
								<Link href="/dashboard/team-calendar" className="text-sm font-medium text-primary hover:underline">
									View Team Calendar →
								</Link>
							</CardContent>
						</Card>
					)}
				</div>
			)}
		</div>
	)
}
