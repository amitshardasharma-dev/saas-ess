import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	try {
		const { id: employeeId } = await params

		if (!employeeId) {
			return NextResponse.json({ error: 'Employee ID is required' }, { status: 400 })
		}

		// Try to find by employee_no first, then by UUID
		let query = supabaseAdmin.from('ess_employees').select('*')

		// Check if it's a UUID format
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

		return NextResponse.json({
			employee: {
				id: employee.bc_employee_id || employee.employee_no || employee.id,
				mobile_phone_no: employee.phone,
				status: employee.status || 'Active',
			}
		})
	} catch (error) {
		console.error('Employee fetch error:', error)
		return NextResponse.json(
			{ error: 'Failed to fetch employee data' },
			{ status: 500 }
		)
	}
}
