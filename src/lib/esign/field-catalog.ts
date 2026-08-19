// The e-sign field palette: the single source of truth mapping each field "kind"
// to its input type, default label, and (for auto-fill) which profile value seeds
// it. Used by the designer (palette) and the signer (auto-fill + rendering).
import type { FieldType, FieldKind } from '@/types/esign'

export interface SignerProfile {
  fullName: string | null
  email: string | null
  employeeNo: string | null
}

export interface FieldCatalogEntry {
  kind: FieldKind
  type: FieldType
  label: string
  /** Short palette caption. */
  palette: string
  /** Default box size as page ratios (w, h). */
  size: { w: number; h: number }
  /** Derive the auto-fill value from the signer's profile (null = no auto-fill). */
  prefill?: (p: SignerProfile) => string | null
}

const firstWord = (s: string | null) => (s ? s.trim().split(/\s+/)[0] || '' : '')
const restWords = (s: string | null) => (s ? s.trim().split(/\s+/).slice(1).join(' ') : '')

export const FIELD_CATALOG: Record<FieldKind, FieldCatalogEntry> = {
  full_name: { kind: 'full_name', type: 'text', label: 'Full name', palette: 'Full name', size: { w: 0.3, h: 0.035 }, prefill: (p) => p.fullName },
  first_name: { kind: 'first_name', type: 'text', label: 'First name', palette: 'First name', size: { w: 0.22, h: 0.035 }, prefill: (p) => firstWord(p.fullName) || null },
  last_name: { kind: 'last_name', type: 'text', label: 'Last name', palette: 'Last name', size: { w: 0.22, h: 0.035 }, prefill: (p) => restWords(p.fullName) || null },
  email: { kind: 'email', type: 'text', label: 'Email', palette: 'Email', size: { w: 0.3, h: 0.035 }, prefill: (p) => p.email },
  phone: { kind: 'phone', type: 'text', label: 'Phone', palette: 'Phone', size: { w: 0.24, h: 0.035 }, prefill: () => null },
  address: { kind: 'address', type: 'text', label: 'Address', palette: 'Address', size: { w: 0.42, h: 0.035 }, prefill: () => null },
  employee_no: { kind: 'employee_no', type: 'text', label: 'Member / staff no.', palette: 'Member no.', size: { w: 0.22, h: 0.035 }, prefill: (p) => p.employeeNo },
  dob: { kind: 'dob', type: 'date', label: 'Date of birth', palette: 'Date of birth', size: { w: 0.2, h: 0.035 }, prefill: () => null },
  date: { kind: 'date', type: 'date', label: 'Date', palette: 'Date', size: { w: 0.2, h: 0.035 }, prefill: () => null },
  number: { kind: 'number', type: 'text', label: 'Number', palette: 'Number', size: { w: 0.18, h: 0.035 }, prefill: () => null },
  id_number: { kind: 'id_number', type: 'text', label: 'Document / ID number', palette: 'ID number', size: { w: 0.28, h: 0.035 }, prefill: () => null },
  custom: { kind: 'custom', type: 'text', label: 'Text', palette: 'Custom text', size: { w: 0.28, h: 0.035 }, prefill: () => null },
}

/** The palette the designer shows, in order. Signature first, then smart fields, then generic. */
export const PALETTE_KINDS: FieldKind[] = [
  'full_name', 'first_name', 'last_name', 'email', 'phone', 'address',
  'employee_no', 'id_number', 'dob', 'date', 'number', 'custom',
]

/** Auto-fill value for a placed field from the signer's profile, or null. */
export function autoFillValue(kind: FieldKind, profile: SignerProfile): string | null {
  const entry = FIELD_CATALOG[kind]
  return entry?.prefill ? entry.prefill(profile) : null
}
