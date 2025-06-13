'use client'

import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { CompactProfileSettings } from '@/components/profile/compact-profile-settings'
import { useAuthStore } from '@/stores/auth'
import { Toaster } from 'react-hot-toast'
import { User, Sparkles } from 'lucide-react'

export default function ProfilePage() {
	const { user } = useAuthStore()

	if (!user) {
		return null
	}

	return (
		<DashboardLayout>
			<Toaster position="top-center" />
			
			<div className="min-h-screen fluid-bg">
				<div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
					<CompactProfileSettings user={user} />
				</div>
			</div>
		</DashboardLayout>
	)
} 