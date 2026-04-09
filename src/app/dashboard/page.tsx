'use client'

import { useEffect, useState } from 'react'
import { Sparkles, User, Building, Mail, Hash, Calendar } from 'lucide-react'
import { Toaster } from 'react-hot-toast'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuthStore } from '@/stores/auth'
import config from '@/config/environment'

// Employee dashboard components
import { EmployeeStatsCards } from '@/components/dashboard/employee-stats-cards'
import { useEmployee } from '@/hooks/use-employee'
import { MyLeaveApplications } from '@/components/dashboard/my-leave-applications'
import { MyExpenseClaims } from '@/components/dashboard/my-expense-claims'
import { MyPayslips } from '@/components/dashboard/my-payslips'
import { LeaveBalanceComponent } from '@/components/dashboard/leave-balance'
import { PendingApprovalsSummary } from '@/components/dashboard/pending-approvals-summary'
import { PendingExpenseApprovals } from '@/components/dashboard/pending-expense-approvals'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { useModules } from '@/hooks/use-modules'
import { UserRole, hasMinRole } from '@/types/roles'
import { TimesheetList } from '@/components/timesheets/timesheet-list'

// Employee dashboard data and types
import { employeeDashboardService } from '@/services/dashboard-data'
import {
	MyLeaveApplication,
	MyExpenseClaim,
	LeaveBalance,
	EmployeeDashboardStats,
	PayslipData,
	DashboardTimesheet
} from '@/types/dashboard'

interface UserInfoItemProps {
	label: string
	value: string
}

function UserInfoItem({ label, value }: UserInfoItemProps) {
	return (
		<div className="content-flow p-4 rounded-xl space-y-2">
			<p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
			<p className="text-sm text-foreground font-bold truncate" title={value}>{value}</p>
		</div>
	)
}

export default function DashboardPage() {
	const { user, isAuthenticated, checkAuth, isLoading } = useAuthStore()

	// Employee dashboard data state
	const [dashboardStats, setDashboardStats] = useState<EmployeeDashboardStats | null>(null)
	const [myLeaveApplications, setMyLeaveApplications] = useState<MyLeaveApplication[]>([])
	const [myExpenseClaims, setMyExpenseClaims] = useState<MyExpenseClaim[]>([])
	const [myPayslips, setMyPayslips] = useState<PayslipData[]>([])
	const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([])
	const [myTimesheets, setMyTimesheets] = useState<DashboardTimesheet[]>([])
	const [isDashboardLoading, setIsDashboardLoading] = useState(true)
	
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
			const [stats, applications, claims, payslips, balances, timesheets] = await Promise.all([
				employeeDashboardService.getEmployeeDashboardStats(),
				employeeDashboardService.getMyLeaveApplications(),
				employeeDashboardService.getMyExpenseClaims(),
				employeeDashboardService.getMyPayslips(),
				employeeDashboardService.getLeaveBalances(),
				employeeDashboardService.getMyTimesheets()
			])

			// Validate that stats is a proper object with numeric values
			if (stats && typeof stats === 'object' && !(stats as any).message && !(stats as any).workflow_state) {
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
		} catch (error) {
			console.error('Failed to load dashboard data:', error)
			// Set safe default values
			setDashboardStats(null)
			setMyLeaveApplications([])
			setMyExpenseClaims([])
			setMyPayslips([])
			setLeaveBalances([])
			setMyTimesheets([])
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
								Manage your leave applications, expense claims, and view your balances
							</p>
						</div>

						{/* Statistics Cards with Enhanced Styling */}
						{dashboardStats && (
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

						{/* My Applications, Claims, and Payslips Row with Modern Cards */}
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
							<div className="space-y-2">
								<MyPayslips payslips={myPayslips} />
							</div>
						</div>

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
										status: ts.status as any,
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

						{/* Approval Sections Row - Only visible to users with approval access */}
						<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
							<PendingApprovalsSummary />
							<PendingExpenseApprovals />
						</div>


					</div>
				)}
				</div>
			</div>
		</DashboardLayout>
	)
} 