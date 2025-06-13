'use client'

import { ReactNode } from 'react'
import { Sidebar } from './sidebar'

interface DashboardLayoutProps {
	children: ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
	return (
		<div className="flex h-screen bg-background">
			{/* Sidebar */}
			<Sidebar />
			
			{/* Main Content */}
			<div className="flex-1 flex flex-col overflow-hidden">
				<main className="flex-1 overflow-y-auto">
					{children}
				</main>
			</div>
		</div>
	)
} 