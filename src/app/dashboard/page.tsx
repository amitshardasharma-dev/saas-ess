'use client'

import { useEffect, useState } from 'react'
import { Sparkles, User, Building, Mail, Hash, FileText, Users } from 'lucide-react'
import Link from 'next/link'
import { Toaster } from 'react-hot-toast'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuthStore } from '@/stores/auth'

// Employee dashboard components
import { EmployeeStatsCards } from '@/components/dashboard/employee-stats-cards'
import { useEmployee } from '@/hooks/use-employee'
import { MyLeaveApplications } from '@/components/dashboard/my-leave-applications'
import { MyExpenseClaims } from '@/components/dashboard/my-expense-claims'
import { LeaveBalanceComponent } from '@/components/dashboard/leave-balance'
import { PendingApprovalsSummary } from '@/components/dashboard/pending-approvals-summary'
import { PendingExpenseApprovals } from '@/components/dashboard/pending-expense-approvals'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
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

	// Employee dashboard data state
	const [dashboardStats, setDashboardStats] = useState<EmployeeDashboardStats | null>(null)
	const [myLeaveApplications, setMyLeaveApplications] = useState<MyLeaveApplication[]>([])
	const [myExpenseClaims, setMyExpenseClaims] = useState<MyExpenseClaim[]>([])
	const [, setMyPayslips] = useState<PayslipData[]>([])
	const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([])
	const [myTimesheets, setMyTimesheets] = useState<DashboardTimesheet[]>([])
	const [pendingAcks, setPendingAcks] = useState<PendingAcknowledgment[]>([])
	const [isDashboardLoading, setIsDashboardLoading] = useState(true)
	const [teamAbsencesThisWeek, setTeamAbsencesThisWeek] = useState<number>(0)
	
	// Get employee data for enhanced welcome section
	const { employee, loading: employeeLoading } = useEmployee()
	const { isModuleEnabled } = useModules()
	const userRole = (user?.role || 'employee') as UserRole

	useEffect(() => {
		// Check authentication status
		checkAuth()
	}, [checkAuth])

	useEffect(() => {
		// Load dashboard data when user is authenticated
		if (isAuthenticated && user) {
			loadDashboardData()
		}
	}, [isAuthenticated, user])

	const loadDashboardData = async () => {
		try {
			setIsDashboardLoading(true)
			console.log('Dashboard Page: Current user:', user)
			
			// Load all employee dashboard data in parallel
			const [stats, applications, claims, payslips, balances, timesheets, acks] = await Promise.all([
				employeeDashboardService.getEmployeeDashboardStats(),
				employeeDashboardService.getMyLeaveApplications(),
				employeeDashboardService.getMyExpenseClaims(),
				employeeDashboardService.getMyPayslips(),
				employeeDashboardService.getLeaveBalances(),
				employeeDashboardService.getMyTimesheets(),
				employeeDashboardService.getPendingAcknowledgments()
			])

			// Validate that stats is a proper object with numeric values
			if (stats && typeof stats === 'object' && !(stats as unknown as Record<string, unknown>).message && !(stats as unknown as Record<string, unknown>).workflow_state) {
				setDashboardStats(stats)
			} else {
				console.error('Invalid stats data received:', stats)
				setDashboardStats(null)
			}

			// Validate that applications is an array
			if (Array.isArray(applications)) {
				console.log('Dashboard Page: Received applications:', applications)
				setMyLeaveApplications(applications)
			} else {
				console.error('Invalid applications data received:', applications)
				setMyLeaveApplications([])
			}

			// Validate that claims is an array
			if (Array.isArray(claims)) {
				setMyExpenseClaims(claims)
			} else {
				console.error('Invalid claims data received:', claims)
				setMyExpenseClaims([])
			}

			// Validate that payslips is an array
			if (Array.isArray(payslips)) {
				setMyPayslips(payslips)
			} else {
				console.error('Invalid payslips data received:', payslips)
				setMyPayslips([])
			}

			// Validate that balances is an array
			if (Array.isArray(balances)) {
				setLeaveBalances(balances)
			} else {
				console.error('Invalid balances data received:', balances)
				setLeaveBalances([])
			}

			// Set timesheets state
			setMyTimesheets(Array.isArray(timesheets) ? timesheets : [])

			// Set pending acknowledgments state
			setPendingAcks(Array.isArray(acks) ? acks : [])

			// Load team absences for managers with leave module enabled
			if (hasMinRole(userRole, 'manager') && isModuleEnabled('leave')) {
				try {
					const now = new Date()
					const year = now.getFullYear()
					const month = now.getMonth() + 1
					const teamData = await teamCalendarService.getTeamLeaves(year, month)

					// Determine current week boundaries (Mon–Sun)
					const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
					const dayOfWeek = today.getDay() // 0=Sun, 1=Mon, ...
					const diffToMon = (dayOfWeek === 0 ? -6 : 1 - dayOfWeek)
					const weekStart = new Date(today)
					weekStart.setDate(today.getDate() + diffToMon)
					const weekEnd = new Date(weekStart)
					weekEnd.setDate(weekStart.getDate() + 6)

					const weekStartStr = weekStart.toISOString().slice(0, 10)
					const weekEndStr = weekEnd.toISOString().slice(0, 10)

					// Count unique employees with leave overlapping the current week
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
			// Set safe default values
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

	if (isLoading) {
		return (
			<div className="min-h-screen fluid-bg flex items-center justify-center p-6">
				<div className="text-center floating-element p-12 max-w-md mx-auto">
					<div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary mx-auto mb-6"></div>
					<p className="text-foreground font-semibold text-lg">Loading your workspace...</p>
					<p className="text-muted-foreground text-sm mt-2">Setting up your personalized dashboard</p>
				</div>
			</div>
		)
	}

	if (!isAuthenticated || !user) {
		return null
	}

	return (
		<DashboardLayout>
			<Toaster position="top-center" />
			
			{/* Main Content with Modern Spacing */}
			<div className="min-h-screen fluid-bg">
				{/* Enhanced Header with Employee Info */}
				<div className="border-b border-border bg-background/50 backdrop-blur-sm">
					<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
						<div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
							{/* Welcome Section */}
							<div className="flex-1">
								<div className="flex items-center space-x-3 mb-2">
									<div className="p-2 bg-primary/10 rounded-xl">
										<Sparkles className="h-6 w-6 text-primary" />
									</div>
									<div>
										<h1 className="text-2xl font-bold text-foreground">
											Welcome back, {user.full_name}
										</h1>
										<p className="text-muted-foreground">Have a productive day!</p>
									</div>
								</div>
							</div>
							
							{/* Employee Details Card */}
							{employee && !employeeLoading && (
								<div className="bg-muted/30 backdrop-blur-sm rounded-2xl p-4 border border-border/50">
									<div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
										{employee.employee_id && (
											<div className="flex items-center space-x-2">
												<Hash className="h-4 w-4 text-primary" />
												<div>
													<p className="text-muted-foreground text-xs">Employee ID</p>
													<p className="font-medium text-foreground">{employee.employee_id}</p>
												</div>
											</div>
										)}
										
										{employee.bc_employee_id && (
											<div className="flex items-center space-x-2">
												<User className="h-4 w-4 text-primary" />
												<div>
													<p className="text-muted-foreground text-xs">BC Code</p>
													<p className="font-medium text-foreground">{employee.bc_employee_id}</p>
												</div>
											</div>
										)}
										
										{employee.user_id && (
											<div className="flex items-center space-x-2">
												<Mail className="h-4 w-4 text-primary" />
												<div>
													<p className="text-muted-foreground text-xs">Email</p>
													<p className="font-medium text-foreground truncate max-w-32">{employee.user_id}</p>
												</div>
											</div>
										)}
										
										{(employee.company || employee.department) && (
											<div className="flex items-center space-x-2">
												<Building className="h-4 w-4 text-primary" />
												<div>
													<p className="text-muted-foreground text-xs">
														{employee.company && employee.department ? 'Dept' : employee.company ? 'Company' : 'Department'}
													</p>
													<p className="font-medium text-foreground truncate max-w-32">
														{employee.department || employee.company || 'Not Set'}
													</p>
												</div>
											</div>
										)}
									</div>
								</div>
							)}
							
							{/* Loading state for employee details */}
							{employeeLoading && (
								<div className="bg-muted/30 backdrop-blur-sm rounded-2xl p-4 border border-border/50">
									<div className="animate-pulse">
										<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
											{[...Array(4)].map((_, i) => (
												<div key={i} className="flex items-center space-x-2">
													<div className="h-4 w-4 bg-muted rounded"></div>
													<div className="space-y-1">
														<div className="h-3 bg-muted rounded w-16"></div>
														<div className="h-4 bg-muted rounded w-20"></div>
													</div>
												</div>
											))}
										</div>
									</div>
								</div>
							)}
						</div>
					</div>
				</div>
				
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
				{isDashboardLoading ? (
					<div className="space-y-8">
						{/* Loading Header */}
						<div className="text-center mb-8">
							<div className="animate-pulse">
								<div className="h-8 bg-muted rounded-lg w-64 mx-auto mb-2"></div>
								<div className="h-4 bg-muted rounded w-96 mx-auto"></div>
							</div>
						</div>

						{/* Loading Stats Cards */}
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
							{[...Array(6)].map((_, i) => (
								<div key={i} className="animate-pulse">
									<div className="flowing-card p-6 h-32">
										<div className="flex items-center justify-between mb-4">
											<div className="h-10 w-10 bg-muted rounded-xl"></div>
											<div className="h-2 w-2 bg-muted rounded-full"></div>
										</div>
										<div className="space-y-2">
											<div className="h-8 bg-muted rounded w-12"></div>
											<div className="h-4 bg-muted rounded w-20"></div>
											<div className="h-3 bg-muted rounded w-16"></div>
										</div>
									</div>
								</div>
							))}
						</div>

						{/* Loading Leave Balance */}
						<div className="flowing-card p-8">
							<div className="animate-pulse">
								<div className="flex items-center justify-between mb-8">
									<div className="flex items-center space-x-4">
										<div className="h-12 w-12 bg-muted rounded-xl"></div>
										<div className="space-y-2">
											<div className="h-6 bg-muted rounded w-64"></div>
											<div className="h-4 bg-muted rounded w-48"></div>
										</div>
									</div>
									<div className="flex space-x-2">
										<div className="h-8 w-8 bg-muted rounded"></div>
										<div className="h-8 w-8 bg-muted rounded"></div>
										<div className="h-8 w-8 bg-muted rounded"></div>
									</div>
								</div>
								<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
									{[...Array(8)].map((_, i) => (
										<div key={i} className="border-2 border-muted rounded-2xl p-6">
											<div className="flex items-center justify-between mb-4">
												<div className="h-12 w-12 bg-muted rounded-xl"></div>
												<div className="h-6 w-16 bg-muted rounded-full"></div>
											</div>
											<div className="h-6 bg-muted rounded w-24 mb-4"></div>
											<div className="grid grid-cols-2 gap-4 mb-4">
												<div className="text-center">
													<div className="h-8 bg-muted rounded w-8 mx-auto mb-1"></div>
													<div className="h-3 bg-muted rounded w-12 mx-auto"></div>
												</div>
												<div className="text-center">
													<div className="h-8 bg-muted rounded w-8 mx-auto mb-1"></div>
													<div className="h-3 bg-muted rounded w-16 mx-auto"></div>
												</div>
											</div>
											<div className="h-3 bg-muted rounded-full"></div>
										</div>
									))}
								</div>
							</div>
						</div>

						{/* Loading Applications, Claims, and Payslips */}
						<div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
							{[...Array(5)].map((_, i) => (
								<div key={i} className="flowing-card p-8">
									<div className="animate-pulse">
										<div className="flex items-center space-x-4 mb-8">
											<div className="h-12 w-12 bg-muted rounded-xl"></div>
											<div className="space-y-2">
												<div className="h-6 bg-muted rounded w-48"></div>
												<div className="h-4 bg-muted rounded w-64"></div>
											</div>
										</div>
										<div className="space-y-4">
											{[...Array(3)].map((_, j) => (
												<div key={j} className="border-2 border-muted rounded-2xl p-6">
													<div className="flex items-start justify-between mb-4">
														<div className="flex items-center space-x-3">
															<div className="h-4 w-4 bg-muted rounded"></div>
															<div className="space-y-1">
																<div className="h-5 bg-muted rounded w-32"></div>
																<div className="h-4 bg-muted rounded w-20"></div>
															</div>
														</div>
														<div className="flex items-center space-x-3">
															<div className="h-6 w-16 bg-muted rounded-full"></div>
															<div className="h-8 w-16 bg-muted rounded"></div>
														</div>
													</div>
													<div className="grid grid-cols-3 gap-4 mb-4">
														{[...Array(3)].map((_, k) => (
															<div key={k} className="bg-muted/50 p-4 rounded-xl">
																<div className="h-3 bg-muted rounded w-16 mb-1"></div>
																<div className="h-5 bg-muted rounded w-20"></div>
															</div>
														))}
													</div>
													<div className="bg-muted/50 p-4 rounded-xl mb-4">
														<div className="h-3 bg-muted rounded w-12 mb-2"></div>
														<div className="h-4 bg-muted rounded w-full"></div>
													</div>
													<div className="flex justify-between pt-4 border-t border-muted">
														<div className="h-3 bg-muted rounded w-32"></div>
														<div className="h-3 bg-muted rounded w-24"></div>
													</div>
												</div>
											))}
										</div>
									</div>
								</div>
							))}
						</div>
					</div>
				) : (
					<div className="space-y-8">
						{/* Welcome Section */}
						<div className="text-center mb-8">
							<h2 className="text-3xl font-bold text-foreground mb-2">
								Your Personal Dashboard
							</h2>
							<p className="text-muted-foreground">
								Your tasks and activity at a glance
							</p>
						</div>

						{/* Statistics Cards — leave/expense oriented; only when those modules are on */}
						{dashboardStats && (isModuleEnabled('leave') || isModuleEnabled('expense')) && (
							<div className="relative">
								<EmployeeStatsCards stats={dashboardStats} />
								<div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-accent/5 rounded-2xl -z-10 blur-3xl"></div>
							</div>
						)}

						{/* Leave Balance Overview with Glass Effect */}
						{isModuleEnabled('leave') && (
							<div className="relative">
								<LeaveBalanceComponent balances={leaveBalances} />
							</div>
						)}

						{/* My Applications & Claims — each gated by its module (Payslips removed:
						    no payslips module/API exists, was mock data) */}
						{(isModuleEnabled('leave') || isModuleEnabled('expense')) && (
							<div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
								{isModuleEnabled('leave') && (
									<div className="space-y-2">
										<MyLeaveApplications applications={myLeaveApplications} />
									</div>
								)}
								{isModuleEnabled('expense') && (
									<div className="space-y-2">
										<MyExpenseClaims claims={myExpenseClaims} />
									</div>
								)}
							</div>
						)}

						{/* Timesheets Section */}
						{isModuleEnabled('timesheets') && (
							<div className="space-y-2">
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
							</div>
						)}

						{/* Pending Acknowledgments Card */}
						{isModuleEnabled('documents') && pendingAcks.length > 0 && (
							<div className="flowing-card p-6 border-l-4 border-amber-500">
								<div className="flex items-center justify-between">
									<div className="flex items-center space-x-3">
										<div className="p-2 bg-amber-100 rounded-xl">
											<FileText className="h-5 w-5 text-amber-600" />
										</div>
										<div>
											<h3 className="font-semibold text-foreground">Pending Acknowledgments</h3>
											<p className="text-sm text-muted-foreground">
												{pendingAcks.length} document{pendingAcks.length !== 1 ? 's' : ''} require your acknowledgment
											</p>
										</div>
									</div>
									<Link
										href="/dashboard/documents"
										className="text-sm font-medium text-primary hover:underline"
									>
										View Documents →
									</Link>
								</div>
							</div>
						)}

						{/* Approval Sections — gated by their modules (leave / expense) */}
						{(isModuleEnabled('leave') || isModuleEnabled('expense')) && (
							<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
								{isModuleEnabled('leave') && <PendingApprovalsSummary />}
								{isModuleEnabled('expense') && <PendingExpenseApprovals />}
							</div>
						)}

						{/* Team Absences This Week - Managers only */}
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
										<span className="ml-2 text-muted-foreground text-sm">
											{teamAbsencesThisWeek === 1 ? 'employee' : 'employees'} off
										</span>
									</div>
									<Link
										href="/dashboard/team-calendar"
										className="text-sm font-medium text-primary hover:underline"
									>
										View Team Calendar →
									</Link>
								</CardContent>
							</Card>
						)}

					</div>
				)}
				</div>
			</div>
		</DashboardLayout>
	)
} 