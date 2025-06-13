'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { 
	ArrowLeft, 
	Calendar, 
	FileText, 
	Clock, 
	User, 
	CheckCircle,
	Loader2,
	Eye,
	Send
} from 'lucide-react'
import { leaveService, type LeaveType, type Employee, type ApprovalChain } from '@/services/leave'
import toast from 'react-hot-toast'
import { z } from 'zod'

const leaveApplicationSchema = z.object({
	leave_type: z.string().min(1, 'Leave type is required'),
	from_date: z.string().min(1, 'From date is required'),
	till_date: z.string().min(1, 'Till date is required'),
	leave_reason: z.string().min(10, 'Reason must be at least 10 characters'),
	total_leave_days: z.number().min(1, 'Total leave days must be greater than 0'),
})

type LeaveApplicationFormData = z.infer<typeof leaveApplicationSchema>

export default function NewLeaveApplicationPage() {
	const router = useRouter()
	const [employee, setEmployee] = useState<Employee | null>(null)
	const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([])
	const [isLoading, setIsLoading] = useState(true)
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [showPreview, setShowPreview] = useState(false)
	const [approvalChain, setApprovalChain] = useState<ApprovalChain | null>(null)
	const [errors, setErrors] = useState<Record<string, string>>({})
	
	const [formData, setFormData] = useState<LeaveApplicationFormData>({
		leave_type: '',
		from_date: '',
		till_date: '',
		leave_reason: '',
		total_leave_days: 0,
	})

	useEffect(() => {
		loadInitialData()
	}, [])

	useEffect(() => {
		// Auto-calculate total leave days when dates change
		if (formData.from_date && formData.till_date) {
			const days = leaveService.calculateWorkingDays(formData.from_date, formData.till_date)
			setFormData(prev => ({ ...prev, total_leave_days: days }))
		}
	}, [formData.from_date, formData.till_date])

	const loadInitialData = async () => {
		setIsLoading(true)
		console.log('Loading initial data for new leave application...')
		
		// Load data independently so if one fails, the other can still succeed
		let employeeData: Employee | null = null
		let leaveTypesData: LeaveType[] = []
		
		// Load employee data
		try {
			employeeData = await leaveService.getCurrentEmployee()
			console.log('Employee data loaded:', employeeData)
			console.log('Employee ID from data:', employeeData?.employee_id)
			console.log('Employee name from data:', employeeData?.name)
			setEmployee(employeeData)
			
			if (!employeeData) {
				console.warn('No employee data found')
				// Don't show error toast, we'll handle this in UI
			}
		} catch (error: any) {
			console.error('Error loading employee data:', error)
			// Don't show error toast, we'll handle this in UI
		}
		
		// Load leave types data (independent of employee data)
		try {
			leaveTypesData = await leaveService.getLeaveTypes()
			console.log('Leave types data:', leaveTypesData)
			console.log('Leave types count:', leaveTypesData?.length)
			console.log('Is array?', Array.isArray(leaveTypesData))
			
			// Ensure we have a valid array
			if (Array.isArray(leaveTypesData) && leaveTypesData.length > 0) {
				// Apply the same filtering logic as dashboard
				const filteredLeaveTypes = leaveTypesData.filter(leaveType => {
					// Filter out non-actual leave types (same logic as dashboard)
					const nonLeaveTypes = ['Present', 'Public Holiday', 'Week Off', 'Weekoff', 'Absent']
					const nonLeaveShortCodes = ['P', 'PH', 'W/OFF']
					
					// Use leave_mapping_code as the display name for filtering
					const displayName = leaveType.leave_mapping_code || leaveType.leave_type_name || leaveType.name
					const leaveTypeLower = displayName.toLowerCase()
					
					// Check for exact matches with short codes (to avoid 'P' matching 'Paternity')
					const matchesShortCode = nonLeaveShortCodes.some(code => 
						leaveTypeLower === code.toLowerCase()
					)
					
					// Check for partial matches with longer terms
					const matchesLongerTerm = nonLeaveTypes.some(nonLeave => 
						leaveTypeLower.includes(nonLeave.toLowerCase())
					)
					
					const isNonLeaveType = matchesShortCode || matchesLongerTerm
					
					// Include if it's an actual leave type AND has eligible days > 0
					const shouldInclude = !isNonLeaveType && (leaveType.eligible_days > 0)
					
					console.log(`Filtering leave type: ${leaveType.name}, Display: ${displayName}, Eligible: ${leaveType.eligible_days}, Include: ${shouldInclude}`)
					return shouldInclude
				})
				
				console.log('Filtered leave types count:', filteredLeaveTypes.length)
				setLeaveTypes(filteredLeaveTypes)
				
				if (filteredLeaveTypes.length === 0) {
					console.warn('No applicable leave types found after filtering')
					toast.error('No applicable leave types available. Please contact HR.')
				} else {
					console.log('Successfully set filtered leave types:', filteredLeaveTypes.length)
				}
			} else {
				console.warn('No leave types found or invalid data:', leaveTypesData)
				setLeaveTypes([])
				toast.error('No leave types available. Please contact HR.')
			}
		} catch (error: any) {
			console.error('Error loading leave types:', error)
			setLeaveTypes([])
			toast.error('Failed to load leave types. Please contact HR.')
		}
		
		setIsLoading(false)
	}

	const validateForm = (): boolean => {
		try {
			leaveApplicationSchema.parse(formData)
			
			// Additional validation
			const fromDate = new Date(formData.from_date)
			const tillDate = new Date(formData.till_date)
			const today = new Date()
			today.setHours(0, 0, 0, 0)
			fromDate.setHours(0, 0, 0, 0)
			
			if (fromDate < today) {
				setErrors(prev => ({ ...prev, from_date: 'From date cannot be in the past' }))
				return false
			}
			
			setErrors({})
			return true
		} catch (error) {
			if (error instanceof z.ZodError) {
				const newErrors: Record<string, string> = {}
				error.errors.forEach((err) => {
					if (err.path[0]) {
						newErrors[err.path[0] as string] = err.message
					}
				})
				setErrors(newErrors)
			}
			return false
		}
	}

	const updateField = (field: keyof LeaveApplicationFormData, value: string | number) => {
		setFormData(prev => ({ ...prev, [field]: value }))
		
		// Clear field error when user starts typing
		if (errors[field]) {
			setErrors(prev => ({ ...prev, [field]: '' }))
		}
	}

	const handlePreviewApprovalChain = async () => {
		if (!validateForm()) return
		
		if (!employee) {
			toast.error('Employee information is required. Please contact HR to link your account.')
			return
		}
		
		const employeeId = employee.employee_id || employee.name
		console.log('Preview approval chain - Employee data:', employee)
		console.log('Preview approval chain - Using employee ID:', employeeId)
		
		if (!employeeId || employeeId === 'Unknown') {
			toast.error('Invalid employee information. Please refresh the page and try again.')
			return
		}
		
		setShowPreview(true)
		try {
			const preview = await leaveService.previewApprovalChain(
				employeeId,
				formData.leave_type,
				formData.total_leave_days,
				formData.from_date,
				formData.till_date
			)
			
			// Check if the response contains an error
			if (preview.error) {
				toast.error(preview.error)
				setApprovalChain(null)
				setShowPreview(false)
				return
			}
			
			setApprovalChain(preview)
		} catch (error) {
			console.error('Error previewing approval chain:', error)
			toast.error('Failed to preview approval chain')
			setApprovalChain(null)
			setShowPreview(false)
		}
	}

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		
		if (!validateForm()) return
		
		if (!employee) {
			toast.error('Employee information is required to submit applications. Please contact HR to link your account.')
			return
		}

		const employeeId = employee.employee_id || employee.name
		console.log('Submit leave application - Employee data:', employee)
		console.log('Submit leave application - Using employee ID:', employeeId)
		
		if (!employeeId || employeeId === 'Unknown') {
			toast.error('Invalid employee information. Please refresh the page and try again.')
			return
		}

		setIsSubmitting(true)
		try {
			// Create and submit the leave application in one step
			const result = await leaveService.createLeaveApplication({
				...formData,
				link_lmbb: employeeId
			})
			
			toast.success('Leave application submitted successfully!')
			router.push('/dashboard/leave-applications')
		} catch (error: any) {
			console.error('Error submitting leave application:', error)
			toast.error(error.message || 'Failed to submit leave application')
		} finally {
			setIsSubmitting(false)
		}
	}

	const formatLeaveType = (leaveType: LeaveType) => {
		// Use leave_mapping_code as the primary display name since leave_type_name is often empty
		const displayName = leaveType.leave_mapping_code || leaveType.leave_type_name || leaveType.name
		return `${displayName} - ${leaveType.bc_leave_code} (${leaveType.eligible_days} days)`
	}

	const formatDate = (dateString: string) => {
		return new Date(dateString).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		})
	}

	const isFormValid = useMemo(() => {
		return formData.leave_type && 
			   formData.from_date && 
			   formData.till_date && 
			   formData.leave_reason.length >= 10 &&
			   formData.total_leave_days > 0
	}, [formData])

	if (isLoading) {
		return (
			<DashboardLayout>
				<div className="container mx-auto px-4 py-6">
					<div className="flex items-center justify-center min-h-[400px]">
						<div className="text-center">
							<Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
							<h2 className="text-lg font-semibold mb-2">Loading Form</h2>
							<p className="text-sm text-muted-foreground">Please wait while we prepare your form...</p>
						</div>
					</div>
				</div>
			</DashboardLayout>
		)
	}

	return (
		<DashboardLayout>
			<div className="container mx-auto px-4 py-6 max-w-4xl">
				{/* Header */}
				<div className="mb-6">
					{/* Breadcrumb Navigation */}
					<div className="flex items-center space-x-2 mb-4">
						<button 
							onClick={() => router.push('/dashboard/leave-applications')}
							className="flex items-center space-x-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
						>
							<ArrowLeft className="h-4 w-4" />
							<span>Leave Applications</span>
						</button>
						<span className="text-muted-foreground">/</span>
						<span className="text-sm font-medium text-foreground">New Application</span>
					</div>
					
					{/* Title Section */}
					<div>
						<h1 className="text-2xl font-bold text-foreground mb-1">
							New Leave Application
						</h1>
						<p className="text-sm text-muted-foreground">
							Submit a new leave request for approval
						</p>
					</div>
				</div>

				{/* Employee Info */}
				{employee ? (
					<Card className="mb-6">
						<CardContent className="p-4">
							<div className="flex items-center space-x-3">
								<User className="h-5 w-5 text-muted-foreground" />
								<div className="flex-1">
									<p className="font-medium text-foreground">
										{employee.full_name || employee.employee_name}
									</p>
									<div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 text-sm text-muted-foreground">
										<span>Employee ID: {employee.employee_id || employee.name}</span>
										{employee.bc_employee_id && (
											<>
												<span className="hidden sm:inline">•</span>
												<span>BC Employee ID: {employee.bc_employee_id}</span>
											</>
										)}
										<span className="hidden sm:inline">•</span>
										<span>User: {employee.user_id}</span>
									</div>
								</div>
							</div>
						</CardContent>
					</Card>
				) : !isLoading && (
					<Card className="mb-6">
						<CardContent className="p-4">
							<div className="flex items-center space-x-3">
								<User className="h-5 w-5 text-muted-foreground" />
								<div>
									<p className="font-medium text-foreground">Employee information not available</p>
									<p className="text-sm text-muted-foreground">Please contact HR to link your account</p>
								</div>
							</div>
						</CardContent>
					</Card>
				)}

				{/* Warning if no employee data */}
				{!employee && !isLoading && (
					<Card className="mb-6 border-amber-200 bg-amber-50">
						<CardContent className="p-4">
							<div className="flex items-center space-x-3">
								<div className="h-5 w-5 text-amber-600">⚠️</div>
								<div>
									<p className="font-medium text-amber-800">Cannot submit leave applications</p>
									<p className="text-sm text-amber-700">Employee information is required to submit leave applications. Please contact HR to link your account.</p>
								</div>
							</div>
						</CardContent>
					</Card>
				)}

				{/* Main Form */}
				<Card>
					<CardContent className="p-6">
						<form onSubmit={handleSubmit} className="space-y-6">
							{/* Leave Type */}
							<div className="space-y-2">
								<Label htmlFor="leave_type" className="text-sm font-semibold text-foreground">
									Leave Type <span className="text-destructive">*</span>
								</Label>
								<Select 
									value={formData.leave_type} 
									onValueChange={(value) => updateField('leave_type', value)}
									disabled={leaveTypes.length === 0}
								>
									<SelectTrigger className={`h-12 ${errors.leave_type ? 'border-destructive' : ''}`}>
										<SelectValue placeholder={
											leaveTypes.length === 0 
												? "Loading leave types..." 
												: "Select leave type"
										} />
									</SelectTrigger>
									<SelectContent>
										{leaveTypes.length > 0 ? (
											leaveTypes.map((leaveType) => (
												<SelectItem key={leaveType.name} value={leaveType.name}>
													{formatLeaveType(leaveType)}
												</SelectItem>
											))
										) : (
											<SelectItem value="" disabled>
												No applicable leave types available
											</SelectItem>
										)}
									</SelectContent>
								</Select>
								{errors.leave_type && (
									<p className="text-sm text-destructive">{errors.leave_type}</p>
								)}
							</div>

							{/* Date Range */}
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								{/* From Date */}
								<div className="space-y-2">
									<Label htmlFor="from_date" className="text-sm font-semibold text-foreground">
										From Date <span className="text-destructive">*</span>
									</Label>
									<div className="relative">
										<Input
											id="from_date"
											type="date"
											value={formData.from_date}
											onChange={(e) => updateField('from_date', e.target.value)}
											disabled={isSubmitting}
											className={`h-12 pl-12 ${errors.from_date ? 'border-destructive' : ''}`}
										/>
										<Calendar className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
									</div>
									{errors.from_date && (
										<p className="text-sm text-destructive">{errors.from_date}</p>
									)}
								</div>

								{/* Till Date */}
								<div className="space-y-2">
									<Label htmlFor="till_date" className="text-sm font-semibold text-foreground">
										Till Date <span className="text-destructive">*</span>
									</Label>
									<div className="relative">
										<Input
											id="till_date"
											type="date"
											value={formData.till_date}
											onChange={(e) => updateField('till_date', e.target.value)}
											disabled={isSubmitting}
											className={`h-12 pl-12 ${errors.till_date ? 'border-destructive' : ''}`}
										/>
										<Calendar className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
									</div>
									{errors.till_date && (
										<p className="text-sm text-destructive">{errors.till_date}</p>
									)}
								</div>
							</div>

							{/* Total Days Display */}
							{formData.total_leave_days > 0 && (
								<div className="p-4 bg-muted/50 rounded-lg">
									<div className="flex items-center space-x-2">
										<Clock className="h-4 w-4 text-muted-foreground" />
										<span className="text-sm font-medium">
											Total Leave Days: {formData.total_leave_days} day{formData.total_leave_days !== 1 ? 's' : ''}
										</span>
									</div>
									{formData.from_date && formData.till_date && (
										<p className="text-sm text-muted-foreground mt-1">
											{formatDate(formData.from_date)} to {formatDate(formData.till_date)}
										</p>
									)}
								</div>
							)}

							{/* Leave Reason */}
							<div className="space-y-2">
								<Label htmlFor="leave_reason" className="text-sm font-semibold text-foreground">
									Reason for Leave <span className="text-destructive">*</span>
								</Label>
								<div className="relative">
									<Textarea
										id="leave_reason"
										value={formData.leave_reason}
										onChange={(e) => updateField('leave_reason', e.target.value)}
										placeholder="Please provide a detailed reason for your leave request..."
										disabled={isSubmitting}
										className={`min-h-[100px] pl-12 pt-4 ${errors.leave_reason ? 'border-destructive' : ''}`}
									/>
									<FileText className="absolute left-4 top-4 h-4 w-4 text-muted-foreground" />
								</div>
								<div className="flex justify-between">
									{errors.leave_reason && (
										<p className="text-sm text-destructive">{errors.leave_reason}</p>
									)}
									<p className="text-xs text-muted-foreground ml-auto">
										{formData.leave_reason.length}/500 characters
									</p>
								</div>
							</div>

							{/* Action Buttons */}
							<div className="flex flex-col sm:flex-row gap-3 pt-4">
								<Button 
									type="button"
									variant="outline"
									onClick={() => router.push('/dashboard/leave-applications')}
									disabled={isSubmitting}
									className="sm:w-auto"
								>
									<ArrowLeft className="h-4 w-4 mr-2" />
									Cancel
								</Button>
								
								<Button 
									type="button"
									variant="outline"
									onClick={handlePreviewApprovalChain}
									disabled={!isFormValid || isSubmitting || !employee}
									className="sm:w-auto"
								>
									<Eye className="h-4 w-4 mr-2" />
									Preview Approval Chain
								</Button>
								
								<Button 
									type="submit"
									disabled={!isFormValid || isSubmitting || !employee}
									className="sm:w-auto sm:ml-auto"
								>
									{isSubmitting ? (
										<>
											<Loader2 className="h-4 w-4 mr-2 animate-spin" />
											Submitting...
										</>
									) : (
										<>
											<Send className="h-4 w-4 mr-2" />
											Submit Application
										</>
									)}
								</Button>
							</div>
						</form>
					</CardContent>
				</Card>

				{/* Approval Chain Preview */}
				{showPreview && approvalChain && (
					<Card className="mt-6">
						<CardContent className="p-6">
							<h3 className="text-lg font-semibold mb-4">Approval Chain Preview</h3>
							<div className="space-y-4">
								{approvalChain.approval_chain && approvalChain.approval_chain.length > 0 ? (
									approvalChain.approval_chain.map((level, index) => (
										<div key={index} className="flex items-center space-x-4 p-3 border rounded-lg">
											<div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-semibold text-sm">
												{level.level_no}
											</div>
											<div className="flex-1">
												<p className="font-medium">{level.approver_name}</p>
												<p className="text-sm text-muted-foreground">{level.approver}</p>
												<p className="text-xs text-muted-foreground">
													SLA: {new Date(level.sla_deadline).toLocaleDateString()}
												</p>
											</div>
											<div className="flex items-center space-x-2">
												<Clock className="h-4 w-4 text-amber-500" />
												<span className="text-sm text-amber-600">Pending</span>
											</div>
										</div>
									))
								) : (
									<div className="text-center py-8">
										<p className="text-muted-foreground">No approval chain available for this leave type and duration.</p>
										{approvalChain.default_approver && (
											<p className="text-sm text-muted-foreground mt-2">
												Default approver: {approvalChain.default_approver}
											</p>
										)}
									</div>
								)}
							</div>
						</CardContent>
					</Card>
				)}
			</div>
		</DashboardLayout>
	)
} 