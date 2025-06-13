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
		bc_employee_id?: string
	}
}

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	try {
		const { id: employeeId } = await params
		
		if (!employeeId) {
			return NextResponse.json(
				{ error: 'Employee ID is required' },
				{ status: 400 }
			)
		}

		// Forward cookies from the request
		const cookieHeader = request.headers.get('Cookie')
		
		const frappeUrl = `${config.frappe.url.replace(/\/$/, '')}/api/resource/Employee/${employeeId}`
		
		const response = await fetch(frappeUrl, {
			method: 'GET',
			headers: {
				...(cookieHeader && { Cookie: cookieHeader }),
			},
		})

		if (!response.ok) {
			if (response.status === 404) {
				return NextResponse.json(
					{ error: 'Employee not found' },
					{ status: 404 }
				)
			}
			throw new Error(`Frappe API error: ${response.status}`)
		}

		const employeeDoc: FrappeEmployeeDoc = await response.json()
		
		// Process the employee data
		const processedResult = {
			employee: {
				id: employeeDoc.data.bc_employee_id || employeeDoc.data.name,
				mobile_phone_no: employeeDoc.data.mobile_phone_no,
				status: employeeDoc.data.status || '',
			}
		}

		console.log('Processed employee result:', processedResult)
		
		return NextResponse.json(processedResult)
	} catch (error) {
		console.error('Employee fetch error:', error)
		const errorMessage = error instanceof Error ? error.message : 'Unknown error'
		return NextResponse.json(
			{ error: 'Failed to fetch employee data', details: errorMessage },
			{ status: 500 }
		)
	}
} 