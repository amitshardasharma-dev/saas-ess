# Super Admin Platform Management — Design Spec

**Date:** 2026-04-09
**Status:** Approved
**Goal:** Build a platform administration interface for super admins to onboard new tenants, manage subscriptions/plans, monitor usage, impersonate tenant admins, and broadcast announcements.

---

## 1. Database Schema

### Modify Existing

**`ess_app_users`** — `is_super_admin BOOLEAN NOT NULL DEFAULT FALSE` (already applied)

**`ess_companies`** — add columns:
- `plan TEXT NOT NULL DEFAULT 'free'` — subscription tier slug
- `status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','cancelled'))`
- `max_users INTEGER NOT NULL DEFAULT 10`
- `max_storage_mb INTEGER NOT NULL DEFAULT 500`

### New Tables

**`ess_platform_plans`**
- `id UUID PK`, `name TEXT`, `slug TEXT UNIQUE`, `max_users INTEGER`, `max_storage_mb INTEGER`
- `modules_allowed JSONB DEFAULT '[]'`, `price_monthly NUMERIC(10,2)`, `price_yearly NUMERIC(10,2)`
- `is_active BOOLEAN DEFAULT TRUE`, `sort_order INTEGER DEFAULT 0`, `created_at TIMESTAMPTZ`

**`ess_tenant_usage`**
- `id UUID PK`, `company_id UUID FK(ess_companies)`, `measured_at TIMESTAMPTZ`
- `user_count INTEGER`, `storage_used_mb INTEGER`, `active_employees INTEGER`
- `timesheets_this_month INTEGER`, `leave_apps_this_month INTEGER`, `documents_count INTEGER`

**`ess_announcements`**
- `id UUID PK`, `title TEXT`, `message TEXT`, `type TEXT CHECK (type IN ('info','warning','critical'))`
- `link_url TEXT`, `link_text TEXT`
- `target_type TEXT CHECK (target_type IN ('all','specific_tenants','specific_plans'))`
- `target_ids JSONB DEFAULT '[]'`
- `starts_at TIMESTAMPTZ`, `expires_at TIMESTAMPTZ`, `is_active BOOLEAN DEFAULT TRUE`
- `created_by UUID FK(ess_employees)`, `created_at TIMESTAMPTZ`

**`ess_announcement_dismissals`**
- `id UUID PK`, `announcement_id UUID FK(ess_announcements)`, `user_id UUID` (auth user ID)
- `dismissed_at TIMESTAMPTZ`
- `UNIQUE(announcement_id, user_id)`

---

## 2. Auth & Middleware

**`withSuperAdmin`** middleware:
- Wraps `withAuth`
- Additionally checks `appUser.is_super_admin === true`
- Returns 403 "Super admin access required" if not

---

## 3. Platform API Routes

| Route | Methods | Auth | Purpose |
|-------|---------|------|---------|
| `/api/platform/dashboard` | GET | superAdmin | Aggregate stats |
| `/api/platform/tenants` | GET, POST | superAdmin | List/create tenants |
| `/api/platform/tenants/[id]` | GET, PUT, DELETE | superAdmin | Detail/update/delete tenant |
| `/api/platform/tenants/[id]/users` | GET | superAdmin | List tenant users |
| `/api/platform/tenants/[id]/impersonate` | POST | superAdmin | Generate magic link for tenant admin |
| `/api/platform/tenants/[id]/usage` | GET | superAdmin | Tenant usage history |
| `/api/platform/plans` | GET, POST | superAdmin | List/create plans |
| `/api/platform/plans/[id]` | PUT, DELETE | superAdmin | Update/delete plans |
| `/api/platform/announcements` | GET, POST | superAdmin | List/create announcements |
| `/api/platform/announcements/[id]` | PUT, DELETE | superAdmin | Update/delete announcements |
| `/api/platform/usage/collect` | POST | superAdmin | Trigger usage collection for all tenants |
| `/api/announcements/active` | GET | any auth | Active announcements for current user |
| `/api/announcements/[id]/dismiss` | POST | any auth | Dismiss an announcement |

### Tenant Creation Flow (POST `/api/platform/tenants`)

Input: `{ company_name, company_slug, admin_email, admin_password, admin_name, plan_slug, modules_enabled }`

Steps:
1. Create `ess_companies` record with plan, slug, modules_enabled in settings
2. Create Supabase auth user with email/password
3. Create `ess_app_users` record (role: admin, is_active: true)
4. Create `ess_employees` record (full_name, email, employee_no auto-generated)
5. Create default leave types (Annual Leave 20d, Sick Leave 10d, Personal Leave 5d)
6. Create default approval rules (leave + expense: level 1 reporting_manager)
7. Return the created company + admin user details

### Impersonation Flow (POST `/api/platform/tenants/[id]/impersonate`)

1. Verify super admin
2. Find tenant's admin user (first `ess_app_users` with role='admin' for that company)
3. Get admin's auth email
4. Generate magic link via `supabaseAdmin.auth.admin.generateLink({ type: 'magiclink', email })`
5. Return the magic link URL (expires in 5 minutes)
6. Frontend opens in new tab

---

## 4. Platform UI Pages

### Layout

- Route group: `/platform/*`
- Own sidebar: Dashboard, Tenants, Plans, Announcements
- Header: "Platform Admin" badge + "Back to Tenant" link
- No tenant-specific modules visible

### Dashboard (`/platform`)

- Stats cards: Total Tenants, Total Users, Active This Month, Storage Used
- Tenants by plan breakdown
- Recent signups (last 10)
- Active announcements count
- Tenants over plan limits (highlighted)

### Tenants (`/platform/tenants`)

- Searchable, sortable table: Company Name, Plan, Status, Users, Created Date
- Filter by plan and status
- "Create Tenant" button → multi-step form:
  - Step 1: Company details (name, slug)
  - Step 2: Admin user (name, email, password)
  - Step 3: Plan selection + module config
  - Submit creates everything

### Tenant Detail (`/platform/tenants/[id]`)

- Company info card (name, slug, plan, status, created)
- Usage card (users, storage, activity counts)
- Modules toggle checkboxes
- Users list table
- Actions: Change Plan, Suspend/Activate, Impersonate Admin (new tab), Delete
- Usage history (last 30 days)

### Plans (`/platform/plans`)

- Table: name, pricing, user limit, storage limit, allowed modules
- Create/edit form
- Default plan indicator

### Announcements (`/platform/announcements`)

- List with status badges (active/scheduled/expired)
- Create/edit form: title, message, type (info/warning/critical), targeting (all/specific tenants/specific plans), schedule, optional link
- Preview rendering

---

## 5. Tenant-Side Announcement Display

**Component:** `AnnouncementBanner` in `DashboardLayout`

- Fetches `GET /api/announcements/active` on mount
- Renders dismissible banners stacked above main content:
  - info = blue, warning = amber, critical = red (not dismissible)
- Dismiss calls `POST /api/announcements/[id]/dismiss`
- One fetch per page load, cached in component state

---

## 6. Usage Tracking

**Collection:** `POST /api/platform/usage/collect` (callable via cron or manually)
- For each active tenant, queries user count, employee count, timesheets/month, leave apps/month, documents count
- Inserts row into `ess_tenant_usage`

**Plan enforcement:** Soft limits only
- API returns warning when tenant exceeds plan limits (does not block)
- Platform dashboard highlights over-limit tenants in red

---

## 7. Security

- All `/api/platform/*` routes require `is_super_admin`
- Impersonation generates time-limited magic links (5 min expiry)
- Tenant data isolation unchanged — super admin queries use admin client, not tenant-scoped
- Announcement dismissals use auth_user_id (not employee_id) since super admins may not have employee records in every tenant
