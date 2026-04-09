import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

export const GET = withAuth(async (_request: NextRequest, { companyId }, params) => {
	const id = params?.id
	if (!id) {
		return NextResponse.json({ error: 'Cycle ID required' }, { status: 400 })
	}

	const { data: cycle, error } = await supabaseAdmin
		.from('ess_appraisal_cycles')
		.select(`
			*,
			ess_appraisal_templates (
				name
			)
		`)
		.eq('id', id)
		.eq('company_id', companyId)
		.single()

	if (error || !cycle) {
		return NextResponse.json({ error: 'Cycle not found' }, { status: 404 })
	}

	// Get completion counts
	const { data: appraisals } = await supabaseAdmin
		.from('ess_appraisals')
		.select('status')
		.eq('cycle_id', id)

	const total = (appraisals || []).length
	const completed = (appraisals || []).filter((a) => a.status === 'Completed').length

	const tmpl = cycle.ess_appraisal_templates as any
	return NextResponse.json({
		cycle: {
			...cycle,
			template_name: tmpl?.name ?? null,
			total_appraisals: total,
			completed_count: completed,
			ess_appraisal_templates: undefined,
		},
	})
})

export const PUT = withAuth(async (request: NextRequest, { companyId }, params) => {
	const id = params?.id
	if (!id) {
		return NextResponse.json({ error: 'Cycle ID required' }, { status: 400 })
	}

	const body = await request.json()
	const { id: _id, company_id: _cid, created_at: _ca, ...updates } = body

	const { data: cycle, error } = await supabaseAdmin
		.from('ess_appraisal_cycles')
		.update(updates)
		.eq('id', id)
		.eq('company_id', companyId)
		.select()
		.single()

	if (error || !cycle) {
		console.error('Appraisal cycle update error:', error)
		return NextResponse.json({ error: 'Failed to update cycle' }, { status: 500 })
	}

	return NextResponse.json({ cycle })
}, { minRole: 'hr' })

// POST: activate cycle — set status to 'Active', then create appraisals for ALL active employees
export const POST = withAuth(async (_request: NextRequest, { companyId }, params) => {
	const id = params?.id
	if (!id) {
		return NextResponse.json({ error: 'Cycle ID required' }, { status: 400 })
	}

	// Verify cycle belongs to company and is in Draft state
	const { data: cycle, error: cycleError } = await supabaseAdmin
		.from('ess_appraisal_cycles')
		.select('id, status')
		.eq('id', id)
		.eq('company_id', companyId)
		.single()

	if (cycleError || !cycle) {
		return NextResponse.json({ error: 'Cycle not found' }, { status: 404 })
	}

	if (cycle.status === 'Closed') {
		return NextResponse.json({ error: 'Cannot activate a closed cycle' }, { status: 400 })
	}

	// Set cycle status to Active
	const { error: activateError } = await supabaseAdmin
		.from('ess_appraisal_cycles')
		.update({ status: 'Active' })
		.eq('id', id)

	if (activateError) {
		console.error('Cycle activate error:', activateError)
		return NextResponse.json({ error: 'Failed to activate cycle' }, { status: 500 })
	}

	// Fetch all active employees for the company that have a reports_to
	const { data: employees, error: empError } = await supabaseAdmin
		.from('ess_employees')
		.select('id, reports_to')
		.eq('company_id', companyId)
		.eq('status', 'Active')
		.not('reports_to', 'is', null)

	if (empError) {
		console.error('Employees fetch error:', empError)
		return NextResponse.json({ error: 'Failed to fetch employees' }, { status: 500 })
	}

	const activeEmployees = employees || []

	if (activeEmployees.length === 0) {
		return NextResponse.json({
			message: 'Cycle activated. No eligible employees found (employees must have a manager assigned).',
			created_count: 0,
		})
	}

	// Check for existing appraisals to avoid duplicates
	const { data: existingAppraisals } = await supabaseAdmin
		.from('ess_appraisals')
		.select('employee_id')
		.eq('cycle_id', id)

	const existingEmployeeIds = new Set((existingAppraisals || []).map((a) => a.employee_id))

	const appraisalsToInsert = activeEmployees
		.filter((emp) => !existingEmployeeIds.has(emp.id))
		.map((emp) => ({
			cycle_id: id,
			employee_id: emp.id,
			manager_id: emp.reports_to as string,
			status: 'Pending Self',
		}))

	let created_count = 0
	if (appraisalsToInsert.length > 0) {
		const { data: newAppraisals, error: insertError } = await supabaseAdmin
			.from('ess_appraisals')
			.insert(appraisalsToInsert)
			.select()

		if (insertError) {
			console.error('Appraisals insert error:', insertError)
			return NextResponse.json({ error: 'Failed to create appraisals' }, { status: 500 })
		}
		created_count = (newAppraisals || []).length
	}

	return NextResponse.json({
		message: 'Cycle activated successfully',
		created_count,
		skipped_count: activeEmployees.length - appraisalsToInsert.length,
	})
}, { minRole: 'hr' })
