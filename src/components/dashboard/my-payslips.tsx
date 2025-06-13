'use client'

import { FileText, Download, Eye, Sparkles, ArrowRight, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface PayslipData {
	id: string
	month: string
	year: number
	grossSalary: number
	netSalary: number
	currency: string
	payDate: string
	status: 'processed' | 'pending' | 'draft'
	downloadUrl?: string
}

interface MyPayslipsProps {
	payslips: PayslipData[]
}

export function MyPayslips({ payslips }: MyPayslipsProps) {
	// Show only first 4 payslips for compact view
	const displayPayslips = payslips.slice(0, 4)
	const hasMore = payslips.length > 4

	const getStatusConfig = (status: string) => {
		switch (status) {
			case 'processed':
				return {
					variant: 'default' as const,
					bg: 'bg-green-50 dark:bg-green-900/20',
					border: 'border-green-200 dark:border-green-800',
					accent: '#10b981'
				}
			case 'draft':
				return {
					variant: 'secondary' as const,
					bg: 'bg-gray-50 dark:bg-gray-900/20',
					border: 'border-gray-200 dark:border-gray-800',
					accent: '#6b7280'
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

	const formatAmount = (amount: number, currency: string) => {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: currency
		}).format(amount)
	}

	const formatDate = (dateString: string) => {
		return new Date(dateString).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		})
	}

	const getMonthName = (month: string) => {
		const date = new Date(`${month} 1, 2024`)
		return date.toLocaleDateString('en-US', { month: 'long' })
	}

	return (
		<div className="flowing-card p-6 hover-lift">
			<div className="flex items-center justify-between mb-6">
				<div className="flex items-center space-x-3">
					<div className="floating-element p-2">
						<FileText className="h-5 w-5 text-primary" />
					</div>
					<div>
						<h2 className="text-lg font-bold text-foreground flex items-center space-x-2">
							<span>Payslips</span>
							<Sparkles className="h-4 w-4 text-primary" />
						</h2>
						<p className="text-sm text-muted-foreground">
							Recent salary statements ({payslips.length} total)
						</p>
					</div>
				</div>
				{hasMore && (
					<Button 
						variant="outline" 
						size="sm" 
						className="floating-element hover-lift"
						onClick={() => {
							// Navigate to detailed payslips page
							window.open('/dashboard/payslips', '_blank')
						}}
					>
						<span>View All</span>
						<ArrowRight className="h-4 w-4 ml-1" />
					</Button>
				)}
			</div>

			<div className="space-y-3">
				{displayPayslips.length === 0 ? (
					<div className="text-center py-12 content-flow">
						<FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-40" />
						<p className="text-sm font-semibold text-muted-foreground mb-1">No payslips found</p>
						<p className="text-xs text-muted-foreground">
							Your payslips will appear here once generated
						</p>
					</div>
				) : (
					<div className="space-y-3">
						{displayPayslips.map((payslip) => {
							const statusConfig = getStatusConfig(payslip.status)
							return (
								<div 
									key={payslip.id}
									className={`relative overflow-hidden rounded-xl border ${statusConfig.border} ${statusConfig.bg} p-4 hover-lift group transition-all duration-200`}
								>
									{/* Compact Header Row */}
									<div className="flex items-center justify-between mb-3">
										<div className="flex items-center space-x-2">
											<Calendar className="h-4 w-4 text-primary" />
											<div>
												<h3 className="font-semibold text-sm text-foreground">
													{getMonthName(payslip.month)} {payslip.year}
												</h3>
												<p className="text-xs text-muted-foreground">
													Payslip #{payslip.id}
												</p>
											</div>
										</div>
										<div className="flex items-center space-x-2">
											<Badge 
												variant={statusConfig.variant}
												className="text-xs px-2 py-1"
											>
												{payslip.status.charAt(0).toUpperCase() + payslip.status.slice(1)}
											</Badge>
											<Button size="sm" variant="ghost" className="h-6 w-6 p-0">
												<Eye className="h-3 w-3" />
											</Button>
											{payslip.status === 'processed' && payslip.downloadUrl && (
												<Button size="sm" variant="ghost" className="h-6 w-6 p-0">
													<Download className="h-3 w-3" />
												</Button>
											)}
										</div>
									</div>

									{/* Compact Info Row */}
									<div className="flex items-center justify-between text-xs text-muted-foreground">
										<div className="flex items-center space-x-4">
											<div className="font-bold text-primary">
												{formatAmount(payslip.netSalary, payslip.currency)}
											</div>
											<span className="text-muted-foreground">
												Gross: {formatAmount(payslip.grossSalary, payslip.currency)}
											</span>
										</div>
										<span>Paid {formatDate(payslip.payDate)}</span>
									</div>

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