// src/services/training.ts
//
// Client service for the Phase 5 LMS API. Mirrors existing services (auth header
// from localStorage 'ess_access_token').

import type {
  AssignedModule,
  CreateAssignmentInput,
  CreateGroupInput,
  CreateItemInput,
  CreateModuleInput,
  TrainingAssignment,
  TrainingEvent,
  TrainingGroup,
  TrainingItem,
  TrainingItemProgress,
  TrainingModule,
  TrainingModuleWithItems,
  TrainingProgress,
  UpdateModuleInput,
  Assignee,
} from '@/types/training'

const getToken = () =>
  typeof window !== 'undefined' ? localStorage.getItem('ess_access_token') : null

const authHeaders = (): HeadersInit => {
  const token = getToken()
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export const trainingService = {
  // ---- Modules ----
  async getModules(manage = false): Promise<TrainingModule[]> {
    const res = await fetch(`/api/training/modules${manage ? '?manage=true' : ''}`, {
      headers: authHeaders(),
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.modules ?? []
  },

  async getModule(id: string): Promise<TrainingModuleWithItems | null> {
    const res = await fetch(`/api/training/modules/${id}`, { headers: authHeaders() })
    if (!res.ok) return null
    const data = await res.json()
    return data.module ?? null
  },

  async createModule(input: CreateModuleInput): Promise<TrainingModule> {
    const res = await fetch('/api/training/modules', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(input),
    })
    if (!res.ok) throw new Error('Failed to create module')
    return (await res.json()).module
  },

  async updateModule(id: string, input: UpdateModuleInput): Promise<TrainingModule> {
    const res = await fetch(`/api/training/modules/${id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(input),
    })
    if (!res.ok) throw new Error('Failed to update module')
    return (await res.json()).module
  },

  async publishModule(id: string): Promise<void> {
    await trainingService.updateModule(id, { status: 'published' })
  },

  async archiveModule(id: string): Promise<void> {
    await trainingService.updateModule(id, { status: 'archived' })
  },

  async deleteModule(id: string): Promise<void> {
    const res = await fetch(`/api/training/modules/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    if (!res.ok) throw new Error('Failed to delete module')
  },

  // ---- Items ----
  async addItem(moduleId: string, input: CreateItemInput): Promise<TrainingItem> {
    const res = await fetch(`/api/training/modules/${moduleId}/items`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(input),
    })
    if (!res.ok) throw new Error('Failed to add item')
    return (await res.json()).item
  },

  async reorderItems(moduleId: string, itemIds: string[]): Promise<void> {
    const res = await fetch(`/api/training/modules/${moduleId}/items`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ item_ids: itemIds }),
    })
    if (!res.ok) throw new Error('Failed to reorder items')
  },

  async deleteItem(itemId: string): Promise<void> {
    const res = await fetch(`/api/training/items/${itemId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    if (!res.ok) throw new Error('Failed to delete item')
  },

  // ---- Assignments ----
  async getAssignments(
    moduleId: string
  ): Promise<{ assignments: TrainingAssignment[]; assignees: Assignee[] }> {
    const res = await fetch(`/api/training/modules/${moduleId}/assignments`, {
      headers: authHeaders(),
    })
    if (!res.ok) return { assignments: [], assignees: [] }
    return res.json()
  },

  async createAssignment(
    moduleId: string,
    input: CreateAssignmentInput
  ): Promise<TrainingAssignment> {
    const res = await fetch(`/api/training/modules/${moduleId}/assignments`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(input),
    })
    if (!res.ok) throw new Error('Failed to create assignment')
    return (await res.json()).assignment
  },

  async deleteAssignment(moduleId: string, assignmentId: string): Promise<void> {
    const res = await fetch(
      `/api/training/modules/${moduleId}/assignments?assignment_id=${assignmentId}`,
      { method: 'DELETE', headers: authHeaders() }
    )
    if (!res.ok) throw new Error('Failed to remove assignment')
  },

  // ---- Groups ----
  async getGroups(): Promise<TrainingGroup[]> {
    const res = await fetch('/api/training/groups', { headers: authHeaders() })
    if (!res.ok) return []
    return (await res.json()).groups ?? []
  },

  async createGroup(input: CreateGroupInput): Promise<TrainingGroup> {
    const res = await fetch('/api/training/groups', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(input),
    })
    if (!res.ok) throw new Error('Failed to create group')
    return (await res.json()).group
  },

  // ---- Volunteer learning view ----
  async getAssignedModules(): Promise<AssignedModule[]> {
    const res = await fetch('/api/training/assigned', { headers: authHeaders() })
    if (!res.ok) return []
    return (await res.json()).modules ?? []
  },

  // ---- Tracking ----
  async track(
    itemId: string,
    event: 'video_watched' | 'doc_downloaded' | 'doc_acknowledged' | 'time_tick',
    seconds?: number
  ): Promise<TrainingItemProgress | null> {
    const res = await fetch('/api/training/track', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ item_id: itemId, event, ...(seconds ? { seconds } : {}) }),
    })
    if (!res.ok) return null
    return (await res.json()).progress ?? null
  },

  async submitQuizResult(itemId: string, passed: boolean, score?: number): Promise<void> {
    const res = await fetch('/api/training/quiz-result', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ item_id: itemId, passed, score }),
    })
    if (!res.ok) throw new Error('Failed to submit quiz result')
  },

  // ---- Progress / events read ----
  async getProgress(
    scope: 'my' | 'all' = 'my',
    opts: { employeeId?: string; moduleId?: string } = {}
  ): Promise<TrainingProgress[]> {
    const params = new URLSearchParams({ scope })
    if (opts.employeeId) params.set('employee_id', opts.employeeId)
    if (opts.moduleId) params.set('module_id', opts.moduleId)
    const res = await fetch(`/api/training/progress?${params.toString()}`, {
      headers: authHeaders(),
    })
    if (!res.ok) return []
    return (await res.json()).progress ?? []
  },

  async getEvents(
    scope: 'my' | 'all' = 'my',
    opts: { employeeId?: string; moduleId?: string } = {}
  ): Promise<TrainingEvent[]> {
    const params = new URLSearchParams({ scope })
    if (opts.employeeId) params.set('employee_id', opts.employeeId)
    if (opts.moduleId) params.set('module_id', opts.moduleId)
    const res = await fetch(`/api/training/events?${params.toString()}`, {
      headers: authHeaders(),
    })
    if (!res.ok) return []
    return (await res.json()).events ?? []
  },
}
