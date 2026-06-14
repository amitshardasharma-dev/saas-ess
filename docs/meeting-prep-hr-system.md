# HR System — Meeting Preparation

## Current Product Features

### Core Platform
- Multi-tenant SaaS architecture with complete data isolation between companies
- Role-based access control: Employee, Manager, HR, Admin, Super Admin
- Dynamic module toggles per tenant — admin enables/disables features as needed
- Super Admin platform for onboarding new tenants in minutes via a 3-step wizard
- Subscription plans: Free, Starter, Professional, Enterprise with user/storage limits

---

### Staff Features

| Feature | Description | Replaces |
|---------|-------------|----------|
| **Timesheets** | Weekly/fortnightly/monthly grid input. Three modes: simple hours, project-based, activity-based. Save as draft, submit for approval. | Excel spreadsheets |
| **Leave Applications** | Select leave type, date range, half-day support, add reason. Auto-routes to reporting manager. | Email/verbal requests |
| **Leave Balance** | Visual dashboard showing allocated, taken, and remaining days per leave type | Manual tracking |
| **Policies & HR Documents** | Searchable document library organised by category. Download files. Acknowledge policies ("I have read & understood"). | OneDrive folders |
| **My Contract** | View employment contract details, download contract PDF | Filing cabinet / OneDrive |
| **Performance Goals** | Create and track personal goals with progress bars and status updates | Spreadsheets |
| **Self-Assessment** | Fill appraisal forms during review cycles, view completed reviews | Paper forms |
| **Expense Claims** | Submit expenses with line items, categories, receipt uploads, approval workflow | Email + receipts |

---

### Manager Features

| Feature | Description |
|---------|-------------|
| **Timesheet Approval** | View team timesheets, approve/reject with remarks |
| **Leave Request Approval** | Pending approvals queue, approve/reject with remarks, view history |
| **Team Leave Calendar** | Monthly grid showing who is off, colour-coded by leave type, calendar + list view toggle |
| **Staff Leave Balances** | Table of all direct reports showing allocated/taken/remaining per leave type |
| **Staff Appraisals** | Review employee self-assessments, submit manager review, side-by-side comparison, finalise with overall rating |
| **Team Timesheets** | View all direct reports' timesheet submissions and statuses |
| **Team Contracts** | View team members' contract status and expiry dates |
| **Expense Approval** | Approve/reject expense claims from direct reports |

---

### HR Features

| Feature | Description |
|---------|-------------|
| **Document Management** | Upload, version control, publish/unpublish policies. Track acknowledgment status across all employees |
| **Contract Management** | Create/upload contracts per employee. Track expiry with colour-coded indicators (green >30d, amber <30d, red <7d). Full audit trail |
| **Appraisal Cycles** | Create review templates (rating scales, text, goals). Launch cycles company-wide. Track completion progress |
| **All Employee Views** | Access all contracts, documents, appraisals, leave data across the entire company |

---

### Admin Features

| Feature | Description |
|---------|-------------|
| **Module Configuration** | Toggle on/off: Leave, Expense, Timesheets, Documents, Appraisals, Contracts, Team Calendar |
| **Company Settings** | Company name, app branding, session timeout, Business Central integration |
| **Approval Rules** | Configure multi-level approval chains (reporting manager, specific approver) |
| **User Management** | Manage staff accounts, roles, and access levels |

---

### Super Admin (Platform Management)

| Feature | Description |
|---------|-------------|
| **Tenant Dashboard** | Overview: total tenants, users, usage stats, over-limit alerts |
| **Tenant Onboarding** | 3-step wizard: company details, admin user, plan & modules. Creates everything in one click |
| **Plan Management** | Define subscription tiers with user limits, storage limits, allowed modules, pricing |
| **Tenant Administration** | Change plan, suspend/activate, impersonate tenant admin, soft-delete |
| **Announcements** | Broadcast messages to all tenants or target by plan/specific companies. Schedule with start/expiry dates |
| **Usage Tracking** | Monitor user counts, employees, timesheets, leave apps, documents per tenant |

---

## Questions for Client Meeting

### 1. Understanding Current State

- How many staff and managers will use the system initially?
- What is the organisational structure — how many departments, locations?
- Who currently manages HR administration? Is there a dedicated HR person?
- What are the biggest pain points with the current OneDrive + Excel approach?
- Is there an existing staff directory or HR spreadsheet we can import from?

### 2. Leave Management

- What leave types do you currently track? (Annual, sick, personal, TOIL, parental, compassionate, study leave?)
- How many days are allocated for each leave type?
- What is your leave year — calendar year (Jan-Dec) or financial year (Apr-Mar)?
- Do you allow carry-forward of unused leave? If so, how many days?
- Is half-day leave required?
- Are there blackout periods where leave cannot be requested?
- How are public holidays handled — is there a company calendar?
- What is the approval process — line manager only, or multiple levels?
- Do you need different leave entitlements by role or tenure?

### 3. Timesheets

- What does your current Excel timesheet look like — just daily hours, or broken down by project/client/task?
- What submission cycle works best — weekly, fortnightly, or monthly?
- Do you need project or client codes on timesheets?
- Is overtime tracked? What is the threshold (e.g., over 8 hours/day or 40 hours/week)?
- What are your standard working hours per day?
- Does the week start on Monday or Sunday?
- Do you need to track billable vs non-billable hours?

### 4. Policies & Documents

- What types of documents are currently stored in OneDrive? (Policies, handbooks, forms, procedures?)
- Roughly how many documents and how would you categorise them?
- Do staff need to formally acknowledge they have read certain policies?
- When a policy is updated, should staff be required to re-acknowledge the new version?
- Who should be able to upload and manage documents — HR only, or managers too?
- Are there documents that should only be visible to certain roles?

### 5. Appraisals & Performance

- How often do you conduct performance reviews — annually, bi-annually, quarterly?
- What format do you prefer — manager review only, or self-assessment + manager review?
- Do you use a rating scale? If so, what scale (1-5, 1-10, custom labels)?
- Do you track goals or KPIs between review cycles?
- Do you need peer feedback / 360-degree reviews?
- Is there a probation review process that differs from regular reviews?

### 6. Contracts

- What contract types do you have — permanent, fixed-term, probation, contractor?
- Do you need automated reminders before contracts expire? How far in advance?
- Is contract generation needed, or just storing uploaded PDFs?
- Do you need to track contract amendments and renewals with an audit trail?

### 7. Expense Claims

- Do staff submit expense claims? What categories (travel, meals, equipment, training)?
- Is receipt upload required?
- What is the approval process for expenses?
- Are there spending limits by category or role?
- What currency do you operate in?

### 8. Roles & Access

- How many approval levels do you need? (Just line manager, or line manager then director?)
- Should managers only see their direct reports, or the entire department?
- Do you need an HR role that can see all employee data company-wide?
- Who will be the system administrator managing settings and user access?

### 9. Technical & Rollout

- Do you want to roll out all modules at once, or start with leave + timesheets and add more later?
- Do you need SSO (Single Sign-On) integration, or is email/password login sufficient?
- Is there an existing system (e.g., Business Central, MYOB, Xero) that timesheets or leave data needs to integrate with?
- Any data residency requirements — does data need to stay in a specific region?
- Do you need a mobile-friendly interface, or is desktop sufficient?
- What is your preferred go-live timeline?

### 10. Reporting & Analytics

- What reports does management currently need? (Leave usage, timesheet summaries, headcount?)
- Do you need the ability to export data to CSV or Excel?
- Are there any compliance or audit reporting requirements?
- Do you need a management dashboard with key HR metrics?

---

## Mapping Client Requirements to Product Features

| Client Requirement | Product Feature | Status |
|--------------------|-----------------|----|
| Central place for organisational policies | Document Library with categories, search, versioning, acknowledgment tracking | Built |
| Role-based access | 4-tier role system (Employee, Manager, HR, Admin) with permission-based visibility | Built |
| Staff appraisals (managers) | Configurable appraisal templates, review cycles, self + manager assessment, side-by-side view | Built |
| Contracts (managers) | Contract management with types, file upload, expiry tracking, renewal indicators | Built |
| Leave request approval (managers) | Pending approvals queue with approve/reject, multi-level approval chains | Built |
| Timesheets approval (managers) | Team timesheet view with approve/reject/revision workflow | Built |
| Team leave calendar (managers) | Monthly grid + list view, colour-coded by leave type, filter by department | Built |
| View staff leave balances (managers) | Balances table showing allocated/taken/remaining per team member per leave type | Built |
| Submit timesheets (staff) | Three-mode timesheet grid (simple/project/activity), save draft, submit for approval | Built |
| Apply for leave (staff) | Leave application form with type selection, date range, half-day, reason | Built |
| Check leave balance (staff) | Visual balance cards with progress indicators per leave type | Built |
| Access policies & HR documents (staff) | Searchable document library with categories, download, and acknowledgment | Built |
| Move away from OneDrive folders | All documents stored in secure cloud storage with proper access control | Built |
| Replace Excel timesheets | Digital timesheet with configurable modes, approval workflow, history | Built |
