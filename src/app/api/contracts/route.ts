import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

function calcDaysUntilExpiry(endDate: string | null): number | null {
	if (!endDate) return null
	const now = new Date()
	const end = new Date(endDate)
	const diffMs = end.getTime() - now.getTime()
	return Math.ceil(diffMs / (1000 * 60 * 60 * 24))
}

export const GET = withAuth(async (request: NextRequest, { companyId, employee }) => {
	const { searchParams } = new URL(request.url)
	const scope = searchParams.get('scope') || 'my'

	let query = supabaseAdmin
		.from('ess_contracts')
		.select(`
			*,
			ess_employees!ess_contracts_employee_id_fkey (
				full_name,
				employee_no
			),
			ess_contract_types (
				name
			)
		`)
		.eq('company_id', companyId)
		.order('created_at', { ascending: false })

	if (scope === 'my') {
		if (!employee) {
			return NextResponse.json({ contracts: [] })
		}
		query = query.eq('employee_id', employee.id)
	} else if (scope === 'team') {
		if (!employee) {
			return NextResponse.json({ contracts: [] })
		}
		// Get direct reports
		const { data: directReports } = await supabaseAdmin
			.from('ess_employees')
			.select('id')
			.eq('reports_to', employee.id)
			.eq('company_id', companyId)

		const reportIds = (directReports || []).map((r) => r.id)
		if (reportIds.length === 0) {
			return NextResponse.json({ contracts: [] })
		}
		query = query.in('employee_id', reportIds)
	} else if (scope === 'all') {
		// hr+ only — companyId filter already applied
	} else {
		return NextResponse.json({ error: 'Invalid scope' }, { status: 400 })
	}

	const { data: contracts, error } = await query

	if (error) {
		console.error('Contracts fetch error:', error)
		return NextResponse.json({ error: 'Failed to fetch contracts' }, { status: 500 })
	}

	const processed = (contracts || []).map((c) => {
		const emp = c.ess_employees as { full_name?: string; employee_no?: string } | null
		const ctype = c.ess_contract_types as { name?: string } | null
		return {
			...c,
			employee_name: emp?.full_name ?? null,
			employee_no: emp?.employee_no ?? null,
			contract_type_name: ctype?.name ?? null,
			days_until_expiry: calcDaysUntilExpiry(c.end_date),
			ess_employees: undefined,
			ess_contract_types: undefined,
		}
	})

	return NextResponse.json({ contracts: processed })
})

export const POST = withAuth(async (request: NextRequest, { companyId, employee }) => {
	if (!employee) {
		return NextResponse.json({ error: 'Employee record required' }, { status: 403 })
	}

	const body = await request.json()
	const {
		employee_id,
		contract_type_id,
		title,
		start_date,
		end_date = null,
		status = 'Active',
		notes = null,
		renewal_reminder_days = 30,
	} = body

	if (!employee_id || !title || !start_date) {
		return NextResponse.json({ error: 'employee_id, title, and start_date are required' }, { status: 400 })
	}

	const { data: contract, error } = await supabaseAdmin
		.from('ess_contracts')
		.insert({
			employee_id,
			company_id: companyId,
			contract_type_id: contract_type_id || null,
			title,
			start_date,
			end_date,
			status,
			notes,
			renewal_reminder_days,
			created_by: employee.id,
		})
		.select()
		.single()

	if (error) {
		console.error('Contract create error:', error)
		return NextResponse.json({ error: 'Failed to create contract' }, { status: 500 })
	}

	// Create initial history entry
	await supabaseAdmin.from('ess_contract_history').insert({
		contract_id: contract.id,
		action: 'created',
		performed_by: employee.id,
		notes: null,
	})

	return NextResponse.json({ contract }, { status: 201 })
}, { minRole: 'hr' })
