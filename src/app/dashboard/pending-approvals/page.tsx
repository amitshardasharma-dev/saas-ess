'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { useEmployee } from '@/hooks/use-employee'
import { 
	Clock, 
	CheckCircle, 
	XCircle, 
	User, 
	Calendar,
	MessageSquare,
	Loader2,
	RefreshCw,
	AlertCircle,
	FileText,
	Eye,
	ThumbsUp,
	ThumbsDown,
	ShieldX
} from 'lucide-react'
import { safeToast } from '@/utils/safe-toast'

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
}

export default function PendingApprovalsPage() {
	const router = useRouter()
	const { hasLeaveApprovalAccess, loading: employeeLoading } = useEmployee()
	const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([])
	const [isLoading, setIsLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [processingApproval, setProcessingApproval] = useState<string | null>(null)
	const [selectedApproval, setSelectedApproval] = useState<PendingApproval | null>(null)
	const [remarks, setRemarks] = useState('')
	const [showApprovalDialog, setShowApprovalDialog] = useState(false)
	const [approvalAction, setApprovalAction] = useState<'approve' | 'reject'>('approve')

	useEffect(() => {
		loadPendingApprovals()
	}, [])

	const loadPendingApprovals = async () => {
		setIsLoading(true)
		setError(null)
		try {
			const token = localStorage.getItem('ess_access_token')
			const response = await fetch('/api/pending-approvals', {
				headers: token ? { Authorization: `Bearer ${token}` } : {},
			})
			
			if (response.ok) {
				const data = await response.json()
				setPendingApprovals(data.pending_approvals || [])
			} else if (response.status === 401) {
				setError('Authentication required. Please log in.')
			} else {
				setError('Failed to load pending approvals')
			}
		} catch (error) {
			console.error('Error loading pending approvals:', error)
			setError('An error occurred while loading pending approvals')
		} finally {
			setIsLoading(false)
		}
	}

	const handleApprovalAction = (approval: PendingApproval, action: 'approve' | 'reject') => {
		setSelectedApproval(approval)
		setApprovalAction(action)
		setRemarks('')
		setShowApprovalDialog(true)
	}

	const processApproval = async () => {
		if (!selectedApproval) return

		setProcessingApproval(selectedApproval.name)
		try {
			const token = localStorage.getItem('ess_access_token')
			const response = await fetch('/api/process-approval', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(token ? { Authorization: `Bearer ${token}` } : {}),
				},
				body: JSON.stringify({
					leave_id: selectedApproval.name,
					action: approvalAction,
					remarks: remarks,
					type: (selectedApproval as any).type || 'leave'
				})
			})

			if (response.ok) {
				const data = await response.json()
				safeToast.success(data.message || `Leave application ${approvalAction}d successfully`)
				
				// Remove the processed approval from the list
				setPendingApprovals(prev => prev.filter(approval => approval.name !== selectedApproval.name))
				
				setShowApprovalDialog(false)
				setSelectedApproval(null)
				setRemarks('')
			} else {
				const errorData = await response.json()
				safeToast.error(errorData.error || `Failed to ${approvalAction} leave application`)
			}
		} catch (error) {
			console.error('Error processing approval:', error)
			safeToast.error(`An error occurred while ${approvalAction === 'approve' ? 'approving' : 'rejecting'} the application`)
		} finally {
			setProcessingApproval(null)
		}
	}

	const formatDate = (dateString: string) => {
		return new Date(dateString).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		})
	}

	const formatLeaveType = (leaveType: string) => {
		if (!leaveType) return 'N/A'
		return leaveType.replace('LEAVETYPE', 'Leave Type ')
	}

	const viewDetails = (approval: any) => {
		if (approval.type === 'timesheet') {
			router.push(`/dashboard/timesheets/${approval.timesheet_id || approval.name}`)
		} else if (approval.type === 'expense') {
			router.push(`/dashboard/expense-claims/${approval.expense_id || approval.name}`)
		} else {
			router.push(`/dashboard/leave-applications/${approval.name}`)
		}
	}

	// Check for access permission
	if (!employeeLoading && !hasLeaveApprovalAccess) {
		return (
			<DashboardLayout>
				<div className="container mx-auto px-4 py-6">
					<div className="flex items-center justify-center min-h-[400px]">
						<div className="text-center">
							<ShieldX className="h-12 w-12 mx-auto mb-4 text-red-500" />
							<h2 className="text-xl font-semibold mb-2">Access Restricted</h2>
							<p className="text-sm text-muted-foreground mb-4">
								You don't have permission to access the approval features.
							</p>
							<p className="text-xs text-muted-foreground">
								Contact your administrator if you believe this is an error.
							</p>
						</div>
					</div>
				</div>
			</DashboardLayout>
		)
	}

	if (isLoading || employeeLoading) {
		return (
			<DashboardLayout>
				<div className="container mx-auto px-4 py-6">
					<div className="flex items-center justify-center min-h-[400px]">
						<div className="text-center">
							<Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
							<h2 className="text-lg font-semibold mb-2">Loading Pending Approvals</h2>
							<p className="text-sm text-muted-foreground">Please wait while we fetch your pending approvals...</p>
						</div>
					</div>
				</div>
			</DashboardLayout>
		)
	}

	if (error) {
		return (
			<DashboardLayout>
				<div className="container mx-auto px-4 py-6">
					<div className="flex items-center justify-center min-h-[400px]">
						<div className="text-center">
							<AlertCircle className="h-8 w-8 mx-auto mb-3 text-red-500" />
							<h2 className="text-lg font-semibold mb-2">Error Loading Approvals</h2>
							<p className="text-sm text-muted-foreground mb-4">{error}</p>
							<div className="space-x-2">
								<Button onClick={loadPendingApprovals} variant="outline" size="sm">
									<RefreshCw className="h-4 w-4 mr-2" />
									Try Again
								</Button>
							</div>
						</div>
					</div>
				</div>
			</DashboardLayout>
		)
	}

	return (
		<DashboardLayout>
			<div className="container mx-auto px-4 py-6 max-w-6xl">
				{/* Header */}
				<div className="mb-6">
					<div className="flex items-center justify-between">
						<div>
							<h1 className="text-2xl font-bold text-foreground mb-1">
								Pending Approvals
							</h1>
							<p className="text-sm text-muted-foreground">
								Review and approve leave applications assigned to you
							</p>
						</div>
						<div className="flex items-center space-x-2">
							<Badge variant="secondary" className="px-3 py-1">
								{pendingApprovals.length} pending
							</Badge>
							<Button 
								variant="outline" 
								size="sm"
								onClick={loadPendingApprovals}
							>
								<RefreshCw className="h-4 w-4 mr-1" />
								Refresh
							</Button>
						</div>
					</div>
				</div>

				{/* Pending Approvals List */}
				{pendingApprovals.length === 0 ? (
					<Card>
						<CardContent className="p-8">
							<div className="text-center">
								<CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
								<h3 className="text-lg font-semibold mb-2">No Pending Approvals</h3>
								<p className="text-sm text-muted-foreground">
									You have no leave applications waiting for your approval at this time.
								</p>
							</div>
						</CardContent>
					</Card>
				) : (
					<div className="space-y-4">
						{pendingApprovals.map((approval) => (
							<Card key={approval.name} className="hover:shadow-md transition-shadow">
								<CardContent className="p-6">
									<div className="flex items-start justify-between">
										<div className="flex-1">
											<div className="flex items-center space-x-3 mb-3">
												<div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 text-amber-600 font-semibold text-sm">
													{approval.level_no}
												</div>
												<div>
													<h3 className="font-semibold text-lg">{approval.name}</h3>
													<p className="text-sm text-muted-foreground">
														Level {approval.level_no} Approval Required
													</p>
												</div>
											</div>

											<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
												<div className="space-y-1">
													<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Employee</p>
													<div className="flex items-center space-x-2">
														<User className="h-4 w-4 text-muted-foreground" />
														<div>
															<p className="font-medium text-sm">{approval.employee_name}</p>
															<p className="text-xs text-muted-foreground">{approval.employee}</p>
														</div>
													</div>
												</div>

												{/* Type-specific details */}
											{(approval as any).type === 'timesheet' ? (
												<>
													<div className="space-y-1">
														<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Type</p>
														<Badge variant="outline">Timesheet</Badge>
													</div>
													<div className="space-y-1">
														<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Period</p>
														<div className="flex items-center space-x-2">
															<Calendar className="h-4 w-4 text-muted-foreground" />
															<p className="font-medium text-sm">
																{formatDate((approval as any).period_start)} - {formatDate((approval as any).period_end)}
															</p>
														</div>
													</div>
													<div className="space-y-1">
														<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Hours</p>
														<p className="font-medium text-sm">{(approval as any).total_hours}h</p>
													</div>
												</>
											) : (approval as any).type === 'expense' ? (
												<>
													<div className="space-y-1">
														<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Type</p>
														<Badge variant="outline">Expense Claim</Badge>
													</div>
													<div className="space-y-1">
														<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Amount</p>
														<p className="font-medium text-sm">{(approval as any).total_amount} {(approval as any).currency}</p>
													</div>
												</>
											) : (
												<>
													<div className="space-y-1">
														<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Leave Type</p>
														<p className="font-medium text-sm">{formatLeaveType(approval.leave_type)}</p>
													</div>
													<div className="space-y-1">
														<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Duration</p>
														<div className="flex items-center space-x-2">
															<Calendar className="h-4 w-4 text-muted-foreground" />
															<div>
																<p className="font-medium text-sm">
																	{formatDate(approval.from_date)} - {formatDate(approval.till_date)}
																</p>
																<p className="text-xs text-muted-foreground">
																	{approval.total_days} day{approval.total_days !== 1 ? 's' : ''}
																</p>
															</div>
														</div>
													</div>
												</>
											)}

												<div className="space-y-1">
													<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</p>
													<Badge variant="secondary" className="bg-amber-100 text-amber-800">
														<Clock className="h-3 w-3 mr-1" />
														{approval.workflow_state}
													</Badge>
												</div>
											</div>

											{approval.reason && (
												<div className="mb-4">
													<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Reason</p>
													<div className="flex items-start space-x-2">
														<MessageSquare className="h-4 w-4 text-muted-foreground mt-0.5" />
														<p className="text-sm text-foreground">{approval.reason}</p>
													</div>
												</div>
											)}
										</div>

										<div className="flex flex-col space-y-2 ml-4">
											<Button
												size="sm"
												variant="outline"
												onClick={() => viewDetails(approval)}
											>
												<Eye className="h-4 w-4 mr-1" />
												View Details
											</Button>
											<Button
												size="sm"
												onClick={() => handleApprovalAction(approval, 'approve')}
												disabled={processingApproval === approval.name}
												className="bg-green-600 hover:bg-green-700"
											>
												{processingApproval === approval.name ? (
													<Loader2 className="h-4 w-4 mr-1 animate-spin" />
												) : (
													<ThumbsUp className="h-4 w-4 mr-1" />
												)}
												Approve
											</Button>
											<Button
												size="sm"
												variant="destructive"
												onClick={() => handleApprovalAction(approval, 'reject')}
												disabled={processingApproval === approval.name}
											>
												<ThumbsDown className="h-4 w-4 mr-1" />
												Reject
											</Button>
										</div>
									</div>
								</CardContent>
							</Card>
						))}
					</div>
				)}

				{/* Approval Dialog */}
				{showApprovalDialog && selectedApproval && (
					<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
						<Card className="w-full max-w-md mx-4">
							<CardHeader>
								<CardTitle className="flex items-center space-x-2">
									{approvalAction === 'approve' ? (
										<ThumbsUp className="h-5 w-5 text-green-600" />
									) : (
										<ThumbsDown className="h-5 w-5 text-red-600" />
									)}
									<span>
										{approvalAction === 'approve' ? 'Approve' : 'Reject'}{' '}
										{(selectedApproval as any).type === 'timesheet' ? 'Timesheet' : (selectedApproval as any).type === 'expense' ? 'Expense Claim' : 'Leave Application'}
									</span>
								</CardTitle>
							</CardHeader>
							<CardContent className="space-y-4">
								<div>
									<p className="text-sm text-muted-foreground mb-2">
										Application: <span className="font-medium">{selectedApproval.name}</span>
									</p>
									<p className="text-sm text-muted-foreground">
										Employee: <span className="font-medium">{selectedApproval.employee_name}</span>
									</p>
								</div>

								<div>
									<Label htmlFor="remarks">
										Remarks {approvalAction === 'reject' ? '(Required)' : '(Optional)'}
									</Label>
									<Textarea
										id="remarks"
										placeholder={`Add your ${approvalAction === 'approve' ? 'approval' : 'rejection'} comments...`}
										value={remarks}
										onChange={(e) => setRemarks(e.target.value)}
										className="mt-1"
									/>
								</div>

								<div className="flex space-x-2 pt-4">
									<Button
										variant="outline"
										onClick={() => {
											setShowApprovalDialog(false)
											setSelectedApproval(null)
											setRemarks('')
										}}
										disabled={processingApproval === selectedApproval.name}
										className="flex-1"
									>
										Cancel
									</Button>
									<Button
										onClick={processApproval}
										disabled={
											processingApproval === selectedApproval.name ||
											(approvalAction === 'reject' && !remarks.trim())
										}
										className={`flex-1 ${
											approvalAction === 'approve' 
												? 'bg-green-600 hover:bg-green-700' 
												: 'bg-red-600 hover:bg-red-700'
										}`}
									>
										{processingApproval === selectedApproval.name ? (
											<>
												<Loader2 className="h-4 w-4 mr-2 animate-spin" />
												Processing...
											</>
										) : (
											<>
												{approvalAction === 'approve' ? (
													<ThumbsUp className="h-4 w-4 mr-2" />
												) : (
													<ThumbsDown className="h-4 w-4 mr-2" />
												)}
												{approvalAction === 'approve' ? 'Approve' : 'Reject'}
											</>
										)}
									</Button>
								</div>
							</CardContent>
						</Card>
					</div>
				)}
			</div>
		</DashboardLayout>
	)
} 