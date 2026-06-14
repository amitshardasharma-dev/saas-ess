import type {
	AppraisalTemplate,
	AppraisalCycle,
	Appraisal,
	AppraisalResponse,
	Goal,
} from '@/types/appraisal'

function getToken(): string | null {
	if (typeof window === 'undefined') return null
	return localStorage.getItem('ess_access_token')
}

function authHeaders(): Record<string, string> {
	const token = getToken()
	return token ? { Authorization: `Bearer ${token}` } : {}
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
	const response = await fetch(path, {
		...options,
		headers: {
			...authHeaders(),
			...(options?.body ? { 'Content-Type': 'application/json' } : {}),
			...(options?.headers ?? {}),
		},
	})
	if (!response.ok) {
		const errorData = await response.json().catch(() => ({}))
		throw new Error(
			(errorData as { error?: string; message?: string }).error ||
				(errorData as { error?: string; message?: string }).message ||
				`Request failed: ${response.status}`
		)
	}
	return response.json() as Promise<T>
}

// ─── Templates ────────────────────────────────────────────────────────────────

export async function getTemplates(): Promise<AppraisalTemplate[]> {
	const data = await apiFetch<{ templates: AppraisalTemplate[] }>(
		'/api/appraisal-templates'
	)
	return data.templates || []
}

export async function getTemplate(id: string): Promise<AppraisalTemplate> {
	const data = await apiFetch<{ template: AppraisalTemplate }>(
		`/api/appraisal-templates/${id}`
	)
	return data.template
}

export async function createTemplate(
	body: Partial<AppraisalTemplate>
): Promise<AppraisalTemplate> {
	const data = await apiFetch<{ template: AppraisalTemplate }>(
		'/api/appraisal-templates',
		{ method: 'POST', body: JSON.stringify(body) }
	)
	return data.template
}

export async function updateTemplate(
	id: string,
	body: Partial<AppraisalTemplate>
): Promise<AppraisalTemplate> {
	const data = await apiFetch<{ template: AppraisalTemplate }>(
		`/api/appraisal-templates/${id}`,
		{ method: 'PUT', body: JSON.stringify(body) }
	)
	return data.template
}

export async function deleteTemplate(id: string): Promise<void> {
	await apiFetch<unknown>(`/api/appraisal-templates/${id}`, {
		method: 'DELETE',
	})
}

// ─── Cycles ───────────────────────────────────────────────────────────────────

export async function getCycles(): Promise<AppraisalCycle[]> {
	const data = await apiFetch<{ cycles: AppraisalCycle[] }>(
		'/api/appraisal-cycles'
	)
	return data.cycles || []
}

export async function getCycle(id: string): Promise<AppraisalCycle> {
	const data = await apiFetch<{ cycle: AppraisalCycle }>(
		`/api/appraisal-cycles/${id}`
	)
	return data.cycle
}

export async function createCycle(
	body: Partial<AppraisalCycle>
): Promise<AppraisalCycle> {
	const data = await apiFetch<{ cycle: AppraisalCycle }>(
		'/api/appraisal-cycles',
		{ method: 'POST', body: JSON.stringify(body) }
	)
	return data.cycle
}

export async function updateCycle(
	id: string,
	body: Partial<AppraisalCycle>
): Promise<AppraisalCycle> {
	const data = await apiFetch<{ cycle: AppraisalCycle }>(
		`/api/appraisal-cycles/${id}`,
		{ method: 'PUT', body: JSON.stringify(body) }
	)
	return data.cycle
}

export async function activateCycle(
	id: string
): Promise<{ message: string; created_count: number; skipped_count: number }> {
	return apiFetch(`/api/appraisal-cycles/${id}`, { method: 'POST' })
}

// ─── Appraisals ───────────────────────────────────────────────────────────────

export async function getAppraisals(
	scope: 'my' | 'team'
): Promise<Appraisal[]> {
	const data = await apiFetch<{ appraisals: Appraisal[] }>(
		`/api/appraisals?scope=${scope}`
	)
	return data.appraisals || []
}

export async function getAppraisal(
	id: string
): Promise<Appraisal & { responses: AppraisalResponse[] }> {
	const data = await apiFetch<{
		appraisal: Appraisal & { responses: AppraisalResponse[] }
	}>(`/api/appraisals/${id}`)
	return data.appraisal
}

export async function submitResponse(
	id: string,
	body: {
		section_id: string
		respondent_type: 'self' | 'manager'
		ratings: Record<string, number>
		comments?: string | null
	}
): Promise<{ message: string; status: string }> {
	return apiFetch(`/api/appraisals/${id}`, {
		method: 'PUT',
		body: JSON.stringify(body),
	})
}

export async function finalizeAppraisal(
	id: string,
	body: { overall_rating?: number; final_comments?: string }
): Promise<{ message: string; appraisal: Appraisal }> {
	return apiFetch(`/api/appraisals/${id}`, {
		method: 'POST',
		body: JSON.stringify(body),
	})
}

// ─── Goals ────────────────────────────────────────────────────────────────────

export async function getGoals(cycleId?: string): Promise<Goal[]> {
	const url = cycleId
		? `/api/goals?cycle_id=${encodeURIComponent(cycleId)}`
		: '/api/goals'
	const data = await apiFetch<{ goals: Goal[] }>(url)
	return data.goals || []
}

export async function createGoal(body: Partial<Goal>): Promise<Goal> {
	const data = await apiFetch<{ goal: Goal }>('/api/goals', {
		method: 'POST',
		body: JSON.stringify(body),
	})
	return data.goal
}

export async function updateGoal(
	id: string,
	body: Partial<Goal>
): Promise<Goal> {
	const data = await apiFetch<{ goal: Goal }>(`/api/goals/${id}`, {
		method: 'PUT',
		body: JSON.stringify(body),
	})
	return data.goal
}
