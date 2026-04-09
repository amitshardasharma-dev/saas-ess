'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AppraisalForm } from '@/components/appraisals/appraisal-form'
import { SideBySideView } from '@/components/appraisals/side-by-side-view'
import {
	getAppraisal,
	submitResponse,
	finalizeAppraisal,
} from '@/services/appraisal'
import type { Appraisal, AppraisalResponse } from '@/types/appraisal'
import {
	ArrowLeft,
	Loader2,
	AlertCircle,
	CheckCircle2,
	Star,
	User,
	UserCheck,
	Calendar,
	Gavel,
} from 'lucide-react'

type FullAppraisal = Appraisal & { responses: AppraisalResponse[] }

function getEmployeeId(): string | null {
	// Employee ID is stored in localStorage after login (set by the employee hook/session)
	// We rely on the API to enforce authorization — here we only use it for UI branching
	if (typeof window === 'undefined') return null
	return (
		localStorage.getItem('ess_employee_id') ||
		sessionStorage.getItem('ess_employee_id') ||
		null
	)
}

export default function AppraisalDetailPage() {
	const params = useParams()
	const router = useRouter()
	const id = params.id as string

	const [appraisal, setAppraisal] = useState<FullAppraisal | null>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

	// Finalize form state
	const [overallRating, setOverallRating] = useState('')
	const [finalComments, setFinalComments] = useState('')
	const [finalizing, setFinalizing] = useState(false)
	const [finalizeError, setFinalizeError] = useState<string | null>(null)

	const load = useCallback(async () => {
		setLoading(true)
		setError(null)
		try {
			const data = await getAppraisal(id)
			setAppraisal(data)
		} catch (err) {
			setError(
				err instanceof Error ? err.message : 'Failed to load appraisal'
			)
		} finally {
			setLoading(false)
		}
	}, [id])

	useEffect(() => {
		if (id) load()
	}, [id, load])

	const handleSubmitResponse = async (
		sectionId: string,
		ratings: Record<string, number>,
		comments: string | null
	) => {
		if (!appraisal) return
		// Determine respondent type by checking whether the current user is employee or manager
		// We compare stored employee_id; fallback: if status is Pending Self → self, else manager
		const storedEmpId = getEmployeeId()
		const respondentType: 'self' | 'manager' =
			storedEmpId === appraisal.employee_id
				? 'self'
				: appraisal.status === 'Pending Self'
				? 'self'
				: 'manager'

		await submitResponse(id, {
			section_id: sectionId,
			respondent_type: respondentType,
			ratings,
			comments,
		})
		// Refresh to get updated status
		await load()
	}

	const handleFinalize = async () => {
		setFinalizing(true)
		setFinalizeError(null)
		try {
			await finalizeAppraisal(id, {
				overall_rating: overallRating ? parseFloat(overallRating) : undefined,
				final_comments: finalComments || undefined,
			})
			await load()
		} catch (err) {
			setFinalizeError(
				err instanceof Error ? err.message : 'Failed to finalize appraisal'
			)
		} finally {
			setFinalizing(false)
		}
	}

	if (loading) {
		return (
			<DashboardLayout>
				<div className="flex items-center justify-center min-h-[300px]">
					<Loader2 className="h-6 w-6 animate-spin text-primary" />
				</div>
			</DashboardLayout>
		)
	}

	if (error || !appraisal) {
		return (
			<DashboardLayout>
				<div className="container mx-auto px-4 py-6 max-w-3xl">
					<div className="flex items-center gap-3 p-4 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300">
						<AlertCircle className="h-5 w-5 shrink-0" />
						<p className="text-sm">{error ?? 'Appraisal not found'}</p>
					</div>
					<Button className="mt-4" variant="outline" onClick={load}>
						Try Again
					</Button>
				</div>
			</DashboardLayout>
		)
	}

	const { status, template, responses } = appraisal
	const sections = template?.sections ?? []

	// Determine the current user's role in this appraisal
	const storedEmpId = getEmployeeId()
	const isEmployee = !storedEmpId || storedEmpId === appraisal.employee_id
	const isManager = storedEmpId === appraisal.manager_id

	// Respondent type for the form
	const respondentType: 'self' | 'manager' =
		status === 'Pending Self' ? 'self' : 'manager'

	return (
		<DashboardLayout>
			<div className="container mx-auto px-4 py-6 max-w-3xl space-y-6">
				{/* Header */}
				<div className="space-y-3">
					<button
						type="button"
						onClick={() => router.push('/dashboard/appraisals')}
						className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
					>
						<ArrowLeft className="h-4 w-4" />
						Back to Appraisals
					</button>
					<div className="flex items-start justify-between gap-4">
						<div className="space-y-1">
							<h1 className="text-xl font-bold">
								{appraisal.cycle_name ?? 'Performance Appraisal'}
							</h1>
							<div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
								<span className="flex items-center gap-1">
									<User className="h-3.5 w-3.5" />
									{appraisal.employee_name ?? appraisal.employee_id}
								</span>
								<span className="text-border">·</span>
								<span className="flex items-center gap-1">
									<UserCheck className="h-3.5 w-3.5" />
									{appraisal.manager_name ?? appraisal.manager_id}
								</span>
							</div>
						</div>
						<Badge
							variant={
								status === 'Completed'
									? 'default'
									: status === 'Pending Self' || status === 'Pending Manager'
									? 'secondary'
									: 'outline'
							}
						>
							{status}
						</Badge>
					</div>
				</div>

				{/* ── Pending Self ── employee fills self-assessment */}
				{status === 'Pending Self' && isEmployee && (
					<>
						<div className="flex items-center gap-2 p-3 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-300">
							<User className="h-4 w-4 shrink-0" />
							<span>
								Please complete your self-assessment below. Submit each section
								when done.
							</span>
						</div>
						<AppraisalForm
							sections={sections}
							responses={responses}
							respondentType="self"
							disabled={false}
							onSubmit={handleSubmitResponse}
						/>
					</>
				)}

				{/* ── Pending Self ── manager sees waiting state */}
				{status === 'Pending Self' && isManager && !isEmployee && (
					<Card>
						<CardContent className="py-10 text-center">
							<Clock className="h-8 w-8 mx-auto mb-3 text-muted-foreground opacity-40" />
							<p className="text-sm font-medium">
								Waiting for employee self-assessment
							</p>
							<p className="text-xs text-muted-foreground mt-1">
								{appraisal.employee_name} has not yet submitted their
								self-assessment.
							</p>
						</CardContent>
					</Card>
				)}

				{/* ── Pending Manager ── manager fills review */}
				{status === 'Pending Manager' && isManager && (
					<>
						<div className="flex items-center gap-2 p-3 rounded-md bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 text-sm text-purple-800 dark:text-purple-300">
							<UserCheck className="h-4 w-4 shrink-0" />
							<span>
								The employee has completed their self-assessment. Please complete
								your manager review.
							</span>
						</div>
						<AppraisalForm
							sections={sections}
							responses={responses}
							respondentType="manager"
							disabled={false}
							onSubmit={handleSubmitResponse}
						/>
					</>
				)}

				{/* ── Pending Manager ── employee sees waiting state */}
				{status === 'Pending Manager' && isEmployee && !isManager && (
					<Card>
						<CardContent className="py-10 text-center">
							<UserCheck className="h-8 w-8 mx-auto mb-3 text-muted-foreground opacity-40" />
							<p className="text-sm font-medium">
								Waiting for manager review
							</p>
							<p className="text-xs text-muted-foreground mt-1">
								Your self-assessment is submitted. Your manager will review it
								shortly.
							</p>
						</CardContent>
					</Card>
				)}

				{/* ── Pending Review Meeting ── side-by-side + finalize form */}
				{status === 'Pending Review Meeting' && (
					<>
						<div className="flex items-center gap-2 p-3 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-300">
							<Calendar className="h-4 w-4 shrink-0" />
							<span>
								Both assessments are complete. Schedule a review meeting and
								finalize the appraisal.
							</span>
						</div>

						<SideBySideView sections={sections} responses={responses} />

						{/* Finalize card — only for manager */}
						{isManager && (
							<Card>
								<CardHeader className="pb-3">
									<CardTitle className="text-base flex items-center gap-2">
										<Gavel className="h-4 w-4" />
										Finalize Appraisal
									</CardTitle>
								</CardHeader>
								<CardContent className="space-y-4">
									{finalizeError && (
										<div className="flex items-center gap-2 p-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 text-sm text-red-800 dark:text-red-300">
											<AlertCircle className="h-4 w-4 shrink-0" />
											{finalizeError}
										</div>
									)}
									<div className="space-y-1">
										<label className="text-xs font-medium text-muted-foreground">
											Overall Rating (e.g. 1–5)
										</label>
										<input
											type="number"
											min={1}
											max={5}
											step={0.1}
											value={overallRating}
											onChange={(e) => setOverallRating(e.target.value)}
											placeholder="e.g. 4.5"
											className="w-48 rounded-md border border-input bg-background px-3 py-2 text-sm
												focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										/>
									</div>
									<div className="space-y-1">
										<label className="text-xs font-medium text-muted-foreground">
											Final Comments
										</label>
										<textarea
											value={finalComments}
											onChange={(e) => setFinalComments(e.target.value)}
											rows={4}
											placeholder="Summarize the review meeting outcomes..."
											className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm
												placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2
												focus-visible:ring-ring resize-none"
										/>
									</div>
									<div className="flex justify-end">
										<Button onClick={handleFinalize} disabled={finalizing}>
											{finalizing ? (
												<Loader2 className="h-4 w-4 mr-2 animate-spin" />
											) : (
												<CheckCircle2 className="h-4 w-4 mr-2" />
											)}
											Finalize Appraisal
										</Button>
									</div>
								</CardContent>
							</Card>
						)}
					</>
				)}

				{/* ── Completed ── read-only side-by-side with final rating */}
				{status === 'Completed' && (
					<>
						<Card className="border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/10">
							<CardContent className="p-4 flex items-center gap-4">
								<CheckCircle2 className="h-8 w-8 text-green-500 shrink-0" />
								<div className="flex-1">
									<p className="font-semibold text-green-800 dark:text-green-300">
										Appraisal Completed
									</p>
									{appraisal.overall_rating != null && (
										<div className="flex items-center gap-1.5 mt-1">
											<Star className="h-4 w-4 fill-amber-400 text-amber-400" />
											<span className="text-sm font-bold text-amber-600 dark:text-amber-400">
												{appraisal.overall_rating}
											</span>
											<span className="text-sm text-muted-foreground">
												overall rating
											</span>
										</div>
									)}
								</div>
							</CardContent>
						</Card>

						{appraisal.final_comments && (
							<Card>
								<CardHeader className="pb-2">
									<CardTitle className="text-sm">Final Comments</CardTitle>
								</CardHeader>
								<CardContent>
									<p className="text-sm leading-relaxed text-muted-foreground">
										{appraisal.final_comments}
									</p>
								</CardContent>
							</Card>
						)}

						<SideBySideView sections={sections} responses={responses} />
					</>
				)}
			</div>
		</DashboardLayout>
	)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function Clock(props: React.SVGProps<SVGSVGElement>) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="24"
			height="24"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			{...props}
		>
			<circle cx="12" cy="12" r="10" />
			<polyline points="12 6 12 12 16 14" />
		</svg>
	)
}
