import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'
import { hasMinRole } from '@/types/roles'

export const GET = withAuth(async (request: NextRequest, { employee, companyId, role }) => {
	if (!employee) {
		return NextResponse.json({ goals: [] })
	}

	const { searchParams } = new URL(request.url)
	const cycle_id = searchParams.get('cycle_id')
	const employee_id = searchParams.get('employee_id')

	// IDOR fix: the list previously honored an `employee_id` query param with no
	// tenant/permission check, returning any employee's goals. Now: default to the
	// caller's own goals; allow viewing another employee's goals only when that
	// employee is in the SAME company AND the caller is manager+.
	let targetEmployeeId = employee.id
	if (employee_id && employee_id !== employee.id) {
		if (!hasMinRole(role, 'manager')) {
			return NextResponse.json({ error: 'Not found' }, { status: 404 })
		}
		const { data: target } = await supabaseAdmin
			.from('ess_employees')
			.select('id')
			.eq('id', employee_id)
			.eq('company_id', companyId)
			.single()
		if (!target) {
			return NextResponse.json({ error: 'Not found' }, { status: 404 })
		}
		targetEmployeeId = target.id
	}

	let query = supabaseAdmin
		.from('ess_goals')
		.select('*')
		.eq('employee_id', targetEmployeeId)
		.order('created_at', { ascending: false })

	if (cycle_id) {
		query = query.eq('cycle_id', cycle_id)
	}

	const { data: goals, error } = await query

	if (error) {
		console.error('Goals fetch error:', error)
		return NextResponse.json({ error: 'Failed to fetch goals' }, { status: 500 })
	}

	return NextResponse.json({ goals: goals || [] })
})

export const POST = withAuth(async (request: NextRequest, { employee }) => {
	if (!employee) {
		return NextResponse.json({ error: 'Employee record required' }, { status: 403 })
	}

	const body = await request.json()
	const {
		title,
		description = null,
		target_metric = null,
		cycle_id = null,
		current_progress = 0,
		status = 'Not Started',
		weight = 1,
	} = body

	if (!title) {
		return NextResponse.json({ error: 'title is required' }, { status: 400 })
	}

	const { data: goal, error } = await supabaseAdmin
		.from('ess_goals')
		.insert({
			employee_id: employee.id,
			cycle_id,
			title,
			description,
			target_metric,
			current_progress,
			status,
			weight,
		})
		.select()
		.single()

	if (error) {
		console.error('Goal create error:', error)
		return NextResponse.json({ error: 'Failed to create goal' }, { status: 500 })
	}

	return NextResponse.json({ goal }, { status: 201 })
})
