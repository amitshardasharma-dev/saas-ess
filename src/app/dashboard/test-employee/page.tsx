'use client'

import { useState } from 'react'
import { useEmployee } from '@/hooks/use-employee'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RefreshCw, User, Shield, ShieldCheck, ShieldX } from 'lucide-react'

export default function TestEmployeePage() {
	const { employee, loading, error, hasLeaveApprovalAccess, hasExpenseApprovalAccess, refetch } = useEmployee()
	const [directApiData, setDirectApiData] = useState<unknown>(null)
	const [directApiLoading, setDirectApiLoading] = useState(false)

	const testDirectApi = async () => {
		setDirectApiLoading(true)
		try {
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
			
			if (response.ok) {
				const data = await response.json()
				setDirectApiData(data)
			} else {
				setDirectApiData({ error: `API Error: ${response.status}` })
			}
		} catch (err) {
			setDirectApiData({ error: err instanceof Error ? err.message : 'Unknown error' })
		} finally {
			setDirectApiLoading(false)
		}
	}

	return (
		<div className="container mx-auto p-6 space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold">Employee Data Test</h1>
					<p className="text-muted-foreground">Testing employee data and approval permissions</p>
				</div>
				<div className="flex gap-2">
					<Button onClick={refetch} disabled={loading} variant="outline">
						<RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
						Refresh Hook
					</Button>
					<Button onClick={testDirectApi} disabled={directApiLoading} variant="outline">
						<RefreshCw className={`h-4 w-4 mr-2 ${directApiLoading ? 'animate-spin' : ''}`} />
						Test Direct API
					</Button>
				</div>
			</div>

			{error && (
				<Card className="border-red-200 bg-red-50">
					<CardHeader>
						<CardTitle className="text-red-800">Error</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-red-700">{error}</p>
					</CardContent>
				</Card>
			)}

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				{/* Employee Information */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<User className="h-5 w-5" />
							Employee Information
						</CardTitle>
						<CardDescription>Basic employee details</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						{loading ? (
							<div className="space-y-2">
								<div className="h-4 bg-gray-200 rounded animate-pulse"></div>
								<div className="h-4 bg-gray-200 rounded animate-pulse"></div>
								<div className="h-4 bg-gray-200 rounded animate-pulse"></div>
							</div>
						) : employee ? (
							<div className="space-y-3">
								<div className="grid grid-cols-2 gap-2 text-sm">
									<div className="font-medium">Name</div>
									<div>{employee.name}</div>
									
									<div className="font-medium">Employee Name</div>
									<div>{employee.employee_name}</div>
									
									<div className="font-medium">User ID</div>
									<div>{employee.user_id}</div>
									
									<div className="font-medium">Employee ID</div>
									<div>{employee.employee_id || 'N/A'}</div>
									
									<div className="font-medium">Full Name</div>
									<div>{employee.full_name || 'N/A'}</div>
									
									<div className="font-medium">BC Employee ID</div>
									<div>{employee.bc_employee_id || 'N/A'}</div>
								</div>
							</div>
						) : (
							<p className="text-muted-foreground">No employee data available</p>
						)}
					</CardContent>
				</Card>

				{/* Approval Permissions */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Shield className="h-5 w-5" />
							Approval Permissions
						</CardTitle>
						<CardDescription>Access control for approval features</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						{loading ? (
							<div className="space-y-2">
								<div className="h-4 bg-gray-200 rounded animate-pulse"></div>
								<div className="h-4 bg-gray-200 rounded animate-pulse"></div>
							</div>
						) : employee ? (
							<div className="space-y-4">
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-2">
										{hasLeaveApprovalAccess ? (
											<ShieldCheck className="h-4 w-4 text-green-600" />
										) : (
											<ShieldX className="h-4 w-4 text-red-600" />
										)}
										<span className="font-medium">Leave Approval Enabled</span>
									</div>
									<div className="flex items-center gap-2">
										<Badge variant={hasLeaveApprovalAccess ? "default" : "secondary"}>
											{hasLeaveApprovalAccess ? "Enabled" : "Disabled"}
										</Badge>
										<span className="text-xs text-muted-foreground">
											(Raw value: {employee.leave_approval_enabled})
										</span>
									</div>
								</div>
								
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-2">
										{hasExpenseApprovalAccess ? (
											<ShieldCheck className="h-4 w-4 text-green-600" />
										) : (
											<ShieldX className="h-4 w-4 text-red-600" />
										)}
										<span className="font-medium">Expense Approval Enabled</span>
									</div>
									<div className="flex items-center gap-2">
										<Badge variant={hasExpenseApprovalAccess ? "default" : "secondary"}>
											{hasExpenseApprovalAccess ? "Enabled" : "Disabled"}
										</Badge>
										<span className="text-xs text-muted-foreground">
											(Raw value: {employee.expense_approval_enabled})
										</span>
									</div>
								</div>
							</div>
						) : (
							<p className="text-muted-foreground">No permission data available</p>
						)}
					</CardContent>
				</Card>
			</div>

			{/* Raw Data Display */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<Card>
					<CardHeader>
						<CardTitle>Raw Employee Data (from Hook)</CardTitle>
						<CardDescription>Data retrieved via useEmployee hook</CardDescription>
					</CardHeader>
					<CardContent>
						<pre className="text-xs bg-gray-50 p-4 rounded overflow-auto max-h-64">
							{employee ? JSON.stringify(employee, null, 2) : 'No data'}
						</pre>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Direct API Response</CardTitle>
						<CardDescription>Data from direct API call</CardDescription>
					</CardHeader>
					<CardContent>
						<pre className="text-xs bg-gray-50 p-4 rounded overflow-auto max-h-64">
							{directApiData ? JSON.stringify(directApiData, null, 2) : 'Click "Test Direct API" to fetch'}
						</pre>
					</CardContent>
				</Card>
			</div>
		</div>
	)
} 