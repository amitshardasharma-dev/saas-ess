import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

export const PUT = withAuth(async (request: NextRequest, { employee }, params) => {
	const id = params?.id
	if (!id) {
		return NextResponse.json({ error: 'Goal ID required' }, { status: 400 })
	}

	if (!employee) {
		return NextResponse.json({ error: 'Employee record required' }, { status: 403 })
	}

	// Verify the goal belongs to this employee
	const { data: existing, error: fetchError } = await supabaseAdmin
		.from('ess_goals')
		.select('id, employee_id')
		.eq('id', id)
		.eq('employee_id', employee.id)
		.single()

	if (fetchError || !existing) {
		return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
	}

	const body = await request.json()
	// Strip fields that should not be updated by the user
	const { id: _id, employee_id: _eid, created_at: _ca, ...updates } = body

	const { data: goal, error } = await supabaseAdmin
		.from('ess_goals')
		.update({ ...updates, updated_at: new Date().toISOString() })
		.eq('id', id)
		.eq('employee_id', employee.id)
		.select()
		.single()

	if (error) {
		console.error('Goal update error:', error)
		return NextResponse.json({ error: 'Failed to update goal' }, { status: 500 })
	}

	return NextResponse.json({ goal })
})
