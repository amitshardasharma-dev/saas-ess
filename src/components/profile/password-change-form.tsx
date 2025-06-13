'use client'

import { useState, useMemo } from 'react'
import { Eye, EyeOff, Lock, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/stores/auth'
import toast from 'react-hot-toast'
import { z } from 'zod'

const passwordChangeSchema = z.object({
	currentPassword: z.string().min(1, 'Current password is required'),
	newPassword: z.string().min(8, 'Password must be at least 8 characters'),
	confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine((data) => data.newPassword === data.confirmPassword, {
	message: "Passwords don't match",
	path: ["confirmPassword"],
})

type PasswordChangeFormData = z.infer<typeof passwordChangeSchema>

export function PasswordChangeForm() {
	const { changePassword } = useAuthStore()
	const [formData, setFormData] = useState<PasswordChangeFormData>({
		currentPassword: '',
		newPassword: '',
		confirmPassword: '',
	})
	const [showPasswords, setShowPasswords] = useState({
		current: false,
		new: false,
		confirm: false,
	})
	const [errors, setErrors] = useState<Record<string, string>>({})
	const [isLoading, setIsLoading] = useState(false)

	const validateForm = (): boolean => {
		try {
			passwordChangeSchema.parse(formData)
			return true
		} catch (error) {
			return false
		}
	}

	const validateAndSetErrors = (): boolean => {
		try {
			passwordChangeSchema.parse(formData)
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
			// Simulate API call - replace with actual password change logic
			await new Promise(resolve => setTimeout(resolve, 2000))
			
			// Call auth store method (will need to implement)
			// await changePassword(formData.currentPassword, formData.newPassword)
			
			toast.success('Password changed successfully!')
			
			// Reset form
			setFormData({
				currentPassword: '',
				newPassword: '',
				confirmPassword: '',
			})
		} catch (error) {
			toast.error('Failed to change password')
			console.error('Password change error:', error)
		} finally {
			setIsLoading(false)
		}
	}

	const updateField = (field: keyof PasswordChangeFormData, value: string) => {
		setFormData(prev => ({ ...prev, [field]: value }))
		
		// Clear field error when user starts typing
		if (errors[field]) {
			setErrors(prev => ({ ...prev, [field]: '' }))
		}
	}

	const togglePasswordVisibility = (field: 'current' | 'new' | 'confirm') => {
		setShowPasswords(prev => ({
			...prev,
			[field]: !prev[field]
		}))
	}

	const getPasswordStrength = (password: string) => {
		let strength = 0
		const checks = [
			password.length >= 8,
			/[a-z]/.test(password),
			/[A-Z]/.test(password),
			/\d/.test(password),
			/[!@#$%^&*(),.?":{}|<>]/.test(password),
		]
		
		strength = checks.filter(Boolean).length
		
		if (strength < 2) return { label: 'Weak', color: 'text-red-500', width: '20%' }
		if (strength < 4) return { label: 'Medium', color: 'text-yellow-500', width: '60%' }
		return { label: 'Strong', color: 'text-green-500', width: '100%' }
	}

	const passwordStrength = useMemo(() => getPasswordStrength(formData.newPassword), [formData.newPassword])
	const isFormValid = useMemo(() => validateForm(), [formData])

	return (
		<form onSubmit={handleSubmit} className="space-y-6">
			{/* Current Password */}
			<div className="space-y-2">
				<Label htmlFor="currentPassword" className="text-sm font-semibold text-foreground">
					Current Password
				</Label>
				<div className="relative">
					<Input
						id="currentPassword"
						type={showPasswords.current ? 'text' : 'password'}
						value={formData.currentPassword}
						onChange={(e) => updateField('currentPassword', e.target.value)}
						placeholder="Enter your current password"
						disabled={isLoading}
						className={`h-12 pr-12 ${errors.currentPassword ? 'border-destructive' : ''} floating-element border-0 focus:ring-2 focus:ring-primary/20`}
					/>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
						onClick={() => togglePasswordVisibility('current')}
						disabled={isLoading}
					>
						{showPasswords.current ? (
							<EyeOff className="h-4 w-4 text-muted-foreground" />
						) : (
							<Eye className="h-4 w-4 text-muted-foreground" />
						)}
					</Button>
				</div>
				{errors.currentPassword && (
					<p className="text-sm text-destructive">{errors.currentPassword}</p>
				)}
			</div>

			{/* New Password */}
			<div className="space-y-2">
				<Label htmlFor="newPassword" className="text-sm font-semibold text-foreground">
					New Password
				</Label>
				<div className="relative">
					<Input
						id="newPassword"
						type={showPasswords.new ? 'text' : 'password'}
						value={formData.newPassword}
						onChange={(e) => updateField('newPassword', e.target.value)}
						placeholder="Enter your new password"
						disabled={isLoading}
						className={`h-12 pr-12 ${errors.newPassword ? 'border-destructive' : ''} floating-element border-0 focus:ring-2 focus:ring-primary/20`}
					/>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
						onClick={() => togglePasswordVisibility('new')}
						disabled={isLoading}
					>
						{showPasswords.new ? (
							<EyeOff className="h-4 w-4 text-muted-foreground" />
						) : (
							<Eye className="h-4 w-4 text-muted-foreground" />
						)}
					</Button>
				</div>
				{formData.newPassword && (
					<div className="space-y-2">
						<div className="flex items-center justify-between text-xs">
							<span className="text-muted-foreground">Password strength</span>
							<span className={passwordStrength.color}>{passwordStrength.label}</span>
						</div>
						<div className="w-full bg-muted rounded-full h-1.5">
							<div
								className={`h-1.5 rounded-full transition-all duration-300 ${
									passwordStrength.label === 'Weak' ? 'bg-red-500' :
									passwordStrength.label === 'Medium' ? 'bg-yellow-500' : 'bg-green-500'
								}`}
								style={{ width: passwordStrength.width }}
							/>
						</div>
					</div>
				)}
				{errors.newPassword && (
					<p className="text-sm text-destructive">{errors.newPassword}</p>
				)}
			</div>

			{/* Confirm Password */}
			<div className="space-y-2">
				<Label htmlFor="confirmPassword" className="text-sm font-semibold text-foreground">
					Confirm New Password
				</Label>
				<div className="relative">
					<Input
						id="confirmPassword"
						type={showPasswords.confirm ? 'text' : 'password'}
						value={formData.confirmPassword}
						onChange={(e) => updateField('confirmPassword', e.target.value)}
						placeholder="Confirm your new password"
						disabled={isLoading}
						className={`h-12 pr-12 ${errors.confirmPassword ? 'border-destructive' : ''} floating-element border-0 focus:ring-2 focus:ring-primary/20`}
					/>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
						onClick={() => togglePasswordVisibility('confirm')}
						disabled={isLoading}
					>
						{showPasswords.confirm ? (
							<EyeOff className="h-4 w-4 text-muted-foreground" />
						) : (
							<Eye className="h-4 w-4 text-muted-foreground" />
						)}
					</Button>
				</div>
				{errors.confirmPassword && (
					<p className="text-sm text-destructive">{errors.confirmPassword}</p>
				)}
			</div>

			{/* Password Requirements */}
			<div className="content-flow p-4 rounded-xl">
				<h4 className="font-medium text-foreground mb-3">Password Requirements</h4>
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
					{[
						{ label: 'At least 8 characters', met: formData.newPassword.length >= 8 },
						{ label: 'One lowercase letter', met: /[a-z]/.test(formData.newPassword) },
						{ label: 'One uppercase letter', met: /[A-Z]/.test(formData.newPassword) },
						{ label: 'One number', met: /\d/.test(formData.newPassword) },
						{ label: 'One special character', met: /[!@#$%^&*(),.?":{}|<>]/.test(formData.newPassword) },
					].map((req, index) => (
						<div key={index} className="flex items-center space-x-2">
							<div className={`w-4 h-4 rounded-full flex items-center justify-center ${
								req.met ? 'bg-green-500' : 'bg-muted'
							}`}>
								{req.met && <Check className="h-2.5 w-2.5 text-white" />}
							</div>
							<span className={req.met ? 'text-green-600' : 'text-muted-foreground'}>
								{req.label}
							</span>
						</div>
					))}
				</div>
			</div>

			{/* Submit Button */}
			<Button 
				type="submit" 
				disabled={isLoading || !isFormValid}
				className="w-full h-12 bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 shadow-sm hover:shadow-md transition-all duration-200 font-semibold"
			>
				{isLoading ? (
					<>
						<div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
						Changing Password...
					</>
				) : (
					<>
						<Lock className="h-4 w-4 mr-2" />
						Change Password
					</>
				)}
			</Button>
		</form>
	)
} 