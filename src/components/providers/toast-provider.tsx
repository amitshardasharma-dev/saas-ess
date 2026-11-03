'use client'

import { Toaster } from 'react-hot-toast'

/**
 * The one app-wide toast outlet. Every page calls `toast(...)` from
 * react-hot-toast; without a mounted <Toaster /> those calls render nothing.
 * Pages must NOT mount their own <Toaster /> — a second one shows each toast twice.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
	return (
		<>
			{children}
			<Toaster position="top-center" />
		</>
	)
}
