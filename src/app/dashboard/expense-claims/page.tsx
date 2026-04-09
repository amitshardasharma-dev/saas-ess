'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Receipt, Plus, Clock, CheckCircle, XCircle, DollarSign, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface ExpenseClaim {
	id: string
	display_id: string
	title: string
	description: string
	total_amount: number
	currency: string
	status: string
	submitted_at: string | null
	created_at: string
	updated_at: string
}

const getStatusConfig = (status: string) => {
	switch (status) {
		case 'Approved':
			return { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', badge: 'default' as const }
		case 'Rejected':
			return { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', badge: 'destructive' as const }
		case 'Paid':
			return { icon: DollarSign, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', badge: 'default' as const }
		case 'Draft':
			return { icon: Receipt, color: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200', badge: 'secondary' as const }
		default:
			return { icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', badge: 'secondary' as const }
	}
}

const formatDate = (dateString: string) =>
	new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

const formatAmount = (amount: number, currency: string) =>
	new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency || 'INR' }).format(amount)

export default function ExpenseClaimsPage() {
	const router = useRouter()
	const [claims, setClaims] = useState<ExpenseClaim[]>([])
	const [loading, setLoading] = useState(true)
	const [filter, setFilter] = useState('all')

	useEffect(() => {
		fetchClaims()
	}, [filter])

	const fetchClaims = async () => {
		setLoading(true)
		try {
			const token = localStorage.getItem('ess_access_token')
			const url = filter === 'all' ? '/api/expense-claims' : `/api/expense-claims?status=${filter}`
			const res = await fetch(url, {
				headers: { Authorization: `Bearer ${token}` },
			})
			const data = await res.json()
			setClaims(data.claims || [])
		} catch (error) {
			console.error('Failed to fetch claims:', error)
		} finally {
			setLoading(false)
		}
	}

	const filters = [
		{ label: 'All', value: 'all' },
		{ label: 'Draft', value: 'Draft' },
		{ label: 'Pending', value: 'Pending Approval' },
		{ label: 'Approved', value: 'Approved' },
		{ label: 'Rejected', value: 'Rejected' },
		{ label: 'Paid', value: 'Paid' },
	]

	return (
		<div className="p-6 max-w-6xl mx-auto">
			<div className="flex items-center justify-between mb-6">
				<div className="flex items-center gap-3">
					<Button variant="ghost" size="icon" onClick={() => router.push('/dashboard')}>
						<ArrowLeft className="h-5 w-5" />
					</Button>
					<div>
						<h1 className="text-2xl font-bold">Expense Claims</h1>
						<p className="text-sm text-muted-foreground">Submit and track your expense claims</p>
					</div>
				</div>
				<Button onClick={() => router.push('/dashboard/expense-claims/new')}>
					<Plus className="h-4 w-4 mr-2" />
					New Claim
				</Button>
			</div>

			<div className="flex gap-2 mb-6 flex-wrap">
				{filters.map(f => (
					<Button
						key={f.value}
						variant={filter === f.value ? 'default' : 'outline'}
						size="sm"
						onClick={() => setFilter(f.value)}
					>
						{f.label}
					</Button>
				))}
			</div>

			{loading ? (
				<div className="text-center py-12">
					<div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
					<p className="text-sm text-muted-foreground">Loading claims...</p>
				</div>
			) : claims.length === 0 ? (
				<div className="text-center py-12 content-flow">
					<Receipt className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-40" />
					<p className="text-sm font-semibold text-muted-foreground mb-1">No expense claims found</p>
					<p className="text-xs text-muted-foreground mb-4">
						Create your first expense claim to get started
					</p>
					<Button variant="outline" onClick={() => router.push('/dashboard/expense-claims/new')}>
						<Plus className="h-4 w-4 mr-2" />
						New Claim
					</Button>
				</div>
			) : (
				<div className="grid gap-4">
					{claims.map(claim => {
						const config = getStatusConfig(claim.status)
						const StatusIcon = config.icon

						return (
							<div
								key={claim.id}
								className={`p-4 rounded-lg border ${config.border} ${config.bg} cursor-pointer hover:shadow-md transition-shadow`}
								onClick={() => router.push(`/dashboard/expense-claims/${claim.display_id}`)}
							>
								<div className="flex items-center justify-between mb-2">
									<div className="flex items-center gap-2">
										<StatusIcon className={`h-5 w-5 ${config.color}`} />
										<span className="font-medium">{claim.title}</span>
										<span className="text-xs text-muted-foreground">{claim.display_id}</span>
									</div>
									<div className="flex items-center gap-2">
										<span className="font-semibold">{formatAmount(claim.total_amount, claim.currency)}</span>
										<Badge variant={config.badge}>{claim.status}</Badge>
									</div>
								</div>
								{claim.description && (
									<p className="text-sm text-muted-foreground truncate">{claim.description}</p>
								)}
								<p className="text-xs text-muted-foreground mt-1">
									{claim.submitted_at ? `Submitted ${formatDate(claim.submitted_at)}` : `Created ${formatDate(claim.created_at)}`}
								</p>
							</div>
						)
					})}
				</div>
			)}
		</div>
	)
}
