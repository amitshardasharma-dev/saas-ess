// src/services/contract.ts

import { Contract, ContractType, ContractHistoryEntry } from '@/types/contract'

const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('ess_access_token') : null

const authHeaders = (): HeadersInit => {
  const token = getToken()
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

const authHeadersNoContent = (): HeadersInit => {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export const contractService = {
  async getContractTypes(): Promise<ContractType[]> {
    const res = await fetch('/api/contract-types', { headers: authHeaders() })
    if (!res.ok) return []
    const data = await res.json()
    return data.contractTypes || []
  },

  async getContracts(scope: 'my' | 'team' | 'all' = 'my'): Promise<Contract[]> {
    const res = await fetch(`/api/contracts?scope=${scope}`, { headers: authHeaders() })
    if (!res.ok) return []
    const data = await res.json()
    return data.contracts || []
  },

  async getContract(id: string): Promise<Contract> {
    const res = await fetch(`/api/contracts/${id}`, { headers: authHeaders() })
    if (!res.ok) throw new Error('Failed to fetch contract')
    const data = await res.json()
    return data.contract
  },

  async createContract(data: {
    employee_id: string
    contract_type_id?: string
    title: string
    start_date: string
    end_date?: string | null
    notes?: string
    renewal_reminder_days?: number
  }): Promise<Contract> {
    const res = await fetch('/api/contracts', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error('Failed to create contract')
    const result = await res.json()
    return result.contract
  },

  async updateContract(id: string, data: Partial<Contract>): Promise<void> {
    const res = await fetch(`/api/contracts/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error('Failed to update contract')
  },

  async uploadContractFile(id: string, file: File): Promise<Contract> {
    const formData = new FormData()
    formData.append('file', file)

    const res = await fetch(`/api/contracts/${id}`, {
      method: 'POST',
      headers: authHeadersNoContent(),
      body: formData,
    })
    if (!res.ok) throw new Error('Failed to upload contract file')
    const data = await res.json()
    return data.contract
  },

  async deleteContract(id: string): Promise<void> {
    const res = await fetch(`/api/contracts/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    if (!res.ok) throw new Error('Failed to delete contract')
  },

  async getContractHistory(id: string): Promise<ContractHistoryEntry[]> {
    const res = await fetch(`/api/contracts/${id}/history`, { headers: authHeaders() })
    if (!res.ok) return []
    const data = await res.json()
    return data.history || []
  },

  async addHistoryEntry(contractId: string, action: 'created' | 'renewed' | 'terminated' | 'amended', notes?: string): Promise<ContractHistoryEntry> {
    const res = await fetch(`/api/contracts/${contractId}/history`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ action, notes }),
    })
    if (!res.ok) throw new Error('Failed to add history entry')
    const data = await res.json()
    return data.entry
  },

  async terminateContract(id: string, notes?: string): Promise<void> {
    await contractService.updateContract(id, { status: 'Terminated' })
    await contractService.addHistoryEntry(id, 'terminated', notes)
  },

  async renewContract(id: string, data: { start_date: string; end_date?: string | null; notes?: string }): Promise<void> {
    await contractService.updateContract(id, {
      status: 'Renewed',
      start_date: data.start_date,
      end_date: data.end_date ?? null,
    })
    await contractService.addHistoryEntry(id, 'renewed', data.notes)
  },
}
