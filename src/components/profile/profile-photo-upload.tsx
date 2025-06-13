'use client'

import { useState, useRef } from 'react'
import { Camera, Upload, X, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth'
import toast from 'react-hot-toast'
import Image from 'next/image'
import { User } from '@/types/auth'

interface ProfilePhotoUploadProps {
	user: User
}

export function ProfilePhotoUpload({ user }: ProfilePhotoUploadProps) {
	const { updateUserPhoto } = useAuthStore()
	const [isDragging, setIsDragging] = useState(false)
	const [previewUrl, setPreviewUrl] = useState<string | null>(user.photo || null)
	const [isUploading, setIsUploading] = useState(false)
	const fileInputRef = useRef<HTMLInputElement>(null)

	const handleFileSelect = (file: File) => {
		if (!file.type.startsWith('image/')) {
			toast.error('Please select an image file')
			return
		}

		if (file.size > 5 * 1024 * 1024) { // 5MB limit
			toast.error('File size must be less than 5MB')
			return
		}

		const reader = new FileReader()
		reader.onload = (e) => {
			setPreviewUrl(e.target?.result as string)
		}
		reader.readAsDataURL(file)
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

	const handleUpload = async () => {
		if (!previewUrl || previewUrl === user.photo) return

		setIsUploading(true)
		try {
			// Simulate API call - replace with actual upload logic
			await new Promise(resolve => setTimeout(resolve, 2000))
			
			// Update user photo in store
			await updateUserPhoto(previewUrl)
			
			toast.success('Profile photo updated successfully!')
		} catch (error) {
			toast.error('Failed to update profile photo')
			console.error('Photo upload error:', error)
		} finally {
			setIsUploading(false)
		}
	}

	const handleRemove = () => {
		setPreviewUrl(null)
		if (fileInputRef.current) {
			fileInputRef.current.value = ''
		}
	}

	return (
		<div className="space-y-6">
			{/* Current Photo Display */}
			<div className="flex items-center space-x-6">
				<div className="relative">
					<div className="w-24 h-24 rounded-full overflow-hidden floating-element">
						{previewUrl ? (
							<Image
								src={previewUrl}
								alt="Profile"
								width={96}
								height={96}
								className="w-full h-full object-cover"
							/>
						) : (
							<div className="w-full h-full bg-muted flex items-center justify-center">
								<Camera className="h-8 w-8 text-muted-foreground" />
							</div>
						)}
					</div>
					{previewUrl && (
						<Button
							size="sm"
							variant="destructive"
							className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0"
							onClick={handleRemove}
						>
							<X className="h-3 w-3" />
						</Button>
					)}
				</div>
				<div>
					<h3 className="font-semibold text-foreground">Profile Photo</h3>
					<p className="text-sm text-muted-foreground">
						Upload a photo to personalize your profile
					</p>
				</div>
			</div>

			{/* Upload Area */}
			<div
				className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 ${
					isDragging
						? 'border-primary bg-primary/5'
						: 'border-muted hover:border-primary/50'
				}`}
				onDrop={handleDrop}
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
			>
				<div className="space-y-4">
					<div className="floating-element p-4 w-16 h-16 mx-auto">
						<Upload className="h-8 w-8 text-primary" />
					</div>
					<div>
						<h4 className="font-semibold text-foreground">
							Drag and drop your photo here
						</h4>
						<p className="text-sm text-muted-foreground">
							or click to browse files
						</p>
					</div>
					<Button
						variant="outline"
						onClick={() => fileInputRef.current?.click()}
						className="floating-element"
					>
						<Camera className="h-4 w-4 mr-2" />
						Choose Photo
					</Button>
				</div>
			</div>

			{/* File Input */}
			<input
				ref={fileInputRef}
				type="file"
				accept="image/*"
				onChange={handleFileInputChange}
				className="hidden"
			/>

			{/* Upload Actions */}
			{previewUrl && previewUrl !== user.photo && (
				<div className="flex items-center justify-between content-flow p-4 rounded-xl">
					<div>
						<p className="text-sm font-medium text-foreground">
							Ready to update your profile photo?
						</p>
						<p className="text-xs text-muted-foreground">
							Click save to apply changes
						</p>
					</div>
					<Button
						onClick={handleUpload}
						disabled={isUploading}
						className="bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90"
					>
						{isUploading ? (
							<div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
						) : (
							<Check className="h-4 w-4 mr-2" />
						)}
						{isUploading ? 'Uploading...' : 'Save Photo'}
					</Button>
				</div>
			)}

			{/* Guidelines */}
			<div className="content-flow p-4 rounded-xl">
				<h4 className="font-medium text-foreground mb-2">Photo Guidelines</h4>
				<ul className="text-sm text-muted-foreground space-y-1">
					<li>• Use a clear, recent photo of yourself</li>
					<li>• File size should be less than 5MB</li>
					<li>• Supported formats: JPG, PNG, WebP</li>
					<li>• Square photos work best (1:1 aspect ratio)</li>
				</ul>
			</div>
		</div>
	)
} 