'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
	Plus,
	Loader2,
	Target,
	ChevronDown,
	ChevronUp,
	Check,
	X,
	Pencil,
} from 'lucide-react'
import type { Goal } from '@/types/appraisal'

type GoalStatus = Goal['status']

const STATUS_OPTIONS: GoalStatus[] = [
	'Not Started',
	'In Progress',
	'Completed',
	'Deferred',
]

function statusVariant(
	status: GoalStatus
): 'secondary' | 'default' | 'destructive' | 'outline' {
	switch (status) {
		case 'Not Started':
			return 'outline'
		case 'In Progress':
			return 'secondary'
		case 'Completed':
			return 'default'
		case 'Deferred':
			return 'destructive'
	}
}

function statusColor(status: GoalStatus): string {
	switch (status) {
		case 'Not Started':
			return 'text-muted-foreground'
		case 'In Progress':
			return 'text-blue-600 dark:text-blue-400'
		case 'Completed':
			return 'text-green-600 dark:text-green-400'
		case 'Deferred':
			return 'text-red-600 dark:text-red-400'
	}
}

function ProgressBar({ value }: { value: number }) {
	const clamped = Math.min(100, Math.max(0, value))
	return (
		<div className="h-2 bg-muted rounded-full overflow-hidden">
			<div
				className={`h-full rounded-full transition-all ${
					clamped === 100
						? 'bg-green-500'
						: clamped > 50
						? 'bg-blue-500'
						: 'bg-amber-500'
				}`}
				style={{ width: `${clamped}%` }}
			/>
		</div>
	)
}

interface GoalCardProps {
	goal: Goal
	onUpdate: (id: string, updates: Partial<Goal>) => Promise<void>
}

function GoalCard({ goal, onUpdate }: GoalCardProps) {
	const [editing, setEditing] = useState(false)
	const [progress, setProgress] = useState(String(goal.current_progress))
	const [status, setStatus] = useState<GoalStatus>(goal.status)
	const [saving, setSaving] = useState(false)
	const [expanded, setExpanded] = useState(false)

	const handleSave = async () => {
		setSaving(true)
		try {
			await onUpdate(goal.id, {
				current_progress: parseFloat(progress) || 0,
				status,
			})
			setEditing(false)
		} finally {
			setSaving(false)
		}
	}

	const handleCancel = () => {
		setProgress(String(goal.current_progress))
		setStatus(goal.status)
		setEditing(false)
	}

	return (
		<Card>
			<CardContent className="p-4">
				<div className="space-y-3">
					{/* Header row */}
					<div className="flex items-start justify-between gap-2">
						<div className="flex-1 min-w-0">
							<div className="flex items-center gap-2">
								<Target className="h-4 w-4 text-muted-foreground shrink-0" />
								<p className="text-sm font-medium truncate">{goal.title}</p>
							</div>
							{goal.description && (
								<button
									type="button"
									className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground ml-6"
									onClick={() => setExpanded((v) => !v)}
								>
									{expanded ? (
										<>
											<ChevronUp className="h-3 w-3" /> Hide details
										</>
									) : (
										<>
											<ChevronDown className="h-3 w-3" /> Show details
										</>
									)}
								</button>
							)}
						</div>
						<div className="flex items-center gap-2 shrink-0">
							<Badge variant={statusVariant(goal.status)}>
								{goal.status}
							</Badge>
							{!editing && (
								<button
									type="button"
									onClick={() => setEditing(true)}
									className="p-1 rounded hover:bg-muted transition-colors"
									title="Edit progress"
								>
									<Pencil className="h-3.5 w-3.5 text-muted-foreground" />
								</button>
							)}
						</div>
					</div>

					{/* Expanded description */}
					{expanded && goal.description && (
						<p className="text-sm text-muted-foreground ml-6 leading-relaxed">
							{goal.description}
						</p>
					)}
					{expanded && goal.target_metric && (
						<p className="text-xs text-muted-foreground ml-6">
							Target: {goal.target_metric}
						</p>
					)}

					{/* Progress bar */}
					<div className="space-y-1">
						<div className="flex items-center justify-between text-xs text-muted-foreground">
							<span>Progress</span>
							<span className={statusColor(goal.status)}>
								{goal.current_progress}%
							</span>
						</div>
						<ProgressBar value={goal.current_progress} />
					</div>

					{/* Inline edit */}
					{editing && (
						<div className="space-y-3 pt-2 border-t">
							<div className="grid grid-cols-2 gap-3">
								<div className="space-y-1">
									<label className="text-xs font-medium text-muted-foreground">
										Progress (%)
									</label>
									<input
										type="number"
										min={0}
										max={100}
										value={progress}
										onChange={(e) => setProgress(e.target.value)}
										className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm
											focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									/>
								</div>
								<div className="space-y-1">
									<label className="text-xs font-medium text-muted-foreground">
										Status
									</label>
									<select
										value={status}
										onChange={(e) =>
											setStatus(e.target.value as GoalStatus)
										}
										className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm
											focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									>
										{STATUS_OPTIONS.map((s) => (
											<option key={s} value={s}>
												{s}
											</option>
										))}
									</select>
								</div>
							</div>
							<div className="flex justify-end gap-2">
								<Button
									variant="outline"
									size="sm"
									onClick={handleCancel}
									disabled={saving}
								>
									<X className="h-3.5 w-3.5 mr-1" />
									Cancel
								</Button>
								<Button size="sm" onClick={handleSave} disabled={saving}>
									{saving ? (
										<Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
									) : (
										<Check className="h-3.5 w-3.5 mr-1" />
									)}
									Save
								</Button>
							</div>
						</div>
					)}
				</div>
			</CardContent>
		</Card>
	)
}

interface NewGoalFormProps {
	cycleId?: string
	onCreate: (data: Partial<Goal>) => Promise<void>
	onCancel: () => void
}

function NewGoalForm({ cycleId, onCreate, onCancel }: NewGoalFormProps) {
	const [title, setTitle] = useState('')
	const [description, setDescription] = useState('')
	const [targetMetric, setTargetMetric] = useState('')
	const [weight, setWeight] = useState('1')
	const [saving, setSaving] = useState(false)

	const handleCreate = async () => {
		if (!title.trim()) return
		setSaving(true)
		try {
			await onCreate({
				title: title.trim(),
				description: description.trim() || null,
				target_metric: targetMetric.trim() || null,
				weight: parseFloat(weight) || 1,
				cycle_id: cycleId ?? null,
				status: 'Not Started',
				current_progress: 0,
			})
		} finally {
			setSaving(false)
		}
	}

	return (
		<Card className="border-dashed">
			<CardContent className="p-4 space-y-3">
				<p className="text-sm font-semibold">New Goal</p>
				<div className="space-y-1">
					<label className="text-xs font-medium text-muted-foreground">
						Title <span className="text-red-500">*</span>
					</label>
					<input
						type="text"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						placeholder="e.g. Complete Q2 product roadmap"
						className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm
							placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				</div>
				<div className="space-y-1">
					<label className="text-xs font-medium text-muted-foreground">
						Description
					</label>
					<textarea
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						rows={2}
						placeholder="Describe the goal..."
						className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm
							placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
					/>
				</div>
				<div className="grid grid-cols-2 gap-3">
					<div className="space-y-1">
						<label className="text-xs font-medium text-muted-foreground">
							Target Metric
						</label>
						<input
							type="text"
							value={targetMetric}
							onChange={(e) => setTargetMetric(e.target.value)}
							placeholder="e.g. 100% on-time delivery"
							className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm
								placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</div>
					<div className="space-y-1">
						<label className="text-xs font-medium text-muted-foreground">
							Weight
						</label>
						<input
							type="number"
							min={0}
							step={0.5}
							value={weight}
							onChange={(e) => setWeight(e.target.value)}
							className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm
								focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</div>
				</div>
				<div className="flex justify-end gap-2 pt-1">
					<Button variant="outline" size="sm" onClick={onCancel}>
						Cancel
					</Button>
					<Button
						size="sm"
						onClick={handleCreate}
						disabled={saving || !title.trim()}
					>
						{saving ? (
							<Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
						) : (
							<Plus className="h-3.5 w-3.5 mr-1" />
						)}
						Create Goal
					</Button>
				</div>
			</CardContent>
		</Card>
	)
}

interface GoalTrackerProps {
	goals: Goal[]
	cycleId?: string
	onUpdate: (id: string, updates: Partial<Goal>) => Promise<void>
	onCreate: (data: Partial<Goal>) => Promise<void>
}

export function GoalTracker({
	goals,
	cycleId,
	onUpdate,
	onCreate,
}: GoalTrackerProps) {
	const [filterStatus, setFilterStatus] = useState<GoalStatus | 'All'>('All')
	const [showNewForm, setShowNewForm] = useState(false)

	const filtered =
		filterStatus === 'All'
			? goals
			: goals.filter((g) => g.status === filterStatus)

	const handleCreate = async (data: Partial<Goal>) => {
		await onCreate(data)
		setShowNewForm(false)
	}

	return (
		<Card>
			<CardHeader className="pb-3">
				<div className="flex items-center justify-between">
					<CardTitle className="text-base flex items-center gap-2">
						<Target className="h-4 w-4" />
						Goals Tracker
						<Badge variant="secondary" className="text-xs">
							{goals.length}
						</Badge>
					</CardTitle>
					<Button
						size="sm"
						variant="outline"
						onClick={() => setShowNewForm(true)}
						disabled={showNewForm}
					>
						<Plus className="h-3.5 w-3.5 mr-1" />
						Add Goal
					</Button>
				</div>
				{/* Status filter pills */}
				<div className="flex flex-wrap gap-1.5 pt-2">
					{(['All', ...STATUS_OPTIONS] as const).map((s) => (
						<button
							key={s}
							type="button"
							onClick={() => setFilterStatus(s)}
							className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors
								${filterStatus === s
									? 'bg-primary text-primary-foreground border-primary'
									: 'bg-background text-muted-foreground border-border hover:border-foreground'
								}`}
						>
							{s}
						</button>
					))}
				</div>
			</CardHeader>
			<CardContent className="space-y-3">
				{showNewForm && (
					<NewGoalForm
						cycleId={cycleId}
						onCreate={handleCreate}
						onCancel={() => setShowNewForm(false)}
					/>
				)}
				{filtered.length === 0 && !showNewForm ? (
					<div className="text-center py-8 text-muted-foreground">
						<Target className="h-8 w-8 mx-auto mb-2 opacity-40" />
						<p className="text-sm">
							{goals.length === 0
								? 'No goals yet. Add your first goal to get started.'
								: `No goals with status "${filterStatus}".`}
						</p>
					</div>
				) : (
					filtered.map((goal) => (
						<GoalCard key={goal.id} goal={goal} onUpdate={onUpdate} />
					))
				)}
			</CardContent>
		</Card>
	)
}
