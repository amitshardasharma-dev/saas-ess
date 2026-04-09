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
