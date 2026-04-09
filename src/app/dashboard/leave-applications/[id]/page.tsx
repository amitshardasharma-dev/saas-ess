'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { 
	CalendarDays, 
	Clock, 
	CheckCircle, 
	XCircle, 
	User, 
	FileText,
	Calendar,
	Hash,
	MessageSquare,
	UserCheck,
	AlertCircle,
	Info,
	ArrowLeft,
	Loader2,
	RefreshCw
} from 'lucide-react'
import { MyLeaveApplication } from '@/types/dashboard'

interface LeaveType {
	name: string
	leave_type_name: string | null
	leave_mapping_code: string
	bc_leave_code: string
	eligible_days: number
	description: string
	without_pay: number
	leave_applicable_to_gender: string
}

interface ApprovalChainLevel {
	level_no: number
	approver_id: string
	approver_name: string
	approver_bc_id: string
	status: string
	approved_date?: string
	remarks?: string
}

interface ApprovalChain {
	leave_id: string
	current_level: number
	total_levels: number
	workflow_state: string
	levels: ApprovalChainLevel[]
}

export default function LeaveApplicationDetailPage() {
	const params = useParams()
	const router = useRouter()
	const applicationId = params.id as string

	const [application, setApplication] = useState<MyLeaveApplication | null>(null)
	const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([])
	const [approvalChain, setApprovalChain] = useState<ApprovalChain | null>(null)
	const [isLoading, setIsLoading] = useState(true)
	const [isLoadingChain, setIsLoadingChain] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		if (applicationId) {
			loadApplicationDetails()
			loadLeaveTypes()
			loadApprovalChain()
		}
	}, [applicationId])

	const loadLeaveTypes = async () => {
		try {
			const response = await fetch('/api/leave-types')
			if (response.ok) {
				const data = await response.json()
				setLeaveTypes(data.leave_types || [])
			}
		} catch (error) {
			console.error('Error loading leave types:', error)
		}
	}

	const loadApprovalChain = async () => {
		setIsLoadingChain(true)
		try {
			const token = localStorage.getItem('ess_access_token')
			const response = await fetch(`/api/approval-chain/${applicationId}`, {
				headers: token ? { Authorization: `Bearer ${token}` } : {},
			})
			if (response.ok) {
				const data = await response.json()
				const chainData = data.approval_chain
				if (chainData) {
					// Handle the case where Frappe returns approval_chain as an array
					// but we expect levels
					const processedChain: ApprovalChain = {
						leave_id: chainData.leave_id || applicationId,
						current_level: chainData.current_level || 1,
						total_levels: chainData.total_levels || 0,
						workflow_state: chainData.workflow_state || 'Draft',
						levels: chainData.levels || chainData.approval_chain || []
					}
					setApprovalChain(processedChain)
				}
			}
		} catch (error) {
			console.error('Error loading approval chain:', error)
		} finally {
			setIsLoadingChain(false)
		}
	}

	const loadApplicationDetails = async () => {
		setIsLoading(true)
		setError(null)
		try {
			const response = await fetch(`/api/leave-applications/${applicationId}`)
			if (response.ok) {
				const data = await response.json()
				if (data.leave_application) {
					// Convert API response to MyLeaveApplication format
					const detailedApp: MyLeaveApplication = {
						id: data.leave_application.name,
						leaveType: data.leave_application.leave_type,
						fromDate: data.leave_application.from_date,
						toDate: data.leave_application.to_date,
						days: data.leave_application.total_leave_days,
						reason: data.leave_application.description || 'No reason provided',
						status: data.leave_application.leave_status === 'Approved' ? 'approved' : 
								data.leave_application.leave_status === 'Rejected' ? 'rejected' : 'pending',
						appliedDate: data.leave_application.posting_date,
						approvedBy: data.leave_application.leave_approver,
						approvedDate: data.leave_application.leave_status === 'Approved' ? data.leave_application.posting_date : undefined,
						// Additional detailed fields
						createdDate: data.leave_application.creation,
						modifiedDate: data.leave_application.modified,
						owner: data.leave_application.owner,
						halfDay: data.leave_application.half_day === 1,
						employeeId: data.leave_application.employee,
						bcEmployeeId: data.leave_application.bc_employee_id,
						employeeName: data.leave_application.employee_name,
						approverBcEmployeeId: data.leave_application.leave_approver_bc_id,
						approverName: data.leave_application.leave_approver_name
					}
					setApplication(detailedApp)
				}
			} else if (response.status === 404) {
				setError('Leave application not found')
			} else {
				setError('Failed to load leave application details')
			}
		} catch (error) {
			console.error('Error loading application details:', error)
			setError('An error occurred while loading the application details')
		} finally {
			setIsLoading(false)
		}
	}

	const formatLeaveType = (leaveTypeId: string) => {
		const leaveType = leaveTypes.find(lt => lt.name === leaveTypeId)
		if (leaveType) {
			// Format: leave_type_id / bc_leave_code / leave_mapping_code
			return `${leaveTypeId} / ${leaveType.bc_leave_code} / ${leaveType.leave_mapping_code}`
		}
		return leaveTypeId
	}

	const formatApproverName = (approverFrappeId: string, approverBcId?: string, approverName?: string) => {
		const idPart = approverFrappeId && approverBcId ? `${approverFrappeId} / ${approverBcId}` : (approverFrappeId || approverBcId || '')
		if (approverName && idPart) {
			return `${approverName} (${idPart})`
		}
		return approverName || idPart
	}

	const formatEmployeeName = (employeeFrappeId?: string, employeeBcId?: string, employeeName?: string) => {
		const idPart = employeeFrappeId && employeeBcId ? `${employeeFrappeId} / ${employeeBcId}` : (employeeFrappeId || employeeBcId || '')
		if (employeeName && idPart) {
			return `${employeeName} (${idPart})`
		}
		return employeeName || idPart
	}

	const getStatusIcon = (status: string) => {
		switch (status) {
			case 'pending':
				return <Clock className="h-4 w-4 text-amber-500" />
			case 'approved':
				return <CheckCircle className="h-4 w-4 text-green-500" />
			case 'rejected':
				return <XCircle className="h-4 w-4 text-red-500" />
			default:
				return <Clock className="h-4 w-4 text-gray-500" />
		}
	}

	const getStatusConfig = (status: string) => {
		switch (status) {
			case 'approved':
				return {
					variant: 'default' as const,
					bg: 'bg-green-50 dark:bg-green-900/20',
					border: 'border-green-200 dark:border-green-800',
					text: 'text-green-700 dark:text-green-300'
				}
			case 'rejected':
				return {
					variant: 'destructive' as const,
					bg: 'bg-red-50 dark:bg-red-900/20',
					border: 'border-red-200 dark:border-red-800',
					text: 'text-red-700 dark:text-red-300'
				}
			case 'pending':
			default:
				return {
					variant: 'secondary' as const,
					bg: 'bg-amber-50 dark:bg-amber-900/20',
					border: 'border-amber-200 dark:border-amber-800',
					text: 'text-amber-700 dark:text-amber-300'
				}
		}
	}

	const formatDate = (dateString: string) => {
		return new Date(dateString).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		})
	}

	const formatDateTime = (dateString: string) => {
		return new Date(dateString).toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		})
	}

	if (isLoading) {
		return (
			<DashboardLayout>
				<div className="container mx-auto px-4 py-6">
					<div className="flex items-center justify-center min-h-[300px]">
						<div className="text-center">
							<Loader2 className="h-6 w-6 animate-spin mx-auto mb-3 text-primary" />
							<p className="text-sm text-muted-foreground">Loading application details...</p>
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
					<div className="flex items-center justify-center min-h-[300px]">
						<div className="text-center">
							<AlertCircle className="h-8 w-8 mx-auto mb-3 text-red-500" />
							<h2 className="text-lg font-semibold mb-2">Error Loading Application</h2>
							<p className="text-sm text-muted-foreground mb-4">{error}</p>
							<div className="space-x-2">
								<Button onClick={loadApplicationDetails} variant="outline" size="sm">
									<RefreshCw className="h-4 w-4 mr-2" />
									Try Again
								</Button>
								<Button onClick={() => router.back()} variant="default" size="sm">
									<ArrowLeft className="h-4 w-4 mr-2" />
									Go Back
								</Button>
							</div>
						</div>
					</div>
				</div>
			</DashboardLayout>
		)
	}

	if (!application) {
		return (
			<DashboardLayout>
				<div className="container mx-auto px-4 py-6">
					<div className="flex items-center justify-center min-h-[300px]">
						<div className="text-center">
							<FileText className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
							<h2 className="text-lg font-semibold mb-2">Application Not Found</h2>
							<p className="text-sm text-muted-foreground mb-4">The requested leave application could not be found.</p>
							<Button onClick={() => router.back()} variant="default" size="sm">
								<ArrowLeft className="h-4 w-4 mr-2" />
								Go Back
							</Button>
						</div>
					</div>
				</div>
			</DashboardLayout>
		)
	}

	const statusConfig = getStatusConfig(application.status)

	return (
		<DashboardLayout>
			<div className="container mx-auto px-4 py-6 max-w-4xl">
				{/* Enhanced Header */}
				<div className="mb-6">
					{/* Breadcrumb Navigation */}
					<div className="flex items-center space-x-2 mb-4">
						<button 
							onClick={() => router.push('/dashboard/leave-applications')}
							className="flex items-center space-x-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
						>
							<ArrowLeft className="h-4 w-4" />
							<span>Leave Applications</span>
						</button>
						<span className="text-muted-foreground">/</span>
						<span className="text-sm font-medium text-foreground">{application.id}</span>
					</div>
					
					{/* Title Section */}
					<div className="flex items-center justify-between">
						<div>
							<h1 className="text-2xl font-bold text-foreground mb-1">
								{application.id}
							</h1>
							<p className="text-sm text-muted-foreground">
								{formatLeaveType(application.leaveType)}
							</p>
						</div>
						<div className="flex items-center space-x-2">
							<Button 
								variant="outline" 
								size="sm"
								onClick={() => {
									loadApplicationDetails()
									loadApprovalChain()
								}}
							>
								<RefreshCw className="h-4 w-4 mr-1" />
								Refresh
							</Button>
						</div>
					</div>
				</div>

				<div className="space-y-4">
					{/* Main Information Card */}
					<Card>
						<CardContent className="p-4">
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								{/* Date Range */}
								<div className="space-y-2">
									<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Date Range</p>
									<div className="flex items-center space-x-2">
										<Calendar className="h-4 w-4 text-muted-foreground" />
										<div>
											<p className="font-semibold text-sm">
												{formatDate(application.fromDate)} - {formatDate(application.toDate)}
											</p>
											<p className="text-xs text-muted-foreground">
												{application.days} day{application.days !== 1 ? 's' : ''} • {application.halfDay ? 'Half day' : 'Full day'}
											</p>
										</div>
									</div>
								</div>

								{/* Approver */}
								{application.approvedBy && (
									<div className="space-y-2">
										<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
											{application.status === 'approved' ? 'Approved By' : application.status === 'rejected' ? 'Rejected By' : 'Approver'}
										</p>
										<div className="flex items-center space-x-2">
											<UserCheck className="h-4 w-4 text-muted-foreground" />
											<div>
												<p className="font-semibold text-sm">
													{formatApproverName(application.approvedBy, application.approverBcEmployeeId, application.approverName)}
												</p>
											</div>
										</div>
									</div>
								)}
							</div>
						</CardContent>
					</Card>

					{/* Professional Status Card */}
					<Card>
						<CardContent className="p-4">
							<div className={`rounded-lg border-2 p-4 ${
								application.status === 'approved' 
									? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800' 
									: application.status === 'rejected' 
									? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
									: 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800'
							}`}>
								<div className="flex items-center justify-between">
									<div className="flex items-center space-x-3">
										<div className={`w-3 h-3 rounded-full ${
											application.status === 'approved' ? 'bg-green-500' :
											application.status === 'rejected' ? 'bg-red-500' : 'bg-amber-500'
										}`}></div>
										<div>
											<p className={`font-semibold text-lg ${
												application.status === 'approved' 
													? 'text-green-700 dark:text-green-300' 
													: application.status === 'rejected' 
													? 'text-red-700 dark:text-red-300'
													: 'text-amber-700 dark:text-amber-300'
											}`}>
												{application.status === 'approved' ? 'APPROVED' :
												 application.status === 'rejected' ? 'REJECTED' : 'PENDING APPROVAL'}
											</p>
											{application.status === 'pending' && (
												<p className="text-sm text-amber-600 dark:text-amber-400">
													Awaiting manager review
												</p>
											)}
											{application.status === 'approved' && (
												<p className="text-sm text-green-600 dark:text-green-400">
													Application has been approved
												</p>
											)}
											{application.status === 'rejected' && (
												<p className="text-sm text-red-600 dark:text-red-400">
													Application was rejected
												</p>
											)}
										</div>
									</div>
									<div className={`p-2 rounded-full ${
										application.status === 'approved' 
											? 'bg-green-100 dark:bg-green-800' 
											: application.status === 'rejected' 
											? 'bg-red-100 dark:bg-red-800'
											: 'bg-amber-100 dark:bg-amber-800'
									}`}>
										{getStatusIcon(application.status)}
									</div>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Reason */}
					<Card>
						<CardHeader className="pb-2">
							<CardTitle className="text-sm flex items-center space-x-2">
								<MessageSquare className="h-4 w-4" />
								<span>Reason</span>
							</CardTitle>
						</CardHeader>
						<CardContent className="pt-0">
							<p className="text-sm text-foreground leading-relaxed">
								{application.reason}
							</p>
						</CardContent>
					</Card>

					{/* Rejection Reason */}
					{application.status === 'rejected' && application.rejectionReason && (
						<Card>
							<CardHeader className="pb-2">
								<CardTitle className="text-sm flex items-center space-x-2">
									<AlertCircle className="h-4 w-4 text-red-500" />
									<span>Rejection Reason</span>
								</CardTitle>
							</CardHeader>
							<CardContent className="pt-0">
								<p className="text-sm text-red-700 dark:text-red-300">
									{application.rejectionReason}
								</p>
							</CardContent>
						</Card>
					)}

					{/* Approval Chain */}
					{approvalChain && (
						<Card>
							<CardHeader className="pb-2">
								<CardTitle className="text-sm flex items-center space-x-2">
									<UserCheck className="h-4 w-4" />
									<span>Approval Chain</span>
									{isLoadingChain && <Loader2 className="h-3 w-3 animate-spin" />}
								</CardTitle>
							</CardHeader>
							<CardContent className="pt-0">
								{/* Progress Header */}
								<div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg mb-4">
									<div className="flex items-center space-x-2">
										<div className="flex items-center space-x-1">
											<div className="w-2 h-2 rounded-full bg-primary"></div>
											<span className="text-sm font-medium">Progress</span>
										</div>
										<span className="text-sm text-muted-foreground">
											Level {approvalChain.current_level} of {approvalChain.total_levels}
										</span>
									</div>
									<Badge variant="outline" className="text-xs">
										{approvalChain.workflow_state}
									</Badge>
								</div>
								
								{approvalChain.levels && approvalChain.levels.length > 0 ? (
									<div className="space-y-0">
										{approvalChain.levels.map((level, index) => (
											<div key={level.level_no} className="relative">
												{/* Connecting Line */}
												{index < approvalChain.levels.length - 1 && (
													<div className="absolute left-4 top-12 w-0.5 h-8 bg-border z-0"></div>
												)}
												
												{/* Approval Level */}
												<div className="relative flex items-start space-x-4 pb-6 last:pb-0">
													{/* Level Number Circle */}
													<div className={`relative z-10 flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold border-2 ${
														level.status === 'Approved' 
															? 'bg-green-100 text-green-700 border-green-300' 
															: level.status === 'Rejected'
															? 'bg-red-100 text-red-700 border-red-300'
															: level.level_no === approvalChain.current_level
															? 'bg-amber-100 text-amber-700 border-amber-300'
															: 'bg-muted text-muted-foreground border-border'
													}`}>
														{level.status === 'Approved' ? (
															<CheckCircle className="h-4 w-4" />
														) : level.status === 'Rejected' ? (
															<XCircle className="h-4 w-4" />
														) : level.level_no === approvalChain.current_level ? (
															<Clock className="h-4 w-4" />
														) : (
															level.level_no
														)}
													</div>
													
													{/* Approval Details */}
													<div className="flex-1 min-w-0">
														<div className="flex items-start justify-between">
															<div className="flex-1 min-w-0">
																<div className="flex items-center space-x-2 mb-1">
																	<p className="text-sm font-medium truncate">
																		{level.approver_name}
																	</p>
																	<Badge 
																		variant={
																			level.status === 'Approved' ? 'default' :
																			level.status === 'Rejected' ? 'destructive' :
																			level.level_no === approvalChain.current_level ? 'secondary' : 'outline'
																		}
																		className="text-xs shrink-0"
																	>
																		{level.status === 'Pending' && level.level_no === approvalChain.current_level 
																			? 'Current' 
																			: level.status}
																	</Badge>
																</div>
																
																<div className="space-y-1">
																	<p className="text-xs text-muted-foreground">
																		{level.approver_id}
																	</p>
																	{level.approver_bc_id && (
																		<p className="text-xs text-muted-foreground">
																			BC ID: {level.approver_bc_id}
																		</p>
																	)}
																	{level.approved_date && (
																		<p className="text-xs text-muted-foreground">
																			{formatDateTime(level.approved_date)}
																		</p>
																	)}
																</div>
																
																{level.remarks && (
																	<div className="mt-2 p-2 bg-muted/50 rounded text-xs">
																		<p className="text-muted-foreground italic">
																			"{level.remarks}"
																		</p>
																	</div>
																)}
															</div>
														</div>
													</div>
												</div>
											</div>
										))}
									</div>
								) : (
									<div className="text-center py-8">
										<UserCheck className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
										<p className="text-sm text-muted-foreground">
											No approval chain configured for this leave application.
										</p>
									</div>
								)}
							</CardContent>
						</Card>
					)}

					{/* Additional Details - Compact Grid */}
					<Card>
						<CardHeader className="pb-2">
							<CardTitle className="text-sm flex items-center space-x-2">
								<Info className="h-4 w-4" />
								<span>Details</span>
							</CardTitle>
						</CardHeader>
						<CardContent className="pt-0">
							<div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
								{(application.employeeId || application.bcEmployeeId || application.employeeName) && (
									<div>
										<p className="text-muted-foreground">Employee ID</p>
										<p className="font-medium">
											{formatEmployeeName(application.employeeId, application.bcEmployeeId, application.employeeName)}
										</p>
									</div>
								)}

								{application.createdDate && (
									<div>
										<p className="text-muted-foreground">Created</p>
										<p className="font-medium">{formatDateTime(application.createdDate)}</p>
									</div>
								)}
								{application.modifiedDate && (
									<div>
										<p className="text-muted-foreground">Modified</p>
										<p className="font-medium">{formatDateTime(application.modifiedDate)}</p>
									</div>
								)}
								<div>
									<p className="text-muted-foreground">Duration</p>
									<p className="font-medium">{application.days} working day{application.days !== 1 ? 's' : ''}</p>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Footer */}
					<div className="flex justify-center pt-6">
						<Button 
							variant="outline"
							onClick={() => router.push('/dashboard/leave-applications')}
							className="px-6"
						>
							<ArrowLeft className="h-4 w-4 mr-2" />
							Back to Leave Applications
						</Button>
					</div>
				</div>
			</div>
		</DashboardLayout>
	)
} 