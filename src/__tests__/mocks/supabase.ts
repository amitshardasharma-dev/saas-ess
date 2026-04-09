// Chainable mock Supabase client
type MockData = Record<string, any[]>

function createChainableMock(data: MockData) {
  let currentTable = ''
  let filters: Array<{ field: string; value: any }> = []

  const chain: any = {
    from(table: string) {
      currentTable = table
      filters = []
      return chain
    },
    select(_columns?: string) { return chain },
    insert(record: any) {
      const tableData = data[currentTable] || []
      const newRecord = { id: 'mock-id-' + Date.now(), ...record }
      tableData.push(newRecord)
      data[currentTable] = tableData
      return chain
    },
    update(_record: any) { return chain },
    delete() { return chain },
    eq(field: string, value: any) {
      filters.push({ field, value })
      return chain
    },
    neq(_field: string, _value: any) { return chain },
    in(_field: string, _values: any[]) { return chain },
    gte(_field: string, _value: any) { return chain },
    lte(_field: string, _value: any) { return chain },
    order(_field: string, _opts?: any) { return chain },
    limit(_n: number) { return chain },
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
    then(resolve: Function) {
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
