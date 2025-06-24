'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { useEmployee } from '@/hooks/use-employee'
import { Pagination, PaginationInfo } from '@/components/ui/pagination'
import { 
	Calendar, 
	Clock, 
	User, 
	FileText, 
	CheckCircle, 
	XCircle, 
	Award,
	Search,
	Filter,
	CalendarDays,
	Loader2,
	RefreshCw,
	ChevronRight,
	ShieldX,
	Settings
} from 'lucide-react'
import toast from 'react-hot-toast'
import { leaveService, ApprovalHistoryItem } from '@/services/leave'
import Link from 'next/link'

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

export default function ApprovalHistoryPage() {
	const { hasLeaveApprovalAccess, loading: employeeLoading } = useEmployee()
	const [approvalHistory, setApprovalHistory] = useState<ApprovalHistoryItem[]>([])
	const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([])
	const [isLoading, setIsLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [searchTerm, setSearchTerm] = useState('')
	const [statusFilter, setStatusFilter] = useState<'all' | 'approved' | 'rejected'>('all')
	
	// Pagination state
	const [currentPage, setCurrentPage] = useState(1)
	const [itemsPerPage, setItemsPerPage] = useState(10)

	useEffect(() => {
		loadApprovalHistory()
		loadLeaveTypes()
	}, [])

	// Reset to first page when filters change
	useEffect(() => {
		setCurrentPage(1)
	}, [searchTerm, statusFilter, itemsPerPage])

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

	const loadApprovalHistory = async () => {
		setIsLoading(true)
		setError(null)
		try {
			const history = await leaveService.getApprovalHistory()
			setApprovalHistory(history)
		} catch (error) {
			console.error('Error loading approval history:', error)
			setError('Failed to load approval history')
			toast.error('Failed to load approval history')
		} finally {
			setIsLoading(false)
		}
	}

	const formatLeaveType = (leaveTypeId: string) => {
		const leaveType = leaveTypes.find(lt => lt.name === leaveTypeId)
		if (leaveType) {
			return `${leaveTypeId} / ${leaveType.bc_leave_code} / ${leaveType.leave_mapping_code}`
		}
		return leaveTypeId
	}

	const getActionIcon = (action: string) => {
		switch (action.toLowerCase()) {
			case 'approved':
				return <CheckCircle className="h-4 w-4 text-green-500" />
			case 'rejected':
				return <XCircle className="h-4 w-4 text-red-500" />
			default:
				return <Clock className="h-4 w-4 text-gray-500" />
		}
	}

	const getActionBadge = (action: string) => {
		switch (action.toLowerCase()) {
			case 'approved':
				return <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-100">Approved</Badge>
			case 'rejected':
				return <Badge variant="destructive">Rejected</Badge>
			default:
				return <Badge variant="secondary">Unknown</Badge>
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
			hour: 'numeric',
			minute: '2-digit',
			hour12: true
		})
	}

	// Filter and paginate data
	const { filteredHistory, paginatedHistory, totalPages } = useMemo(() => {
		// Apply filters
		const filtered = approvalHistory.filter(item => {
			const matchesSearch = item.leave_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
								 item.employee_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
								 item.reason.toLowerCase().includes(searchTerm.toLowerCase()) ||
								 formatLeaveType(item.leave_type).toLowerCase().includes(searchTerm.toLowerCase())
			const matchesStatus = statusFilter === 'all' || item.my_action.toLowerCase() === statusFilter
			return matchesSearch && matchesStatus
		})

		// Calculate pagination
		const totalPages = Math.ceil(filtered.length / itemsPerPage)
		const startIndex = (currentPage - 1) * itemsPerPage
		const endIndex = startIndex + itemsPerPage
		const paginated = filtered.slice(startIndex, endIndex)

		return {
			filteredHistory: filtered,
			paginatedHistory: paginated,
			totalPages
		}
	}, [approvalHistory, searchTerm, statusFilter, currentPage, itemsPerPage, leaveTypes])

	const handlePageChange = (page: number) => {
		setCurrentPage(page)
		// Scroll to top when page changes
		window.scrollTo({ top: 0, behavior: 'smooth' })
	}

	const handleItemsPerPageChange = (newItemsPerPage: number) => {
		setItemsPerPage(newItemsPerPage)
		setCurrentPage(1)
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
							<h2 className="text-lg font-semibold mb-2">Loading Approval History</h2>
							<p className="text-sm text-muted-foreground">Please wait while we fetch your data...</p>
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
							<XCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
							<h2 className="text-lg font-semibold mb-2">Error Loading Approval History</h2>
							<p className="text-sm text-muted-foreground mb-4">{error}</p>
							<Button onClick={loadApprovalHistory} variant="outline">
								<RefreshCw className="h-4 w-4 mr-2" />
								Try Again
							</Button>
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
				<div className="flex items-center justify-between mb-6">
					<div>
						<h1 className="text-2xl font-bold text-foreground mb-1">Approval History</h1>
						<p className="text-sm text-muted-foreground">
							View your past approval actions on leave applications
						</p>
					</div>
					<div className="flex items-center space-x-3">
						<Button 
							variant="outline" 
							size="sm"
							onClick={loadApprovalHistory}
						>
							<RefreshCw className="h-4 w-4 mr-2" />
							Refresh
						</Button>
						<Link href="/dashboard/pending-approvals">
							<Button size="sm">
								<Clock className="h-4 w-4 mr-2" />
								Pending Approvals
							</Button>
						</Link>
					</div>
				</div>

				{/* Filters and Search */}
				<Card className="mb-6">
					<CardContent className="p-4">
						<div className="flex flex-col sm:flex-row gap-4">
							{/* Search */}
							<div className="flex-1">
								<div className="relative">
									<Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
									<input
										type="text"
										placeholder="Search by leave ID, employee name, reason, or leave type..."
										value={searchTerm}
										onChange={(e) => setSearchTerm(e.target.value)}
										className="w-full pl-10 pr-4 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
									/>
								</div>
							</div>
							
							{/* Action Filter */}
							<div className="flex items-center space-x-2">
								<Filter className="h-4 w-4 text-muted-foreground" />
								<select
									value={statusFilter}
									onChange={(e) => setStatusFilter(e.target.value as any)}
									className="px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
								>
									<option value="all">All Actions</option>
									<option value="approved">Approved</option>
									<option value="rejected">Rejected</option>
								</select>
							</div>

							{/* Items per page */}
							<div className="flex items-center space-x-2">
								<Settings className="h-4 w-4 text-muted-foreground" />
								<select
									value={itemsPerPage}
									onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
									className="px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
								>
									<option value={5}>5 per page</option>
									<option value={10}>10 per page</option>
									<option value={20}>20 per page</option>
									<option value={50}>50 per page</option>
								</select>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Pagination Info */}
				{filteredHistory.length > 0 && (
					<div className="flex items-center justify-between mb-4">
						<PaginationInfo
							currentPage={currentPage}
							itemsPerPage={itemsPerPage}
							totalItems={filteredHistory.length}
							itemName="approval actions"
						/>
						<div className="text-sm text-muted-foreground">
							Total: {approvalHistory.length} approval actions
						</div>
					</div>
				)}

				{/* Approval History List */}
				{filteredHistory.length === 0 ? (
					<Card>
						<CardContent className="p-8">
							<div className="text-center">
								<Award className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
								<h3 className="text-lg font-semibold mb-2">No Approval History Found</h3>
								<p className="text-sm text-muted-foreground mb-4">
									{searchTerm || statusFilter !== 'all' 
										? 'No approval actions match your current filters.' 
										: 'You haven\'t approved or rejected any leave applications yet.'
									}
								</p>
								{(!searchTerm && statusFilter === 'all') && (
									<Link href="/dashboard/pending-approvals">
										<Button>
											<Clock className="h-4 w-4 mr-2" />
											View Pending Approvals
										</Button>
									</Link>
								)}
							</div>
						</CardContent>
					</Card>
				) : (
					<div className="space-y-4">
						{paginatedHistory.map((item) => (
							<Link 
								key={`${item.leave_id}-${item.action_date}`} 
								href={`/dashboard/leave-applications/${item.leave_id}`}
								className="block"
							>
								<Card className="hover:shadow-md transition-shadow cursor-pointer">
									<CardContent className="p-4">
										<div className="flex items-center justify-between">
											<div className="flex-1">
												<div className="flex items-center space-x-3 mb-2">
													<h3 className="font-semibold text-foreground">{item.leave_id}</h3>
													{getActionBadge(item.my_action)}
													{item.approved_level && (
														<Badge variant="outline" className="text-xs">
															Level {item.approved_level}
														</Badge>
													)}
												</div>
												
												<div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
													<div className="flex items-center space-x-2">
														<User className="h-4 w-4 text-muted-foreground" />
														<span className="text-muted-foreground">Employee:</span>
														<span className="font-medium">{item.employee_name}</span>
													</div>
													
													<div className="flex items-center space-x-2">
														<Calendar className="h-4 w-4 text-muted-foreground" />
														<span className="text-muted-foreground">Leave Type:</span>
														<span className="font-medium">{formatLeaveType(item.leave_type)}</span>
													</div>
													
													<div className="flex items-center space-x-2">
														<CalendarDays className="h-4 w-4 text-muted-foreground" />
														<span className="text-muted-foreground">Duration:</span>
														<span className="font-medium">
															{formatDate(item.from_date)} - {formatDate(item.till_date)} 
															({item.total_days} day{item.total_days !== 1 ? 's' : ''})
														</span>
													</div>
												</div>
												
												<div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
													<div>
														<p className="text-muted-foreground">
															<span className="font-medium">Reason:</span> {item.reason || 'No reason provided'}
														</p>
													</div>
													<div className="flex items-center space-x-2">
														<Clock className="h-4 w-4 text-muted-foreground" />
														<span className="text-muted-foreground">Action Date:</span>
														<span className="font-medium">{formatDateTime(item.action_date)}</span>
													</div>
												</div>
												
												{item.remarks && (
													<div className="mt-2">
														<p className="text-sm text-muted-foreground">
															<span className="font-medium">Your Remarks:</span> {item.remarks}
														</p>
													</div>
												)}
											</div>
											
											<div className="flex items-center space-x-2 ml-4">
												{getActionIcon(item.my_action)}
												<ChevronRight className="h-4 w-4 text-muted-foreground" />
											</div>
										</div>
									</CardContent>
								</Card>
							</Link>
						))}
					</div>
				)}

				{/* Pagination Controls */}
				{totalPages > 1 && (
					<div className="mt-6 flex flex-col items-center space-y-4">
						<Pagination
							currentPage={currentPage}
							totalPages={totalPages}
							onPageChange={handlePageChange}
							showFirstLast={true}
							maxVisiblePages={5}
						/>
						<div className="text-xs text-muted-foreground">
							Page {currentPage} of {totalPages}
						</div>
					</div>
				)}
			</div>
		</DashboardLayout>
	)
} 