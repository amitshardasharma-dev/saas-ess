'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Receipt, Plus, Trash2, Upload, CheckCircle, Clock, XCircle, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface ExpenseItem {
	id: string
	description: string
	amount: number
	expense_date: string
	has_receipt: boolean
	receipt_url: string | null
	receipt_filename: string | null
	ess_expense_categories: { code: string; name: string } | null
}

interface ApprovalEntry {
	level_no: number
	status: string
	action_time: string | null
	remarks: string | null
	ess_employees: { full_name: string; employee_no: string } | null
}

interface ExpenseCategory {
	id: string
	name: string
}

interface ExpenseClaim {
	id: string
	display_id: string
	title: string
	description: string | null
	status: string
	currency: string
	total_amount: number
}

const formatDate = (dateString: string) =>
	new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

const formatAmount = (amount: number, currency: string) =>
	new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency || 'INR' }).format(amount)

export default function ExpenseClaimDetailPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = use(params)
	const router = useRouter()
	const [claim, setClaim] = useState<ExpenseClaim | null>(null)
	const [items, setItems] = useState<ExpenseItem[]>([])
	const [approvalChain, setApprovalChain] = useState<ApprovalEntry[]>([])
	const [loading, setLoading] = useState(true)
	const [showAddItem, setShowAddItem] = useState(false)
	const [categories, setCategories] = useState<ExpenseCategory[]>([])

	// New item form
	const [newItem, setNewItem] = useState({
		category_id: '',
		description: '',
		amount: '',
		expense_date: new Date().toISOString().split('T')[0],
	})

	useEffect(() => {
		fetchClaimDetail()
		fetchCategories()
	}, [id])

	const getToken = () => localStorage.getItem('ess_access_token')

	const fetchClaimDetail = async () => {
		setLoading(true)
		try {
			const res = await fetch(`/api/expense-claims/${id}`, {
				headers: { Authorization: `Bearer ${getToken()}` },
			})
			const data = await res.json()
			setClaim(data.claim)
			setItems(data.items || [])
			setApprovalChain(data.approval_chain || [])
		} catch (error) {
			console.error('Failed to fetch claim:', error)
		} finally {
			setLoading(false)
		}
	}

	const fetchCategories = async () => {
		try {
			const res = await fetch('/api/expense-categories', {
				headers: { Authorization: `Bearer ${getToken()}` },
			})
			const data = await res.json()
			setCategories(data.categories || [])
		} catch (error) {
			console.error('Failed to fetch categories:', error)
		}
	}

	const addItem = async () => {
		if (!newItem.category_id || !newItem.description || !newItem.amount) return

		try {
			const res = await fetch(`/api/expense-claims/${id}/items`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${getToken()}`,
				},
				body: JSON.stringify({
					...newItem,
					amount: parseFloat(newItem.amount),
				}),
			})

			if (res.ok) {
				setShowAddItem(false)
				setNewItem({ category_id: '', description: '', amount: '', expense_date: new Date().toISOString().split('T')[0] })
				fetchClaimDetail()
			}
		} catch (error) {
			console.error('Failed to add item:', error)
		}
	}

	const deleteItem = async (itemId: string) => {
		try {
			await fetch(`/api/expense-claims/${id}/items?itemId=${itemId}`, {
				method: 'DELETE',
				headers: { Authorization: `Bearer ${getToken()}` },
			})
			fetchClaimDetail()
		} catch (error) {
			console.error('Failed to delete item:', error)
		}
	}

	const submitClaim = async () => {
		try {
			const res = await fetch(`/api/expense-claims/${id}`, {
				method: 'POST',
				headers: { Authorization: `Bearer ${getToken()}` },
			})
			const data = await res.json()
			if (res.ok) {
				fetchClaimDetail()
			} else {
				alert(data.error || 'Failed to submit')
			}
		} catch (error) {
			console.error('Failed to submit claim:', error)
		}
	}

	if (loading) {
		return (
			<div className="p-6 text-center">
				<div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
				<p className="text-sm text-muted-foreground">Loading claim...</p>
			</div>
		)
	}

	if (!claim) {
		return (
			<div className="p-6 text-center">
				<p className="text-muted-foreground">Claim not found</p>
			</div>
		)
	}

	const isDraft = claim.status === 'Draft'

	return (
		<div className="p-6 max-w-4xl mx-auto">
			{/* Header */}
			<div className="flex items-center justify-between mb-6">
				<div className="flex items-center gap-3">
					<Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/expense-claims')}>
						<ArrowLeft className="h-5 w-5" />
					</Button>
					<div>
						<h1 className="text-2xl font-bold">{claim.title}</h1>
						<p className="text-sm text-muted-foreground">{claim.display_id}</p>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<span className="text-xl font-bold">{formatAmount(claim.total_amount, claim.currency)}</span>
					<Badge variant={claim.status === 'Approved' ? 'default' : claim.status === 'Rejected' ? 'destructive' : 'secondary'}>
						{claim.status}
					</Badge>
				</div>
			</div>

			{claim.description && (
				<p className="text-sm text-muted-foreground mb-6">{claim.description}</p>
			)}

			{/* Line Items */}
			<div className="border rounded-lg p-4 mb-6">
				<div className="flex items-center justify-between mb-4">
					<h2 className="font-semibold flex items-center gap-2">
						<Receipt className="h-4 w-4" />
						Expense Items ({items.length})
					</h2>
					{isDraft && (
						<Button size="sm" variant="outline" onClick={() => setShowAddItem(!showAddItem)}>
							<Plus className="h-4 w-4 mr-1" />
							Add Item
						</Button>
					)}
				</div>

				{/* Add item form */}
				{showAddItem && (
					<div className="p-4 mb-4 bg-muted/50 rounded-lg space-y-3">
						<div className="grid grid-cols-2 gap-3">
							<div>
								<label className="text-xs font-medium mb-1 block">Category *</label>
								<select
									value={newItem.category_id}
									onChange={e => setNewItem({ ...newItem, category_id: e.target.value })}
									className="w-full p-2 border rounded-md bg-background text-sm"
								>
									<option value="">Select category</option>
									{categories.map(cat => (
										<option key={cat.id} value={cat.id}>{cat.name}</option>
									))}
								</select>
							</div>
							<div>
								<label className="text-xs font-medium mb-1 block">Amount *</label>
								<input
									type="number"
									step="0.01"
									value={newItem.amount}
									onChange={e => setNewItem({ ...newItem, amount: e.target.value })}
									placeholder="0.00"
									className="w-full p-2 border rounded-md bg-background text-sm"
								/>
							</div>
						</div>
						<div className="grid grid-cols-2 gap-3">
							<div>
								<label className="text-xs font-medium mb-1 block">Description *</label>
								<input
									type="text"
									value={newItem.description}
									onChange={e => setNewItem({ ...newItem, description: e.target.value })}
									placeholder="What was this expense for?"
									className="w-full p-2 border rounded-md bg-background text-sm"
								/>
							</div>
							<div>
								<label className="text-xs font-medium mb-1 block">Date *</label>
								<input
									type="date"
									value={newItem.expense_date}
									onChange={e => setNewItem({ ...newItem, expense_date: e.target.value })}
									className="w-full p-2 border rounded-md bg-background text-sm"
								/>
							</div>
						</div>
						<div className="flex gap-2">
							<Button size="sm" onClick={addItem}>Add</Button>
							<Button size="sm" variant="ghost" onClick={() => setShowAddItem(false)}>Cancel</Button>
						</div>
					</div>
				)}

				{items.length === 0 ? (
					<div className="text-center py-8">
						<Receipt className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
						<p className="text-sm text-muted-foreground">No items added yet</p>
					</div>
				) : (
					<div className="space-y-2">
						{items.map(item => (
							<div key={item.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
								<div className="flex-1">
									<div className="flex items-center gap-2">
										<span className="text-sm font-medium">{item.description}</span>
										{item.ess_expense_categories && (
											<Badge variant="outline" className="text-xs">{item.ess_expense_categories.name}</Badge>
										)}
									</div>
									<div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
										<span>{formatDate(item.expense_date)}</span>
										{item.has_receipt && (
											<span className="flex items-center gap-1 text-green-600">
												<Upload className="h-3 w-3" /> Receipt
											</span>
										)}
									</div>
								</div>
								<div className="flex items-center gap-2">
									<span className="font-semibold">{formatAmount(item.amount, claim.currency)}</span>
									{isDraft && (
										<Button size="icon" variant="ghost" className="h-8 w-8 text-red-500" onClick={() => deleteItem(item.id)}>
											<Trash2 className="h-4 w-4" />
										</Button>
									)}
								</div>
							</div>
						))}
					</div>
				)}
			</div>

			{/* Approval Chain */}
			{approvalChain.length > 0 && (
				<div className="border rounded-lg p-4 mb-6">
					<h2 className="font-semibold mb-4">Approval Chain</h2>
					<div className="space-y-3">
						{approvalChain.map(entry => {
							const approver = entry.ess_employees
							const StatusIcon = entry.status === 'Approved' ? CheckCircle
								: entry.status === 'Rejected' ? XCircle : Clock

							return (
								<div key={entry.level_no} className="flex items-center gap-3">
									<StatusIcon className={`h-5 w-5 ${
										entry.status === 'Approved' ? 'text-green-600'
											: entry.status === 'Rejected' ? 'text-red-600'
												: 'text-amber-500'
									}`} />
									<div>
										<p className="text-sm font-medium">
											Level {entry.level_no}: {approver?.full_name || 'Unknown'}
										</p>
										<p className="text-xs text-muted-foreground">
											{entry.status}
											{entry.action_time && ` on ${formatDate(entry.action_time)}`}
										</p>
										{entry.remarks && (
											<p className="text-xs text-muted-foreground italic">{entry.remarks}</p>
										)}
									</div>
								</div>
							)
						})}
					</div>
				</div>
			)}

			{/* Submit Button */}
			{isDraft && items.length > 0 && (
				<div className="flex justify-end">
					<Button onClick={submitClaim} className="gap-2">
						<Send className="h-4 w-4" />
						Submit for Approval
					</Button>
				</div>
			)}
		</div>
	)
}
