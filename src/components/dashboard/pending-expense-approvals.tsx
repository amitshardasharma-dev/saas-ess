'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
	Receipt,
	ArrowRight,
	FileText,
	Eye,
	DollarSign,
	MapPin,
	Sparkles
} from 'lucide-react'
import { useEmployee } from '@/hooks/use-employee'

interface PendingExpenseApproval {
	id: string
	employee: string
	employee_name: string
	expense_type: string
	amount: number
	currency: string
	date: string
	description: string
	status: string
	level_no: number
}

interface PendingExpenseApprovalsProps {
	className?: string
}

// Dummy data for pending expense approvals
const dummyExpenseApprovals: PendingExpenseApproval[] = [
	{
		id: 'EXP-2024-001',
		employee: 'EMP000021',
		employee_name: 'Amit Sharma',
		expense_type: 'Travel',
		amount: 2500.00,
		currency: 'INR',
		date: '2024-01-15',
		description: 'Business trip to Delhi for client meeting',
		status: 'Pending Approval',
		level_no: 1
	},
	{
		id: 'EXP-2024-002',
		employee: 'EMP000003',
		employee_name: 'Priya Singh',
		expense_type: 'Meals',
		amount: 850.00,
		currency: 'INR',
		date: '2024-01-14',
		description: 'Client lunch meeting at Hotel Taj',
		status: 'Pending Approval',
		level_no: 1
	},
	{
		id: 'EXP-2024-003',
		employee: 'EMP000004',
		employee_name: 'Rajesh Kumar',
		expense_type: 'Accommodation',
		amount: 4200.00,
		currency: 'INR',
		date: '2024-01-13',
		description: 'Hotel stay for 2 nights in Mumbai',
		status: 'Pending Approval',
		level_no: 2
	},
	{
		id: 'EXP-2024-004',
		employee: 'EMP000005',
		employee_name: 'Sneha Patel',
		expense_type: 'Office Supplies',
		amount: 1200.00,
		currency: 'INR',
		date: '2024-01-12',
		description: 'Stationery and office equipment purchase',
		status: 'Pending Approval',
		level_no: 1
	}
]

export function PendingExpenseApprovals({ className }: PendingExpenseApprovalsProps) {
	const [pendingExpenses, setPendingExpenses] = useState<PendingExpenseApproval[]>([])
	const [isLoading, setIsLoading] = useState(true)
	const router = useRouter()
	const { hasLeaveApprovalAccess, loading: employeeLoading } = useEmployee()

	useEffect(() => {
		// Simulate loading and set dummy data
		const timer = setTimeout(() => {
			// Only show if user has approval access (assuming expense approval follows same logic)
			if (!employeeLoading && hasLeaveApprovalAccess) {
				setPendingExpenses(dummyExpenseApprovals.slice(0, 4))
			}
			setIsLoading(false)
		}, 1000)

		return () => clearTimeout(timer)
	}, [hasLeaveApprovalAccess, employeeLoading])

	const formatDate = (dateString: string) => {
		return new Date(dateString).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric'
		})
	}

	const formatAmount = (amount: number, currency: string) => {
		return new Intl.NumberFormat('en-IN', {
			style: 'currency',
			currency: currency,
			minimumFractionDigits: 0,
			maximumFractionDigits: 0
		}).format(amount)
	}

	const getExpenseTypeIcon = (type: string) => {
		switch (type.toLowerCase()) {
			case 'travel':
				return <MapPin className="h-4 w-4" />
			case 'meals':
				return <Receipt className="h-4 w-4" />
			case 'accommodation':
				return <FileText className="h-4 w-4" />
			default:
				return <DollarSign className="h-4 w-4" />
		}
	}

	const getExpenseTypeColor = (type: string) => {
		switch (type.toLowerCase()) {
			case 'travel':
				return 'bg-blue-100 text-blue-800'
			case 'meals':
				return 'bg-green-100 text-green-800'
			case 'accommodation':
				return 'bg-purple-100 text-purple-800'
			default:
				return 'bg-gray-100 text-gray-800'
		}
	}

	const viewAllExpenseApprovals = () => {
		// Navigate to expense approvals page (to be implemented)
		router.push('/dashboard/expense-claims')
	}

	const viewExpenseDetails = (expenseId: string) => {
		// Navigate to expense details page (to be implemented)
		router.push(`/dashboard/expense-claims/${expenseId}`)
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
						<Receipt className="h-5 w-5 text-green-600" />
					</div>
					<div>
						<h2 className="text-lg font-bold text-foreground flex items-center space-x-2">
							<span>Pending Expense Approvals</span>
							<Sparkles className="h-4 w-4 text-primary" />
						</h2>
						<p className="text-sm text-muted-foreground">
							Expense claims awaiting your approval
						</p>
					</div>
				</div>
				{pendingExpenses.length > 0 && (
					<Button 
						variant="outline" 
						size="sm"
						onClick={viewAllExpenseApprovals}
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
									<div className="h-6 w-20 bg-muted rounded-full"></div>
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
			) : pendingExpenses.length === 0 ? (
				<div className="text-center py-6 content-flow">
					<Receipt className="h-8 w-8 mx-auto mb-2 text-green-500 opacity-40" />
					<p className="text-sm font-semibold text-muted-foreground mb-1">All caught up!</p>
					<p className="text-xs text-muted-foreground">
						No pending expense approvals at this time
					</p>
				</div>
			) : (
				<div className="space-y-2">
					{pendingExpenses.map((expense) => (
						<div 
							key={expense.id}
							className="relative overflow-hidden rounded-lg border border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800 p-3 hover-lift group transition-all duration-200 cursor-pointer"
							onClick={() => viewExpenseDetails(expense.id)}
						>
							<div className="flex items-center justify-between mb-2">
								<div className="flex items-center space-x-3">
									<div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-100 text-green-600 font-semibold text-sm">
										{expense.level_no}
									</div>
									<div>
										<h3 className="font-semibold text-sm text-foreground">
											{expense.employee_name}
										</h3>
										<p className="text-xs text-muted-foreground">
											{expense.employee}
										</p>
									</div>
								</div>
								<div className="flex items-center space-x-2">
									<Badge 
										variant="secondary" 
										className={`text-xs ${getExpenseTypeColor(expense.expense_type)}`}
									>
										{getExpenseTypeIcon(expense.expense_type)}
										<span className="ml-1">{expense.expense_type}</span>
									</Badge>
									<Button 
										size="sm" 
										variant="ghost" 
										className="h-6 w-6 p-0 hover:bg-primary/10"
										onClick={(e) => {
											e.stopPropagation()
											viewExpenseDetails(expense.id)
										}}
										title="View details"
									>
										<Eye className="h-3 w-3" />
									</Button>
								</div>
							</div>

							<div className="grid grid-cols-3 gap-2 mb-2 text-xs">
								<div className="bg-muted/50 p-2 rounded-lg">
									<p className="text-muted-foreground mb-1">Amount</p>
									<p className="font-bold text-foreground text-xs">
										{formatAmount(expense.amount, expense.currency)}
									</p>
								</div>
								<div className="bg-muted/50 p-2 rounded-lg">
									<p className="text-muted-foreground mb-1">Date</p>
									<p className="font-medium text-foreground text-xs">
										{formatDate(expense.date)}
									</p>
								</div>
								<div className="bg-muted/50 p-2 rounded-lg">
									<p className="text-muted-foreground mb-1">Status</p>
									<Badge variant="secondary" className="bg-amber-100 text-amber-800 text-xs">
										Pending
									</Badge>
								</div>
							</div>

							{expense.description && (
								<div className="bg-muted/50 p-2 rounded-lg mb-2">
									<p className="text-muted-foreground mb-1 text-xs">Description</p>
									<p className="text-xs text-foreground line-clamp-1">
										{expense.description}
									</p>
								</div>
							)}

							<div className="flex justify-between pt-2 border-t border-border text-xs text-muted-foreground">
								<span>Level {expense.level_no} Approval</span>
								<span>ID: {expense.id}</span>
							</div>

							{/* Hover Effect */}
							<div 
								className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
								style={{
									background: 'linear-gradient(135deg, #10b98105, transparent 50%, #10b98102)',
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