import { NextRequest, NextResponse } from 'next/server'
import config from '@/config/environment'

interface FrappeEmployeeDoc {
	data: {
		name: string
		employee_name?: string
		mobile_phone_no?: string
		department?: string
		designation?: string
		company?: string
		status?: string
		user_id?: string
	}
}

interface FrappeListResponse {
	data: FrappeEmployeeDoc['data'][]
}

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ userId: string }> }
) {
	try {
		const { userId } = await params
		
		if (!userId) {
			return NextResponse.json(
				{ error: 'User ID is required' },
				{ status: 400 }
			)
		}

		// Forward cookies from the request
		const cookieHeader = request.headers.get('Cookie')
		
		// Query Employee doctype to find employee with matching user_id
		const frappeUrl = `${config.frappe.url.replace(/\/$/, '')}/api/resource/Employee?filters=[["user_id","=","${userId}"]]&limit=1`
		
		const response = await fetch(frappeUrl, {
			method: 'GET',
			headers: {
				...(cookieHeader && { Cookie: cookieHeader }),
			},
		})

		if (!response.ok) {
			throw new Error(`Frappe API error: ${response.status}`)
		}

		const employeeList: FrappeListResponse = await response.json()
		
		if (employeeList.data.length === 0) {
			return NextResponse.json(
				{ error: 'No employee found for this user' },
				{ status: 404 }
			)
		}

		const employeeData = employeeList.data[0]
		
		return NextResponse.json({
			employee: {
				id: employeeData.name,
				name: employeeData.employee_name,
				mobile_phone_no: employeeData.mobile_phone_no,
				department: employeeData.department,
				designation: employeeData.designation,
				company: employeeData.company,
				status: employeeData.status,
				user_id: employeeData.user_id,
			}
		})
	} catch (error) {
		console.error('Employee by user fetch error:', error)
		const errorMessage = error instanceof Error ? error.message : 'Unknown error'
		return NextResponse.json(
			{ error: 'Failed to fetch employee data', details: errorMessage },
			{ status: 500 }
		)
	}
} 