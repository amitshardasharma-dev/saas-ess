import { useState, useEffect } from 'react'
import { Employee } from '@/services/leave'

interface UseEmployeeReturn {
	employee: Employee | null
	loading: boolean
	error: string | null
	hasLeaveApprovalAccess: boolean
	hasExpenseApprovalAccess: boolean
	refetch: () => void
}

export function useEmployee(): UseEmployeeReturn {
	const [employee, setEmployee] = useState<Employee | null>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

	const fetchEmployee = async () => {
		try {
			setLoading(true)
			setError(null)
			
			console.log('useEmployee: Fetching employee data...')
			
			const response = await fetch('/api/employee', {
				method: 'GET',
				credentials: 'include',
				cache: 'no-store',
				headers: {
					'Cache-Control': 'no-cache, no-store, must-revalidate',
					'Pragma': 'no-cache',
					'Expires': '0'
				}
			})

			if (!response.ok) {
				throw new Error(`Failed to fetch employee: ${response.status}`)
			}

			const data = await response.json()
			console.log('useEmployee: Raw API response:', data)
			
			if (data.employee) {
				setEmployee(data.employee)
				console.log('useEmployee: Employee data set:', data.employee)
			} else {
				throw new Error('No employee data in response')
			}
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Failed to fetch employee'
			console.error('useEmployee: Error fetching employee:', errorMessage)
			setError(errorMessage)
		} finally {
			setLoading(false)
		}
	}

	useEffect(() => {
		fetchEmployee()
	}, [])

	// Helper functions to check approval access
	const hasLeaveApprovalAccess = employee?.leave_approval_enabled === 1
	const hasExpenseApprovalAccess = employee?.expense_approval_enabled === 1

	console.log('useEmployee: Current state:', {
		employee,
		loading,
		error,
		hasLeaveApprovalAccess,
		hasExpenseApprovalAccess
	})

	return {
		employee,
		loading,
		error,
		hasLeaveApprovalAccess,
		hasExpenseApprovalAccess,
		refetch: fetchEmployee
	}
} 