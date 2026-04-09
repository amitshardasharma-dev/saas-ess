# Super Admin Platform Core — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the platform admin foundation — super admin auth, tenant CRUD with full onboarding wizard, impersonation, and a dedicated platform UI with dashboard and tenant management.

**Architecture:** New `withSuperAdmin` middleware wrapping existing `withAuth`. Dedicated `/platform` route group with its own layout/sidebar. Tenant creation API handles full onboarding (company + auth user + app user + employee + defaults) in one call. Impersonation via Supabase magic links.

**Tech Stack:** Next.js 15 App Router, Supabase PostgreSQL + Auth Admin API, TypeScript, Tailwind CSS, shadcn/ui

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/lib/super-admin-middleware.ts` | `withSuperAdmin` wrapper |
| Create | `src/types/platform.ts` | Platform type definitions |
| Create | `src/app/api/platform/dashboard/route.ts` | Platform dashboard stats |
| Create | `src/app/api/platform/tenants/route.ts` | List/create tenants |
| Create | `src/app/api/platform/tenants/[id]/route.ts` | Tenant detail/update/delete |
| Create | `src/app/api/platform/tenants/[id]/users/route.ts` | List tenant users |
| Create | `src/app/api/platform/tenants/[id]/impersonate/route.ts` | Generate impersonation link |
| Create | `src/services/platform.ts` | Client-side platform service |
| Create | `src/components/platform/platform-layout.tsx` | Platform sidebar + layout |
| Create | `src/components/platform/tenant-create-wizard.tsx` | Multi-step tenant creation form |
| Create | `src/app/platform/page.tsx` | Platform dashboard page |
| Create | `src/app/platform/tenants/page.tsx` | Tenant list page |
| Create | `src/app/platform/tenants/[id]/page.tsx` | Tenant detail page |
| Create | `src/app/platform/layout.tsx` | Platform route group layout |
| Create | `supabase/migrations/005_platform.sql` | DB migration |
| Modify | `src/components/layout/sidebar.tsx` | Add "Platform Admin" link for super admins |

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/005_platform.sql`

- [ ] **Step 1: Create migration file**

```sql
-- Add columns to ess_companies
ALTER TABLE ess_companies ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';
ALTER TABLE ess_companies ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE ess_companies ADD COLUMN IF NOT EXISTS max_users INTEGER NOT NULL DEFAULT 10;
ALTER TABLE ess_companies ADD COLUMN IF NOT EXISTS max_storage_mb INTEGER NOT NULL DEFAULT 500;

-- Platform plans
CREATE TABLE IF NOT EXISTS ess_platform_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  max_users INTEGER NOT NULL DEFAULT 10,
  max_storage_mb INTEGER NOT NULL DEFAULT 500,
  modules_allowed JSONB NOT NULL DEFAULT '["leave","expense"]'::jsonb,
  price_monthly NUMERIC(10,2) NOT NULL DEFAULT 0,
  price_yearly NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tenant usage tracking
CREATE TABLE IF NOT EXISTS ess_tenant_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES ess_companies(id) ON DELETE CASCADE,
  measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_count INTEGER NOT NULL DEFAULT 0,
  storage_used_mb INTEGER NOT NULL DEFAULT 0,
  active_employees INTEGER NOT NULL DEFAULT 0,
  timesheets_this_month INTEGER NOT NULL DEFAULT 0,
  leave_apps_this_month INTEGER NOT NULL DEFAULT 0,
  documents_count INTEGER NOT NULL DEFAULT 0
);

-- Announcements
CREATE TABLE IF NOT EXISTS ess_announcements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info','warning','critical')),
  link_url TEXT,
  link_text TEXT,
  target_type TEXT NOT NULL DEFAULT 'all' CHECK (target_type IN ('all','specific_tenants','specific_plans')),
  target_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES ess_employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Announcement dismissals
CREATE TABLE IF NOT EXISTS ess_announcement_dismissals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  announcement_id UUID NOT NULL REFERENCES ess_announcements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  dismissed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(announcement_id, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tenant_usage_company ON ess_tenant_usage(company_id);
CREATE INDEX IF NOT EXISTS idx_tenant_usage_date ON ess_tenant_usage(measured_at);
CREATE INDEX IF NOT EXISTS idx_announcements_active ON ess_announcements(is_active, starts_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_announcement_dismissals ON ess_announcement_dismissals(announcement_id, user_id);

-- RLS
ALTER TABLE ess_platform_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_tenant_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_announcement_dismissals ENABLE ROW LEVEL SECURITY;

-- Seed default plans
INSERT INTO ess_platform_plans (name, slug, max_users, max_storage_mb, modules_allowed, price_monthly, price_yearly, sort_order) VALUES
  ('Free', 'free', 5, 100, '["leave","expense"]', 0, 0, 0),
  ('Starter', 'starter', 25, 500, '["leave","expense","timesheets","documents"]', 29, 290, 1),
  ('Professional', 'professional', 100, 2000, '["leave","expense","timesheets","documents","appraisals","contracts","team_calendar"]', 79, 790, 2),
  ('Enterprise', 'enterprise', 999, 10000, '["leave","expense","timesheets","documents","appraisals","contracts","team_calendar"]', 199, 1990, 3)
ON CONFLICT (slug) DO NOTHING;
```

- [ ] **Step 2: Apply via Supabase MCP or commit file**

```bash
mkdir -p supabase/migrations
git add -f supabase/migrations/005_platform.sql
git commit -m "feat: add platform admin database migration"
```

---

### Task 2: Platform Types

**Files:**
- Create: `src/types/platform.ts`

- [ ] **Step 1: Create type definitions**

```typescript
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
  settings: Record<string, any>
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
```

- [ ] **Step 2: Commit**

```bash
git add src/types/platform.ts
git commit -m "feat: add platform type definitions"
```

---

### Task 3: Super Admin Middleware

**Files:**
- Create: `src/lib/super-admin-middleware.ts`

- [ ] **Step 1: Create middleware**

```typescript
// src/lib/super-admin-middleware.ts

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { AuthContext, withAuth } from '@/lib/auth-middleware'

type SuperAdminHandler = (
  request: NextRequest,
  context: AuthContext,
  params?: Record<string, string>
) => Promise<NextResponse>

/**
 * Wraps an API route with super admin authentication.
 * Requires the user to have is_super_admin = true on their app_users record.
 */
export function withSuperAdmin(handler: SuperAdminHandler) {
  return withAuth(async (request, context, params) => {
    // Check is_super_admin flag
    const { data: appUser } = await supabaseAdmin
      .from('ess_app_users')
      .select('is_super_admin')
      .eq('id', context.appUser.id)
      .single()

    if (!appUser?.is_super_admin) {
      return NextResponse.json(
        { error: 'Super admin access required' },
        { status: 403 }
      )
    }

    return handler(request, context, params)
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/super-admin-middleware.ts
git commit -m "feat: add withSuperAdmin middleware"
```

---

### Task 4: Platform Dashboard API

**Files:**
- Create: `src/app/api/platform/dashboard/route.ts`

- [ ] **Step 1: Create dashboard stats endpoint**

```typescript
// src/app/api/platform/dashboard/route.ts

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withSuperAdmin } from '@/lib/super-admin-middleware'

export const GET = withSuperAdmin(async () => {
  // Total tenants
  const { data: companies } = await supabaseAdmin
    .from('ess_companies')
    .select('id, name, plan, status, max_users, created_at')
    .order('created_at', { ascending: false })

  const allCompanies = companies || []

  // Total users
  const { count: totalUsers } = await supabaseAdmin
    .from('ess_app_users')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)

  // Tenants by plan
  const tenantsByPlan: Record<string, number> = {}
  const tenantsByStatus: Record<string, number> = {}
  for (const c of allCompanies) {
    tenantsByPlan[c.plan] = (tenantsByPlan[c.plan] || 0) + 1
    tenantsByStatus[c.status] = (tenantsByStatus[c.status] || 0) + 1
  }

  // User counts per company for over-limit check
  const { data: userCounts } = await supabaseAdmin
    .from('ess_app_users')
    .select('company_id')
    .eq('is_active', true)

  const usersPerCompany: Record<string, number> = {}
  for (const u of userCounts || []) {
    usersPerCompany[u.company_id] = (usersPerCompany[u.company_id] || 0) + 1
  }

  let overLimitTenants = 0
  for (const c of allCompanies) {
    if ((usersPerCompany[c.id] || 0) > c.max_users) {
      overLimitTenants++
    }
  }

  // Recent signups (last 10)
  const recentSignups = allCompanies.slice(0, 10).map(c => ({
    id: c.id,
    name: c.name,
    plan: c.plan,
    created_at: c.created_at,
  }))

  return NextResponse.json({
    total_tenants: allCompanies.length,
    total_users: totalUsers || 0,
    tenants_by_plan: tenantsByPlan,
    tenants_by_status: tenantsByStatus,
    recent_signups: recentSignups,
    over_limit_tenants: overLimitTenants,
  })
})
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/platform/dashboard/route.ts
git commit -m "feat: add platform dashboard API"
```

---

### Task 5: Tenants List/Create API

**Files:**
- Create: `src/app/api/platform/tenants/route.ts`

- [ ] **Step 1: Create tenants list and create endpoint**

```typescript
// src/app/api/platform/tenants/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withSuperAdmin } from '@/lib/super-admin-middleware'

export const GET = withSuperAdmin(async (request) => {
  const url = new URL(request.url)
  const search = url.searchParams.get('search') || ''
  const plan = url.searchParams.get('plan') || ''
  const status = url.searchParams.get('status') || ''

  let query = supabaseAdmin
    .from('ess_companies')
    .select('*')
    .order('created_at', { ascending: false })

  if (search) {
    query = query.or(`name.ilike.%${search}%,slug.ilike.%${search}%`)
  }
  if (plan) {
    query = query.eq('plan', plan)
  }
  if (status) {
    query = query.eq('status', status)
  }

  const { data: companies, error } = await query
  if (error) throw error

  // Get user counts per company
  const { data: userCounts } = await supabaseAdmin
    .from('ess_app_users')
    .select('company_id')
    .eq('is_active', true)

  const usersPerCompany: Record<string, number> = {}
  for (const u of userCounts || []) {
    usersPerCompany[u.company_id] = (usersPerCompany[u.company_id] || 0) + 1
  }

  // Get employee counts per company
  const { data: empCounts } = await supabaseAdmin
    .from('ess_employees')
    .select('company_id')
    .eq('status', 'Active')

  const empsPerCompany: Record<string, number> = {}
  for (const e of empCounts || []) {
    empsPerCompany[e.company_id] = (empsPerCompany[e.company_id] || 0) + 1
  }

  const tenants = (companies || []).map(c => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    plan: c.plan,
    status: c.status,
    max_users: c.max_users,
    max_storage_mb: c.max_storage_mb,
    user_count: usersPerCompany[c.id] || 0,
    employee_count: empsPerCompany[c.id] || 0,
    created_at: c.created_at,
    settings: c.settings || {},
  }))

  return NextResponse.json({ tenants })
})

export const POST = withSuperAdmin(async (request) => {
  const body = await request.json()
  const {
    company_name, company_slug, admin_email, admin_password,
    admin_name, plan_slug, modules_enabled,
  } = body

  if (!company_name || !company_slug || !admin_email || !admin_password || !admin_name) {
    return NextResponse.json({ error: 'All fields are required' }, { status: 400 })
  }

  // Check slug is unique
  const { data: existing } = await supabaseAdmin
    .from('ess_companies')
    .select('id')
    .eq('slug', company_slug)
    .single()

  if (existing) {
    return NextResponse.json({ error: 'Company slug already exists' }, { status: 409 })
  }

  // Get plan details
  const { data: plan } = await supabaseAdmin
    .from('ess_platform_plans')
    .select('*')
    .eq('slug', plan_slug || 'free')
    .single()

  // 1. Create company
  const { data: company, error: companyError } = await supabaseAdmin
    .from('ess_companies')
    .insert({
      name: company_name,
      slug: company_slug,
      plan: plan_slug || 'free',
      status: 'active',
      max_users: plan?.max_users || 10,
      max_storage_mb: plan?.max_storage_mb || 500,
      settings: {
        modules_enabled: modules_enabled || plan?.modules_allowed || ['leave', 'expense'],
      },
    })
    .select()
    .single()

  if (companyError) {
    return NextResponse.json({ error: `Failed to create company: ${companyError.message}` }, { status: 500 })
  }

  // 2. Create auth user
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: admin_email,
    password: admin_password,
    email_confirm: true,
  })

  if (authError || !authData.user) {
    // Rollback company
    await supabaseAdmin.from('ess_companies').delete().eq('id', company.id)
    return NextResponse.json({ error: `Failed to create auth user: ${authError?.message}` }, { status: 500 })
  }

  // 3. Create app user
  const { data: appUser, error: appUserError } = await supabaseAdmin
    .from('ess_app_users')
    .insert({
      auth_user_id: authData.user.id,
      company_id: company.id,
      role: 'admin',
      is_active: true,
    })
    .select()
    .single()

  if (appUserError) {
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
    await supabaseAdmin.from('ess_companies').delete().eq('id', company.id)
    return NextResponse.json({ error: `Failed to create app user: ${appUserError.message}` }, { status: 500 })
  }

  // 4. Create employee record
  const { error: empError } = await supabaseAdmin
    .from('ess_employees')
    .insert({
      app_user_id: appUser.id,
      company_id: company.id,
      email: admin_email,
      full_name: admin_name,
      employee_no: `${company_slug.toUpperCase().slice(0, 4)}001`,
      department: 'Management',
      designation: 'Administrator',
      status: 'Active',
      is_approver: true,
      leave_approval_enabled: 1,
      expense_approval_enabled: 1,
    })

  if (empError) {
    console.error('Employee creation error:', empError)
    // Non-fatal — company and user still created
  }

  // 5. Create default leave types
  const defaultLeaveTypes = [
    { company_id: company.id, name: 'Annual Leave', code: 'AL', eligible_days: 20 },
    { company_id: company.id, name: 'Sick Leave', code: 'SL', eligible_days: 10 },
    { company_id: company.id, name: 'Personal Leave', code: 'PL', eligible_days: 5 },
  ]
  await supabaseAdmin.from('ess_leave_types').insert(defaultLeaveTypes)

  // 6. Create default approval rules
  const defaultRules = [
    { company_id: company.id, rule_type: 'leave', level_no: 1, approver_type: 'reporting_manager', is_active: true },
    { company_id: company.id, rule_type: 'expense', level_no: 1, approver_type: 'reporting_manager', is_active: true },
    { company_id: company.id, rule_type: 'timesheet', level_no: 1, approver_type: 'reporting_manager', is_active: true },
  ]
  await supabaseAdmin.from('ess_approval_rules').insert(defaultRules)

  return NextResponse.json({
    message: 'Tenant created successfully',
    tenant: {
      id: company.id,
      name: company.name,
      slug: company.slug,
      plan: company.plan,
      admin_email,
    },
  })
})
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/platform/tenants/route.ts
git commit -m "feat: add tenants list and create API with full onboarding"
```

---

### Task 6: Tenant Detail/Update/Delete + Users + Impersonate APIs

**Files:**
- Create: `src/app/api/platform/tenants/[id]/route.ts`
- Create: `src/app/api/platform/tenants/[id]/users/route.ts`
- Create: `src/app/api/platform/tenants/[id]/impersonate/route.ts`

- [ ] **Step 1: Create tenant detail endpoint**

```typescript
// src/app/api/platform/tenants/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withSuperAdmin } from '@/lib/super-admin-middleware'

export const GET = withSuperAdmin(async (_request, _ctx, params) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const { data: company, error } = await supabaseAdmin
    .from('ess_companies')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !company) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  }

  // User count
  const { count: userCount } = await supabaseAdmin
    .from('ess_app_users')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', id)
    .eq('is_active', true)

  // Employee count
  const { count: empCount } = await supabaseAdmin
    .from('ess_employees')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', id)
    .eq('status', 'Active')

  const settings = company.settings || {}
  return NextResponse.json({
    tenant: {
      id: company.id,
      name: company.name,
      slug: company.slug,
      plan: company.plan,
      status: company.status,
      max_users: company.max_users,
      max_storage_mb: company.max_storage_mb,
      user_count: userCount || 0,
      employee_count: empCount || 0,
      modules_enabled: settings.modules_enabled || ['leave', 'expense'],
      bc_enabled: company.bc_enabled || false,
      bc_api_url: company.bc_api_url || null,
      bc_company_id: company.bc_company_id || null,
      created_at: company.created_at,
      settings,
    },
  })
})

export const PUT = withSuperAdmin(async (request, _ctx, params) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const body = await request.json()
  const updates: Record<string, any> = {}

  if (body.plan !== undefined) updates.plan = body.plan
  if (body.status !== undefined) updates.status = body.status
  if (body.max_users !== undefined) updates.max_users = body.max_users
  if (body.max_storage_mb !== undefined) updates.max_storage_mb = body.max_storage_mb
  if (body.name !== undefined) updates.name = body.name

  // Handle modules_enabled in settings
  if (body.modules_enabled !== undefined) {
    const { data: current } = await supabaseAdmin
      .from('ess_companies')
      .select('settings')
      .eq('id', id)
      .single()

    updates.settings = { ...(current?.settings || {}), modules_enabled: body.modules_enabled }
  }

  const { error } = await supabaseAdmin
    .from('ess_companies')
    .update(updates)
    .eq('id', id)

  if (error) throw error
  return NextResponse.json({ message: 'Tenant updated' })
})

export const DELETE = withSuperAdmin(async (_request, _ctx, params) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  // Soft delete — set status to cancelled
  const { error } = await supabaseAdmin
    .from('ess_companies')
    .update({ status: 'cancelled' })
    .eq('id', id)

  if (error) throw error
  return NextResponse.json({ message: 'Tenant cancelled' })
})
```

- [ ] **Step 2: Create tenant users endpoint**

```typescript
// src/app/api/platform/tenants/[id]/users/route.ts

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withSuperAdmin } from '@/lib/super-admin-middleware'

export const GET = withSuperAdmin(async (_request, _ctx, params) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const { data: appUsers, error } = await supabaseAdmin
    .from('ess_app_users')
    .select(`
      id, role, is_active, is_super_admin, auth_user_id,
      ess_employees (full_name, employee_no, department, email)
    `)
    .eq('company_id', id)

  if (error) throw error

  // Get auth emails
  const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers()
  const emailMap = new Map((authUsers?.users || []).map(u => [u.id, u.email]))

  const users = (appUsers || []).map((u: any) => ({
    id: u.id,
    email: emailMap.get(u.auth_user_id) || u.ess_employees?.email || 'Unknown',
    role: u.role,
    is_active: u.is_active,
    is_super_admin: u.is_super_admin,
    employee_name: u.ess_employees?.full_name || null,
    employee_no: u.ess_employees?.employee_no || null,
    department: u.ess_employees?.department || null,
  }))

  return NextResponse.json({ users })
})
```

- [ ] **Step 3: Create impersonate endpoint**

```typescript
// src/app/api/platform/tenants/[id]/impersonate/route.ts

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withSuperAdmin } from '@/lib/super-admin-middleware'

export const POST = withSuperAdmin(async (_request, _ctx, params) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  // Find the tenant's admin user
  const { data: adminUser } = await supabaseAdmin
    .from('ess_app_users')
    .select('auth_user_id')
    .eq('company_id', id)
    .eq('role', 'admin')
    .eq('is_active', true)
    .limit(1)
    .single()

  if (!adminUser) {
    return NextResponse.json({ error: 'No admin user found for this tenant' }, { status: 404 })
  }

  // Get admin's email
  const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(adminUser.auth_user_id)
  if (!authUser?.user?.email) {
    return NextResponse.json({ error: 'Could not resolve admin email' }, { status: 500 })
  }

  // Generate magic link
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: authUser.user.email,
  })

  if (linkError || !linkData) {
    return NextResponse.json({ error: `Failed to generate link: ${linkError?.message}` }, { status: 500 })
  }

  return NextResponse.json({
    magic_link: linkData.properties?.action_link || null,
    email: authUser.user.email,
    expires_in: '5 minutes',
  })
})
```

- [ ] **Step 4: Commit all**

```bash
git add src/app/api/platform/tenants/
git commit -m "feat: add tenant detail, users, and impersonate APIs"
```

---

### Task 7: Platform Client Service

**Files:**
- Create: `src/services/platform.ts`

- [ ] **Step 1: Create service**

```typescript
// src/services/platform.ts

import {
  PlatformDashboardStats, TenantSummary, TenantDetail,
  TenantUser, CreateTenantInput, PlatformPlan,
} from '@/types/platform'

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
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/platform.ts
git commit -m "feat: add platform client service"
```

---

### Task 8: Platform Layout & Sidebar

**Files:**
- Create: `src/components/platform/platform-layout.tsx`
- Create: `src/app/platform/layout.tsx`

- [ ] **Step 1: Create platform layout component**

```typescript
// src/components/platform/platform-layout.tsx

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth'
import {
  LayoutDashboard, Building2, CreditCard, Megaphone,
  ArrowLeft, Shield, LogOut,
} from 'lucide-react'

interface PlatformLayoutProps {
  children: React.ReactNode
}

const navItems = [
  { title: 'Dashboard', href: '/platform', icon: LayoutDashboard },
  { title: 'Tenants', href: '/platform/tenants', icon: Building2 },
  { title: 'Plans', href: '/platform/plans', icon: CreditCard },
  { title: 'Announcements', href: '/platform/announcements', icon: Megaphone },
]

export function PlatformLayout({ children }: PlatformLayoutProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuthStore()
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  useEffect(() => {
    // Check super admin status
    const checkAccess = async () => {
      try {
        const token = localStorage.getItem('ess_access_token')
        const res = await fetch('/api/platform/dashboard', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        setIsSuperAdmin(res.ok)
        if (!res.ok) router.push('/dashboard')
      } catch {
        router.push('/dashboard')
      }
    }
    checkAccess()
  }, [])

  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <div className="w-64 border-r border-border bg-background/50 flex flex-col">
        <div className="p-4 border-b border-border">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-red-100 rounded-xl">
              <Shield className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <h2 className="font-bold text-sm">Platform Admin</h2>
              <p className="text-xs text-muted-foreground">Super Admin Panel</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(item => {
            const isActive = pathname === item.href ||
              (item.href !== '/platform' && pathname.startsWith(item.href))
            return (
              <Link key={item.href} href={item.href}>
                <div className={cn(
                  'flex items-center space-x-3 px-3 py-2.5 rounded-xl transition-all',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-accent hover:text-accent-foreground'
                )}>
                  <item.icon className="h-5 w-5" />
                  <span className="text-sm font-medium">{item.title}</span>
                </div>
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-border space-y-2">
          <Link href="/dashboard">
            <Button variant="outline" size="sm" className="w-full justify-start">
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to Tenant
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={async () => { await logout(); router.push('/login') }}
          >
            <LogOut className="h-4 w-4 mr-2" /> Logout
          </Button>
          <div className="px-3 py-2 text-center text-xs text-muted-foreground">
            {user?.full_name || user?.email}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create route layout**

```typescript
// src/app/platform/layout.tsx

import { PlatformLayout } from '@/components/platform/platform-layout'

export default function Layout({ children }: { children: React.ReactNode }) {
  return <PlatformLayout>{children}</PlatformLayout>
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/platform/platform-layout.tsx src/app/platform/layout.tsx
git commit -m "feat: add platform layout with sidebar"
```

---

### Task 9: Platform Dashboard Page

**Files:**
- Create: `src/app/platform/page.tsx`

- [ ] **Step 1: Create dashboard page**

The page should:
1. Fetch dashboard stats from `platformService.getDashboard()`
2. Show stats cards: Total Tenants, Total Users, Over-Limit Tenants
3. Show tenants by plan as a simple table/grid
4. Show recent signups list (last 10)
5. Follow the existing dashboard card styling patterns
6. Use loading skeletons while fetching

This is a standard data-fetch-and-display page following the same patterns as `src/app/dashboard/page.tsx`. The implementer should read that file for styling reference.

- [ ] **Step 2: Commit**

```bash
git add src/app/platform/page.tsx
git commit -m "feat: add platform dashboard page"
```

---

### Task 10: Tenant Create Wizard Component

**Files:**
- Create: `src/components/platform/tenant-create-wizard.tsx`

- [ ] **Step 1: Create multi-step wizard**

A 3-step form component:

**Step 1: Company Details**
- Company Name (text input, required)
- Company Slug (text input, auto-generated from name, editable)

**Step 2: Admin User**
- Full Name (text input, required)
- Email (email input, required)
- Password (password input, required, min 8 chars)

**Step 3: Plan & Modules**
- Plan selector (radio cards from fetched plans — show name, price, limits)
- Module checkboxes (pre-filled from selected plan's `modules_allowed`)

Props: `{ plans: PlatformPlan[], onSubmit: (input: CreateTenantInput) => Promise<void>, onCancel: () => void }`

Uses shadcn Card, Input, Label, Button, Checkbox. Next/Back/Submit navigation between steps.

- [ ] **Step 2: Commit**

```bash
git add src/components/platform/tenant-create-wizard.tsx
git commit -m "feat: add tenant creation wizard component"
```

---

### Task 11: Tenants List Page

**Files:**
- Create: `src/app/platform/tenants/page.tsx`

- [ ] **Step 1: Create tenants page**

The page should:
1. Fetch tenants from `platformService.getTenants()`
2. Fetch plans from `platformService.getPlans()` (for the create wizard)
3. Show search bar + filter by plan + filter by status
4. Render a table: Company Name, Slug, Plan, Status, Users, Created
5. Status badges: active=green, suspended=amber, cancelled=red
6. Users column shows `count / max_users` with red highlight if over limit
7. Click row → navigate to `/platform/tenants/[id]`
8. "Create Tenant" button opens the `TenantCreateWizard` in a modal/dialog
9. On successful creation, refresh the list and show toast

- [ ] **Step 2: Commit**

```bash
git add src/app/platform/tenants/page.tsx
git commit -m "feat: add tenants list page"
```

---

### Task 12: Tenant Detail Page

**Files:**
- Create: `src/app/platform/tenants/[id]/page.tsx`

- [ ] **Step 1: Create tenant detail page**

The page should:
1. Fetch tenant detail from `platformService.getTenant(id)`
2. Fetch tenant users from `platformService.getTenantUsers(id)`
3. Show company info card (name, slug, plan, status, created, max_users, max_storage)
4. Show modules toggles (checkboxes for each module, save updates on change)
5. Show users table: Email, Name, Role, Department, Status
6. Actions section:
   - **Change Plan** — dropdown select, calls `platformService.updateTenant(id, { plan })`
   - **Suspend/Activate** — toggle button, calls `updateTenant(id, { status })`
   - **Impersonate** — button, calls `platformService.impersonateTenant(id)`, opens `magic_link` in new tab
   - **Delete** — red button with confirm dialog, calls `platformService.deleteTenant(id)`
7. Back button → `/platform/tenants`

- [ ] **Step 2: Commit**

```bash
git add src/app/platform/tenants/[id]/page.tsx
git commit -m "feat: add tenant detail page with impersonation"
```

---

### Task 13: Add Platform Admin Link to Tenant Sidebar

**Files:**
- Modify: `src/components/layout/sidebar.tsx`

- [ ] **Step 1: Add platform link for super admins**

In the sidebar component, after the existing navigation items and before the footer/logout section, add a check:

```typescript
// If user is super admin, show platform link
// Read is_super_admin from the auth-storage user object or a separate check
```

The simplest approach: add `is_super_admin` to the User type and auth response (like we did with `role`), then check it in the sidebar. If true, render a "Platform Admin" link with a Shield icon that navigates to `/platform`.

Changes needed:
1. Add `is_super_admin?: boolean` to the `User` interface in `src/types/auth.ts`
2. Add `is_super_admin: appUser.is_super_admin` to the user response in `src/app/api/auth/user/route.ts`
3. In the sidebar, before the Logout button, add:

```tsx
{user?.is_super_admin && (
  <Link href="/platform">
    <div className="flex items-center space-x-3 px-3 py-2.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 transition-all mb-2">
      <Shield className="h-5 w-5" />
      <div>
        <div className="font-medium text-sm">Platform Admin</div>
        <div className="text-xs opacity-75">Super admin panel</div>
      </div>
    </div>
  </Link>
)}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/auth.ts src/app/api/auth/user/route.ts src/components/layout/sidebar.tsx
git commit -m "feat: add Platform Admin link in sidebar for super admins"
```

---

### Task 14: Set Existing Admin as Super Admin & Build Verification

- [ ] **Step 1: Mark the existing Acme Corp admin as super admin**

Run SQL:
```sql
UPDATE ess_app_users SET is_super_admin = true WHERE auth_user_id = (
  SELECT id FROM auth.users WHERE email = 'admin@acme.com' LIMIT 1
);
```

- [ ] **Step 2: Verify dev server starts**

```bash
npx next dev --turbopack --port 3001
```

- [ ] **Step 3: Test the full flow**

1. Login as admin@acme.com
2. Verify "Platform Admin" link appears in sidebar
3. Navigate to /platform
4. Verify dashboard loads with stats
5. Navigate to /platform/tenants
6. Create a new tenant via the wizard
7. View tenant detail
8. Test impersonate

- [ ] **Step 4: Commit any fixes**

```bash
git add -A && git commit -m "fix: resolve platform admin build issues"
```
