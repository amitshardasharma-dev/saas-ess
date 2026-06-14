'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { GoalTracker } from '@/components/appraisals/goal-tracker'
import {
	getAppraisals,
	getGoals,
	createGoal,
	updateGoal,
} from '@/services/appraisal'
import type { Appraisal, Goal } from '@/types/appraisal'
import {
	Loader2,
	AlertCircle,
	ClipboardList,
	CheckCircle2,
	Clock,
	ChevronRight,
	Star,
} from 'lucide-react'

type AppraisalStatus = Appraisal['status']

function statusVariant(
	status: AppraisalStatus
): 'default' | 'secondary' | 'destructive' | 'outline' {
	switch (status) {
		case 'Completed':
			return 'default'
		case 'Pending Self':
		case 'Pending Manager':
			return 'secondary'
		case 'Pending Review Meeting':
			return 'outline'
	}
}

function StatusBadge({ status }: { status: AppraisalStatus }) {
	const icons: Record<AppraisalStatus, React.ReactNode> = {
		'Pending Self': <Clock className="h-3 w-3 mr-1" />,
		'Pending Manager': <Clock className="h-3 w-3 mr-1" />,
		'Pending Review Meeting': <Clock className="h-3 w-3 mr-1" />,
		Completed: <CheckCircle2 className="h-3 w-3 mr-1" />,
	}
	return (
		<Badge variant={statusVariant(status)} className="flex items-center">
			{icons[status]}
			{status}
		</Badge>
	)
}

export default function AppraisalsPage() {
	const [appraisals, setAppraisals] = useState<Appraisal[]>([])
	const [goals, setGoals] = useState<Goal[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

	const load = useCallback(async () => {
		setLoading(true)
		setError(null)
		try {
			const [appraisalData, goalData] = await Promise.all([
				getAppraisals('my'),
				getGoals(),
			])
			setAppraisals(appraisalData)
			setGoals(goalData)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to load data')
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		load()
	}, [load])

	const handleCreateGoal = async (data: Partial<Goal>) => {
		const newGoal = await createGoal(data)
		setGoals((prev) => [newGoal, ...prev])
	}

	const handleUpdateGoal = async (id: string, updates: Partial<Goal>) => {
		const updated = await updateGoal(id, updates)
		setGoals((prev) => prev.map((g) => (g.id === id ? updated : g)))
	}

	const activeAppraisals = appraisals.filter(
		(a) =>
			a.status === 'Pending Self' ||
			a.status === 'Pending Manager' ||
			a.status === 'Pending Review Meeting'
	)
	const completedAppraisals = appraisals.filter(
		(a) => a.status === 'Completed'
	)

	if (loading) {
		return (
			<DashboardLayout>
				<div className="flex items-center justify-center min-h-[300px]">
					<Loader2 className="h-6 w-6 animate-spin text-primary" />
				</div>
			</DashboardLayout>
		)
	}

	if (error) {
		return (
			<DashboardLayout>
				<div className="container mx-auto px-4 py-6 max-w-3xl">
					<div className="flex items-center gap-3 p-4 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300">
						<AlertCircle className="h-5 w-5 shrink-0" />
						<p className="text-sm">{error}</p>
					</div>
					<Button className="mt-4" variant="outline" onClick={load}>
						Try Again
					</Button>
				</div>
			</DashboardLayout>
		)
	}

	return (
		<DashboardLayout>
			<div className="container mx-auto px-4 py-6 max-w-3xl space-y-6">
				{/* Page Header */}
				<div className="flex items-center justify-between">
					<div>
						<h1 className="text-2xl font-bold">My Appraisals</h1>
						<p className="text-sm text-muted-foreground mt-1">
							Track your performance reviews and goals
						</p>
					</div>
				</div>

				{/* Active Appraisals */}
				{activeAppraisals.length > 0 && (
					<section className="space-y-3">
						<h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
							Action Required
						</h2>
						{activeAppraisals.map((appraisal) => (
							<Card
								key={appraisal.id}
								className="border-primary/30 bg-primary/5 dark:bg-primary/10"
							>
								<CardContent className="p-4">
									<div className="flex items-start justify-between gap-4">
										<div className="flex-1 min-w-0 space-y-1">
											<p className="font-semibold text-sm">
												{appraisal.cycle_name ?? 'Performance Review'}
											</p>
											<StatusBadge status={appraisal.status} />
											{appraisal.status === 'Pending Self' && (
												<p className="text-xs text-muted-foreground pt-1">
													Your self-assessment is due. Fill it in now.
												</p>
											)}
											{appraisal.status === 'Pending Manager' && (
												<p className="text-xs text-muted-foreground pt-1">
													Waiting for your manager to complete their review.
												</p>
											)}
											{appraisal.status === 'Pending Review Meeting' && (
												<p className="text-xs text-muted-foreground pt-1">
													Both assessments done. Review meeting pending.
												</p>
											)}
										</div>
										<Link href={`/dashboard/appraisals/${appraisal.id}`}>
											<Button size="sm" variant="default">
												{appraisal.status === 'Pending Self'
													? 'Fill Assessment'
													: 'View'}
												<ChevronRight className="h-3.5 w-3.5 ml-1" />
											</Button>
										</Link>
									</div>
								</CardContent>
							</Card>
						))}
					</section>
				)}

				{/* No active appraisals */}
				{activeAppraisals.length === 0 && completedAppraisals.length === 0 && (
					<Card>
						<CardContent className="py-12 text-center">
							<ClipboardList className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
							<p className="text-sm font-medium">No active appraisals</p>
							<p className="text-xs text-muted-foreground mt-1">
								Your HR team will notify you when a new review cycle begins.
							</p>
						</CardContent>
					</Card>
				)}

				{/* Goal Tracker */}
				<GoalTracker
					goals={goals}
					onCreate={handleCreateGoal}
					onUpdate={handleUpdateGoal}
				/>

				{/* Completed Appraisals */}
				{completedAppraisals.length > 0 && (
					<section className="space-y-3">
						<h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
							Completed Reviews
						</h2>
						<div className="space-y-2">
							{completedAppraisals.map((appraisal) => (
								<Link
									key={appraisal.id}
									href={`/dashboard/appraisals/${appraisal.id}`}
									className="block"
								>
									<Card className="hover:bg-muted/30 transition-colors cursor-pointer">
										<CardContent className="p-4">
											<div className="flex items-center justify-between gap-4">
												<div className="flex-1 min-w-0 space-y-1">
													<p className="font-medium text-sm">
														{appraisal.cycle_name ?? 'Performance Review'}
													</p>
													{appraisal.overall_rating != null && (
														<div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
															<Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
															<span className="font-semibold">
																{appraisal.overall_rating}
															</span>
															<span className="text-muted-foreground">
																overall rating
															</span>
														</div>
													)}
												</div>
												<div className="flex items-center gap-2">
													<Badge
														variant="default"
														className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-200"
													>
														<CheckCircle2 className="h-3 w-3 mr-1" />
														Completed
													</Badge>
													<ChevronRight className="h-4 w-4 text-muted-foreground" />
												</div>
											</div>
										</CardContent>
									</Card>
								</Link>
							))}
						</div>
					</section>
				)}
			</div>
		</DashboardLayout>
	)
}
