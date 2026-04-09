import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

export const GET = withAuth(async (_request: NextRequest, { companyId }, params) => {
	const id = params?.id
	if (!id) {
		return NextResponse.json({ error: 'Contract ID required' }, { status: 400 })
	}

	// Verify contract belongs to this company
	const { data: contract, error: contractError } = await supabaseAdmin
		.from('ess_contracts')
		.select('id')
		.eq('id', id)
		.eq('company_id', companyId)
		.single()

	if (contractError || !contract) {
		return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
	}

	const { data: history, error } = await supabaseAdmin
		.from('ess_contract_history')
		.select(`
			*,
			ess_employees!ess_contract_history_performed_by_fkey (
				full_name
			)
		`)
		.eq('contract_id', id)
		.order('action_date', { ascending: false })

	if (error) {
		console.error('Contract history fetch error:', error)
		return NextResponse.json({ error: 'Failed to fetch contract history' }, { status: 500 })
	}

	const processed = (history || []).map((h) => {
		const performer = h.ess_employees as any
		return {
			...h,
			performer_name: performer?.full_name ?? null,
			ess_employees: undefined,
		}
	})

	return NextResponse.json({ history: processed })
})

export const POST = withAuth(async (request: NextRequest, { companyId, employee }, params) => {
	const id = params?.id
	if (!id) {
		return NextResponse.json({ error: 'Contract ID required' }, { status: 400 })
	}

	if (!employee) {
		return NextResponse.json({ error: 'Employee record required' }, { status: 403 })
	}

	// Verify contract belongs to this company
	const { data: contract, error: contractError } = await supabaseAdmin
		.from('ess_contracts')
		.select('id')
		.eq('id', id)
		.eq('company_id', companyId)
		.single()

	if (contractError || !contract) {
		return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
	}

	const body = await request.json()
	const { action, notes = null, action_date } = body

	const validActions = ['created', 'renewed', 'terminated', 'amended']
	if (!action || !validActions.includes(action)) {
		return NextResponse.json(
			{ error: `action must be one of: ${validActions.join(', ')}` },
			{ status: 400 }
		)
	}

	const { data: entry, error } = await supabaseAdmin
		.from('ess_contract_history')
		.insert({
			contract_id: id,
			action,
			action_date: action_date || new Date().toISOString(),
			performed_by: employee.id,
			notes,
		})
		.select()
		.single()

	if (error) {
		console.error('Contract history create error:', error)
		return NextResponse.json({ error: 'Failed to add history entry' }, { status: 500 })
	}

	return NextResponse.json({ entry }, { status: 201 })
}, { minRole: 'hr' })
