# Multi-Tenant HR System Enhancement — Design Spec

**Date:** 2026-04-09
**Status:** Approved
**Goal:** Transform the existing ESS portal into a comprehensive, multi-tenant HR system replacing OneDrive-based workflows with a streamlined digital platform.

---

## 1. Tenant Configuration & Role-Based Access

### Role System

Current roles (`admin`, `employee` + `is_approver` flag) expand to:

| Role | Scope | Description |
|------|-------|-------------|
| `admin` | Tenant-wide | Module configuration, tenant settings, full access |
| `hr` | Tenant-wide | All employee data, documents, contracts, appraisals |
| `manager` | Team | Direct reports' data, approvals, team calendar, balances |
| `employee` | Self | Own data, submissions, document access |

- `manager` is derived from `reports_to` relationships (has direct reports).
- `is_approver` flag remains for approval workflow routing.
- Permissions resolved at API level: check role + module access per request.

### Tenant Feature Flags

Extend `ess_companies.settings` JSON:

```json
{
  "modules_enabled": ["leave", "expense", "timesheets", "documents", "appraisals", "contracts"],
  "timesheet_config": { ... },
  "appraisal_config": { ... },
  "leave_calendar_config": { ... }
}
```

- Sidebar and dashboard dynamically render based on `modules_enabled`.
- Each module has its own config block for tenant-specific behavior.

### Role Permissions Config

A `role_permissions` config per tenant in settings allows customizing what each role can do per module.

### Dashboard Adaptation

- **Staff:** My timesheets, my leave, my documents, my appraisals
- **Manager:** Above + team calendar, pending approvals, team balances
- **HR:** Above + company-wide views, document management, contract tracking
- **Admin:** Above + tenant settings, module configuration

---

## 2. Timesheets Module

### Database Tables

**`ess_timesheet_configs`** — per-tenant configuration:
- `company_id`, `mode` (simple_hours / project_based / activity_based)
- `submission_cycle` (weekly / fortnightly / monthly)
- `week_start_day`, `required_hours_per_day`
- `overtime_enabled`, `projects_enabled`

**`ess_projects`** — optional project list:
- `company_id`, `name`, `code`, `is_active`, `billable`

**`ess_timesheets`** — header per submission period:
- `employee_id`, `company_id`, `period_start`, `period_end`
- `status` (draft / submitted / approved / rejected / revision_requested)
- `total_hours`, `submitted_at`

**`ess_timesheet_entries`** — individual entries:
- `timesheet_id`, `entry_date`, `hours`
- `project_id` (nullable), `activity_category` (nullable), `description` (nullable)

**`ess_timesheet_approval_entries`** — same pattern as leave/expense approvals:
- `timesheet_id`, `level_no`, `approver_id`, `status`, `action_time`, `remarks`

### Timesheet Modes (tenant-configurable)

1. **Simple hours** — Staff logs total hours per day
2. **Project-based** — Staff logs hours per project per day (matrix grid)
3. **Activity-based** — Staff logs entries with descriptions, grouped by day

### Workflow

1. Staff opens current period, sees grid of days
2. Fills in hours (+ project/activity/notes depending on tenant config)
3. Saves as draft (editable) → submits for approval
4. Manager gets pending approval notification
5. Manager approves / rejects / requests revision with remarks
6. Staff can view history of past timesheets

### UI

**Staff:**
- Weekly grid view as primary input
- Summary card: total hours, expected hours, overtime
- Copy from previous period shortcut
- Timesheet history

**Manager:**
- Team timesheets list with status filters
- Drill into any staff member's timesheet
- Bulk approve capability

---

## 3. Policies & HR Documents

### Database Tables

**`ess_document_categories`** — `company_id`, `name`, `sort_order`

**`ess_documents`** — `company_id`, `category_id`, `title`, `description`, `current_version`, `access_roles` (JSON array), `is_published`, `published_at`, `requires_acknowledgment`, `created_by`

**`ess_document_versions`** — `document_id`, `version_number`, `file_url`, `file_name`, `file_size`, `uploaded_by`, `uploaded_at`, `changelog`

**`ess_document_acknowledgments`** — `document_id`, `version_id`, `employee_id`, `acknowledged_at`, `ip_address`

**`ess_document_read_tracking`** — `document_id`, `employee_id`, `last_viewed_at`

### Storage

- Supabase Storage bucket per company
- Path: `{company_id}/documents/{document_id}/{version}/{filename}`

### Workflow

1. HR/Admin uploads document, assigns category and access roles
2. Publishes → visible to eligible staff
3. If acknowledgment required, staff see banner/notification
4. Staff clicks "I have read and understood" → recorded with timestamp
5. New version uploaded → acknowledgment resets for all staff
6. HR views acknowledgment report: who has/hasn't acknowledged

### UI

**Staff:**
- Document library grouped by category
- Search/filter by title and category
- View/download, acknowledgment button
- "Pending acknowledgments" badge in sidebar

**HR/Admin:**
- Document management CRUD
- Upload new version with changelog
- Acknowledgment status dashboard (employee × acknowledged yes/no × date)

---

## 4. Appraisals / Performance Reviews

### Database Tables

**`ess_appraisal_templates`** — `company_id`, `name`, `description`, `is_default`
- `sections` (JSON): array of section definitions
- Section schema: `{ name, type: "rating_scale" | "text" | "goals" | "competency", weight, rating_labels, fields[] }`

**`ess_appraisal_cycles`** — `company_id`, `template_id`, `name`, `start_date`, `end_date`, `self_assessment_deadline`, `manager_review_deadline`, `status` (draft / active / closed)

**`ess_appraisals`** — `cycle_id`, `employee_id`, `manager_id`, `status` (pending_self / pending_manager / pending_review_meeting / completed), `overall_rating`, `final_comments`

**`ess_appraisal_responses`** — `appraisal_id`, `section_id`, `respondent_type` (self / manager), `ratings` (JSON), `comments`

**`ess_goals`** — `employee_id`, `cycle_id`, `title`, `description`, `target_metric`, `current_progress`, `status` (not_started / in_progress / completed / deferred), `weight`

### Pre-built Templates

1. **Simple Review** — Performance rating (1-5), strengths & improvements (text), goals for next period (text)
2. **360-Degree** — Self-assessment + manager review, same sections, side-by-side view
3. **Goal-Based** — Set goals at cycle start, mid-cycle check-in, end-of-cycle rating against goals

### Template Builder (per tenant)

- Drag-and-drop sections
- Configurable rating scales (1-5, 1-10, custom labels)
- Custom fields per section
- Section weights for overall score calculation

### Workflow

1. HR creates cycle, assigns template, sets deadlines
2. System creates appraisal records for all active employees
3. Employee fills self-assessment by deadline
4. Manager fills their review
5. Side-by-side view in review meeting
6. Manager finalizes with overall rating and comments
7. Employee views completed appraisal

### UI

**Staff:** Active appraisal form, completed history, goals tracker
**Manager:** Team appraisals list with status, fill reviews, side-by-side comparison, finalize
**HR:** Cycle management, template builder, completion dashboard, export

---

## 5. Contracts Management

### Database Tables

**`ess_contract_types`** — `company_id`, `name`, `requires_end_date`, `default_duration_months`

**`ess_contracts`** — `employee_id`, `company_id`, `contract_type_id`, `title`, `start_date`, `end_date` (nullable for permanent), `status` (active / expired / terminated / renewed), `file_url`, `file_name`, `notes`, `renewal_reminder_days`, `created_by`

**`ess_contract_history`** — `contract_id`, `action` (created / renewed / terminated / amended), `action_date`, `performed_by`, `notes`

### Storage

- Path: `{company_id}/contracts/{employee_id}/{filename}`

### Features

- Upload contract PDF per employee
- Track contract type, dates, status
- Auto-calculate expiry from end_date
- Renewal reminders: flag contracts expiring within X days
- Contract history audit trail

### UI

**Staff:** View own contract details, download document
**Manager:** Team contracts with expiry indicators (green/amber/red), filter by type/status
**HR:** Full contracts management, upload/replace documents, expiry dashboard, renewal actions

---

## 6. Team Leave Calendar & Balances

No new tables — built from existing `ess_leave_applications` and `ess_leave_allocations`.

### Calendar View

- Monthly grid: employee rows, day columns
- Color-coded by leave type
- Half-day indicators (AM/PM shading)
- Filter by department, leave type
- Shows approved + pending leaves
- Click entry for details
- Export as PDF/CSV

### List View

- Table: employee, leave type, from, to, days, status
- Sort/filter by date range, employee, status, type
- Upcoming absences highlighted

### Team Leave Balances

- Table: employee name, columns per leave type (allocated / taken / remaining)
- Current fiscal year default, toggle previous
- Visual indicators for low balances
- Export as CSV

### Dashboard Integration

- Manager card: "Team absences this week"
- Alert if >50% team off same day (configurable threshold per tenant)

---

## 7. Testing Strategy

### Unit Tests (Jest + React Testing Library)

- All service functions
- Zod validation schemas
- Utility functions and data transformations
- Role/permission resolution logic

### API Integration Tests

- All API routes with mocked Supabase client
- Tenant isolation verification (company A cannot access company B)
- Role-based access enforcement
- Approval workflows end-to-end
- Edge cases: expired tokens, missing fields, invalid data

### Component Tests (React Testing Library)

- Form submissions and validation errors
- Conditional rendering based on roles/permissions
- Module visibility based on tenant config

### Browser/E2E Tests (Claude-in-Chrome)

- Full user flows: login → submit timesheet → manager approves
- Leave application → calendar reflection
- Document upload → staff acknowledgment
- Appraisal cycle: self-assessment → manager review → finalization
- Multi-tenant data isolation across test tenants

### Test Data

- Seed script for test tenants with different configs
- Test users for each role (admin, hr, manager, employee)
- Sample data for all modules

---

## 8. Implementation Order

| Phase | Module | Description |
|-------|--------|-------------|
| 0 | Role system & tenant config | Expand roles, module toggles, permission middleware, sidebar/dashboard updates |
| 1 | Timesheets | Configurable modes, approval workflow, manager view |
| 2 | Policies & HR Documents | Document library, versioning, acknowledgment tracking |
| 3 | Team Leave Calendar & Balances | Calendar grid, list view, manager balance dashboard |
| 4 | Contracts | Contract records, document storage, expiry tracking |
| 5 | Appraisals | Template builder, cycles, self/manager assessment, goals |
| 6 | Testing | Comprehensive unit, integration, component, and E2E tests |

Each phase delivers a working, testable increment. Testing runs alongside each phase, with Phase 6 as a dedicated comprehensive pass.

---

## Architecture Notes

- **Approach:** Modular monolith — all modules in same Next.js app, shared Supabase database
- **Tech stack:** Next.js 15, React 19, Supabase, Tailwind 4, shadcn/ui, Zustand, Zod
- **Multi-tenancy:** `company_id` on all tables, RLS policies enforcing isolation
- **Approval pattern:** Reuse existing approval entry pattern across timesheets (and potentially future modules)
- **File storage:** Supabase Storage with company-scoped buckets
- **Migrations:** Supabase SQL migrations for all schema changes
- **Indexes:** On `company_id`, `employee_id`, `status` columns for performance
