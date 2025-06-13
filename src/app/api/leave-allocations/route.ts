import { NextRequest, NextResponse } from 'next/server'
import config from '@/config/environment'

interface FrappeLeaveAllocation {
	name: string
	employee: string
	employee_name: string
	leave_type: string
	from_date: string
	to_date: string
	new_leaves_allocated: number
	leaves_taken: number
	total_leaves_allocated: number
	unused_leaves: number
	expired_leaves: number
	carry_forwarded_leaves: number
	doctype: string
}

interface FrappeLeaveAllocationsResponse {
	data: FrappeLeaveAllocation[]
}

export async function GET(request: NextRequest) {
	try {
		// Forward cookies from the request for authentication
		const cookieHeader = request.headers.get('Cookie')
		
		console.log('Fetching Leave Allocations from Frappe...')
		console.log('Cookie header present:', cookieHeader ? 'Yes' : 'No')
		
		// Get current year for filtering
		const currentYear = new Date().getFullYear()
		
		// Build filters for current year and current employee
		const filters = JSON.stringify([
			["from_date", ">=", `${currentYear}-01-01`],
			["to_date", "<=", `${currentYear}-12-31`]
		])
		
		const frappeUrl = `${config.frappe.url.replace(/\/$/, '')}/api/resource/Leave Allocation?filters=${encodeURIComponent(filters)}&fields=["name","employee","employee_name","leave_type","from_date","to_date","new_leaves_allocated","leaves_taken","total_leaves_allocated","unused_leaves","expired_leaves","carry_forwarded_leaves"]`
		console.log('Making request to Frappe URL:', frappeUrl)
		
		const response = await fetch(frappeUrl, {
			method: 'GET',
			headers: {
				...(cookieHeader && { Cookie: cookieHeader }),
			},
		})

		console.log('Frappe response status:', response.status)
		console.log('Frappe response ok:', response.ok)

		if (!response.ok) {
			if (response.status === 404) {
				return NextResponse.json(
					{ error: 'Leave Allocations not found' },
					{ status: 404 }
				)
			}
			throw new Error(`Frappe API error: ${response.status}`)
		}

		const leaveAllocationsData: FrappeLeaveAllocationsResponse = await response.json()
		console.log('Raw leave allocations data from Frappe:', JSON.stringify(leaveAllocationsData, null, 2))
		
		// Process the leave allocations data
		const processedLeaveAllocations = leaveAllocationsData.data.map(allocation => ({
			name: allocation.name,
			employee: allocation.employee,
			employee_name: allocation.employee_name,
			leave_type: allocation.leave_type,
			from_date: allocation.from_date,
			to_date: allocation.to_date,
			new_leaves_allocated: allocation.new_leaves_allocated || 0,
			leaves_taken: allocation.leaves_taken || 0,
			total_leaves_allocated: allocation.total_leaves_allocated || 0,
			unused_leaves: allocation.unused_leaves || 0,
			expired_leaves: allocation.expired_leaves || 0,
			carry_forwarded_leaves: allocation.carry_forwarded_leaves || 0,
			remaining_leaves: (allocation.total_leaves_allocated || 0) - (allocation.leaves_taken || 0)
		}))

		console.log('Processed leave allocations:', JSON.stringify(processedLeaveAllocations, null, 2))
		
		return NextResponse.json({
			leave_allocations: processedLeaveAllocations
		})
	} catch (error) {
		console.error('Leave Allocations fetch error:', error)
		const errorMessage = error instanceof Error ? error.message : 'Unknown error'
		return NextResponse.json(
			{ error: 'Failed to fetch leave allocations', details: errorMessage },
			{ status: 500 }
		)
	}
} 