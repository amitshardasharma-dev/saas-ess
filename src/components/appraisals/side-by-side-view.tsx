'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { User, UserCheck, AlertCircle } from 'lucide-react'
import type { AppraisalSection, AppraisalResponse } from '@/types/appraisal'

interface SideBySideViewProps {
	sections: AppraisalSection[]
	responses: AppraisalResponse[]
}

function ratingLabel(
	section: AppraisalSection,
	key: string,
	value: number
): string {
	if (section.rating_labels && section.rating_labels.length > 0) {
		const idx = value - 1
		return section.rating_labels[idx] ?? String(value)
	}
	return String(value)
}

function RatingBadge({
	value,
	label,
	highlight,
}: {
	value: number | null | undefined
	label: string
	highlight?: boolean
}) {
	if (value == null) {
		return <span className="text-muted-foreground text-sm italic">—</span>
	}
	return (
		<Badge
			variant={highlight ? 'destructive' : 'secondary'}
			className="text-sm font-semibold"
		>
			{label}
		</Badge>
	)
}

interface SectionComparisonProps {
	section: AppraisalSection
	selfResponse: AppraisalResponse | undefined
	managerResponse: AppraisalResponse | undefined
}

function SectionComparison({
	section,
	selfResponse,
	managerResponse,
}: SectionComparisonProps) {
	// Determine keys to compare
	const allKeys: string[] = []
	if (section.type === 'rating_scale') {
		allKeys.push('rating')
	} else if (section.type === 'competency' && section.fields) {
		for (const f of section.fields) {
			allKeys.push(f.name)
		}
	}

	return (
		<Card>
			<CardHeader className="pb-3">
				<CardTitle className="text-base">{section.name}</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="grid grid-cols-2 gap-6">
					{/* Self column */}
					<div className="space-y-3">
						<div className="flex items-center gap-2 mb-3">
							<User className="h-4 w-4 text-blue-500" />
							<span className="text-sm font-semibold text-blue-700 dark:text-blue-400">
								Self Assessment
							</span>
						</div>
						{!selfResponse ? (
							<p className="text-sm text-muted-foreground italic">
								Not submitted yet
							</p>
						) : (
							<>
								{allKeys.map((key) => {
									const selfVal = selfResponse.ratings[key]
									const mgrVal = managerResponse?.ratings[key]
									const differ =
										selfVal != null &&
										mgrVal != null &&
										selfVal !== mgrVal
									return (
										<div key={key} className="space-y-1">
											{allKeys.length > 1 && (
												<p className="text-xs text-muted-foreground font-medium">
													{key}
												</p>
											)}
											<RatingBadge
												value={selfVal}
												label={ratingLabel(section, key, selfVal)}
												highlight={differ}
											/>
										</div>
									)
								})}
								{selfResponse.comments && (
									<div className="mt-3 p-3 rounded-md bg-muted/40 text-sm leading-relaxed">
										{selfResponse.comments}
									</div>
								)}
								{allKeys.length === 0 && selfResponse.comments && null}
								{(section.type === 'text' || section.type === 'goals') &&
									selfResponse.comments && (
										<div className="p-3 rounded-md bg-muted/40 text-sm leading-relaxed">
											{selfResponse.comments}
										</div>
									)}
								{(section.type === 'text' || section.type === 'goals') &&
									!selfResponse.comments && (
										<p className="text-sm text-muted-foreground italic">
											No comments provided.
										</p>
									)}
							</>
						)}
					</div>

					{/* Manager column */}
					<div className="space-y-3">
						<div className="flex items-center gap-2 mb-3">
							<UserCheck className="h-4 w-4 text-purple-500" />
							<span className="text-sm font-semibold text-purple-700 dark:text-purple-400">
								Manager Review
							</span>
						</div>
						{!managerResponse ? (
							<p className="text-sm text-muted-foreground italic">
								Not submitted yet
							</p>
						) : (
							<>
								{allKeys.map((key) => {
									const selfVal = selfResponse?.ratings[key]
									const mgrVal = managerResponse.ratings[key]
									const differ =
										selfVal != null &&
										mgrVal != null &&
										selfVal !== mgrVal
									return (
										<div key={key} className="space-y-1">
											{allKeys.length > 1 && (
												<p className="text-xs text-muted-foreground font-medium">
													{key}
												</p>
											)}
											<div className="flex items-center gap-2">
												<RatingBadge
													value={mgrVal}
													label={ratingLabel(section, key, mgrVal)}
													highlight={differ}
												/>
												{differ && (
													<span
														title="Rating differs from self assessment"
														className="text-amber-500"
													>
														<AlertCircle className="h-3.5 w-3.5" />
													</span>
												)}
											</div>
										</div>
									)
								})}
								{managerResponse.comments && (
									<div className="mt-3 p-3 rounded-md bg-muted/40 text-sm leading-relaxed">
										{managerResponse.comments}
									</div>
								)}
								{(section.type === 'text' || section.type === 'goals') &&
									managerResponse.comments && (
										<div className="p-3 rounded-md bg-muted/40 text-sm leading-relaxed">
											{managerResponse.comments}
										</div>
									)}
								{(section.type === 'text' || section.type === 'goals') &&
									!managerResponse.comments && (
										<p className="text-sm text-muted-foreground italic">
											No comments provided.
										</p>
									)}
							</>
						)}
					</div>
				</div>
			</CardContent>
		</Card>
	)
}

export function SideBySideView({ sections, responses }: SideBySideViewProps) {
	if (!sections || sections.length === 0) {
		return (
			<div className="text-center py-8 text-muted-foreground">
				<p>No sections to display.</p>
			</div>
		)
	}

	// Check if any ratings differ across sections
	const hasDifferences = sections.some((section) => {
		const self = responses.find(
			(r) => r.section_id === section.id && r.respondent_type === 'self'
		)
		const manager = responses.find(
			(r) => r.section_id === section.id && r.respondent_type === 'manager'
		)
		if (!self || !manager) return false
		return Object.keys(self.ratings).some(
			(key) =>
				self.ratings[key] != null &&
				manager.ratings[key] != null &&
				self.ratings[key] !== manager.ratings[key]
		)
	})

	return (
		<div className="space-y-4">
			{hasDifferences && (
				<div className="flex items-center gap-2 p-3 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-300">
					<AlertCircle className="h-4 w-4 shrink-0" />
					<span>
						Some ratings differ between self and manager assessments (highlighted
						in red).
					</span>
				</div>
			)}
			{sections.map((section) => {
				const self = responses.find(
					(r) =>
						r.section_id === section.id && r.respondent_type === 'self'
				)
				const manager = responses.find(
					(r) =>
						r.section_id === section.id &&
						r.respondent_type === 'manager'
				)
				return (
					<SectionComparison
						key={section.id}
						section={section}
						selfResponse={self}
						managerResponse={manager}
					/>
				)
			})}
		</div>
	)
}
