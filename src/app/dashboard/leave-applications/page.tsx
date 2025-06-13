'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
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
	Search,
	Filter,
	Plus,
	Eye,
	Loader2,
	RefreshCw,
	ChevronRight
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

export default function LeaveApplicationsPage() {
	const router = useRouter()
	const [applications, setApplications] = useState<MyLeaveApplication[]>([])
	const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([])
	const [isLoading, setIsLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [searchTerm, setSearchTerm] = useState('')
	const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')

	useEffect(() => {
		loadApplications()
		loadLeaveTypes()
	}, [])

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

	const loadApplications = async () => {
		setIsLoading(true)
		setError(null)
		try {
			const response = await fetch('/api/leave-applications')
			if (response.ok) {
				const data = await response.json()
				if (data.leave_applications) {
					// Convert API response to MyLeaveApplication format
					const convertedApps: MyLeaveApplication[] = data.leave_applications.map((app: any) => ({
						id: app.name,
						leaveType: app.leave_type,
						fromDate: app.from_date,
						toDate: app.to_date,
						days: app.total_leave_days,
						reason: app.description || 'No reason provided',
						status: app.leave_status === 'Approved' ? 'approved' : 
								app.leave_status === 'Rejected' ? 'rejected' : 'pending',
						appliedDate: app.posting_date,
						approvedBy: app.leave_approver,
						approvedDate: app.leave_status === 'Approved' ? app.posting_date : undefined,
						modifiedDate: app.modified || app.posting_date, // Use modified date from API
					}))
					
					// Sort by modified date (most recent first)
					convertedApps.sort((a, b) => {
						const dateA = new Date(a.modifiedDate || a.appliedDate)
						const dateB = new Date(b.modifiedDate || b.appliedDate)
						return dateB.getTime() - dateA.getTime()
					})
					
					setApplications(convertedApps)
				}
			} else {
				setError('Failed to load leave applications')
			}
		} catch (error) {
			console.error('Error loading applications:', error)
			setError('An error occurred while loading leave applications')
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

	const getStatusBadge = (status: string) => {
		switch (status) {
			case 'approved':
				return <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-100">Approved</Badge>
			case 'rejected':
				return <Badge variant="destructive">Rejected</Badge>
			case 'pending':
			default:
				return <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-100">Pending</Badge>
		}
	}

	const formatDate = (dateString: string) => {
		return new Date(dateString).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		})
	}

	const formatModifiedDate = (dateString: string) => {
		return new Date(dateString).toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
			hour12: true
		})
	}

	const filteredApplications = applications.filter(app => {
		const matchesSearch = app.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
							 app.reason.toLowerCase().includes(searchTerm.toLowerCase()) ||
							 formatLeaveType(app.leaveType).toLowerCase().includes(searchTerm.toLowerCase())
		const matchesStatus = statusFilter === 'all' || app.status === statusFilter
		return matchesSearch && matchesStatus
	})

	const handleViewDetails = (applicationId: string) => {
		router.push(`/dashboard/leave-applications/${applicationId}`)
	}

	if (isLoading) {
		return (
			<DashboardLayout>
				<div className="container mx-auto px-4 py-6">
					<div className="flex items-center justify-center min-h-[400px]">
						<div className="text-center">
							<Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
							<h2 className="text-lg font-semibold mb-2">Loading Leave Applications</h2>
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
							<h2 className="text-lg font-semibold mb-2">Error Loading Applications</h2>
							<p className="text-sm text-muted-foreground mb-4">{error}</p>
							<Button onClick={loadApplications} variant="outline">
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
						<h1 className="text-2xl font-bold text-foreground mb-1">Leave Applications</h1>
						<p className="text-sm text-muted-foreground">
							Manage and track your leave applications
						</p>
					</div>
					<div className="flex items-center space-x-3">
						<Button 
							variant="outline" 
							size="sm"
							onClick={loadApplications}
						>
							<RefreshCw className="h-4 w-4 mr-2" />
							Refresh
						</Button>
						<Button 
							onClick={() => router.push('/dashboard/leave-applications/new')}
							size="sm"
						>
							<Plus className="h-4 w-4 mr-2" />
							New Application
						</Button>
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
										placeholder="Search by ID, reason, or leave type..."
										value={searchTerm}
										onChange={(e) => setSearchTerm(e.target.value)}
										className="w-full pl-10 pr-4 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
									/>
								</div>
							</div>
							
							{/* Status Filter */}
							<div className="flex items-center space-x-2">
								<Filter className="h-4 w-4 text-muted-foreground" />
								<select
									value={statusFilter}
									onChange={(e) => setStatusFilter(e.target.value as any)}
									className="px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
								>
									<option value="all">All Status</option>
									<option value="pending">Pending</option>
									<option value="approved">Approved</option>
									<option value="rejected">Rejected</option>
								</select>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Applications List */}
				{filteredApplications.length === 0 ? (
					<Card>
						<CardContent className="p-8">
							<div className="text-center">
								<FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
								<h3 className="text-lg font-semibold mb-2">No Leave Applications Found</h3>
								<p className="text-sm text-muted-foreground mb-4">
									{searchTerm || statusFilter !== 'all' 
										? 'No applications match your current filters.' 
										: 'You haven\'t submitted any leave applications yet.'
									}
								</p>
								{(!searchTerm && statusFilter === 'all') && (
									<Button onClick={() => router.push('/dashboard/leave-applications/new')}>
										<Plus className="h-4 w-4 mr-2" />
										Create Your First Application
									</Button>
								)}
							</div>
						</CardContent>
					</Card>
				) : (
					<div className="space-y-4">
						{filteredApplications.map((application) => (
							<Card 
								key={application.id} 
								className="hover:shadow-md transition-shadow cursor-pointer"
								onClick={() => handleViewDetails(application.id)}
							>
								<CardContent className="p-4">
									<div className="flex items-center justify-between">
										<div className="flex-1">
											<div className="flex items-center space-x-3 mb-2">
												<h3 className="font-semibold text-foreground">{application.id}</h3>
												{getStatusBadge(application.status)}
											</div>
											
											<div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
												<div className="flex items-center space-x-2">
													<Calendar className="h-4 w-4 text-muted-foreground" />
													<span className="text-muted-foreground">Leave Type:</span>
													<span className="font-medium">{formatLeaveType(application.leaveType)}</span>
												</div>
												
												<div className="flex items-center space-x-2">
													<CalendarDays className="h-4 w-4 text-muted-foreground" />
													<span className="text-muted-foreground">Duration:</span>
													<span className="font-medium">
														{formatDate(application.fromDate)} - {formatDate(application.toDate)} 
														({application.days} day{application.days !== 1 ? 's' : ''})
													</span>
												</div>
												
												<div className="flex items-center space-x-2">
													<User className="h-4 w-4 text-muted-foreground" />
													<span className="text-muted-foreground">Modified:</span>
													<span className="font-medium">{formatModifiedDate(application.modifiedDate || application.appliedDate)}</span>
												</div>
											</div>
											
											<div className="mt-2">
												<p className="text-sm text-muted-foreground">
													<span className="font-medium">Reason:</span> {application.reason}
												</p>
											</div>
										</div>
										
										<div className="flex items-center space-x-2 ml-4">
											{getStatusIcon(application.status)}
											<ChevronRight className="h-4 w-4 text-muted-foreground" />
										</div>
									</div>
								</CardContent>
							</Card>
						))}
					</div>
				)}

				{/* Summary Footer */}
				{filteredApplications.length > 0 && (
					<div className="mt-6 text-center text-sm text-muted-foreground">
						Showing {filteredApplications.length} of {applications.length} leave applications
					</div>
				)}
			</div>
		</DashboardLayout>
	)
} 