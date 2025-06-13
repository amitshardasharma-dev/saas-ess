'use client'

import { Receipt, Clock, CheckCircle, XCircle, User, Sparkles, Eye, DollarSign, FileText, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MyExpenseClaim } from '@/types/dashboard'

interface MyExpenseClaimsProps {
	claims: MyExpenseClaim[]
}

export function MyExpenseClaims({ claims }: MyExpenseClaimsProps) {
	// Show only first 4 claims for compact view
	const displayClaims = claims.slice(0, 4)
	const hasMore = claims.length > 4

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

	const getCategoryIcon = (category: string) => {
		switch (category.toLowerCase()) {
			case 'meals & entertainment':
				return '🍽️'
			case 'transportation':
				return '🚗'
			case 'office supplies':
				return '📝'
			case 'training & development':
				return '📚'
			default:
				return '📄'
		}
	}

	const formatAmount = (amount: number) => {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD'
		}).format(amount)
	}

	const formatDate = (dateString: string) => {
		return new Date(dateString).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		})
	}

	return (
		<div className="flowing-card p-6 hover-lift">
			<div className="flex items-center justify-between mb-6">
				<div className="flex items-center space-x-3">
					<div className="floating-element p-2">
						<Receipt className="h-5 w-5 text-primary" />
					</div>
					<div>
						<h2 className="text-lg font-bold text-foreground flex items-center space-x-2">
							<span>Expense Claims</span>
							<Sparkles className="h-4 w-4 text-primary" />
						</h2>
						<p className="text-sm text-muted-foreground">
							Recent expense claims ({claims.length} total)
						</p>
					</div>
				</div>
				{hasMore && (
					<Button 
						variant="outline" 
						size="sm" 
						className="floating-element hover-lift"
						onClick={() => {
							// Navigate to detailed expense claims page
							window.open('/dashboard/expense-claims', '_blank')
						}}
					>
						<span>View All</span>
						<ArrowRight className="h-4 w-4 ml-1" />
					</Button>
				)}
			</div>

			<div className="space-y-3">
				{displayClaims.length === 0 ? (
					<div className="text-center py-12 content-flow">
						<Receipt className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-40" />
						<p className="text-sm font-semibold text-muted-foreground mb-1">No expense claims found</p>
						<p className="text-xs text-muted-foreground">
							Your expense claims will appear here once submitted
						</p>
					</div>
				) : (
					<div className="space-y-3">
						{displayClaims.map((claim) => {
							const statusConfig = getStatusConfig(claim.status)
							return (
								<div 
									key={claim.id}
									className={`relative overflow-hidden rounded-xl border ${statusConfig.border} ${statusConfig.bg} p-4 hover-lift group transition-all duration-200`}
								>
									{/* Compact Header Row */}
									<div className="flex items-center justify-between mb-3">
										<div className="flex items-center space-x-2">
											{getStatusIcon(claim.status)}
											<div>
												<h3 className="font-semibold text-sm text-foreground flex items-center space-x-1">
													<span>{claim.description}</span>
													<span className="text-lg">{getCategoryIcon(claim.category)}</span>
												</h3>
												<p className="text-xs text-muted-foreground">
													{claim.category}
												</p>
											</div>
										</div>
										<div className="flex items-center space-x-2">
											<Badge 
												variant={statusConfig.variant}
												className="text-xs px-2 py-1"
											>
												{claim.status.charAt(0).toUpperCase() + claim.status.slice(1)}
											</Badge>
											<Button size="sm" variant="ghost" className="h-6 w-6 p-0">
												<Eye className="h-3 w-3" />
											</Button>
										</div>
									</div>

									{/* Compact Info Row */}
									<div className="flex items-center justify-between text-xs text-muted-foreground">
										<div className="flex items-center space-x-4">
											<div className="font-bold text-primary flex items-center space-x-1">
												<DollarSign className="h-3 w-3" />
												<span>{formatAmount(claim.amount)}</span>
											</div>
											<div className="flex items-center space-x-1">
												{claim.receiptAttached ? (
													<FileText className="h-3 w-3 text-green-500" />
												) : (
													<FileText className="h-3 w-3 text-amber-500" />
												)}
												<span className="text-xs">
													{claim.receiptAttached ? 'Receipt' : 'No receipt'}
												</span>
											</div>
										</div>
										<span>Submitted {formatDate(claim.submittedDate)}</span>
									</div>

									{/* Rejection Reason - Compact */}
									{claim.status === 'rejected' && claim.rejectionReason && (
										<div className="mt-2 p-2 rounded bg-red-50 dark:bg-red-900/20 border-l-2 border-red-400">
											<p className="text-xs text-red-600 dark:text-red-400 truncate" title={claim.rejectionReason}>
												<span className="font-medium">Rejected:</span> {claim.rejectionReason}
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