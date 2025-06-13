'use client'

import { ReactNode } from 'react'
import { FrappeProvider } from 'frappe-react-sdk'

interface AppFrappeProviderProps {
	children: ReactNode
}

export function AppFrappeProvider({ children }: AppFrappeProviderProps) {
	// Get Frappe URL from environment or default to localhost
	const frappeUrl = process.env.NEXT_PUBLIC_FRAPPE_URL || 'http://localhost:8000'
	
	console.log('Frappe URL:', frappeUrl)
	
	return (
		<FrappeProvider
			url={frappeUrl}
			tokenParams={{
				type: 'token',
				useToken: true
			}}
			socketPort={frappeUrl.includes(':8000') ? '8000' : undefined}
			enableSocket={false} // Disable socket.io for now to avoid connection errors
		>
			{children}
		</FrappeProvider>
	)
} 