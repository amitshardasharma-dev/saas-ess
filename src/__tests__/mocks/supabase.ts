// Chainable mock Supabase client
type MockRow = Record<string, unknown>
type MockData = Record<string, MockRow[]>

interface MockResult {
  data: MockRow | MockRow[] | null
  error: { message: string } | null
  count?: number
}

interface MockChain {
  from(table: string): MockChain
  select(columns?: string): MockChain
  insert(record: MockRow): MockChain
  update(record: MockRow): MockChain
  delete(): MockChain
  eq(field: string, value: unknown): MockChain
  neq(field: string, value: unknown): MockChain
  in(field: string, values: unknown[]): MockChain
  gte(field: string, value: unknown): MockChain
  lte(field: string, value: unknown): MockChain
  order(field: string, opts?: { ascending?: boolean }): MockChain
  limit(n: number): MockChain
  single(): Promise<MockResult>
  then(resolve: (value: MockResult) => void): void
}

function createChainableMock(data: MockData) {
  let currentTable = ''
  let filters: Array<{ field: string; value: unknown }> = []

  const chain: MockChain = {
    from(table: string) {
      currentTable = table
      filters = []
      return chain
    },
    select() { return chain },
    insert(record: MockRow) {
      const tableData = data[currentTable] || []
      const newRecord = { id: 'mock-id-' + Date.now(), ...record }
      tableData.push(newRecord)
      data[currentTable] = tableData
      return chain
    },
    update() { return chain },
    delete() { return chain },
    eq(field: string, value: unknown) {
      filters.push({ field, value })
      return chain
    },
    neq() { return chain },
    in() { return chain },
    gte() { return chain },
    lte() { return chain },
    order() { return chain },
    limit() { return chain },
    single() {
      const tableData = data[currentTable] || []
      const filtered = tableData.filter(row =>
        filters.every(f => row[f.field] === f.value)
      )
      return Promise.resolve({
        data: filtered[0] || null,
        error: filtered[0] ? null : { message: 'Not found' },
      })
    },
    then(resolve: (value: MockResult) => void) {
      const tableData = data[currentTable] || []
      const filtered = filters.length > 0
        ? tableData.filter(row => filters.every(f => row[f.field] === f.value))
        : tableData
      resolve({ data: filtered, error: null, count: filtered.length })
    },
  }

  return {
    ...chain,
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'test-user-id', email: 'test@example.com' } },
        error: null,
      }),
      signInWithPassword: jest.fn().mockResolvedValue({
        data: { user: { id: 'test-user-id', email: 'test@example.com' }, session: { access_token: 'test-token' } },
        error: null,
      }),
    },
    storage: {
      from: () => ({
        upload: jest.fn().mockResolvedValue({ error: null }),
        getPublicUrl: jest.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/file.pdf' } }),
      }),
    },
  }
}

export function createMockSupabase(data: MockData = {}) {
  return createChainableMock(data)
}

export const mockSupabaseData: MockData = {
  ess_app_users: [
    { id: 'app-user-1', auth_user_id: 'test-user-id', company_id: 'company-1', role: 'admin', is_active: true },
    { id: 'app-user-2', auth_user_id: 'test-user-2', company_id: 'company-1', role: 'employee', is_active: true },
  ],
  ess_employees: [
    { id: 'emp-1', app_user_id: 'app-user-1', full_name: 'Admin User', employee_no: 'EMP001', department: 'IT', reports_to: null, is_approver: true, leave_approval_enabled: 1, expense_approval_enabled: 1 },
    { id: 'emp-2', app_user_id: 'app-user-2', full_name: 'Regular Employee', employee_no: 'EMP002', department: 'Sales', reports_to: 'emp-1', is_approver: false, leave_approval_enabled: 0, expense_approval_enabled: 0 },
  ],
  ess_companies: [
    { id: 'company-1', name: 'Test Company', slug: 'test-co', settings: { modules_enabled: ['leave', 'expense', 'timesheets', 'documents'] } },
  ],
}
