'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Building, Sparkles } from 'lucide-react'
import { Toaster } from 'react-hot-toast'

import { LoginForm } from '@/components/auth/login-form'
import { useAuthStore } from '@/stores/auth'
import config from '@/config/environment'

export default function LoginPage() {
	const router = useRouter()
	const { isAuthenticated, checkAuth } = useAuthStore()

	useEffect(() => {
		// Check if user is already authenticated
		checkAuth()
	}, [checkAuth])

	useEffect(() => {
		// Redirect to dashboard if already authenticated
		if (isAuthenticated) {
			router.push('/dashboard')
		}
	}, [isAuthenticated, router])

	return (
		<div className="min-h-screen fluid-bg flex items-center justify-center p-4">
			<Toaster position="top-center" />
			
			{/* Animated Background Elements */}
			<div className="absolute inset-0 overflow-hidden pointer-events-none">
				<div className="absolute top-1/4 left-1/4 w-64 h-64 bg-primary/5 rounded-full blur-3xl animate-pulse"></div>
				<div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
			</div>
			
			<div className="relative w-full max-w-md space-y-8">
				{/* Header */}
				<div className="text-center">
					<div className="mx-auto w-20 h-20 flex items-center justify-center floating-element mb-6">
						<Building className="h-10 w-10 text-primary" />
					</div>
					<h1 className="text-4xl font-bold text-foreground mb-3 bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text">
						Welcome Back
					</h1>
					<div className="flex items-center justify-center space-x-2 mb-2">
						<Sparkles className="h-4 w-4 text-primary" />
						<h2 className="text-lg font-semibold text-primary">
							{config.app.name}
						</h2>
						<Sparkles className="h-4 w-4 text-primary" />
					</div>
					<p className="text-sm text-muted-foreground">
						Employee Self Service Portal
					</p>
				</div>

				{/* Login Form */}
				<LoginForm />

				{/* Footer */}
				<div className="text-center">
					<div className="flowing-card p-4">
						<div className="text-xs text-muted-foreground leading-relaxed">
							<div className="font-semibold text-foreground mb-1">ESS System</div>
							<div>
								Powered by{' '}
								<a 
									href="https://ess.mosping.com"
									target="_blank"
									rel="noopener noreferrer"
									className="text-primary hover:text-primary/80 font-medium transition-colors"
								>
									ess.mosping.com
								</a>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
} 