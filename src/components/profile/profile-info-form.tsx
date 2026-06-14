'use client'

import { useState, useMemo } from 'react'
import { Save, User as UserIcon, Mail, Building, Briefcase } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import toast from 'react-hot-toast'
import { z } from 'zod'
import { User } from '@/types/auth'

const profileInfoSchema = z.object({
	full_name: z.string().min(1, 'Full name is required'),
	email: z.string().email('Please enter a valid email address'),
	department: z.string().optional(),
	designation: z.string().optional(),
})

type ProfileInfoFormData = z.infer<typeof profileInfoSchema>

interface ProfileInfoFormProps {
	user: User
}

export function ProfileInfoForm({ user }: ProfileInfoFormProps) {
	const [formData, setFormData] = useState<ProfileInfoFormData>({
		full_name: user.full_name || '',
		email: user.email || '',
		department: user.department || '',
		designation: user.designation || '',
	})
	const [errors, setErrors] = useState<Record<string, string>>({})
	const [isLoading, setIsLoading] = useState(false)

	const validateForm = (): boolean => {
		try {
			profileInfoSchema.parse(formData)
			return true
		} catch {
			return false
		}
	}

	const validateAndSetErrors = (): boolean => {
		try {
			profileInfoSchema.parse(formData)
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

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		
		if (!validateAndSetErrors()) return

		setIsLoading(true)
		try {
			// Simulate API call - replace with actual update logic
			await new Promise(resolve => setTimeout(resolve, 2000))
			
			// Call auth store method (will need to implement)
			// await updateUserInfo(formData)
			
			toast.success('Profile updated successfully!')
		} catch (error) {
			toast.error('Failed to update profile')
			console.error('Profile update error:', error)
		} finally {
			setIsLoading(false)
		}
	}

	const updateField = (field: keyof ProfileInfoFormData, value: string) => {
		setFormData(prev => ({ ...prev, [field]: value }))
		
		// Clear field error when user starts typing
		if (errors[field]) {
			setErrors(prev => ({ ...prev, [field]: '' }))
		}
	}

	const hasChanges = useMemo(() => {
		return (
			formData.full_name !== user.full_name ||
			formData.email !== user.email ||
			formData.department !== (user.department || '') ||
			formData.designation !== (user.designation || '')
		)
	}, [formData, user])

	const isFormValid = useMemo(() => validateForm(), [formData])

	return (
		<form onSubmit={handleSubmit} className="space-y-6">
			{/* Full Name */}
			<div className="space-y-2">
				<Label htmlFor="full_name" className="text-sm font-semibold text-foreground">
					Full Name
				</Label>
				<div className="relative">
					<Input
						id="full_name"
						type="text"
						value={formData.full_name}
						onChange={(e) => updateField('full_name', e.target.value)}
						placeholder="Enter your full name"
						disabled={isLoading}
						className={`h-12 pl-12 ${errors.full_name ? 'border-destructive' : ''} floating-element border-0 focus:ring-2 focus:ring-primary/20`}
					/>
					<UserIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
				</div>
				{errors.full_name && (
					<p className="text-sm text-destructive">{errors.full_name}</p>
				)}
			</div>

			{/* Email */}
			<div className="space-y-2">
				<Label htmlFor="email" className="text-sm font-semibold text-foreground">
					Email Address
				</Label>
				<div className="relative">
					<Input
						id="email"
						type="email"
						value={formData.email}
						onChange={(e) => updateField('email', e.target.value)}
						placeholder="Enter your email address"
						disabled={isLoading}
						className={`h-12 pl-12 ${errors.email ? 'border-destructive' : ''} floating-element border-0 focus:ring-2 focus:ring-primary/20`}
					/>
					<Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
				</div>
				{errors.email && (
					<p className="text-sm text-destructive">{errors.email}</p>
				)}
			</div>

			{/* Username (Read-only) */}
			<div className="space-y-2">
				<Label htmlFor="username" className="text-sm font-semibold text-foreground">
					Username
				</Label>
				<div className="relative">
					<Input
						id="username"
						type="text"
						value={user.name || ''}
						disabled={true}
						className="h-12 pl-12 floating-element border-0 bg-muted/50 text-muted-foreground cursor-not-allowed"
					/>
					<UserIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
				</div>
				<p className="text-xs text-muted-foreground">Username cannot be changed</p>
			</div>

			{/* Employee ID (Read-only) */}
			{user.employee && (
				<div className="space-y-2">
					<Label htmlFor="employee" className="text-sm font-semibold text-foreground">
						Employee ID
					</Label>
					<div className="relative">
						<Input
							id="employee"
							type="text"
							value={user.employee}
							disabled={true}
							className="h-12 pl-12 floating-element border-0 bg-muted/50 text-muted-foreground cursor-not-allowed"
						/>
						<Briefcase className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
					</div>
					<p className="text-xs text-muted-foreground">Employee ID is managed by HR</p>
				</div>
			)}

			{/* Department */}
			<div className="space-y-2">
				<Label htmlFor="department" className="text-sm font-semibold text-foreground">
					Department
				</Label>
				<div className="relative">
					<Input
						id="department"
						type="text"
						value={formData.department}
						onChange={(e) => updateField('department', e.target.value)}
						placeholder="Enter your department"
						disabled={isLoading}
						className={`h-12 pl-12 ${errors.department ? 'border-destructive' : ''} floating-element border-0 focus:ring-2 focus:ring-primary/20`}
					/>
					<Building className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
				</div>
				{errors.department && (
					<p className="text-sm text-destructive">{errors.department}</p>
				)}
			</div>

			{/* Designation */}
			<div className="space-y-2">
				<Label htmlFor="designation" className="text-sm font-semibold text-foreground">
					Designation
				</Label>
				<div className="relative">
					<Input
						id="designation"
						type="text"
						value={formData.designation}
						onChange={(e) => updateField('designation', e.target.value)}
						placeholder="Enter your designation"
						disabled={isLoading}
						className={`h-12 pl-12 ${errors.designation ? 'border-destructive' : ''} floating-element border-0 focus:ring-2 focus:ring-primary/20`}
					/>
					<Briefcase className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
				</div>
				{errors.designation && (
					<p className="text-sm text-destructive">{errors.designation}</p>
				)}
			</div>

			{/* Save Changes Notice */}
			{hasChanges && (
				<div className="content-flow p-4 rounded-xl">
					<div className="flex items-center justify-between">
						<div>
							<p className="text-sm font-medium text-foreground">
								You have unsaved changes
							</p>
							<p className="text-xs text-muted-foreground">
								Click save to apply your changes
							</p>
						</div>
						<div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
					</div>
				</div>
			)}

			{/* Submit Button */}
			<Button 
				type="submit" 
				disabled={isLoading || !hasChanges || !isFormValid}
				className="w-full h-12 bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 shadow-sm hover:shadow-md transition-all duration-200 font-semibold"
			>
				{isLoading ? (
					<>
						<div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
						Saving Changes...
					</>
				) : (
					<>
						<Save className="h-4 w-4 mr-2" />
						Save Changes
					</>
				)}
			</Button>
		</form>
	)
} 