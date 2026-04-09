# Phase 5: Appraisals / Performance Reviews — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Configurable appraisal system with templates (rating/text/goals sections), review cycles, self-assessment + manager review, goal tracking, and cycle management for HR.

**Architecture:** 5 new tables. Templates define form structure via JSON sections. Cycles group appraisals by period. Each appraisal has self and manager responses stored as JSON.

---

## Tasks

### Task 1: Types + Migration

Create `src/types/appraisal.ts`:
```typescript
export type AppraisalSectionType = 'rating_scale' | 'text' | 'goals' | 'competency'
export type AppraisalCycleStatus = 'Draft' | 'Active' | 'Closed'
export type AppraisalStatus = 'Pending Self' | 'Pending Manager' | 'Pending Review Meeting' | 'Completed'

export interface AppraisalSection {
  id: string; name: string; type: AppraisalSectionType; weight: number
  rating_labels?: string[]; fields?: Array<{ name: string; type: string }>
}

export interface AppraisalTemplate {
  id: string; company_id: string; name: string; description: string | null
  sections: AppraisalSection[]; is_default: boolean
  created_at: string; updated_at: string
}

export interface AppraisalCycle {
  id: string; company_id: string; template_id: string; template_name?: string
  name: string; start_date: string; end_date: string
  self_assessment_deadline: string; manager_review_deadline: string
  status: AppraisalCycleStatus
  created_at: string; total_appraisals?: number; completed_count?: number
}

export interface Appraisal {
  id: string; cycle_id: string; employee_id: string; manager_id: string
  status: AppraisalStatus; overall_rating: number | null; final_comments: string | null
  created_at: string; updated_at: string
  employee_name?: string; employee_no?: string; manager_name?: string
  cycle_name?: string; template?: AppraisalTemplate
}

export interface AppraisalResponse {
  id: string; appraisal_id: string; section_id: string
  respondent_type: 'self' | 'manager'
  ratings: Record<string, number>; comments: string | null
}

export interface Goal {
  id: string; employee_id: string; cycle_id: string | null
  title: string; description: string | null; target_metric: string | null
  current_progress: number; status: 'Not Started' | 'In Progress' | 'Completed' | 'Deferred'
  weight: number; created_at: string; updated_at: string
}
```

Create `supabase/migrations/004_appraisals.sql`:
```sql
CREATE TABLE IF NOT EXISTS ess_appraisal_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES ess_companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL, description TEXT, sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ess_appraisal_cycles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES ess_companies(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES ess_appraisal_templates(id),
  name TEXT NOT NULL, start_date DATE NOT NULL, end_date DATE NOT NULL,
  self_assessment_deadline DATE NOT NULL, manager_review_deadline DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Active','Closed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ess_appraisals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cycle_id UUID NOT NULL REFERENCES ess_appraisal_cycles(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES ess_employees(id),
  manager_id UUID NOT NULL REFERENCES ess_employees(id),
  status TEXT NOT NULL DEFAULT 'Pending Self' CHECK (status IN ('Pending Self','Pending Manager','Pending Review Meeting','Completed')),
  overall_rating NUMERIC(3,1), final_comments TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ess_appraisal_responses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  appraisal_id UUID NOT NULL REFERENCES ess_appraisals(id) ON DELETE CASCADE,
  section_id TEXT NOT NULL, respondent_type TEXT NOT NULL CHECK (respondent_type IN ('self','manager')),
  ratings JSONB NOT NULL DEFAULT '{}'::jsonb, comments TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(appraisal_id, section_id, respondent_type)
);

CREATE TABLE IF NOT EXISTS ess_goals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES ess_employees(id) ON DELETE CASCADE,
  cycle_id UUID REFERENCES ess_appraisal_cycles(id),
  title TEXT NOT NULL, description TEXT, target_metric TEXT,
  current_progress NUMERIC(5,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Not Started' CHECK (status IN ('Not Started','In Progress','Completed','Deferred')),
  weight NUMERIC(5,2) NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appraisal_templates_company ON ess_appraisal_templates(company_id);
CREATE INDEX IF NOT EXISTS idx_appraisal_cycles_company ON ess_appraisal_cycles(company_id);
CREATE INDEX IF NOT EXISTS idx_appraisals_cycle ON ess_appraisals(cycle_id);
CREATE INDEX IF NOT EXISTS idx_appraisals_employee ON ess_appraisals(employee_id);
CREATE INDEX IF NOT EXISTS idx_appraisals_manager ON ess_appraisals(manager_id);
CREATE INDEX IF NOT EXISTS idx_appraisal_responses ON ess_appraisal_responses(appraisal_id);
CREATE INDEX IF NOT EXISTS idx_goals_employee ON ess_goals(employee_id);
ALTER TABLE ess_appraisal_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_appraisal_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_appraisals ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_appraisal_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_goals ENABLE ROW LEVEL SECURITY;
```

Commit separately.

### Task 2: APIs

Create these endpoints using withAuth:

**`src/app/api/appraisal-templates/route.ts`** — GET list, POST create (hr+)
**`src/app/api/appraisal-templates/[id]/route.ts`** — GET detail, PUT update (hr+), DELETE (hr+)
**`src/app/api/appraisal-cycles/route.ts`** — GET list, POST create (hr+)
**`src/app/api/appraisal-cycles/[id]/route.ts`** — GET detail, PUT update (hr+), POST activate (hr+ — creates appraisals for all active employees with their reporting managers)
**`src/app/api/appraisals/route.ts`** — GET list (staff=own, manager=team)
**`src/app/api/appraisals/[id]/route.ts`** — GET detail (with template and responses), PUT submit response (self or manager), POST finalize (manager)
**`src/app/api/goals/route.ts`** — GET own goals, POST create
**`src/app/api/goals/[id]/route.ts`** — PUT update progress/status

Commit as: `feat: add appraisal APIs`

### Task 3: Client Service

Create `src/services/appraisal.ts` with methods for all API calls.
Commit: `feat: add appraisal client service`

### Task 4: Components

Create `src/components/appraisals/appraisal-form.tsx` — Renders form from template sections. Supports rating_scale (radio/select), text (textarea), goals (goal list), competency (rating per competency). Handles both self and manager views.

Create `src/components/appraisals/side-by-side-view.tsx` — Shows self vs manager responses side by side for review meeting.

Create `src/components/appraisals/goal-tracker.tsx` — Shows goal list with progress bars, status badges, and edit capabilities.

Commit each separately.

### Task 5: Pages

Create `src/app/dashboard/appraisals/page.tsx` — Staff: my appraisals list, active appraisal form, completed history, goals tracker
Create `src/app/dashboard/appraisals/[id]/page.tsx` — Appraisal detail: fill self-assessment or manager review, side-by-side view if both done, finalize button for managers
Create `src/app/dashboard/appraisals/cycles/page.tsx` — HR: cycle management (create cycle, select template, set deadlines, activate, view completion dashboard)

Commit each separately.

### Task 6: Build Verification
Verify dev server starts. Fix any issues.
