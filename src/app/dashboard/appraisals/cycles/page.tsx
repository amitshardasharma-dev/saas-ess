'use client'

import { useEffect, useState, useCallback } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
	getCycles,
	getTemplates,
	createCycle,
	activateCycle,
} from '@/services/appraisal'
import type { AppraisalCycle, AppraisalTemplate } from '@/types/appraisal'
import {
	Loader2,
	AlertCircle,
	Plus,
	Zap,
	CheckCircle2,
	Clock,
	CalendarRange,
	X,
	ChevronDown,
	ChevronUp,
} from 'lucide-react'

type CycleStatus = AppraisalCycle['status']

function statusVariant(
	status: CycleStatus
): 'default' | 'secondary' | 'outline' {
	switch (status) {
		case 'Active':
			return 'default'
		case 'Draft':
			return 'secondary'
		case 'Closed':
			return 'outline'
	}
}

function ProgressBar({ value, max }: { value: number; max: number }) {
	const pct = max > 0 ? Math.round((value / max) * 100) : 0
	return (
		<div className="space-y-1">
			<div className="flex items-center justify-between text-xs text-muted-foreground">
				<span>Completion</span>
				<span>
					{value}/{max} ({pct}%)
				</span>
			</div>
			<div className="h-2 bg-muted rounded-full overflow-hidden">
				<div
					className={`h-full rounded-full transition-all ${
						pct === 100
							? 'bg-green-500'
							: pct > 50
							? 'bg-blue-500'
							: 'bg-amber-500'
					}`}
					style={{ width: `${pct}%` }}
				/>
			</div>
		</div>
	)
}

interface ActivateDialogProps {
	cycle: AppraisalCycle
	onConfirm: () => Promise<void>
	onCancel: () => void
}

function ActivateDialog({ cycle, onConfirm, onCancel }: ActivateDialogProps) {
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const handleConfirm = async () => {
		setLoading(true)
		setError(null)
		try {
			await onConfirm()
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to activate')
			setLoading(false)
		}
	}

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
			<Card className="w-full max-w-md mx-4">
				<CardHeader className="pb-3">
					<CardTitle className="text-base flex items-center gap-2">
						<Zap className="h-4 w-4 text-amber-500" />
						Activate Cycle
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<p className="text-sm text-muted-foreground">
						You are about to activate{' '}
						<span className="font-semibold text-foreground">
							{cycle.name}
						</span>
						. This will:
					</p>
					<ul className="text-sm text-muted-foreground space-y-1 ml-4 list-disc">
						<li>Set the cycle status to Active</li>
						<li>
							Create appraisals for all active employees who have a manager
							assigned
						</li>
					</ul>
					{error && (
						<div className="flex items-center gap-2 p-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 text-sm text-red-800 dark:text-red-300">
							<AlertCircle className="h-4 w-4 shrink-0" />
							{error}
						</div>
					)}
					<div className="flex justify-end gap-2 pt-2">
						<Button variant="outline" onClick={onCancel} disabled={loading}>
							<X className="h-4 w-4 mr-1" />
							Cancel
						</Button>
						<Button onClick={handleConfirm} disabled={loading}>
							{loading ? (
								<Loader2 className="h-4 w-4 mr-1 animate-spin" />
							) : (
								<Zap className="h-4 w-4 mr-1" />
							)}
							Activate
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	)
}

interface CreateCycleFormProps {
	templates: AppraisalTemplate[]
	onCreate: (data: Partial<AppraisalCycle>) => Promise<void>
	onCancel: () => void
}

function CreateCycleForm({
	templates,
	onCreate,
	onCancel,
}: CreateCycleFormProps) {
	const [name, setName] = useState('')
	const [templateId, setTemplateId] = useState(
		templates.find((t) => t.is_default)?.id ?? templates[0]?.id ?? ''
	)
	const [startDate, setStartDate] = useState('')
	const [endDate, setEndDate] = useState('')
	const [selfDeadline, setSelfDeadline] = useState('')
	const [managerDeadline, setManagerDeadline] = useState('')
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const handleCreate = async () => {
		if (!name || !templateId || !startDate || !endDate || !selfDeadline || !managerDeadline) {
			setError('All fields are required.')
			return
		}
		setSaving(true)
		setError(null)
		try {
			await onCreate({
				name,
				template_id: templateId,
				start_date: startDate,
				end_date: endDate,
				self_assessment_deadline: selfDeadline,
				manager_review_deadline: managerDeadline,
			})
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to create cycle')
			setSaving(false)
		}
	}

	return (
		<Card className="border-dashed">
			<CardHeader className="pb-3">
				<CardTitle className="text-base flex items-center gap-2">
					<Plus className="h-4 w-4" />
					New Review Cycle
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				{error && (
					<div className="flex items-center gap-2 p-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 text-sm text-red-800 dark:text-red-300">
						<AlertCircle className="h-4 w-4 shrink-0" />
						{error}
					</div>
				)}
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div className="md:col-span-2 space-y-1">
						<label className="text-xs font-medium text-muted-foreground">
							Cycle Name <span className="text-red-500">*</span>
						</label>
						<input
							type="text"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="e.g. Q2 2026 Performance Review"
							className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm
								placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</div>
					<div className="md:col-span-2 space-y-1">
						<label className="text-xs font-medium text-muted-foreground">
							Template <span className="text-red-500">*</span>
						</label>
						<select
							value={templateId}
							onChange={(e) => setTemplateId(e.target.value)}
							className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm
								focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							{templates.length === 0 ? (
								<option value="">No templates available</option>
							) : (
								templates.map((t) => (
									<option key={t.id} value={t.id}>
										{t.name}
										{t.is_default ? ' (default)' : ''}
									</option>
								))
							)}
						</select>
					</div>
					<div className="space-y-1">
						<label className="text-xs font-medium text-muted-foreground">
							Start Date <span className="text-red-500">*</span>
						</label>
						<input
							type="date"
							value={startDate}
							onChange={(e) => setStartDate(e.target.value)}
							className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm
								focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</div>
					<div className="space-y-1">
						<label className="text-xs font-medium text-muted-foreground">
							End Date <span className="text-red-500">*</span>
						</label>
						<input
							type="date"
							value={endDate}
							onChange={(e) => setEndDate(e.target.value)}
							className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm
								focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</div>
					<div className="space-y-1">
						<label className="text-xs font-medium text-muted-foreground">
							Self-Assessment Deadline <span className="text-red-500">*</span>
						</label>
						<input
							type="date"
							value={selfDeadline}
							onChange={(e) => setSelfDeadline(e.target.value)}
							className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm
								focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</div>
					<div className="space-y-1">
						<label className="text-xs font-medium text-muted-foreground">
							Manager Review Deadline <span className="text-red-500">*</span>
						</label>
						<input
							type="date"
							value={managerDeadline}
							onChange={(e) => setManagerDeadline(e.target.value)}
							className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm
								focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</div>
				</div>
				<div className="flex justify-end gap-2 pt-1">
					<Button variant="outline" onClick={onCancel} disabled={saving}>
						Cancel
					</Button>
					<Button onClick={handleCreate} disabled={saving}>
						{saving ? (
							<Loader2 className="h-4 w-4 mr-1 animate-spin" />
						) : (
							<Plus className="h-4 w-4 mr-1" />
						)}
						Create Cycle
					</Button>
				</div>
			</CardContent>
		</Card>
	)
}

interface CycleCardProps {
	cycle: AppraisalCycle
	onActivate: (cycle: AppraisalCycle) => void
}

function CycleCard({ cycle, onActivate }: CycleCardProps) {
	const [expanded, setExpanded] = useState(false)

	const fmt = (d: string) =>
		new Date(d).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
		})

	return (
		<Card>
			<CardContent className="p-4 space-y-3">
				<div className="flex items-start justify-between gap-3">
					<div className="flex-1 min-w-0 space-y-1">
						<div className="flex items-center gap-2">
							<p className="font-semibold text-sm truncate">{cycle.name}</p>
							<Badge variant={statusVariant(cycle.status)}>
								{cycle.status}
							</Badge>
						</div>
						{cycle.template_name && (
							<p className="text-xs text-muted-foreground">
								Template: {cycle.template_name}
							</p>
						)}
						<div className="flex items-center gap-1 text-xs text-muted-foreground">
							<CalendarRange className="h-3.5 w-3.5" />
							{fmt(cycle.start_date)} — {fmt(cycle.end_date)}
						</div>
					</div>
					<div className="flex items-center gap-2 shrink-0">
						{cycle.status === 'Draft' && (
							<Button
								size="sm"
								variant="outline"
								onClick={() => onActivate(cycle)}
							>
								<Zap className="h-3.5 w-3.5 mr-1 text-amber-500" />
								Activate
							</Button>
						)}
						<button
							type="button"
							onClick={() => setExpanded((v) => !v)}
							className="p-1 rounded hover:bg-muted transition-colors"
						>
							{expanded ? (
								<ChevronUp className="h-4 w-4 text-muted-foreground" />
							) : (
								<ChevronDown className="h-4 w-4 text-muted-foreground" />
							)}
						</button>
					</div>
				</div>

				{/* Completion progress */}
				{typeof cycle.total_appraisals === 'number' &&
					cycle.total_appraisals > 0 && (
						<ProgressBar
							value={cycle.completed_count ?? 0}
							max={cycle.total_appraisals}
						/>
					)}

				{/* Expanded details */}
				{expanded && (
					<div className="pt-2 border-t grid grid-cols-2 gap-3 text-xs text-muted-foreground">
						<div>
							<p className="font-medium text-foreground mb-0.5">
								Self-Assessment Deadline
							</p>
							<p className="flex items-center gap-1">
								<Clock className="h-3.5 w-3.5" />
								{fmt(cycle.self_assessment_deadline)}
							</p>
						</div>
						<div>
							<p className="font-medium text-foreground mb-0.5">
								Manager Review Deadline
							</p>
							<p className="flex items-center gap-1">
								<Clock className="h-3.5 w-3.5" />
								{fmt(cycle.manager_review_deadline)}
							</p>
						</div>
						<div>
							<p className="font-medium text-foreground mb-0.5">
								Total Appraisals
							</p>
							<p>{cycle.total_appraisals ?? 0}</p>
						</div>
						<div>
							<p className="font-medium text-foreground mb-0.5">Completed</p>
							<p className="flex items-center gap-1 text-green-600 dark:text-green-400">
								<CheckCircle2 className="h-3.5 w-3.5" />
								{cycle.completed_count ?? 0}
							</p>
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	)
}

export default function CyclesPage() {
	const [cycles, setCycles] = useState<AppraisalCycle[]>([])
	const [templates, setTemplates] = useState<AppraisalTemplate[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [showCreateForm, setShowCreateForm] = useState(false)
	const [activatingCycle, setActivatingCycle] =
		useState<AppraisalCycle | null>(null)

	const load = useCallback(async () => {
		setLoading(true)
		setError(null)
		try {
			const [cycleData, templateData] = await Promise.all([
				getCycles(),
				getTemplates(),
			])
			setCycles(cycleData)
			setTemplates(templateData)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to load data')
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		load()
	}, [load])

	const handleCreate = async (data: Partial<AppraisalCycle>) => {
		const newCycle = await createCycle(data)
		setCycles((prev) => [newCycle, ...prev])
		setShowCreateForm(false)
	}

	const handleActivateConfirm = async () => {
		if (!activatingCycle) return
		await activateCycle(activatingCycle.id)
		setActivatingCycle(null)
		await load()
	}

	// Summary stats
	const activeCycles = cycles.filter((c) => c.status === 'Active')
	const totalAppraisals = cycles.reduce(
		(sum, c) => sum + (c.total_appraisals ?? 0),
		0
	)
	const totalCompleted = cycles.reduce(
		(sum, c) => sum + (c.completed_count ?? 0),
		0
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
				<div className="container mx-auto px-4 py-6 max-w-4xl">
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
			<div className="container mx-auto px-4 py-6 max-w-4xl space-y-6">
				{/* Header */}
				<div className="flex items-center justify-between">
					<div>
						<h1 className="text-2xl font-bold">Review Cycle Management</h1>
						<p className="text-sm text-muted-foreground mt-1">
							Create and manage appraisal cycles for your organisation
						</p>
					</div>
					<Button
						onClick={() => setShowCreateForm(true)}
						disabled={showCreateForm}
					>
						<Plus className="h-4 w-4 mr-2" />
						New Cycle
					</Button>
				</div>

				{/* Summary stats */}
				<div className="grid grid-cols-3 gap-4">
					<Card>
						<CardContent className="p-4 text-center">
							<p className="text-2xl font-bold">{cycles.length}</p>
							<p className="text-xs text-muted-foreground">Total Cycles</p>
						</CardContent>
					</Card>
					<Card>
						<CardContent className="p-4 text-center">
							<p className="text-2xl font-bold text-green-600 dark:text-green-400">
								{activeCycles.length}
							</p>
							<p className="text-xs text-muted-foreground">Active</p>
						</CardContent>
					</Card>
					<Card>
						<CardContent className="p-4 text-center">
							<p className="text-2xl font-bold">
								{totalCompleted}/{totalAppraisals}
							</p>
							<p className="text-xs text-muted-foreground">
								Appraisals Completed
							</p>
						</CardContent>
					</Card>
				</div>

				{/* Overall completion progress */}
				{totalAppraisals > 0 && (
					<Card>
						<CardContent className="p-4">
							<ProgressBar value={totalCompleted} max={totalAppraisals} />
						</CardContent>
					</Card>
				)}

				{/* Create form */}
				{showCreateForm && (
					<CreateCycleForm
						templates={templates}
						onCreate={handleCreate}
						onCancel={() => setShowCreateForm(false)}
					/>
				)}

				{/* Cycles list */}
				{cycles.length === 0 && !showCreateForm ? (
					<Card>
						<CardContent className="py-12 text-center">
							<CalendarRange className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
							<p className="text-sm font-medium">No review cycles yet</p>
							<p className="text-xs text-muted-foreground mt-1">
								Create your first cycle to get started.
							</p>
						</CardContent>
					</Card>
				) : (
					<div className="space-y-3">
						{cycles.map((cycle) => (
							<CycleCard
								key={cycle.id}
								cycle={cycle}
								onActivate={setActivatingCycle}
							/>
						))}
					</div>
				)}

				{/* Activate confirmation dialog */}
				{activatingCycle && (
					<ActivateDialog
						cycle={activatingCycle}
						onConfirm={handleActivateConfirm}
						onCancel={() => setActivatingCycle(null)}
					/>
				)}
			</div>
		</DashboardLayout>
	)
}
