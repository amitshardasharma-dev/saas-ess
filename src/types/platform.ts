// src/types/platform.ts

export interface PlatformPlan {
  id: string
  name: string
  slug: string
  max_users: number
  max_storage_mb: number
  modules_allowed: string[]
  price_monthly: number
  price_yearly: number
  is_active: boolean
  sort_order: number
}

export interface TenantSummary {
  id: string
  name: string
  slug: string
  plan: string
  status: string
  max_users: number
  max_storage_mb: number
  user_count: number
  employee_count: number
  created_at: string
  settings: Record<string, unknown>
}

export interface TenantDetail extends TenantSummary {
  modules_enabled: string[]
  bc_enabled: boolean
  bc_api_url: string | null
  bc_company_id: string | null
}

export interface TenantUser {
  id: string
  email: string
  role: string
  is_active: boolean
  is_super_admin: boolean
  employee_name: string | null
  employee_no: string | null
  department: string | null
}

export interface TenantUsage {
  measured_at: string
  user_count: number
  storage_used_mb: number
  active_employees: number
  timesheets_this_month: number
  leave_apps_this_month: number
  documents_count: number
}

export interface PlatformDashboardStats {
  total_tenants: number
  total_users: number
  tenants_by_plan: Record<string, number>
  tenants_by_status: Record<string, number>
  recent_signups: Array<{ id: string; name: string; plan: string; created_at: string }>
  over_limit_tenants: number
}

export interface CreateTenantInput {
  company_name: string
  company_slug: string
  admin_email: string
  admin_password: string
  admin_name: string
  plan_slug: string
  modules_enabled: string[]
}

export interface Announcement {
  id: string
  title: string
  message: string
  type: 'info' | 'warning' | 'critical'
  link_url: string | null
  link_text: string | null
  target_type: 'all' | 'specific_tenants' | 'specific_plans'
  target_ids: string[]
  starts_at: string
  expires_at: string | null
  is_active: boolean
  created_at: string
}
