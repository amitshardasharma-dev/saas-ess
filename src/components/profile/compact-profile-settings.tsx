'use client'

import { useState, useRef, useMemo, useEffect, useCallback } from 'react'
import { Camera, Eye, EyeOff, User as UserIcon, Mail, Building, Briefcase, Shield, Phone } from 'lucide-react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useAuthStore } from '@/stores/auth'
import { User } from '@/types/auth'
import toast from 'react-hot-toast'
import config from '@/config/environment'
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

interface CompactProfileSettingsProps {
	user: User
}

interface EmployeeData {
	id?: string
	mobile_phone_no?: string
	department?: string
	designation?: string
}

export function CompactProfileSettings({ user }: CompactProfileSettingsProps) {
	// State for photo upload
	const [previewUrl, setPreviewUrl] = useState<string | null>(null)
	
	const { updateUserPhoto } = useAuthStore()
	const fileInputRef = useRef<HTMLInputElement>(null)
	
	// Employee data state
	const [employeeData, setEmployeeData] = useState<EmployeeData | null>(null)
	const [isEmployeeLoading, setIsEmployeeLoading] = useState(false)
	const [employeeError, setEmployeeError] = useState<string | null>(null)
	
	// Photo upload state
	const [isPhotoLoading, setIsPhotoLoading] = useState(false)
	const [isDragging, setIsDragging] = useState(false)
	
	// Password change state
	const [passwordData, setPasswordData] = useState<PasswordChangeFormData>({
		currentPassword: '',
		newPassword: '',
		confirmPassword: '',
	})
	const [showPasswords, setShowPasswords] = useState({
		current: false,
		new: false,
		confirm: false,
	})
	const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({})
	const [isPasswordLoading, setIsPasswordLoading] = useState(false)

	// Fetch employee data when component mounts
	useEffect(() => {
		if (user.employee) {
			fetchEmployeeData()
		}
	}, [user.employee])

	const fetchEmployeeData = async () => {
		if (!user.employee) {
			return
		}

		setIsEmployeeLoading(true)
		setEmployeeError(null)

		try {
			const url = `/api/employee/${user.employee}`
			const token = localStorage.getItem('ess_access_token')
			const response = await fetch(url, {
				headers: token ? { Authorization: `Bearer ${token}` } : {},
			})

			if (!response.ok) {
				const errorText = await response.text()
				throw new Error(`Failed to fetch employee data: ${response.status}`)
			}

			const data = await response.json()
			
			setEmployeeData({
				id: data.employee.id,
				mobile_phone_no: data.employee.mobile_phone_no,
				department: data.employee.department,
				designation: data.employee.designation,
			})
		} catch (error) {
			setEmployeeError('Failed to load employee information')
		} finally {
			setIsEmployeeLoading(false)
		}
	}

	// Helper function to convert relative URLs to absolute
	const getAbsoluteImageUrl = (url: string | null | undefined): string | null => {
		if (!url) return null

		// If it's already an absolute URL, return as is
		if (url.startsWith('http://') || url.startsWith('https://')) {
			return url
		}

		// For relative URLs, use the Supabase URL as base
		const baseUrl = config.supabase.url
		if (url.startsWith('/')) {
			return `${baseUrl}${url}`
		}

		return `${baseUrl}/${url}`
	}

	// Update preview URL when user prop changes (e.g., after auth store update)
	useEffect(() => {
		const rawPhotoUrl = user.user_image || user.photo || null
		const absolutePhotoUrl = getAbsoluteImageUrl(rawPhotoUrl)
		
		if (absolutePhotoUrl && absolutePhotoUrl !== previewUrl) {
			setPreviewUrl(absolutePhotoUrl)
		}
	}, [user.photo, user.user_image, previewUrl])

	// Validation
	const isPasswordValid = useMemo(() => {
		try {
			passwordChangeSchema.parse(passwordData)
			return true
		} catch {
			return false
		}
	}, [passwordData])

	// Photo Upload Handlers
	const handleFileSelect = async (file: File) => {
		if (!file.type.startsWith('image/')) {
			toast.error('Please select an image file')
			return
		}

		if (file.size > 5 * 1024 * 1024) {
			toast.error('File size must be less than 5MB')
			return
		}

		// Show preview immediately
		const reader = new FileReader()
		reader.onload = (e) => {
			setPreviewUrl(e.target?.result as string)
		}
		reader.readAsDataURL(file)

		// Auto-upload the file
		await uploadPhoto(file)
	}

	const handleDrop = (e: React.DragEvent) => {
		e.preventDefault()
		setIsDragging(false)
		
		const files = Array.from(e.dataTransfer.files)
		if (files.length > 0) {
			handleFileSelect(files[0])
		}
	}

	const handleDragOver = (e: React.DragEvent) => {
		e.preventDefault()
		setIsDragging(true)
	}

	const handleDragLeave = () => {
		setIsDragging(false)
	}

	const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const files = e.target.files
		if (files && files.length > 0) {
			handleFileSelect(files[0])
		}
	}

	const handleImageClick = () => {
		fileInputRef.current?.click()
	}

	const uploadPhoto = async (file: File) => {
		setIsPhotoLoading(true)
		toast.loading('Uploading photo...', { id: 'photo-upload' })
		
		try {
			const formData = new FormData()
			formData.append('file', file)
			formData.append('is_private', '0')
			formData.append('folder', 'Home')
			
			// Upload file via our API
			const token = localStorage.getItem('ess_access_token')
			const uploadResponse = await fetch('/api/profile/upload-photo', {
				method: 'POST',
				headers: token ? { Authorization: `Bearer ${token}` } : {},
				body: formData,
			})

			if (!uploadResponse.ok) {
				throw new Error('Upload failed')
			}

			const uploadData = await uploadResponse.json()
			const fileUrl = uploadData.photo_url

			if (fileUrl) {
				// Photo URL is already updated in DB by the upload endpoint
				const updateResponse = { ok: true }

				if (!updateResponse.ok) {
					throw new Error('Profile update failed')
				}

				// Update local state
				await updateUserPhoto(fileUrl)
				
				// Force update the preview URL to the new file URL (convert to absolute)
				const absoluteUrl = getAbsoluteImageUrl(fileUrl)
				setPreviewUrl(absoluteUrl)
				
				toast.success('Profile photo updated successfully!', { id: 'photo-upload' })
			} else {
				throw new Error('No file URL returned from upload')
			}
		} catch (error) {
			toast.error('Failed to update profile photo. Please try again.', { id: 'photo-upload' })
		} finally {
			setIsPhotoLoading(false)
		}
	}

	// Password Change Handler
	const handlePasswordChange = async (e: React.FormEvent) => {
		e.preventDefault()
		
		try {
			passwordChangeSchema.parse(passwordData)
			setPasswordErrors({})
		} catch (error) {
			if (error instanceof z.ZodError) {
				const newErrors: Record<string, string> = {}
				error.errors.forEach((err) => {
					if (err.path[0]) {
						newErrors[err.path[0] as string] = err.message
					}
				})
				setPasswordErrors(newErrors)
			}
			return
		}

		setIsPasswordLoading(true)
		try {
			// Change password via our API
			const token = localStorage.getItem('ess_access_token')
			const response = await fetch('/api/profile/change-password', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(token ? { Authorization: `Bearer ${token}` } : {}),
				},
				body: JSON.stringify({
					new_password: passwordData.newPassword,
				}),
			})

			if (!response.ok) {
				throw new Error('Password change failed')
			}

			// Clear form
			setPasswordData({
				currentPassword: '',
				newPassword: '',
				confirmPassword: '',
			})
			
			toast.success('Password changed successfully!')
		} catch (error) {
			toast.error('Failed to change password. Please try again.')
		} finally {
			setIsPasswordLoading(false)
		}
	}

	// Helper functions
	const updatePasswordField = (field: keyof PasswordChangeFormData, value: string) => {
		setPasswordData(prev => ({ ...prev, [field]: value }))
		// Clear error when user starts typing
		if (passwordErrors[field]) {
			setPasswordErrors(prev => ({ ...prev, [field]: '' }))
		}
	}

	const togglePasswordVisibility = (field: 'current' | 'new' | 'confirm') => {
		setShowPasswords(prev => ({ ...prev, [field]: !prev[field] }))
	}

	const getPasswordStrength = (password: string) => {
		let strength = 0
		if (password.length >= 8) strength++
		if (/[A-Z]/.test(password)) strength++
		if (/[a-z]/.test(password)) strength++
		if (/[0-9]/.test(password)) strength++
		if (/[^A-Za-z0-9]/.test(password)) strength++
		return strength
	}

	return (
		<div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
			<div className="max-w-4xl mx-auto px-4 py-6">
				{/* Profile Information Card */}
				<Card className="mb-6 bg-white/80 backdrop-blur-sm border-0 shadow-lg">
					<CardHeader className="pb-4">
						<CardTitle className="flex items-center gap-2 text-lg">
							<UserIcon className="h-5 w-5 text-primary" />
							Profile Information
						</CardTitle>
						<CardDescription className="text-sm">
							Your account details and information
						</CardDescription>
					</CardHeader>
					<CardContent className="pt-0">
						<div className="flex flex-col lg:flex-row gap-6">
							{/* Profile Image Section - Smaller */}
							<div className="flex flex-col items-center lg:items-start space-y-3">
								<div className="relative group">
									<div 
										className="relative w-32 h-32 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 border-2 border-primary/20 overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-lg hover:scale-105"
										onClick={handleImageClick}
										onDrop={handleDrop}
										onDragOver={handleDragOver}
										onDragLeave={handleDragLeave}
									>
										{previewUrl ? (
											<>
												<img
													src={previewUrl}
													alt="Profile"
													className="w-full h-full object-cover"
													onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
														// Show fallback and hide image
														const target = e.target as HTMLImageElement
														target.style.display = 'none'
														const fallback = target.nextElementSibling as HTMLElement
														if (fallback) fallback.style.display = 'flex'
													}}
													onLoad={(e: React.SyntheticEvent<HTMLImageElement>) => {
														// Hide fallback if image loads
														const target = e.target as HTMLImageElement
														const fallback = target.nextElementSibling as HTMLElement
														if (fallback) fallback.style.display = 'none'
													}}
												/>
												<div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center" style={{ display: 'none' }}>
													<div className="text-center">
														<div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-1">
															<UserIcon className="h-4 w-4 text-primary" />
														</div>
														<span className="text-xs font-medium text-primary">No Image</span>
													</div>
												</div>
											</>
										) : (
											<div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
												<div className="text-center">
													<div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-1">
														<UserIcon className="h-4 w-4 text-primary" />
													</div>
													<span className="text-xs font-medium text-primary">No Image</span>
												</div>
											</div>
										)}
										
										{/* Upload Overlay */}
										<div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
											<div className="text-center text-white">
												<Camera className="h-5 w-5 mx-auto mb-1" />
												<span className="text-xs font-medium">Upload</span>
											</div>
										</div>
										
										{/* Drag overlay */}
										{isDragging && (
											<div className="absolute inset-0 bg-primary/20 border-2 border-dashed border-primary flex items-center justify-center">
												<div className="text-center text-primary">
													<Camera className="h-5 w-5 mx-auto mb-1" />
													<span className="text-xs font-medium">Drop here</span>
												</div>
											</div>
										)}
									</div>
									
									{/* Loading indicator */}
									{isPhotoLoading && (
										<div className="absolute inset-0 bg-white/80 rounded-2xl flex items-center justify-center">
											<div className="flex items-center gap-2 text-sm text-primary">
												<div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
												Uploading...
											</div>
										</div>
									)}
								</div>
								
								<input
									ref={fileInputRef}
									type="file"
									accept="image/*"
									onChange={handleFileInputChange}
									className="hidden"
								/>
							</div>

							{/* Information Grid - More Compact */}
							<div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
								{/* Full Name */}
								<div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
									<div className="flex items-center gap-3">
										<div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
											<UserIcon className="h-4 w-4 text-blue-600" />
										</div>
										<div className="flex-1 min-w-0">
											<p className="text-xs font-medium text-gray-500 uppercase tracking-wide">FULL NAME</p>
											<p className="text-sm font-semibold text-gray-900 truncate">{user.full_name}</p>
										</div>
									</div>
								</div>

								{/* Email */}
								<div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
									<div className="flex items-center gap-3">
										<div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
											<Mail className="h-4 w-4 text-primary" />
										</div>
										<div className="flex-1 min-w-0">
											<p className="text-xs font-medium text-gray-500 uppercase tracking-wide">EMAIL ADDRESS</p>
											<p className="text-sm font-semibold text-gray-900 truncate">{user.email}</p>
											<p className="text-xs text-gray-500">Primary email address</p>
										</div>
									</div>
								</div>

								{/* Department */}
								<div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
									<div className="flex items-center gap-3">
										<div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
											<Building className="h-4 w-4 text-blue-600" />
										</div>
										<div className="flex-1 min-w-0">
											<p className="text-xs font-medium text-gray-500 uppercase tracking-wide">DEPARTMENT</p>
											{isEmployeeLoading ? (
												<div className="h-4 bg-gray-200 rounded animate-pulse"></div>
											) : employeeError ? (
												<div className="flex items-center gap-2">
													<p className="text-sm text-gray-500">Not specified</p>
													<button 
														onClick={fetchEmployeeData}
														className="text-xs text-primary hover:text-primary/80 font-medium"
													>
														Retry
													</button>
												</div>
											) : (
												<>
													<p className="text-sm font-semibold text-gray-900">
														{employeeData?.department || 'Not specified'}
													</p>
													<p className="text-xs text-gray-500">Work department</p>
												</>
											)}
										</div>
									</div>
								</div>

								{/* Designation */}
								<div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
									<div className="flex items-center gap-3">
										<div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
											<Briefcase className="h-4 w-4 text-purple-600" />
										</div>
										<div className="flex-1 min-w-0">
											<p className="text-xs font-medium text-gray-500 uppercase tracking-wide">DESIGNATION</p>
											{isEmployeeLoading ? (
												<div className="h-4 bg-gray-200 rounded animate-pulse"></div>
											) : employeeError ? (
												<div className="flex items-center gap-2">
													<p className="text-sm text-gray-500">Not specified</p>
													<button 
														onClick={fetchEmployeeData}
														className="text-xs text-primary hover:text-primary/80 font-medium"
													>
														Retry
													</button>
												</div>
											) : (
												<>
													<p className="text-sm font-semibold text-gray-900">
														{employeeData?.designation || 'Employee'}
													</p>
													<p className="text-xs text-gray-500">Job title</p>
												</>
											)}
										</div>
									</div>
								</div>

								{/* Mobile Phone */}
								<div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
									<div className="flex items-center gap-3">
										<div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
											<Phone className="h-4 w-4 text-green-600" />
										</div>
										<div className="flex-1 min-w-0">
											<p className="text-xs font-medium text-gray-500 uppercase tracking-wide">MOBILE PHONE</p>
											{isEmployeeLoading ? (
												<div className="h-4 bg-gray-200 rounded animate-pulse"></div>
											) : employeeError ? (
												<div className="flex items-center gap-2">
													<p className="text-sm text-gray-500">Not specified</p>
													<button 
														onClick={fetchEmployeeData}
														className="text-xs text-primary hover:text-primary/80 font-medium"
													>
														Retry
													</button>
												</div>
											) : (
												<>
													<p className="text-sm font-semibold text-gray-900">
														{employeeData?.mobile_phone_no || 'Not specified'}
													</p>
													<p className="text-xs text-gray-500">Mobile phone number</p>
												</>
											)}
										</div>
									</div>
								</div>

								{/* Employee ID */}
								<div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
									<div className="flex items-center gap-3">
										<div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
											<UserIcon className="h-4 w-4 text-orange-600" />
										</div>
										<div className="flex-1 min-w-0">
											<p className="text-xs font-medium text-gray-500 uppercase tracking-wide">EMPLOYEE ID</p>
											{isEmployeeLoading ? (
												<div className="h-4 bg-gray-200 rounded animate-pulse"></div>
											) : employeeError ? (
												<div className="flex items-center gap-2">
													<p className="text-sm text-gray-500">{user.employee || 'Not specified'}</p>
													<button 
														onClick={fetchEmployeeData}
														className="text-xs text-primary hover:text-primary/80 font-medium"
													>
														Retry
													</button>
												</div>
											) : (
												<>
													<p className="text-sm font-semibold text-gray-900">
														{employeeData?.id || user.employee || 'Not specified'}
													</p>
													<p className="text-xs text-gray-500">Unique identifier</p>
												</>
											)}
										</div>
									</div>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Password Change Card */}
				<Card className="border-0 shadow-lg bg-gradient-to-br from-white to-gray-50/50">
					<CardHeader className="pb-6 text-center">
						<CardTitle className="flex items-center justify-center gap-3 text-2xl font-bold">
							<Shield className="h-6 w-6 text-primary" />
							Security Settings
						</CardTitle>
						<p className="text-muted-foreground mt-2">Update your password to keep your account secure</p>
					</CardHeader>
					<CardContent className="p-8">
						<div className="max-w-2xl mx-auto">
							<form onSubmit={handlePasswordChange} className="space-y-6">
								<div className="space-y-3">
									<Label htmlFor="currentPassword" className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Current Password</Label>
									<div className="relative">
										<Input
											id="currentPassword"
											type={showPasswords.current ? 'text' : 'password'}
											value={passwordData.currentPassword}
											onChange={(e) => updatePasswordField('currentPassword', e.target.value)}
											disabled={isPasswordLoading}
											className={`pr-12 h-12 text-lg border-2 transition-all focus:border-primary ${passwordErrors.currentPassword ? 'border-destructive' : 'border-gray-200'}`}
											placeholder="Enter your current password"
										/>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											className="absolute right-0 top-0 h-full px-4 hover:bg-transparent"
											onClick={() => togglePasswordVisibility('current')}
										>
											{showPasswords.current ? <EyeOff className="h-5 w-5 text-muted-foreground" /> : <Eye className="h-5 w-5 text-muted-foreground" />}
										</Button>
									</div>
									{passwordErrors.currentPassword && (
										<p className="text-sm text-destructive font-medium">{passwordErrors.currentPassword}</p>
									)}
								</div>

								<div className="space-y-3">
									<Label htmlFor="newPassword" className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">New Password</Label>
									<div className="relative">
										<Input
											id="newPassword"
											type={showPasswords.new ? 'text' : 'password'}
											value={passwordData.newPassword}
											onChange={(e) => updatePasswordField('newPassword', e.target.value)}
											disabled={isPasswordLoading}
											className={`pr-12 h-12 text-lg border-2 transition-all focus:border-primary ${passwordErrors.newPassword ? 'border-destructive' : 'border-gray-200'}`}
											placeholder="Enter your new password"
										/>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											className="absolute right-0 top-0 h-full px-4 hover:bg-transparent"
											onClick={() => togglePasswordVisibility('new')}
										>
											{showPasswords.new ? <EyeOff className="h-5 w-5 text-muted-foreground" /> : <Eye className="h-5 w-5 text-muted-foreground" />}
										</Button>
									</div>
									{passwordData.newPassword && (
										<div className="space-y-2">
											<div className="flex gap-1">
												{[...Array(5)].map((_, i) => (
													<div
														key={i}
														className={`h-2 flex-1 rounded-full transition-all ${
															i < getPasswordStrength(passwordData.newPassword)
																? i < 2 ? 'bg-red-500' : i < 4 ? 'bg-yellow-500' : 'bg-green-500'
																: 'bg-gray-200'
														}`}
													/>
												))}
											</div>
											<p className="text-sm font-medium text-muted-foreground">
												Password strength: {
													getPasswordStrength(passwordData.newPassword) < 2 ? 'Weak' :
													getPasswordStrength(passwordData.newPassword) < 4 ? 'Medium' : 'Strong'
												}
											</p>
										</div>
									)}
									{passwordErrors.newPassword && (
										<p className="text-sm text-destructive font-medium">{passwordErrors.newPassword}</p>
									)}
								</div>

								<div className="space-y-3">
									<Label htmlFor="confirmPassword" className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Confirm New Password</Label>
									<div className="relative">
										<Input
											id="confirmPassword"
											type={showPasswords.confirm ? 'text' : 'password'}
											value={passwordData.confirmPassword}
											onChange={(e) => updatePasswordField('confirmPassword', e.target.value)}
											disabled={isPasswordLoading}
											className={`pr-12 h-12 text-lg border-2 transition-all focus:border-primary ${passwordErrors.confirmPassword ? 'border-destructive' : 'border-gray-200'}`}
											placeholder="Confirm your new password"
										/>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											className="absolute right-0 top-0 h-full px-4 hover:bg-transparent"
											onClick={() => togglePasswordVisibility('confirm')}
										>
											{showPasswords.confirm ? <EyeOff className="h-5 w-5 text-muted-foreground" /> : <Eye className="h-5 w-5 text-muted-foreground" />}
										</Button>
									</div>
									{passwordErrors.confirmPassword && (
										<p className="text-sm text-destructive font-medium">{passwordErrors.confirmPassword}</p>
									)}
								</div>

								<div className="pt-4">
									<Button
										type="submit"
										disabled={isPasswordLoading || !isPasswordValid}
										className="w-full h-12 text-lg font-semibold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 transition-all"
									>
										{isPasswordLoading ? (
											<>
												<div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3" />
												Changing Password...
											</>
										) : (
											<>
												<Shield className="h-5 w-5 mr-3" />
												Change Password
											</>
										)}
									</Button>
								</div>
							</form>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	)
} 