'use client'

import { useRouter } from 'next/navigation'
import { CalendarDays, Clock, CheckCircle, XCircle, User, Sparkles, Eye, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MyLeaveApplication } from '@/types/dashboard'

interface MyLeaveApplicationsProps {
	applications: MyLeaveApplication[]
}

export function MyLeaveApplications({ applications }: MyLeaveApplicationsProps) {
	const router = useRouter()

	// Sort applications by modified date (most recent first), then show only first 4
	const sortedApplications = [...applications].sort((a, b) => {
		const dateA = new Date(a.modifiedDate || a.appliedDate)
		const dateB = new Date(b.modifiedDate || b.appliedDate)
		return dateB.getTime() - dateA.getTime()
	})
	
	const displayApplications = sortedApplications.slice(0, 4)
	const hasMore = applications.length > 4

	const handleViewDetails = (application: MyLeaveApplication) => {
		router.push(`/dashboard/leave-applications/${application.id}`)
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
					accent: '#10b981'
				}
			case 'rejected':
				return {
					variant: 'destructive' as const,
					bg: 'bg-red-50 dark:bg-red-900/20',
					border: 'border-red-200 dark:border-red-800',
					accent: '#ef4444'
				}
			case 'pending':
			default:
				return {
					variant: 'secondary' as const,
					bg: 'bg-amber-50 dark:bg-amber-900/20',
					border: 'border-amber-200 dark:border-amber-800',
					accent: '#f59e0b'
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

	const formatModifiedDate = (dateString: string) => {
		if (!dateString) return 'Unknown'
		
		const date = new Date(dateString)
		
		// Check if date is valid
		if (isNaN(date.getTime())) {
			return 'Invalid date'
		}
		
		const now = new Date()
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
		const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate())
		const diffTime = today.getTime() - dateOnly.getTime()
		const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
		
		const timeStr = date.toLocaleTimeString('en-US', {
			hour: 'numeric',
			minute: '2-digit',
			hour12: true
		})
		
		if (diffDays === 0) {
			// Today
			return timeStr
		} else if (diffDays === 1) {
			// Yesterday
			return `Yesterday ${timeStr}`
		} else if (diffDays > 1 && diffDays <= 7) {
			// This week
			const dayName = date.toLocaleDateString('en-US', { weekday: 'short' })
			return `${dayName} ${timeStr}`
		} else {
			// Older dates - compact format without year
			const monthDay = date.toLocaleDateString('en-US', {
				month: 'short',
				day: 'numeric'
			})
			return `${monthDay} ${timeStr}`
		}
	}

	return (
		<div className="flowing-card p-6 hover-lift">
			<div className="flex items-center justify-between mb-6">
				<div className="flex items-center space-x-3">
					<div className="floating-element p-2">
						<CalendarDays className="h-5 w-5 text-primary" />
					</div>
					<div>
						<h2 className="text-lg font-bold text-foreground flex items-center space-x-2">
							<span>Leave Applications</span>
							<Sparkles className="h-4 w-4 text-primary" />
						</h2>
						<p className="text-sm text-muted-foreground">
							Recent leave requests ({applications.length} total)
						</p>
					</div>
				</div>
				<Button 
					variant="outline" 
					size="sm" 
					className="floating-element hover-lift"
					onClick={() => router.push('/dashboard/leave-applications')}
				>
					<span>View All</span>
					<ArrowRight className="h-4 w-4 ml-1" />
				</Button>
			</div>

			<div className="space-y-3">
				{displayApplications.length === 0 ? (
					<div className="text-center py-12 content-flow">
						<CalendarDays className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-40" />
						<p className="text-sm font-semibold text-muted-foreground mb-1">No leave applications found</p>
						<p className="text-xs text-muted-foreground">
							Your leave applications will appear here once submitted
						</p>
					</div>
				) : (
					<div className="space-y-3">
						{displayApplications.map((application) => {
							const statusConfig = getStatusConfig(application.status)
							return (
								<div 
									key={application.id}
									className={`relative overflow-hidden rounded-xl border ${statusConfig.border} ${statusConfig.bg} p-4 hover-lift group transition-all duration-200 cursor-pointer`}
									onClick={() => handleViewDetails(application)}
								>
									{/* Compact Header Row */}
									<div className="flex items-center justify-between mb-3">
										<div className="flex items-center space-x-2">
											{getStatusIcon(application.status)}
											<div>
												<h3 className="font-semibold text-sm text-foreground">
													{application.leaveType}
												</h3>
												<p className="text-xs text-muted-foreground">
													{application.id}
												</p>
											</div>
										</div>
										<div className="flex items-center space-x-2">
											<Badge 
												variant={statusConfig.variant}
												className="text-xs px-2 py-1"
											>
												{application.status.charAt(0).toUpperCase() + application.status.slice(1)}
											</Badge>
											<Button 
												size="sm" 
												variant="ghost" 
												className="h-6 w-6 p-0 hover:bg-primary/10"
												onClick={(e) => {
													e.stopPropagation()
													handleViewDetails(application)
												}}
												title="View full details"
											>
												<Eye className="h-3 w-3" />
											</Button>
										</div>
									</div>

									{/* Compact Info Row */}
									<div className="text-xs text-muted-foreground">
										<div className="flex items-center justify-between">
											<span className="font-medium text-primary">
												{application.days} day{application.days !== 1 ? 's' : ''}
											</span>
											<span>
												{formatDate(application.fromDate)} → {formatDate(application.toDate)}
											</span>
										</div>
									</div>

									{/* Reason - Truncated */}
									<div className="mt-2 text-xs text-foreground truncate" title={application.reason}>
										<span className="text-muted-foreground">Reason:</span> {application.reason}
									</div>

									{/* Modified Date */}
									<div className="mt-1 text-xs text-muted-foreground">
										<span>Modified {formatModifiedDate(application.modifiedDate || application.appliedDate)}</span>
									</div>

									{/* Rejection Reason - Compact */}
									{application.status === 'rejected' && application.rejectionReason && (
										<div className="mt-2 p-2 rounded bg-red-50 dark:bg-red-900/20 border-l-2 border-red-400">
											<p className="text-xs text-red-600 dark:text-red-400 truncate" title={application.rejectionReason}>
												<span className="font-medium">Rejected:</span> {application.rejectionReason}
											</p>
										</div>
									)}

									{/* Hover Effect */}
									<div 
										className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
										style={{
											background: `linear-gradient(135deg, ${statusConfig.accent}05, transparent 50%, ${statusConfig.accent}02)`,
										}}
									/>
								</div>
							)
						})}
					</div>
				)}
			</div>
		</div>
	)
} 