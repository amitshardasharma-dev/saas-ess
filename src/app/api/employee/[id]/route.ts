import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

// IDOR fix: this route previously trusted any id/employee_no with NO tenant
// scoping, leaking employee PII across tenants. It is now wrapped in withAuth
// and every lookup is constrained to the caller's company_id; a cross-tenant id
// returns 404 (don't reveal existence).
//
// Authorization (E2E B4 finding): same-tenant scoping alone let any volunteer
// read another employee's record by id. Now a base-tier user may read ONLY their
// own record; manager+ may read any record in their company.
import { hasMinRole } from '@/types/roles'

export const GET = withAuth(async (_request: NextRequest, { companyId, role, employee: caller }, params) => {
	const employeeId = params?.id

	if (!employeeId) {
		return NextResponse.json({ error: 'Employee ID is required' }, { status: 400 })
	}

	// Try to find by employee_no first, then by UUID — always scoped to company.
	let query = supabaseAdmin.from('ess_employees').select('*').eq('company_id', companyId)

	const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
	if (uuidRegex.test(employeeId)) {
		query = query.eq('id', employeeId)
	} else {
		query = query.eq('employee_no', employeeId)
	}

	const { data: employee, error } = await query.single()

	if (error || !employee) {
		return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
	}

	// Below manager, you may only read your OWN employee record.
	const isSelf = caller?.id === employee.id
	if (!hasMinRole(role, 'manager') && !isSelf) {
		// 404 (not 403) to avoid revealing that the record exists.
		return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
	}

	return NextResponse.json({
		employee: {
			id: employee.bc_employee_id || employee.employee_no || employee.id,
			mobile_phone_no: employee.phone,
			status: employee.status || 'Active',
		},
	})
})
