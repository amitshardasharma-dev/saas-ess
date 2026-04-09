// src/services/platform.ts

import {
  PlatformDashboardStats, TenantSummary, TenantDetail,
  TenantUser, CreateTenantInput, PlatformPlan, TenantUsage,
} from '@/types/platform'

export interface CreatePlanInput {
  name: string
  slug: string
  max_users: number
  max_storage_mb: number
  modules_allowed: string[]
  price_monthly: number
  price_yearly: number
  is_active?: boolean
  sort_order?: number
}

export type UpdatePlanInput = Partial<CreatePlanInput>

const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('ess_access_token') : null
const authHeaders = (): HeadersInit => {
  const token = getToken()
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export const platformService = {
  async getDashboard(): Promise<PlatformDashboardStats> {
    const res = await fetch('/api/platform/dashboard', { headers: authHeaders() })
    if (!res.ok) throw new Error('Failed to fetch dashboard')
    return res.json()
  },

  async getTenants(search?: string, plan?: string, status?: string): Promise<TenantSummary[]> {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (plan) params.set('plan', plan)
    if (status) params.set('status', status)
    const res = await fetch(`/api/platform/tenants?${params}`, { headers: authHeaders() })
    if (!res.ok) throw new Error('Failed to fetch tenants')
    const data = await res.json()
    return data.tenants || []
  },

  async getTenant(id: string): Promise<TenantDetail> {
    const res = await fetch(`/api/platform/tenants/${id}`, { headers: authHeaders() })
    if (!res.ok) throw new Error('Failed to fetch tenant')
    const data = await res.json()
    return data.tenant
  },

  async createTenant(input: CreateTenantInput): Promise<{ tenant: TenantSummary }> {
    const res = await fetch('/api/platform/tenants', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(input),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'Failed to create tenant')
    }
    return res.json()
  },

  async updateTenant(id: string, data: Partial<TenantDetail>): Promise<void> {
    const res = await fetch(`/api/platform/tenants/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error('Failed to update tenant')
  },

  async deleteTenant(id: string): Promise<void> {
    const res = await fetch(`/api/platform/tenants/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    if (!res.ok) throw new Error('Failed to delete tenant')
  },

  async getTenantUsers(id: string): Promise<TenantUser[]> {
    const res = await fetch(`/api/platform/tenants/${id}/users`, { headers: authHeaders() })
    if (!res.ok) return []
    const data = await res.json()
    return data.users || []
  },

  async impersonateTenant(id: string): Promise<{ magic_link: string; email: string }> {
    const res = await fetch(`/api/platform/tenants/${id}/impersonate`, {
      method: 'POST',
      headers: authHeaders(),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'Failed to impersonate')
    }
    return res.json()
  },

  async getPlans(): Promise<PlatformPlan[]> {
    const res = await fetch('/api/platform/plans', { headers: authHeaders() })
    if (!res.ok) return []
    const data = await res.json()
    return data.plans || []
  },

  async createPlan(input: CreatePlanInput): Promise<PlatformPlan> {
    const res = await fetch('/api/platform/plans', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(input),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'Failed to create plan')
    }
    const data = await res.json()
    return data.plan
  },

  async updatePlan(id: string, input: UpdatePlanInput): Promise<PlatformPlan> {
    const res = await fetch(`/api/platform/plans/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(input),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'Failed to update plan')
    }
    const data = await res.json()
    return data.plan
  },

  async deletePlan(id: string): Promise<void> {
    const res = await fetch(`/api/platform/plans/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'Failed to delete plan')
    }
  },

  async collectUsage(): Promise<{ collected: number; errors?: string[] }> {
    const res = await fetch('/api/platform/usage/collect', {
      method: 'POST',
      headers: authHeaders(),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'Failed to collect usage')
    }
    return res.json()
  },

  async getTenantUsage(id: string): Promise<TenantUsage[]> {
    const res = await fetch(`/api/platform/tenants/${id}/usage`, { headers: authHeaders() })
    if (!res.ok) return []
    const data = await res.json()
    return data.usage || []
  },
}
