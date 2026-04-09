# Phase 6: Testing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Comprehensive testing across all modules — Jest setup, unit tests for types/utils/permissions, API route integration tests with mocked Supabase, component tests with React Testing Library, and a test seed script.

**Architecture:** Jest with ts-jest for TypeScript, React Testing Library for components, custom Supabase mock for API tests. Tests organized in `__tests__/` folders mirroring `src/` structure.

---

## Tasks

### Task 1: Install Testing Dependencies & Configure Jest

Install: `jest`, `ts-jest`, `@types/jest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jest-environment-jsdom`

Create `jest.config.ts`:
```typescript
import type { Config } from 'jest'
import nextJest from 'next/jest'

const createJestConfig = nextJest({ dir: './' })

const config: Config = {
  testEnvironment: 'jsdom',
  setupFilesAfterSetup: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/.next/'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/app/layout.tsx',
    '!src/components/ui/**',
  ],
}

export default createJestConfig(config)
```

Create `jest.setup.ts`:
```typescript
import '@testing-library/jest-dom'
```

Add to `package.json` scripts: `"test": "jest", "test:watch": "jest --watch", "test:coverage": "jest --coverage"`

Commit: `feat: configure Jest testing framework`

### Task 2: Unit Tests — Role Types & Permissions

Create `src/__tests__/types/roles.test.ts`:

Test `hasPermission`:
- admin has all permissions
- hr has hr-level but not admin permissions
- manager has team-level but not hr permissions
- employee has no elevated permissions

Test `hasMinRole`:
- admin >= all roles
- employee < manager
- hr >= manager
- manager >= employee

Commit: `test: add role types and permissions unit tests`

### Task 3: Unit Tests — Timesheet Service Helpers

Create `src/__tests__/services/timesheet.test.ts`:

Test `getCurrentPeriod`:
- Weekly: returns correct Mon-Sun range for given config
- Monthly: returns first-to-last day of month
- Fortnightly: returns correct 1-15 or 16-end range

Test `getPeriodDates`:
- Returns correct array of date strings
- Handles month boundaries

Commit: `test: add timesheet service helper unit tests`

### Task 4: Create Supabase Mock

Create `src/__tests__/mocks/supabase.ts`:

A mock factory that creates a chainable mock Supabase client:
```typescript
export function createMockSupabase(data: Record<string, any[]> = {}) {
  // Returns mock that supports: .from().select().eq().single() etc.
  // Uses data map to return appropriate results
}
```

This mock will be used by API route tests.

Commit: `test: add Supabase client mock for API tests`

### Task 5: API Integration Tests — Auth Middleware

Create `src/__tests__/lib/auth-middleware.test.ts`:

Test `withAuth`:
- Returns 401 when no Authorization header
- Returns 401 when token is invalid
- Returns 403 when user not registered for ESS
- Returns 403 when role is insufficient (e.g., employee accessing admin route)
- Passes AuthContext to handler when auth succeeds
- Resolves route params correctly

Mock `supabaseAdmin` for these tests.

Commit: `test: add auth middleware integration tests`

### Task 6: API Integration Tests — Settings Route

Create `src/__tests__/api/settings.test.ts`:

Test GET /api/settings:
- Returns company settings including modules_enabled
- Returns default modules when none configured

Test POST /api/settings:
- Admin can update settings
- Non-admin gets 403
- Merges with existing settings

Commit: `test: add settings API integration tests`

### Task 7: API Integration Tests — Timesheets

Create `src/__tests__/api/timesheets.test.ts`:

Test GET /api/timesheets:
- Returns employee's timesheets
- Team view returns direct reports' timesheets

Test POST /api/timesheets:
- Creates timesheet with auto-generated display_id
- Returns Draft status

Test POST /api/timesheets/[id] (submit):
- Changes status to Submitted
- Creates approval entries
- Rejects empty timesheet
- Rejects already-submitted timesheet

Commit: `test: add timesheets API integration tests`

### Task 8: API Integration Tests — Documents

Create `src/__tests__/api/documents.test.ts`:

Test GET /api/documents:
- Staff sees only published documents with matching role access
- HR with manage=true sees all documents

Test POST /api/documents/[id]/acknowledge:
- Creates acknowledgment record
- Returns error if no version exists

Commit: `test: add documents API integration tests`

### Task 9: API Integration Tests — Approval Workflow

Create `src/__tests__/api/approval-workflow.test.ts`:

Test POST /api/process-approval:
- Approving a leave application updates entry status
- All levels approved → main document becomes Approved
- Single rejection → main document becomes Rejected
- Timesheet type works same pattern
- Expense type works same pattern
- Invalid type returns error

Commit: `test: add approval workflow integration tests`

### Task 10: Component Tests

Create `src/__tests__/components/sidebar.test.tsx`:
- Renders Dashboard link always
- Shows Leave when module enabled
- Hides Timesheets when module disabled
- Shows Settings only for admin role
- Shows Team Calendar for manager role

Create `src/__tests__/components/timesheet-grid.test.tsx`:
- Renders day columns based on dates
- Updates hours on input change
- Shows project selector in project_based mode
- Disables inputs when disabled prop is true

Create `src/__tests__/components/document-card.test.tsx`:
- Shows title and category
- Shows amber icon when acknowledgment pending
- Shows green icon when acknowledged
- Calls onClick when clicked

Commit: `test: add component tests`

### Task 11: Test Seed Script

Create `scripts/seed-test-data.ts`:

A TypeScript script that:
1. Creates 2 test companies (Company A — all modules, Company B — leave only)
2. Creates users: admin, hr, manager, employee per company
3. Creates leave types, approval rules
4. Creates sample leave applications, timesheets
5. Creates sample documents, contracts, appraisal templates/cycles

Run with: `npx ts-node scripts/seed-test-data.ts`

Commit: `feat: add test data seed script`

### Task 12: Run Tests & Fix

Run all tests: `npx jest --verbose`
Fix any failures.
Commit fixes.

Run coverage: `npx jest --coverage`
Report coverage summary.
