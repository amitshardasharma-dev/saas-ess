# Phase 0: Role System & Tenant Configuration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the existing role system from simple `admin`/`employee` roles to a full `admin`/`hr`/`manager`/`employee` role hierarchy with tenant-level module toggles, a reusable auth middleware, and a dynamic sidebar.

**Architecture:** Extract the repeated auth-token-verification pattern from every API route into a shared `withAuth` middleware. Add `hr` and `manager` roles to the `ess_app_users` table. Add `modules_enabled` to `ess_companies.settings` JSON. Update the sidebar and dashboard to dynamically render based on role and enabled modules.

**Tech Stack:** Next.js 15 App Router, Supabase (PostgreSQL), TypeScript, Zustand, Tailwind CSS, shadcn/ui

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/lib/auth-middleware.ts` | Reusable `withAuth()` wrapper for API routes — extracts token, verifies user, resolves role/company |
| Create | `src/types/roles.ts` | Role type definitions, permission constants, module list |
| Create | `src/hooks/use-modules.ts` | Client hook to fetch enabled modules for current tenant |
| Create | `src/app/api/modules/route.ts` | API route returning enabled modules for authenticated user's company |
| Modify | `src/types/auth.ts` | Add `role` field to `User` interface, add `UserRole` type |
| Modify | `src/app/api/auth/user/route.ts` | Include `role` in user response, use `withAuth` |
| Modify | `src/app/api/auth/login/route.ts` | Include `role` in login response |
| Modify | `src/app/api/settings/route.ts` | Add `modules_enabled` to settings response, add module config endpoints |
| Modify | `src/components/layout/sidebar.tsx` | Dynamic navigation based on role + enabled modules |
| Modify | `src/stores/auth.ts` | Persist role in auth state |
| Modify | `src/hooks/use-employee.ts` | Expose `role` from employee hook |
| Modify | `src/app/dashboard/page.tsx` | Render different dashboard sections based on role |

---

### Task 1: Define Role Types and Permission Constants

**Files:**
- Create: `src/types/roles.ts`

- [ ] **Step 1: Create role type definitions**

```typescript
// src/types/roles.ts

export const USER_ROLES = ['admin', 'hr', 'manager', 'employee'] as const
export type UserRole = (typeof USER_ROLES)[number]

export const MODULE_IDS = [
  'leave',
  'expense',
  'timesheets',
  'documents',
  'appraisals',
  'contracts',
  'team_calendar',
] as const
export type ModuleId = (typeof MODULE_IDS)[number]

// Which roles can access which features
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  admin: 40,
  hr: 30,
  manager: 20,
  employee: 10,
}

// Minimum role level required for each permission
export const PERMISSIONS = {
  // Module management
  configure_modules: 'admin',

  // Team views
  view_team_leave_calendar: 'manager',
  view_team_leave_balances: 'manager',
  view_team_timesheets: 'manager',
  approve_timesheets: 'manager',
  approve_leave: 'manager',
  approve_expenses: 'manager',

  // HR-level views
  view_all_employees: 'hr',
  manage_documents: 'hr',
  manage_contracts: 'hr',
  manage_appraisal_cycles: 'hr',
  view_acknowledgment_reports: 'hr',

  // Admin
  manage_settings: 'admin',
  manage_users: 'admin',
} as const satisfies Record<string, UserRole>

export type Permission = keyof typeof PERMISSIONS

/**
 * Check if a role has a specific permission.
 * Higher roles inherit all lower-role permissions.
 */
export function hasPermission(userRole: UserRole, permission: Permission): boolean {
  const requiredRole = PERMISSIONS[permission]
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole]
}

/**
 * Check if a role meets a minimum role level.
 */
export function hasMinRole(userRole: UserRole, minRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minRole]
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /Volumes/ssd2/projects/saas-ess && npx tsc --noEmit src/types/roles.ts 2>&1 | head -20`
Expected: No errors (or only errors from unrelated files since this file is self-contained)

- [ ] **Step 3: Commit**

```bash
git add src/types/roles.ts
git commit -m "feat: add role types and permission constants"
```

---

### Task 2: Update User Type to Include Role

**Files:**
- Modify: `src/types/auth.ts`

- [ ] **Step 1: Add role to User interface**

In `src/types/auth.ts`, update the `User` interface to include a `role` field:

```typescript
// Add import at top of file
import { UserRole } from './roles'
```

Then update the `User` interface — add `role` field after the `roles` array:

```typescript
export interface User {
	name: string
	email: string
	full_name: string
	user_image?: string
	photo?: string
	roles: string[]
	role: UserRole
	employee?: string
	employee_name?: string
	department?: string
	designation?: string
	mobile_phone_no?: string
}
```

- [ ] **Step 2: Verify no type errors cascade**

Run: `cd /Volumes/ssd2/projects/saas-ess && npx tsc --noEmit 2>&1 | head -30`
Expected: Errors in files that construct `User` objects without `role` — this is expected and will be fixed in subsequent tasks.

- [ ] **Step 3: Commit**

```bash
git add src/types/auth.ts
git commit -m "feat: add role field to User interface"
```

---

### Task 3: Create Auth Middleware

**Files:**
- Create: `src/lib/auth-middleware.ts`

This replaces the repeated 20-line auth boilerplate in every API route with a single `withAuth()` wrapper.

- [ ] **Step 1: Create the withAuth middleware**

```typescript
// src/lib/auth-middleware.ts

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { UserRole } from '@/types/roles'
import { hasMinRole } from '@/types/roles'

export interface AuthContext {
  authUser: { id: string; email: string }
  appUser: { id: string; company_id: string; role: UserRole; is_active: boolean }
  employee: {
    id: string
    full_name: string
    employee_no: string
    department: string | null
    designation: string | null
    photo_url: string | null
    reports_to: string | null
    is_approver: boolean
    leave_approval_enabled: number
    expense_approval_enabled: number
    [key: string]: unknown
  } | null
  companyId: string
  role: UserRole
}

type AuthenticatedHandler = (
  request: NextRequest,
  context: AuthContext,
  params?: Record<string, string>
) => Promise<NextResponse>

interface WithAuthOptions {
  /** Minimum role required. Defaults to 'employee' (any authenticated user). */
  minRole?: UserRole
}

/**
 * Wraps an API route handler with authentication and authorization.
 *
 * Usage:
 * ```ts
 * export const GET = withAuth(async (request, { companyId, role, employee }) => {
 *   // your handler — user is already verified
 *   return NextResponse.json({ data: 'ok' })
 * })
 * ```
 */
export function withAuth(handler: AuthenticatedHandler, options: WithAuthOptions = {}) {
  const { minRole = 'employee' } = options

  return async (request: NextRequest, routeContext?: { params?: Promise<Record<string, string>> }) => {
    try {
      // 1. Extract token
      const authHeader = request.headers.get('Authorization')
      const token = authHeader?.replace('Bearer ', '')

      if (!token) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      // 2. Verify token with Supabase
      const { data: { user: authUser }, error: authError } = await supabaseAdmin.auth.getUser(token)
      if (authError || !authUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      // 3. Get app user (company_id, role)
      const { data: appUser, error: appError } = await supabaseAdmin
        .from('ess_app_users')
        .select('id, company_id, role, is_active')
        .eq('auth_user_id', authUser.id)
        .eq('is_active', true)
        .single()

      if (appError || !appUser) {
        return NextResponse.json({ error: 'Not registered for ESS' }, { status: 403 })
      }

      // 4. Check role authorization
      const userRole = appUser.role as UserRole
      if (!hasMinRole(userRole, minRole)) {
        return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
      }

      // 5. Get employee record
      const { data: employee } = await supabaseAdmin
        .from('ess_employees')
        .select('*')
        .eq('app_user_id', appUser.id)
        .single()

      // 6. Build auth context
      const ctx: AuthContext = {
        authUser: { id: authUser.id, email: authUser.email! },
        appUser: { ...appUser, role: userRole },
        employee,
        companyId: appUser.company_id,
        role: userRole,
      }

      // 7. Resolve route params if present
      const params = routeContext?.params ? await routeContext.params : undefined

      return handler(request, ctx, params)
    } catch (error) {
      console.error('Auth middleware error:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  }
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /Volumes/ssd2/projects/saas-ess && npx tsc --noEmit src/lib/auth-middleware.ts 2>&1 | head -20`
Expected: Clean or only import-chain warnings

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth-middleware.ts
git commit -m "feat: add withAuth middleware for API route authentication"
```

---

### Task 4: Update Auth User Endpoint to Return Role

**Files:**
- Modify: `src/app/api/auth/user/route.ts`

- [ ] **Step 1: Refactor to use withAuth and include role**

Replace the entire content of `src/app/api/auth/user/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
	try {
		const authHeader = request.headers.get('Authorization')
		const token = authHeader?.replace('Bearer ', '')

		if (!token) {
			return NextResponse.json({ user: null, authenticated: false })
		}

		const { data: { user: authUser }, error } = await supabaseAdmin.auth.getUser(token)

		if (error || !authUser) {
			return NextResponse.json({ user: null, authenticated: false })
		}

		const { data: appUser } = await supabaseAdmin
			.from('ess_app_users')
			.select('id, company_id, role, is_active')
			.eq('auth_user_id', authUser.id)
			.eq('is_active', true)
			.single()

		if (!appUser) {
			return NextResponse.json({ user: null, authenticated: false })
		}

		const { data: employee } = await supabaseAdmin
			.from('ess_employees')
			.select('*')
			.eq('app_user_id', appUser.id)
			.single()

		const user = {
			name: authUser.email,
			email: authUser.email,
			full_name: employee?.full_name || authUser.email,
			user_image: employee?.photo_url,
			photo: employee?.photo_url,
			roles: [appUser.role],
			role: appUser.role,
			employee: employee?.employee_no,
			employee_name: employee?.full_name,
			department: employee?.department,
			designation: employee?.designation,
		}

		return NextResponse.json({ user, authenticated: true })
	} catch (error) {
		console.error('User check error:', error)
		return NextResponse.json(
			{ user: null, authenticated: false },
			{ status: 500 }
		)
	}
}
```

The only change is adding `role: appUser.role` to the user object.

- [ ] **Step 2: Verify the endpoint compiles**

Run: `cd /Volumes/ssd2/projects/saas-ess && npx tsc --noEmit src/app/api/auth/user/route.ts 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/auth/user/route.ts
git commit -m "feat: include role in auth user response"
```

---

### Task 5: Update Login Endpoint to Return Role

**Files:**
- Modify: `src/app/api/auth/login/route.ts`

- [ ] **Step 1: Add role to login response**

In `src/app/api/auth/login/route.ts`, update the success response (around line 60-67) to include `role`:

Find:
```typescript
		return NextResponse.json({
			message: 'Logged In',
			home_page: '/dashboard',
			full_name: employee?.full_name || authData.user.email,
			user: authData.user.email,
			access_token: authData.session?.access_token,
			refresh_token: authData.session?.refresh_token,
		})
```

Replace with:
```typescript
		return NextResponse.json({
			message: 'Logged In',
			home_page: '/dashboard',
			full_name: employee?.full_name || authData.user.email,
			user: authData.user.email,
			role: appUser.role,
			access_token: authData.session?.access_token,
			refresh_token: authData.session?.refresh_token,
		})
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/auth/login/route.ts
git commit -m "feat: include role in login response"
```

---

### Task 6: Create Modules API Endpoint

**Files:**
- Create: `src/app/api/modules/route.ts`

This endpoint returns which modules are enabled for the authenticated user's company.

- [ ] **Step 1: Create the modules endpoint**

```typescript
// src/app/api/modules/route.ts

import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth-middleware'
import { MODULE_IDS, ModuleId } from '@/types/roles'

const DEFAULT_MODULES: ModuleId[] = ['leave', 'expense']

export const GET = withAuth(async (_request, { companyId }) => {
	// Fetch company settings to get modules_enabled
	const { supabaseAdmin } = await import('@/lib/supabase-server')

	const { data: company } = await supabaseAdmin
		.from('ess_companies')
		.select('settings')
		.eq('id', companyId)
		.single()

	const settings = company?.settings as Record<string, unknown> | null
	const rawModules = settings?.modules_enabled

	// Validate modules_enabled is an array of known module IDs
	let enabledModules: ModuleId[]
	if (Array.isArray(rawModules)) {
		enabledModules = rawModules.filter(
			(m): m is ModuleId => MODULE_IDS.includes(m as ModuleId)
		)
	} else {
		enabledModules = DEFAULT_MODULES
	}

	return NextResponse.json({ modules_enabled: enabledModules })
})
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/modules/route.ts
git commit -m "feat: add modules API endpoint for tenant module config"
```

---

### Task 7: Create useModules Client Hook

**Files:**
- Create: `src/hooks/use-modules.ts`

- [ ] **Step 1: Create the hook**

```typescript
// src/hooks/use-modules.ts

import { useState, useEffect } from 'react'
import { ModuleId } from '@/types/roles'

interface UseModulesReturn {
  modules: ModuleId[]
  loading: boolean
  isModuleEnabled: (moduleId: ModuleId) => boolean
}

export function useModules(): UseModulesReturn {
  const [modules, setModules] = useState<ModuleId[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchModules = async () => {
      try {
        const token = localStorage.getItem('ess_access_token')
        const response = await fetch('/api/modules', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })

        if (!response.ok) {
          setModules(['leave', 'expense'])
          return
        }

        const data = await response.json()
        setModules(Array.isArray(data.modules_enabled) ? data.modules_enabled : ['leave', 'expense'])
      } catch {
        setModules(['leave', 'expense'])
      } finally {
        setLoading(false)
      }
    }

    fetchModules()
  }, [])

  const isModuleEnabled = (moduleId: ModuleId) => modules.includes(moduleId)

  return { modules, loading, isModuleEnabled }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/use-modules.ts
git commit -m "feat: add useModules hook for tenant module config"
```

---

### Task 8: Update Sidebar with Role-Based & Module-Based Navigation

**Files:**
- Modify: `src/components/layout/sidebar.tsx`

This is the biggest UI change — the sidebar becomes dynamic based on role and enabled modules.

- [ ] **Step 1: Update imports**

At the top of `src/components/layout/sidebar.tsx`, add new imports:

Replace the import block (lines 1-26):

```typescript
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth'
import { useEmployee } from '@/hooks/use-employee'
import { useModules } from '@/hooks/use-modules'
import { UserRole, hasMinRole } from '@/types/roles'
import toast from 'react-hot-toast'
import {
	LayoutDashboard,
	Calendar,
	Receipt,
	FileText,
	User as UserIcon,
	ChevronLeft,
	ChevronRight,
	ChevronDown,
	ChevronUp,
	Building,
	LogOut,
	History,
	Clock,
	Settings,
	Timer,
	FolderOpen,
	Star,
	FileSignature,
	CalendarDays,
	Users,
} from 'lucide-react'
```

- [ ] **Step 2: Update getNavigationItems to be role and module aware**

Replace the `getNavigationItems` function (inside the `Sidebar` component) with:

```typescript
	const { isModuleEnabled, loading: modulesLoading } = useModules()
	const userRole = (user?.role || 'employee') as UserRole

	const getNavigationItems = (): NavigationItem[] => {
		const items: NavigationItem[] = [
			{
				title: 'Dashboard',
				href: '/dashboard',
				icon: LayoutDashboard,
				description: 'Overview and statistics'
			},
		]

		// Leave module
		if (isModuleEnabled('leave')) {
			const leaveSubItems: NavigationItem[] = []
			if (!employeeLoading && hasLeaveApprovalAccess) {
				leaveSubItems.push(
					{
						title: 'Pending Approvals',
						href: '/dashboard/pending-approvals',
						icon: Clock,
						description: 'Review leave approvals'
					},
					{
						title: 'Approval History',
						href: '/dashboard/approval-history',
						icon: History,
						description: 'View approval history'
					}
				)
			}
			if (hasMinRole(userRole, 'manager')) {
				leaveSubItems.push({
					title: 'Team Calendar',
					href: '/dashboard/team-calendar',
					icon: CalendarDays,
					description: 'Team leave calendar'
				})
				leaveSubItems.push({
					title: 'Team Balances',
					href: '/dashboard/team-balances',
					icon: Users,
					description: 'Staff leave balances'
				})
			}
			items.push({
				title: 'Leave',
				href: '/dashboard/leave-applications',
				icon: Calendar,
				description: 'Apply and manage leave',
				subItems: leaveSubItems.length > 0 ? leaveSubItems : undefined
			})
		}

		// Expense module
		if (isModuleEnabled('expense')) {
			items.push({
				title: 'Expense Claims',
				href: '/dashboard/expense-claims',
				icon: Receipt,
				description: 'Submit and track expenses'
			})
		}

		// Timesheets module
		if (isModuleEnabled('timesheets')) {
			const timesheetSubItems: NavigationItem[] = []
			if (hasMinRole(userRole, 'manager')) {
				timesheetSubItems.push({
					title: 'Team Timesheets',
					href: '/dashboard/team-timesheets',
					icon: Users,
					description: 'Review team timesheets'
				})
			}
			items.push({
				title: 'Timesheets',
				href: '/dashboard/timesheets',
				icon: Timer,
				description: 'Submit and track timesheets',
				subItems: timesheetSubItems.length > 0 ? timesheetSubItems : undefined
			})
		}

		// Documents module
		if (isModuleEnabled('documents')) {
			const docSubItems: NavigationItem[] = []
			if (hasMinRole(userRole, 'hr')) {
				docSubItems.push({
					title: 'Manage Documents',
					href: '/dashboard/documents/manage',
					icon: FolderOpen,
					description: 'Upload and manage policies'
				})
			}
			items.push({
				title: 'Documents',
				href: '/dashboard/documents',
				icon: FolderOpen,
				description: 'Policies & HR documents',
				subItems: docSubItems.length > 0 ? docSubItems : undefined
			})
		}

		// Appraisals module
		if (isModuleEnabled('appraisals')) {
			const appraisalSubItems: NavigationItem[] = []
			if (hasMinRole(userRole, 'hr')) {
				appraisalSubItems.push({
					title: 'Manage Cycles',
					href: '/dashboard/appraisals/cycles',
					icon: Star,
					description: 'Manage appraisal cycles'
				})
			}
			items.push({
				title: 'Appraisals',
				href: '/dashboard/appraisals',
				icon: Star,
				description: 'Performance reviews',
				subItems: appraisalSubItems.length > 0 ? appraisalSubItems : undefined
			})
		}

		// Contracts module
		if (isModuleEnabled('contracts')) {
			const contractSubItems: NavigationItem[] = []
			if (hasMinRole(userRole, 'hr')) {
				contractSubItems.push({
					title: 'Manage Contracts',
					href: '/dashboard/contracts/manage',
					icon: FileSignature,
					description: 'All employee contracts'
				})
			}
			items.push({
				title: 'My Contract',
				href: '/dashboard/contracts',
				icon: FileSignature,
				description: 'View contract details',
				subItems: contractSubItems.length > 0 ? contractSubItems : undefined
			})
		}

		// Payslips (always visible — not a toggleable module)
		items.push({
			title: 'Payslips',
			href: '/dashboard/payslips',
			icon: FileText,
			description: 'View salary statements'
		})

		// Profile (always visible)
		items.push({
			title: 'Profile',
			href: '/dashboard/profile',
			icon: UserIcon,
			description: 'Account settings'
		})

		// Settings — admin only
		if (hasMinRole(userRole, 'admin')) {
			items.push({
				title: 'Settings',
				href: '/dashboard/settings',
				icon: Settings,
				description: 'System settings'
			})
		}

		return items
	}
```

Also need to destructure `user` from `useAuthStore` — update line 45:

```typescript
	const { logout, user } = useAuthStore()
```

- [ ] **Step 3: Verify the app compiles**

Run: `cd /Volumes/ssd2/projects/saas-ess && npx tsc --noEmit 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/sidebar.tsx
git commit -m "feat: dynamic sidebar navigation based on role and enabled modules"
```

---

### Task 9: Update Auth Store to Persist Role

**Files:**
- Modify: `src/stores/auth.ts`

- [ ] **Step 1: No structural changes needed**

The auth store already persists the `user` object via `partialize`. Since we added `role` to the `User` type in Task 2, and the `/api/auth/user` endpoint now returns `role` (Task 4), the store will automatically persist `role` as part of the `user` object.

Verify the store imports work with the updated type:

Run: `cd /Volumes/ssd2/projects/saas-ess && npx tsc --noEmit src/stores/auth.ts 2>&1 | head -20`

No commit needed — the store works without changes because it uses the `User` type from `@/types/auth` which now includes `role`.

---

### Task 10: Update useEmployee Hook to Expose Role

**Files:**
- Modify: `src/hooks/use-employee.ts`

- [ ] **Step 1: Add role to the hook return**

In `src/hooks/use-employee.ts`, update the `UseEmployeeReturn` interface and add role resolution:

Replace the interface (lines 4-11):

```typescript
import { UserRole } from '@/types/roles'

interface UseEmployeeReturn {
	employee: Employee | null
	loading: boolean
	error: string | null
	hasLeaveApprovalAccess: boolean
	hasExpenseApprovalAccess: boolean
	role: UserRole
	refetch: () => void
}
```

Then before the `return` statement (around line 75), add:

```typescript
	// Get role from auth store user, default to employee
	const storedUser = typeof window !== 'undefined'
		? JSON.parse(localStorage.getItem('auth-storage') || '{}')?.state?.user
		: null
	const role: UserRole = (storedUser?.role as UserRole) || 'employee'
```

And update the return (line 75-82):

```typescript
	return {
		employee,
		loading,
		error,
		hasLeaveApprovalAccess,
		hasExpenseApprovalAccess,
		role,
		refetch: fetchEmployee
	}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/use-employee.ts
git commit -m "feat: expose role from useEmployee hook"
```

---

### Task 11: Update Settings API to Support Module Configuration

**Files:**
- Modify: `src/app/api/settings/route.ts`

- [ ] **Step 1: Add modules_enabled to settings response**

In the GET handler, update the response (around line 41-49) to explicitly include `modules_enabled`:

Replace:
```typescript
		return NextResponse.json({
			settings: {
				company_name: company.name,
				company_slug: company.slug,
				bc_enabled: company.bc_enabled,
				bc_api_url: company.bc_api_url,
				bc_company_id: company.bc_company_id,
				...(company.settings || {}),
			},
		})
```

With:
```typescript
		const settings = company.settings || {}
		return NextResponse.json({
			settings: {
				company_name: company.name,
				company_slug: company.slug,
				bc_enabled: company.bc_enabled,
				bc_api_url: company.bc_api_url,
				bc_company_id: company.bc_company_id,
				modules_enabled: settings.modules_enabled || ['leave', 'expense'],
				...settings,
			},
		})
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/settings/route.ts
git commit -m "feat: include modules_enabled in settings response"
```

---

### Task 12: Update Dashboard Page for Role-Based Sections

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Add role and module awareness to dashboard**

Add imports at the top of `src/app/dashboard/page.tsx`:

```typescript
import { useModules } from '@/hooks/use-modules'
import { UserRole, hasMinRole } from '@/types/roles'
```

Inside the `DashboardPage` component, after the existing `useEmployee()` call (around line 58), add:

```typescript
	const { isModuleEnabled } = useModules()
	const userRole = (user?.role || 'employee') as UserRole
```

- [ ] **Step 2: Wrap module-specific sections with guards**

In the rendered JSX, wrap the leave sections with module checks. Find the leave balance section (around line 398-400):

```typescript
						{/* Leave Balance Overview with Glass Effect */}
						<div className="relative">
							<LeaveBalanceComponent balances={leaveBalances} />
						</div>
```

Replace with:
```typescript
						{/* Leave Balance Overview with Glass Effect */}
						{isModuleEnabled('leave') && (
							<div className="relative">
								<LeaveBalanceComponent balances={leaveBalances} />
							</div>
						)}
```

Find the three-column grid (around line 403-413):

```typescript
						<div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
							<div className="space-y-2">
								<MyLeaveApplications applications={myLeaveApplications} />
							</div>
							<div className="space-y-2">
								<MyExpenseClaims claims={myExpenseClaims} />
							</div>
							<div className="space-y-2">
								<MyPayslips payslips={myPayslips} />
							</div>
						</div>
```

Replace with:
```typescript
						<div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
							{isModuleEnabled('leave') && (
								<div className="space-y-2">
									<MyLeaveApplications applications={myLeaveApplications} />
								</div>
							)}
							{isModuleEnabled('expense') && (
								<div className="space-y-2">
									<MyExpenseClaims claims={myExpenseClaims} />
								</div>
							)}
							<div className="space-y-2">
								<MyPayslips payslips={myPayslips} />
							</div>
						</div>
```

- [ ] **Step 3: Verify the app compiles**

Run: `cd /Volumes/ssd2/projects/saas-ess && npx tsc --noEmit 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat: role-based and module-based dashboard sections"
```

---

### Task 13: Migrate One Existing API Route to withAuth (Settings)

**Files:**
- Modify: `src/app/api/settings/route.ts`

Demonstrate the `withAuth` migration pattern on one route. Other routes will be migrated incrementally in future phases.

- [ ] **Step 1: Refactor settings GET to use withAuth**

Replace the full content of `src/app/api/settings/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

export const GET = withAuth(async (_request, { companyId }) => {
	const { data: company, error } = await supabaseAdmin
		.from('ess_companies')
		.select('*')
		.eq('id', companyId)
		.single()

	if (error || !company) {
		return NextResponse.json({ error: 'Company not found' }, { status: 404 })
	}

	const settings = company.settings || {}
	return NextResponse.json({
		settings: {
			company_name: company.name,
			company_slug: company.slug,
			bc_enabled: company.bc_enabled,
			bc_api_url: company.bc_api_url,
			bc_company_id: company.bc_company_id,
			modules_enabled: settings.modules_enabled || ['leave', 'expense'],
			...settings,
		},
	})
})

export const POST = withAuth(async (request, { companyId }) => {
	const updates = await request.json()

	const { data: company } = await supabaseAdmin
		.from('ess_companies')
		.select('settings')
		.eq('id', companyId)
		.single()

	const mergedSettings = { ...(company?.settings || {}), ...updates }

	const { error: updateError } = await supabaseAdmin
		.from('ess_companies')
		.update({ settings: mergedSettings })
		.eq('id', companyId)

	if (updateError) throw updateError

	return NextResponse.json({
		settings: mergedSettings,
		message: 'Settings updated successfully',
	})
}, { minRole: 'admin' })
```

Note how the POST handler now uses `{ minRole: 'admin' }` — this replaces the manual `if (appUser.role !== 'admin')` check.

- [ ] **Step 2: Verify the route compiles**

Run: `cd /Volumes/ssd2/projects/saas-ess && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/settings/route.ts
git commit -m "refactor: migrate settings route to withAuth middleware"
```

---

### Task 14: Add Module Configuration UI to Settings Page

**Files:**
- Modify: `src/components/settings/settings-form.tsx`

- [ ] **Step 1: Read the current settings-form.tsx**

Read `src/components/settings/settings-form.tsx` to understand its current shape before modifying.

- [ ] **Step 2: Add module toggles section**

After reading the file, add a "Modules" section to the settings form. This should render checkboxes for each module in `MODULE_IDS`, allowing admins to toggle them on/off. The section should:

1. Import `MODULE_IDS` and `ModuleId` from `@/types/roles`
2. Read `modules_enabled` from the fetched settings
3. Render a checkbox group with labels for each module
4. On save, include `modules_enabled` in the settings update payload

The exact code depends on the current form structure — read first, then add the section following the existing pattern.

- [ ] **Step 3: Verify the settings page compiles**

Run: `cd /Volumes/ssd2/projects/saas-ess && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/settings-form.tsx
git commit -m "feat: add module toggle configuration to settings page"
```

---

### Task 15: Full Application Build Verification

- [ ] **Step 1: Run TypeScript check**

Run: `cd /Volumes/ssd2/projects/saas-ess && npx tsc --noEmit 2>&1`
Expected: No errors

- [ ] **Step 2: Run Next.js build**

Run: `cd /Volumes/ssd2/projects/saas-ess && npx next build 2>&1 | tail -30`
Expected: Build succeeds

- [ ] **Step 3: Fix any build errors**

If there are errors, fix them. Common issues:
- Missing `role` in places that construct `User` objects
- Import path issues for new files

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve build errors from role system changes"
```

---

### Task 16: Manual Smoke Test

- [ ] **Step 1: Start dev server**

Run: `cd /Volumes/ssd2/projects/saas-ess && npx next dev --turbopack --port 3001`

- [ ] **Step 2: Verify login works**

Open `http://localhost:3001/login`, login with test credentials. Verify:
- Login succeeds
- Dashboard loads
- Sidebar shows appropriate items for user's role

- [ ] **Step 3: Verify settings page shows module toggles**

Navigate to Settings (if admin user). Verify:
- Module checkboxes are visible
- Toggling a module and saving works
- Sidebar updates to reflect enabled/disabled modules

- [ ] **Step 4: Verify non-admin cannot access settings**

If you have a non-admin test user, verify Settings link is hidden from sidebar and the API returns 403.
