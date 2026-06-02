'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { z } from 'zod'
import { safeToast } from '@/utils/safe-toast'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'

import { useAuthStore } from '@/stores/auth'
import config from '@/config/environment'

const loginSchema = z.object({
	username: z.string().min(1, 'Email is required').email('Enter a valid email'),
	password: z.string().min(1, 'Password is required'),
})

type LoginFormData = z.infer<typeof loginSchema> & {
	rememberMe: boolean
}

export function LoginForm() {
	const router = useRouter()
	const { login, isLoading, error, clearError } = useAuthStore()
	
	const [formData, setFormData] = useState<LoginFormData>({
		username: '',
		password: '',
		rememberMe: false,
	})
	
	const [showPassword, setShowPassword] = useState(false)
	const [errors, setErrors] = useState<Record<string, string>>({})

	const validateForm = (): boolean => {
		try {
			loginSchema.parse({ username: formData.username, password: formData.password })
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
		
		if (!validateForm()) return

		try {
			await login({
				usr: formData.username,
				pwd: formData.password,
				remember_me: formData.rememberMe,
			})
			safeToast.success('Login successful!')
			router.push('/dashboard')
		} catch (err) {
			safeToast.error(err instanceof Error ? err.message : 'Login failed')
		}
	}

	const updateField = (field: keyof LoginFormData, value: string | boolean) => {
		setFormData(prev => ({ ...prev, [field]: value }))
		
		// Clear field error when user starts typing
		if (errors[field]) {
			setErrors(prev => ({ ...prev, [field]: '' }))
		}
		
		// Clear auth error
		if (error) {
			clearError()
		}
	}

	return (
		<div className="flowing-card p-8 hover-lift w-full max-w-md">
			<form onSubmit={handleSubmit} className="space-y-6">
				<div className="space-y-2">
					<Label htmlFor="username" className="text-sm font-semibold text-foreground">
						Email
					</Label>
					<Input
						id="username"
						type="email"
						autoComplete="email"
						value={formData.username}
						onChange={(e) => updateField('username', e.target.value)}
						placeholder="you@company.com"
						disabled={isLoading}
						className={`h-12 ${errors.username ? 'border-destructive' : ''} floating-element border-0 focus:ring-2 focus:ring-primary/20`}
					/>
					{errors.username && (
						<p className="text-sm text-destructive">{errors.username}</p>
					)}
				</div>

				<div className="space-y-2">
					<Label htmlFor="password" className="text-sm font-semibold text-foreground">
						Password
					</Label>
					<div className="relative">
						<Input
							id="password"
							type={showPassword ? 'text' : 'password'}
							value={formData.password}
							onChange={(e) => updateField('password', e.target.value)}
							placeholder="Enter your password"
							disabled={isLoading}
							className={`h-12 pr-12 ${errors.password ? 'border-destructive' : ''} floating-element border-0 focus:ring-2 focus:ring-primary/20`}
						/>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
							onClick={() => setShowPassword(!showPassword)}
							disabled={isLoading}
						>
							{showPassword ? (
								<EyeOff className="h-4 w-4 text-muted-foreground" />
							) : (
								<Eye className="h-4 w-4 text-muted-foreground" />
							)}
						</Button>
					</div>
					{errors.password && (
						<p className="text-sm text-destructive">{errors.password}</p>
					)}
				</div>

				<div className="flex items-center space-x-3">
					<Checkbox
						id="rememberMe"
						checked={formData.rememberMe}
						onCheckedChange={(checked) => updateField('rememberMe', checked === true)}
						disabled={isLoading}
						className="rounded-md"
					/>
					<Label htmlFor="rememberMe" className="text-sm font-normal cursor-pointer text-muted-foreground">
						Remember me for {config.auth.rememberMeDays} days
					</Label>
				</div>

				{error && (
					<div className="content-flow p-4 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl">
						{error}
					</div>
				)}

				<Button 
					type="submit" 
					className="w-full h-12 bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 shadow-sm hover:shadow-md transition-all duration-200 font-semibold" 
					disabled={isLoading}
				>
					{isLoading ? (
						<>
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							Signing in...
						</>
					) : (
						'Sign in to ESS'
					)}
				</Button>
			</form>
		</div>
	)
} 