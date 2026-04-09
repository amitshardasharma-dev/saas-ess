# Phase 4: Contracts Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Employment contract tracking — upload PDFs per employee, track types/dates/status, renewal reminders, contract history audit trail.

**Architecture:** 3 new tables. Staff views own contract; managers see team; HR manages all. File storage via Supabase Storage.

---

## Tasks

### Task 1: Types + Migration

Create `src/types/contract.ts`:
```typescript
export type ContractStatus = 'Active' | 'Expired' | 'Terminated' | 'Renewed'

export interface ContractType {
  id: string; company_id: string; name: string; requires_end_date: boolean; default_duration_months: number | null
}

export interface Contract {
  id: string; employee_id: string; company_id: string; contract_type_id: string
  contract_type_name?: string; title: string; start_date: string; end_date: string | null
  status: ContractStatus; file_url: string | null; file_name: string | null
  notes: string | null; renewal_reminder_days: number; created_by: string
  created_at: string; updated_at: string
  employee_name?: string; employee_no?: string; days_until_expiry?: number | null
}

export interface ContractHistoryEntry {
  id: string; contract_id: string; action: 'created' | 'renewed' | 'terminated' | 'amended'
  action_date: string; performed_by: string; performer_name?: string; notes: string | null
}
```

Create `supabase/migrations/003_contracts.sql`:
```sql
CREATE TABLE IF NOT EXISTS ess_contract_types (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES ess_companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL, requires_end_date BOOLEAN NOT NULL DEFAULT TRUE,
  default_duration_months INTEGER, created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ess_contracts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES ess_employees(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES ess_companies(id) ON DELETE CASCADE,
  contract_type_id UUID REFERENCES ess_contract_types(id),
  title TEXT NOT NULL, start_date DATE NOT NULL, end_date DATE,
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Expired','Terminated','Renewed')),
  file_url TEXT, file_name TEXT, notes TEXT,
  renewal_reminder_days INTEGER NOT NULL DEFAULT 30,
  created_by UUID NOT NULL REFERENCES ess_employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ess_contract_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID NOT NULL REFERENCES ess_contracts(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('created','renewed','terminated','amended')),
  action_date TIMESTAMPTZ DEFAULT NOW(),
  performed_by UUID NOT NULL REFERENCES ess_employees(id),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_contracts_employee ON ess_contracts(employee_id);
CREATE INDEX IF NOT EXISTS idx_contracts_company ON ess_contracts(company_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON ess_contracts(status);
CREATE INDEX IF NOT EXISTS idx_contract_history ON ess_contract_history(contract_id);
ALTER TABLE ess_contract_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_contract_history ENABLE ROW LEVEL SECURITY;
```

Commit each separately.

### Task 2: APIs

Create `src/app/api/contract-types/route.ts` — GET list, POST create (hr+)
Create `src/app/api/contracts/route.ts` — GET list (staff=own, manager=team, hr=all), POST create (hr+)
Create `src/app/api/contracts/[id]/route.ts` — GET detail, PUT update, POST upload file, DELETE
Create `src/app/api/contracts/[id]/history/route.ts` — GET history, POST add entry

All using withAuth middleware. GET contracts should calculate `days_until_expiry` from `end_date`. Support `?scope=my|team|all` query param.

Commit as: `feat: add contract APIs`

### Task 3: Client Service

Create `src/services/contract.ts` with methods: `getContractTypes`, `getContracts(scope)`, `getContract(id)`, `createContract`, `updateContract`, `uploadContractFile`, `getContractHistory`, `terminateContract`, `renewContract`.

Commit: `feat: add contract client service`

### Task 4: Components

Create `src/components/contracts/contract-card.tsx` — shows contract with expiry indicator (green/amber/red based on days_until_expiry)
Create `src/components/contracts/contract-history.tsx` — timeline of contract actions

Commit each separately.

### Task 5: Pages

Create `src/app/dashboard/contracts/page.tsx` — Staff: my contract view
Create `src/app/dashboard/contracts/manage/page.tsx` — HR: all contracts with search, filter by status/type, expiry dashboard, create/upload

Commit each separately.

### Task 6: Build Verification

Verify dev server starts. Fix any issues. Commit fixes.
