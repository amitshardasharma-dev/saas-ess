// src/services/announcement.ts

import { Announcement } from '@/types/platform'

const getToken = () =>
  typeof window !== 'undefined' ? localStorage.getItem('ess_access_token') : null

const authHeaders = (): HeadersInit => {
  const token = getToken()
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export const announcementService = {
  async getActive(): Promise<Announcement[]> {
    const res = await fetch('/api/announcements/active', { headers: authHeaders() })
    if (!res.ok) return []
    const data = await res.json()
    return data.announcements || []
  },

  async dismiss(id: string): Promise<void> {
    const res = await fetch(`/api/announcements/${id}/dismiss`, {
      method: 'POST',
      headers: authHeaders(),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Failed to dismiss announcement')
    }
  },
}
