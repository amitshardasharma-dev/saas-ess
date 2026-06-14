# Phase 4 — E-Signatures & In-Portal Document Completion

> **Self-contained build doc.** Read `_SHARED_CONVENTIONS.md` first. Migration block:
> **`030`–`034`**. Brief module: 3. Can run fully in parallel with Phase 5.

---

## 1. Mission
Extend the existing document library (migration 002: `ess_documents`,
`ess_document_versions`, `ess_document_acknowledgments`) with:
1. **In-portal document completion** — volunteer fills required fields within the portal
   (no print/scan).
2. **Digital signature capture** — typed-name and/or drawn signature, bound to the doc +
   version, with timestamp + signer identity.
3. **Signed-document storage** linked to the user's profile (immutable signed copy).
4. **Signature audit trail** — who signed what version, when, from where (IP/time).

## 2. Reuse note
Build ON the existing documents module — do not fork it. Add signing as a new capability
referencing `ess_documents`/`ess_document_versions`. The existing "acknowledge" flow stays;
signing is the stronger, legally-meaningful action.

## 3. Owned files / namespace
- `src/app/dashboard/documents/sign/**` and `src/app/dashboard/documents/[id]/sign/**` (new)
- `src/components/documents/signing/**` (new — fillable form renderer, signature pad)
- `src/app/api/documents/[id]/fields/**`, `src/app/api/documents/[id]/sign/**`,
  `src/app/api/signed-documents/**` (new)
- `src/services/esign.ts`, `src/types/esign.ts` (new)
- `src/lib/esign/**` (new — signed-PDF generation, hash)
- `src/config/nav/phase-4-esign.nav.tsx` + append PHASE-4 nav markers
- `supabase/migrations/030_*.sql`…`034_*.sql`
- `scripts/seed-phase-4.ts`

## 4. Migrations (block 030–034)
- **`030_document_fields.sql`** — `ess_document_fields` — fillable field definitions on a
  document version: `id, company_id, document_id, version_id, field_key, label, type text
  check in ('text','date','checkbox','signature'), required boolean, sort_order`. RLS.
- **`031_signed_documents.sql`** — `ess_signed_documents` — `id, company_id, document_id,
  version_id, employee_id, signer_name text, signature_type text check in ('typed','drawn'),
  signature_data text (data-url or storage path), field_values jsonb, signed_pdf_url text,
  content_hash text, signed_at timestamptz, ip_address text, user_agent text`. Indexes on
  `(company_id)`, `(employee_id)`, `(document_id)`. RLS. **Immutable**: no UPDATE policy
  (insert + select only); a re-sign creates a new row.
- **`032_esign_audit.sql`** — `ess_esign_events` — append-only audit
  (`signed_document_id`, `event text`, `actor`, `at`, `ip`, `meta`). RLS via parent.
- `033`–`034` reserved.

## 5. Work items
- **Field designer** (Staff/Admin): define fillable fields on a document version
  (`/dashboard/documents/[id]/sign` manage tab). Store in `ess_document_fields`.
- **Signing experience** (volunteer): render the document + fillable fields; signature pad
  (drawn, via canvas) and/or typed-name. On submit:
  - Validate all required fields.
  - Generate an **immutable signed PDF** (embed field values + signature + signer identity +
    timestamp). Use a lightweight server-side PDF lib (e.g. `pdf-lib@^1.17`). Store the PDF
    in Supabase Storage bucket `signed-documents` (private).
  - Compute `content_hash` (sha256 of the signed PDF) for tamper-evidence.
  - Insert `ess_signed_documents` + `ess_esign_events` (`signed`), capturing IP + user agent
    from the request. Call `recordAudit` (Phase 0).
  - Call Phase 2 `advanceOnboarding(employeeId)` if this doc is an onboarding step (contract; guard).
- **Profile linkage**: signed docs appear on the user's profile (Phase 2 widget reads
  `ess_signed_documents`) and in a Staff/Admin "signature status" view (who has/hasn't signed
  a required doc — reuse acknowledgment-tracking UI patterns).
- **Storage security**: private bucket; downloads via short-lived signed URLs through an API
  route that re-checks `company_id` ownership (avoid the IDOR class from the audit).

## 6. Contracts PUBLISHED
- `ess_document_fields`, `ess_signed_documents`, `ess_esign_events`.
- `GET /api/signed-documents?employee_id=&document_id=` (scoped) — Phase 2 profile widget +
  Phase 7 reporting read these.
- Storage bucket `signed-documents` (private; access only via ownership-checked route).

## 7. Contracts CONSUMED (stub if needed)
- Phase 0: Storage conventions, `recordAudit`, baseline schema (`ess_employees`).
- Phase 1: `useLabels` (term `document`), nav markers, `MODULE_IDS` (`documents_esign`),
  `assertModuleEnabled`.
- Phase 2: `advanceOnboarding` (optional, guard).
- Existing documents module (002) — read-only reference to `ess_documents`/versions.

## 8. Tests
- Required-field validation blocks submission.
- A completed signing inserts an immutable signed-doc row + audit event; UPDATE is denied by RLS.
- `content_hash` is stable for identical input and changes if the PDF changes.
- Cross-tenant: tenant-B cannot read tenant-A signed docs (route 404 + RLS denial).
- Signed-PDF download route rejects cross-tenant ids.

## 9. Seed (`scripts/seed-phase-4.ts`)
- A "Volunteer Code of Conduct" document with typed-name signature field; one volunteer who
  has signed and one who hasn't.

## 10. Acceptance criteria
- [ ] Volunteer completes + signs a document in-portal; an immutable signed PDF is stored
      and linked to their profile with full audit (who/what version/when/IP).
- [ ] Staff can see who has/hasn't signed a required document.
- [ ] Re-signing creates a new immutable record; old one is preserved.
- [ ] Downloads are ownership-checked. RLS + tests pass; `pnpm build` passes.

## 11. MERGE_NOTES
Migrations 030(+); PHASE-4 nav append; `pdf-lib` dependency; storage bucket
`signed-documents`; any onboarding hook calls.
