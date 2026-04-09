import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

export const GET = withAuth(async (request: NextRequest, { companyId, employee }) => {
	if (!employee) {
		return NextResponse.json({ appraisals: [] })
	}

	const { searchParams } = new URL(request.url)
	const scope = searchParams.get('scope') || 'my'

	let query = supabaseAdmin
		.from('ess_appraisals')
		.select(`
			*,
			employee:ess_employees!ess_appraisals_employee_id_fkey (
				full_name,
				employee_no
			),
			manager:ess_employees!ess_appraisals_manager_id_fkey (
				full_name
			),
			ess_appraisal_cycles (
				name,
				company_id
			)
		`)
		.order('created_at', { ascending: false })

	if (scope === 'my') {
		query = query.eq('employee_id', employee.id)
	} else if (scope === 'team') {
		query = query.eq('manager_id', employee.id)
	} else {
		return NextResponse.json({ error: 'Invalid scope. Use my or team.' }, { status: 400 })
	}

	const { data: appraisals, error } = await query

	if (error) {
		console.error('Appraisals fetch error:', error)
		return NextResponse.json({ error: 'Failed to fetch appraisals' }, { status: 500 })
	}

	// Filter to only appraisals belonging to this company (via cycle)
	const processed = (appraisals || [])
		.filter((a) => {
			const cycle = a.ess_appraisal_cycles as any
			return cycle?.company_id === companyId
		})
		.map((a) => {
			const emp = a.employee as any
			const mgr = a.manager as any
			const cycle = a.ess_appraisal_cycles as any
			return {
				...a,
				employee_name: emp?.full_name ?? null,
				employee_no: emp?.employee_no ?? null,
				manager_name: mgr?.full_name ?? null,
				cycle_name: cycle?.name ?? null,
				employee: undefined,
				manager: undefined,
				ess_appraisal_cycles: undefined,
			}
		})

	return NextResponse.json({ appraisals: processed })
})
