'use client'

import { Toaster } from 'react-hot-toast'
import { ProfileSettings } from '@/components/profile/profile-settings'

export default function ProfilePage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <Toaster position="top-center" />
      <div>
        <h1 className="text-2xl font-semibold text-foreground">My Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your details, emergency contact, photo, and password.
        </p>
      </div>
      <ProfileSettings />
    </div>
  )
}
