import { useState, useEffect } from 'react'
import { Employee } from '@/services/leave'
import { UserRole } from '@/types/roles'

interface UseEmployeeReturn {
	employee: Employee | null
	loading: boolean
	error: string | null
	hasLeaveApprovalAccess: boolean
	hasExpenseApprovalAccess: boolean
	role: UserRole
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
			
			const token = localStorage.getItem('ess_access_token')
			const response = await fetch('/api/employee', {
				method: 'GET',
				cache: 'no-store',
				headers: {
					'Cache-Control': 'no-cache, no-store, must-revalidate',
					'Pragma': 'no-cache',
					'Expires': '0',
					...(token ? { Authorization: `Bearer ${token}` } : {}),
				}
			})

			if (!response.ok) {
				throw new Error(`Failed to fetch employee: ${response.status}`)
			}

			const data = await response.json()

			if (data.employee) {
				setEmployee(data.employee)
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

	// Get role from auth store user, default to employee
	const storedUser = typeof window !== 'undefined'
		? JSON.parse(localStorage.getItem('auth-storage') || '{}')?.state?.user
		: null
	const role: UserRole = (storedUser?.role as UserRole) || 'employee'

	return {
		employee,
		loading,
		error,
		hasLeaveApprovalAccess,
		hasExpenseApprovalAccess,
		role,
		refetch: fetchEmployee
	}
} 