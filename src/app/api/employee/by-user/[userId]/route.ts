import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ userId: string }> }
) {
	try {
		const { userId } = await params

		if (!userId) {
			return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
		}

		// Find employee by email (userId is the email in our system)
		const { data: employee, error } = await supabaseAdmin
			.from('ess_employees')
			.select('*')
			.eq('email', userId)
			.single()

		if (error || !employee) {
			return NextResponse.json({ error: 'No employee found for this user' }, { status: 404 })
		}

		return NextResponse.json({
			employee: {
				id: employee.employee_no || employee.id,
				name: employee.full_name,
				mobile_phone_no: employee.phone,
				department: employee.department,
				designation: employee.designation,
				company: '',
				status: employee.status,
				user_id: userId,
			}
		})
	} catch (error) {
		console.error('Employee by user fetch error:', error)
		return NextResponse.json(
			{ error: 'Failed to fetch employee data' },
			{ status: 500 }
		)
	}
}
