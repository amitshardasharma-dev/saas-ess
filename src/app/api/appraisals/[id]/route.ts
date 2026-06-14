import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

export const GET = withAuth(async (_request: NextRequest, { companyId, employee }, params) => {
	const id = params?.id
	if (!id) {
		return NextResponse.json({ error: 'Appraisal ID required' }, { status: 400 })
	}

	// Get appraisal with employee and manager names
	const { data: appraisal, error } = await supabaseAdmin
		.from('ess_appraisals')
		.select(`
			*,
			emp:ess_employees!ess_appraisals_employee_id_fkey (
				full_name,
				employee_no
			),
			mgr:ess_employees!ess_appraisals_manager_id_fkey (
				full_name,
				employee_no
			),
			ess_appraisal_cycles (
				id,
				name,
				company_id,
				template_id,
				start_date,
				end_date,
				self_assessment_deadline,
				manager_review_deadline,
				status,
				ess_appraisal_templates (
					id,
					name,
					description,
					sections,
					is_default
				)
			)
		`)
		.eq('id', id)
		.single()

	if (error || !appraisal) {
		return NextResponse.json({ error: 'Appraisal not found' }, { status: 404 })
	}

	// Verify appraisal belongs to this company via cycle
	const cycle = appraisal.ess_appraisal_cycles as {
		company_id?: string
		name?: string
		ess_appraisal_templates?: unknown
	} | null
	if (cycle?.company_id !== companyId) {
		return NextResponse.json({ error: 'Appraisal not found' }, { status: 404 })
	}

	// Verify user can access this appraisal (must be employee or manager)
	if (employee && appraisal.employee_id !== employee.id && appraisal.manager_id !== employee.id) {
		return NextResponse.json({ error: 'Access denied' }, { status: 403 })
	}

	// Get responses
	const { data: responses } = await supabaseAdmin
		.from('ess_appraisal_responses')
		.select('*')
		.eq('appraisal_id', id)

	const emp = appraisal.emp as { full_name?: string; employee_no?: string } | null
	const mgr = appraisal.mgr as { full_name?: string; employee_no?: string } | null
	const template = cycle?.ess_appraisal_templates ?? null

	return NextResponse.json({
		appraisal: {
			...appraisal,
			employee_name: emp?.full_name ?? null,
			employee_no: emp?.employee_no ?? null,
			manager_name: mgr?.full_name ?? null,
			manager_no: mgr?.employee_no ?? null,
			cycle_name: cycle?.name ?? null,
			template,
			responses: responses || [],
			emp: undefined,
			mgr: undefined,
			ess_appraisal_cycles: undefined,
		},
	})
})

// PUT: submit response (self or manager)
export const PUT = withAuth(async (request: NextRequest, { companyId, employee }, params) => {
	const id = params?.id
	if (!id) {
		return NextResponse.json({ error: 'Appraisal ID required' }, { status: 400 })
	}

	if (!employee) {
		return NextResponse.json({ error: 'Employee record required' }, { status: 403 })
	}

	const body = await request.json()
	const { section_id, respondent_type, ratings, comments } = body

	if (!section_id || !respondent_type) {
		return NextResponse.json({ error: 'section_id and respondent_type are required' }, { status: 400 })
	}
	if (!['self', 'manager'].includes(respondent_type)) {
		return NextResponse.json({ error: 'respondent_type must be self or manager' }, { status: 400 })
	}

	// Fetch the appraisal
	const { data: appraisal, error: fetchError } = await supabaseAdmin
		.from('ess_appraisals')
		.select('id, cycle_id, employee_id, manager_id, status, ess_appraisal_cycles(company_id)')
		.eq('id', id)
		.single()

	if (fetchError || !appraisal) {
		return NextResponse.json({ error: 'Appraisal not found' }, { status: 404 })
	}

	const cycle = appraisal.ess_appraisal_cycles as { company_id?: string } | null
	if (cycle?.company_id !== companyId) {
		return NextResponse.json({ error: 'Appraisal not found' }, { status: 404 })
	}

	// Verify the right person is submitting
	if (respondent_type === 'self' && appraisal.employee_id !== employee.id) {
		return NextResponse.json({ error: 'Only the employee can submit a self-assessment' }, { status: 403 })
	}
	if (respondent_type === 'manager' && appraisal.manager_id !== employee.id) {
		return NextResponse.json({ error: 'Only the manager can submit a manager review' }, { status: 403 })
	}

	// Upsert the response
	const { error: upsertError } = await supabaseAdmin
		.from('ess_appraisal_responses')
		.upsert(
			{
				appraisal_id: id,
				section_id,
				respondent_type,
				ratings: ratings || {},
				comments: comments || null,
			},
			{ onConflict: 'appraisal_id,section_id,respondent_type' }
		)

	if (upsertError) {
		console.error('Appraisal response upsert error:', upsertError)
		return NextResponse.json({ error: 'Failed to save response' }, { status: 500 })
	}

	// Advance appraisal status if appropriate
	let newStatus: string | null = null
	if (respondent_type === 'self' && appraisal.status === 'Pending Self') {
		newStatus = 'Pending Manager'
	} else if (respondent_type === 'manager' && appraisal.status === 'Pending Manager') {
		newStatus = 'Pending Review Meeting'
	}

	if (newStatus) {
		await supabaseAdmin
			.from('ess_appraisals')
			.update({ status: newStatus, updated_at: new Date().toISOString() })
			.eq('id', id)
	}

	return NextResponse.json({
		message: 'Response saved successfully',
		status: newStatus || appraisal.status,
	})
})

// POST: finalize appraisal (manager only)
export const POST = withAuth(async (request: NextRequest, { companyId, employee }, params) => {
	const id = params?.id
	if (!id) {
		return NextResponse.json({ error: 'Appraisal ID required' }, { status: 400 })
	}

	if (!employee) {
		return NextResponse.json({ error: 'Employee record required' }, { status: 403 })
	}

	const body = await request.json()
	const { overall_rating, final_comments } = body

	// Fetch the appraisal
	const { data: appraisal, error: fetchError } = await supabaseAdmin
		.from('ess_appraisals')
		.select('id, manager_id, status, ess_appraisal_cycles(company_id)')
		.eq('id', id)
		.single()

	if (fetchError || !appraisal) {
		return NextResponse.json({ error: 'Appraisal not found' }, { status: 404 })
	}

	const cycle = appraisal.ess_appraisal_cycles as { company_id?: string } | null
	if (cycle?.company_id !== companyId) {
		return NextResponse.json({ error: 'Appraisal not found' }, { status: 404 })
	}

	// Only the manager can finalize
	if (appraisal.manager_id !== employee.id) {
		return NextResponse.json({ error: 'Only the manager can finalize an appraisal' }, { status: 403 })
	}

	const { data: updated, error: updateError } = await supabaseAdmin
		.from('ess_appraisals')
		.update({
			status: 'Completed',
			overall_rating: overall_rating ?? null,
			final_comments: final_comments ?? null,
			updated_at: new Date().toISOString(),
		})
		.eq('id', id)
		.select()
		.single()

	if (updateError) {
		console.error('Appraisal finalize error:', updateError)
		return NextResponse.json({ error: 'Failed to finalize appraisal' }, { status: 500 })
	}

	return NextResponse.json({ message: 'Appraisal finalized', appraisal: updated })
})
