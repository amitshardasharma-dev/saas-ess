'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
	Clock,
	ArrowRight,
	FileText,
	Eye,
	AlertCircle,
	Sparkles
} from 'lucide-react'
import { useEmployee } from '@/hooks/use-employee'

interface PendingApproval {
	name: string
	employee: string
	employee_name: string
	leave_type: string
	from_date: string
	till_date: string
	total_days: number
	reason: string
	level_no: number
	workflow_state: string
	type?: 'timesheet' | 'expense' | 'leave'
}

interface PendingApprovalsSummaryProps {
	className?: string
}

export function PendingApprovalsSummary({ className }: PendingApprovalsSummaryProps) {
	const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([])
	const [isLoading, setIsLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const router = useRouter()
	const { hasLeaveApprovalAccess, loading: employeeLoading } = useEmployee()

	useEffect(() => {
		if (!employeeLoading && hasLeaveApprovalAccess) {
			loadPendingApprovals()
		} else if (!employeeLoading && !hasLeaveApprovalAccess) {
			setIsLoading(false)
		}
	}, [hasLeaveApprovalAccess, employeeLoading])

	const loadPendingApprovals = async () => {
		try {
			setIsLoading(true)
			setError(null)

			const token = localStorage.getItem('ess_access_token')
			const response = await fetch('/api/pending-approvals', {
				headers: token ? { Authorization: `Bearer ${token}` } : {},
			})

			if (!response.ok) {
				throw new Error('Failed to fetch pending approvals')
			}

			const data = await response.json()
			console.log('Dashboard pending approvals response:', data)
			
			// The API returns { pending_approvals: [...] }
			const approvals = data.pending_approvals || []
			// Take only the first 4 items for dashboard summary
			setPendingApprovals(Array.isArray(approvals) ? approvals.slice(0, 4) : [])
		} catch (error) {
			console.error('Error loading pending approvals:', error)
			setError('Failed to load pending approvals')
			setPendingApprovals([])
		} finally {
			setIsLoading(false)
		}
	}

	const formatDate = (dateString: string) => {
		return new Date(dateString).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric'
		})
	}

	const formatLeaveType = (leaveType: string) => {
		if (!leaveType) return 'N/A'
		return leaveType.replace('LEAVETYPE', 'Leave Type ')
	}

	const viewAllApprovals = () => {
		router.push('/dashboard/pending-approvals')
	}

	const viewLeaveDetails = () => {
		router.push('/dashboard/pending-approvals')
	}

	// Don't show the component if user doesn't have approval access
	if (!employeeLoading && !hasLeaveApprovalAccess) {
		return null
	}

	return (
		<div className={`flowing-card p-4 hover-lift ${className}`}>
			<div className="flex items-center justify-between mb-4">
				<div className="flex items-center space-x-3">
					<div className="floating-element p-2">
						<Clock className="h-5 w-5 text-amber-600" />
					</div>
					<div>
						<h2 className="text-lg font-bold text-foreground flex items-center space-x-2">
							<span>Leave Pending Approvals</span>
							<Sparkles className="h-4 w-4 text-primary" />
						</h2>
						<p className="text-sm text-muted-foreground">
							Leave applications awaiting your approval
						</p>
					</div>
				</div>
				{pendingApprovals.length > 0 && (
					<Button 
						variant="outline" 
						size="sm"
						onClick={viewAllApprovals}
						className="floating-element hover-lift"
					>
						<span>View All</span>
						<ArrowRight className="h-4 w-4 ml-1" />
					</Button>
				)}
			</div>

					<div className="space-y-2">
			{isLoading ? (
				<div className="space-y-2">
					{[...Array(2)].map((_, i) => (
						<div key={i} className="animate-pulse">
							<div className="border border-border rounded-lg p-3">
								<div className="flex items-center justify-between mb-3">
									<div className="flex items-center space-x-3">
										<div className="h-8 w-8 bg-muted rounded-full"></div>
										<div className="space-y-1">
											<div className="h-4 bg-muted rounded w-32"></div>
											<div className="h-3 bg-muted rounded w-24"></div>
										</div>
									</div>
									<div className="h-6 w-16 bg-muted rounded-full"></div>
								</div>
								<div className="grid grid-cols-3 gap-3">
									<div className="h-3 bg-muted rounded w-full"></div>
									<div className="h-3 bg-muted rounded w-full"></div>
									<div className="h-3 bg-muted rounded w-full"></div>
								</div>
							</div>
						</div>
					))}
				</div>
			) : error ? (
				<div className="text-center py-6 content-flow">
					<AlertCircle className="h-8 w-8 mx-auto mb-2 text-red-500 opacity-40" />
					<p className="text-sm font-semibold text-muted-foreground mb-1">{error}</p>
					<Button 
						variant="outline" 
						size="sm" 
						onClick={loadPendingApprovals}
						className="mt-2"
					>
						Try Again
					</Button>
				</div>
			) : pendingApprovals.length === 0 ? (
				<div className="text-center py-6 content-flow">
					<FileText className="h-8 w-8 mx-auto mb-2 text-green-500 opacity-40" />
					<p className="text-sm font-semibold text-muted-foreground mb-1">All caught up!</p>
					<p className="text-xs text-muted-foreground">
						No pending approvals at this time
					</p>
				</div>
			) : (
				<div className="space-y-2">
					{pendingApprovals.map((approval) => (
						<div 
							key={approval.name}
							className="relative overflow-hidden rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-3 hover-lift group transition-all duration-200 cursor-pointer"
							onClick={() => viewLeaveDetails()}
						>
							<div className="flex items-center justify-between mb-2">
								<div className="flex items-center space-x-3">
									<div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 text-amber-600 font-semibold text-sm">
										{approval.level_no}
									</div>
									<div>
										<h3 className="font-semibold text-sm text-foreground">
											{approval.employee_name}
										</h3>
										<p className="text-xs text-muted-foreground">
											{approval.employee}
										</p>
									</div>
								</div>
								<div className="flex items-center space-x-2">
									<Badge variant="secondary" className="bg-amber-100 text-amber-800 text-xs">
										Pending
									</Badge>
									<Button 
										size="sm" 
										variant="ghost" 
										className="h-6 w-6 p-0 hover:bg-primary/10"
										onClick={(e) => {
											e.stopPropagation()
											viewLeaveDetails()
										}}
										title="View details"
									>
										<Eye className="h-3 w-3" />
									</Button>
								</div>
							</div>

							<div className="grid grid-cols-3 gap-2 mb-2 text-xs">
								<div className="bg-muted/50 p-2 rounded-lg">
									{approval.type === 'timesheet' ? (
										<>
											<p className="text-muted-foreground mb-1">Type</p>
											<p className="font-medium text-foreground text-xs">Timesheet</p>
										</>
									) : approval.type === 'expense' ? (
										<>
											<p className="text-muted-foreground mb-1">Type</p>
											<p className="font-medium text-foreground text-xs">Expense</p>
										</>
									) : (
										<>
											<p className="text-muted-foreground mb-1">Leave Type</p>
											<p className="font-medium text-foreground text-xs">
												{formatLeaveType(approval.leave_type)}
											</p>
										</>
									)}
								</div>
								<div className="bg-muted/50 p-2 rounded-lg">
									<p className="text-muted-foreground mb-1">Duration</p>
									<p className="font-medium text-foreground text-xs">
										{approval.total_days} day{approval.total_days !== 1 ? 's' : ''}
									</p>
								</div>
								<div className="bg-muted/50 p-2 rounded-lg">
									<p className="text-muted-foreground mb-1">Period</p>
									<p className="font-medium text-foreground text-xs">
										{formatDate(approval.from_date)} → {formatDate(approval.till_date)}
									</p>
								</div>
							</div>

							{approval.reason && (
								<div className="bg-muted/50 p-2 rounded-lg mb-2">
									<p className="text-muted-foreground mb-1 text-xs">Reason</p>
									<p className="text-xs text-foreground line-clamp-1">
										{approval.reason}
									</p>
								</div>
							)}

							<div className="flex justify-between pt-2 border-t border-border text-xs text-muted-foreground">
								<span>Level {approval.level_no} Approval</span>
								<span>Workflow: {approval.workflow_state}</span>
							</div>

							{/* Hover Effect */}
							<div 
								className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
								style={{
									background: 'linear-gradient(135deg, #f59e0b05, transparent 50%, #f59e0b02)',
								}}
							/>
						</div>
					))}
				</div>
			)}
		</div>
		</div>
	)
} 