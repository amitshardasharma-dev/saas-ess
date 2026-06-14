'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Send, Star, AlignLeft, Target, Award } from 'lucide-react'
import type { AppraisalSection, AppraisalResponse } from '@/types/appraisal'

interface AppraisalFormProps {
	sections: AppraisalSection[]
	responses: AppraisalResponse[]
	respondentType: 'self' | 'manager'
	disabled?: boolean
	onSubmit: (
		sectionId: string,
		ratings: Record<string, number>,
		comments: string | null
	) => Promise<void>
}

function getSectionIcon(type: AppraisalSection['type']) {
	switch (type) {
		case 'rating_scale':
			return <Star className="h-4 w-4" />
		case 'text':
			return <AlignLeft className="h-4 w-4" />
		case 'goals':
			return <Target className="h-4 w-4" />
		case 'competency':
			return <Award className="h-4 w-4" />
	}
}

function getSectionTypeLabel(type: AppraisalSection['type']): string {
	switch (type) {
		case 'rating_scale':
			return 'Rating Scale'
		case 'text':
			return 'Written Response'
		case 'goals':
			return 'Goals'
		case 'competency':
			return 'Competency Rating'
	}
}

interface SectionCardProps {
	section: AppraisalSection
	existing: AppraisalResponse | undefined
	respondentType: 'self' | 'manager'
	disabled: boolean
	onSubmit: (
		sectionId: string,
		ratings: Record<string, number>,
		comments: string | null
	) => Promise<void>
}

function SectionCard({
	section,
	existing,
	respondentType,
	disabled,
	onSubmit,
}: SectionCardProps) {
	const defaultLabels =
		section.rating_labels && section.rating_labels.length > 0
			? section.rating_labels
			: ['1', '2', '3', '4', '5']

	const [ratings, setRatings] = useState<Record<string, number>>(
		existing?.ratings ?? {}
	)
	const [comments, setComments] = useState<string>(
		existing?.comments ?? ''
	)
	const [submitting, setSubmitting] = useState(false)
	const [submitted, setSubmitted] = useState(!!existing)

	const handleRatingChange = (key: string, value: number) => {
		if (disabled || submitted) return
		setRatings((prev) => ({ ...prev, [key]: value }))
	}

	const handleSubmit = async () => {
		setSubmitting(true)
		try {
			await onSubmit(section.id, ratings, comments || null)
			setSubmitted(true)
		} finally {
			setSubmitting(false)
		}
	}

	const isReadOnly = disabled || submitted

	return (
		<Card className={submitted ? 'border-green-200 dark:border-green-800' : ''}>
			<CardHeader className="pb-3">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<span className="text-muted-foreground">
							{getSectionIcon(section.type)}
						</span>
						<CardTitle className="text-base">{section.name}</CardTitle>
					</div>
					<div className="flex items-center gap-2">
						<Badge variant="outline" className="text-xs">
							{getSectionTypeLabel(section.type)}
						</Badge>
						{section.weight > 0 && (
							<Badge variant="secondary" className="text-xs">
								Weight: {section.weight}
							</Badge>
						)}
						{submitted && (
							<Badge className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-200">
								Submitted
							</Badge>
						)}
					</div>
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
				{/* rating_scale: radio buttons for each label */}
				{section.type === 'rating_scale' && (
					<div className="space-y-2">
						<p className="text-sm text-muted-foreground">
							Select a rating:
						</p>
						<div className="flex flex-wrap gap-2">
							{defaultLabels.map((label, idx) => {
								const value = idx + 1
								const selected = ratings['rating'] === value
								return (
									<button
										key={idx}
										type="button"
										disabled={isReadOnly}
										onClick={() => handleRatingChange('rating', value)}
										className={`px-4 py-2 rounded-md border text-sm font-medium transition-colors
											${isReadOnly ? 'cursor-default opacity-75' : 'cursor-pointer hover:border-primary'}
											${selected
												? 'bg-primary text-primary-foreground border-primary'
												: 'bg-background text-foreground border-border'
											}`}
									>
										{label}
									</button>
								)
							})}
						</div>
					</div>
				)}

				{/* text: textarea */}
				{section.type === 'text' && (
					<div className="space-y-2">
						<p className="text-sm text-muted-foreground">
							{respondentType === 'self'
								? 'Provide your self-assessment:'
								: 'Provide your assessment:'}
						</p>
						<textarea
							disabled={isReadOnly}
							value={comments}
							onChange={(e) => setComments(e.target.value)}
							rows={5}
							placeholder="Write your response here..."
							className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm
								placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2
								focus-visible:ring-ring disabled:cursor-default disabled:opacity-75 resize-none"
						/>
					</div>
				)}

				{/* goals: read-only reference list */}
				{section.type === 'goals' && (
					<div className="space-y-2">
						<p className="text-sm text-muted-foreground">
							Goals are tracked separately in the Goal Tracker section.
						</p>
						<div className="rounded-md bg-muted/40 p-3">
							<p className="text-sm text-muted-foreground italic">
								Reference your goals progress below when writing your comments.
							</p>
						</div>
						<textarea
							disabled={isReadOnly}
							value={comments}
							onChange={(e) => setComments(e.target.value)}
							rows={4}
							placeholder="Comment on your goals progress..."
							className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm
								placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2
								focus-visible:ring-ring disabled:cursor-default disabled:opacity-75 resize-none"
						/>
					</div>
				)}

				{/* competency: rating per field */}
				{section.type === 'competency' && (
					<div className="space-y-4">
						{section.fields && section.fields.length > 0 ? (
							section.fields.map((field) => (
								<div key={field.name} className="space-y-2">
									<p className="text-sm font-medium">{field.name}</p>
									<div className="flex flex-wrap gap-2">
										{defaultLabels.map((label, idx) => {
											const value = idx + 1
											const selected = ratings[field.name] === value
											return (
												<button
													key={idx}
													type="button"
													disabled={isReadOnly}
													onClick={() =>
														handleRatingChange(field.name, value)
													}
													className={`px-3 py-1.5 rounded-md border text-sm font-medium transition-colors
														${isReadOnly ? 'cursor-default opacity-75' : 'cursor-pointer hover:border-primary'}
														${selected
															? 'bg-primary text-primary-foreground border-primary'
															: 'bg-background text-foreground border-border'
														}`}
												>
													{label}
												</button>
											)
										})}
									</div>
								</div>
							))
						) : (
							<p className="text-sm text-muted-foreground">
								No competency fields defined for this section.
							</p>
						)}
					</div>
				)}

				{/* Shared comments (for rating_scale and competency) */}
				{(section.type === 'rating_scale' ||
					section.type === 'competency') && (
					<div className="space-y-2">
						<p className="text-sm text-muted-foreground">
							Additional comments (optional):
						</p>
						<textarea
							disabled={isReadOnly}
							value={comments}
							onChange={(e) => setComments(e.target.value)}
							rows={3}
							placeholder="Add any comments..."
							className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm
								placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2
								focus-visible:ring-ring disabled:cursor-default disabled:opacity-75 resize-none"
						/>
					</div>
				)}

				{/* Submit button */}
				{!disabled && !submitted && (
					<div className="flex justify-end pt-2">
						<Button
							onClick={handleSubmit}
							disabled={submitting}
							size="sm"
						>
							{submitting ? (
								<>
									<Loader2 className="h-4 w-4 mr-2 animate-spin" />
									Saving…
								</>
							) : (
								<>
									<Send className="h-4 w-4 mr-2" />
									Submit Section
								</>
							)}
						</Button>
					</div>
				)}
			</CardContent>
		</Card>
	)
}

export function AppraisalForm({
	sections,
	responses,
	respondentType,
	disabled = false,
	onSubmit,
}: AppraisalFormProps) {
	if (!sections || sections.length === 0) {
		return (
			<div className="text-center py-8 text-muted-foreground">
				<p>No sections defined in this appraisal template.</p>
			</div>
		)
	}

	return (
		<div className="space-y-4">
			{sections.map((section) => {
				const existing = responses.find(
					(r) =>
						r.section_id === section.id &&
						r.respondent_type === respondentType
				)
				return (
					<SectionCard
						key={section.id}
						section={section}
						existing={existing}
						respondentType={respondentType}
						disabled={disabled}
						onSubmit={onSubmit}
					/>
				)
			})}
		</div>
	)
}
