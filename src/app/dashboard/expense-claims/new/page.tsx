'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Receipt } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function NewExpenseClaimPage() {
	const router = useRouter()
	const [title, setTitle] = useState('')
	const [description, setDescription] = useState('')
	const [currency, setCurrency] = useState('INR')
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState('')

	const handleCreate = async () => {
		if (!title.trim()) {
			setError('Title is required')
			return
		}

		setSubmitting(true)
		setError('')

		try {
			const token = localStorage.getItem('ess_access_token')
			const res = await fetch('/api/expense-claims', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({ title, description, currency }),
			})

			const data = await res.json()

			if (!res.ok) {
				throw new Error(data.error || 'Failed to create claim')
			}

			// Navigate to the new claim detail page to add items
			router.push(`/dashboard/expense-claims/${data.claim.display_id}`)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to create claim')
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<div className="p-6 max-w-2xl mx-auto">
			<div className="flex items-center gap-3 mb-6">
				<Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/expense-claims')}>
					<ArrowLeft className="h-5 w-5" />
				</Button>
				<div>
					<h1 className="text-2xl font-bold">New Expense Claim</h1>
					<p className="text-sm text-muted-foreground">Create a new expense claim, then add line items</p>
				</div>
			</div>

			<div className="space-y-4 p-6 border rounded-lg bg-card">
				<div className="flex items-center gap-2 mb-4">
					<Receipt className="h-5 w-5 text-muted-foreground" />
					<h2 className="font-semibold">Claim Details</h2>
				</div>

				<div>
					<label className="text-sm font-medium mb-1 block">Title *</label>
					<input
						type="text"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						placeholder="e.g., Business trip to Mumbai"
						className="w-full p-2 border rounded-md bg-background"
					/>
				</div>

				<div>
					<label className="text-sm font-medium mb-1 block">Description</label>
					<textarea
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						placeholder="Brief description of the expenses"
						rows={3}
						className="w-full p-2 border rounded-md bg-background"
					/>
				</div>

				<div>
					<label className="text-sm font-medium mb-1 block">Currency</label>
					<select
						value={currency}
						onChange={(e) => setCurrency(e.target.value)}
						className="w-full p-2 border rounded-md bg-background"
					>
						<option value="INR">INR - Indian Rupee</option>
						<option value="USD">USD - US Dollar</option>
						<option value="EUR">EUR - Euro</option>
						<option value="GBP">GBP - British Pound</option>
					</select>
				</div>

				{error && (
					<div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
						{error}
					</div>
				)}

				<div className="flex gap-3 pt-2">
					<Button onClick={handleCreate} disabled={submitting}>
						{submitting ? 'Creating...' : 'Create Claim'}
					</Button>
					<Button variant="outline" onClick={() => router.back()}>
						Cancel
					</Button>
				</div>
			</div>
		</div>
	)
}
