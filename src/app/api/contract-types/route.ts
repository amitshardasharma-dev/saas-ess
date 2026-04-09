import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

export const GET = withAuth(async (_request, { companyId }) => {
	const { data: contractTypes, error } = await supabaseAdmin
		.from('ess_contract_types')
		.select('*')
		.eq('company_id', companyId)
		.order('name')

	if (error) {
		console.error('Contract types fetch error:', error)
		return NextResponse.json({ error: 'Failed to fetch contract types' }, { status: 500 })
	}

	return NextResponse.json({ contract_types: contractTypes || [] })
})

export const POST = withAuth(async (request, { companyId }) => {
	const body = await request.json()
	const { name, requires_end_date = true, default_duration_months = null } = body

	if (!name) {
		return NextResponse.json({ error: 'name is required' }, { status: 400 })
	}

	const { data: contractType, error } = await supabaseAdmin
		.from('ess_contract_types')
		.insert({
			company_id: companyId,
			name,
			requires_end_date,
			default_duration_months,
		})
		.select()
		.single()

	if (error) {
		console.error('Contract type create error:', error)
		return NextResponse.json({ error: 'Failed to create contract type' }, { status: 500 })
	}

	return NextResponse.json({ contract_type: contractType }, { status: 201 })
}, { minRole: 'hr' })
