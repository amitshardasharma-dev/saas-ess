// src/services/phase7-client.ts
//
// Phase 7 — thin client-side fetch helpers (matches the existing src/services/*
// convention, _SHARED_CONVENTIONS §6.2). Bearer token from localStorage.

const getToken = () => (typeof window !== 'undefined' ? localStorage.getItem('ess_access_token') : null)

export const authHeaders = (): HeadersInit => {
  const token = getToken()
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: authHeaders() })
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
  const json = (await res.json()) as { data: T }
  return json.data
}

export async function apiSend<T>(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: authHeaders(),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  if (!res.ok) throw new Error(`${method} ${path} failed: ${res.status}`)
  const json = (await res.json().catch(() => ({}))) as { data?: T }
  return json.data as T
}

/** Trigger a file download from an export endpoint (CSV/XLSX) honouring auth. */
export async function downloadExport(path: string, fallbackName: string): Promise<void> {
  const res = await fetch(path, { headers: authHeaders() })
  if (!res.ok) throw new Error(`Export ${path} failed: ${res.status}`)
  const blob = await res.blob()
  const disposition = res.headers.get('Content-Disposition') ?? ''
  const match = /filename="([^"]+)"/.exec(disposition)
  const filename = match ? match[1] : fallbackName
  const objUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(objUrl)
}
