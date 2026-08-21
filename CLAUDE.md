# saas-ess — ESS Portal (Employee Self-Service)

Multi-tenant Next.js 15 (App Router, React 19) + Supabase HR / volunteer-management app.
Primary client: **Birch Foundation**. Production: **https://ess.mosping.com** (also `saas-ess.vercel.app`).


## ⚠️ Tenant data safety — READ FIRST

**Never modify another tenant's data without the user's explicit permission. Reading is fine.**

| Tenant | Who owns it | What I may do |
|---|---|---|
| `birch-foundation` | The live customer | **READ ONLY** |
| `birch-e2e` | A customer actively tests here (it displays as "Birch Foundation" via `settings.brand_name`) | **READ ONLY — never reseed** |
| `mosping` | Mine, for testing | Seed / destroy freely |

Do all seeding, load tests and destructive experiments in **`mosping`**.

`tests/seed-birch-e2e.mjs` DESTROYS content (documents, certifications, training,
onboarding, messages) in the tenant it targets. It is hard-guarded: `PROTECTED_SLUGS`
(birch-foundation, birch-e2e) always refuse, and only `ALLOWED_SLUGS` (mosping) may run.
Do not add a customer tenant to that allow-list.

History (2026-08-21): reseeding `birch-e2e` repeatedly wiped a customer's manually added
people and their onboarding checklists ("0 of 0 steps"). Restored by re-running
initOnboarding's logic. The guard exists so that cannot recur.


---

## Repository & Git identity — VERIFIED 2026-08-19

- **Push to the `saas-ess` remote, NOT `origin`:**
  - `saas-ess` → `git@github-dev:amitshardasharma-dev/saas-ess.git`  ← **use this**
  - `origin`   → `https://github.com/myselfamitsharma/ess.git`        ← do NOT use
- The `saas-ess` remote resolves via the SSH host alias **`github-dev`**, which uses the **`~/.ssh/github_dev`** key.
  There are two GitHub keys on this machine — `github_dev` and `github_personal`. **This repo uses `github_dev`** (the `amitshardasharma-dev` GitHub account).
- **Git author identity (already set in this repo — keep it):**
  - name:  `Amit Sharma`
  - email: **`amit.sharda.sharma@gmail.com`**  ← always use this email for commits here
- End commit messages with the usual `Co-Authored-By: Claude …` trailer.

## Deploy — VERIFIED 2026-08-19

- **Push to `saas-ess` `main` → Vercel auto-deploys to production.** No manual `vercel --prod` needed
  (verified repeatedly; the Vercel project's production branch is `main`).
- Vercel project: **saas-ess** (`prj_BWuCqdxfXYEzzly5Yn38fCF8vi1b`) in team **"amitshardasharma's projects"** (`team_K2zrBZ2a5cdOkykhiyhmoCqB`).
- Vercel **CLI** is signed in as `amitshardasharma-dev` and linked to this project (`.vercel/project.json`).
  Token file: `~/Library/Application Support/com.vercel.cli/auth.json`.
- Production domain **`ess.mosping.com`** is attached with a Let's Encrypt cert. **mosping.com DNS is hosted at GoDaddy**
  (nameservers `ns15/ns16.domaincontrol.com`) — subdomain DNS records are added at GoDaddy, not Vercel.
- The Claude↔Vercel **MCP** is on a *different* Vercel account and 403s for this team → **use the Vercel CLI** for Vercel actions here.
- Set `NEXT_PUBLIC_APP_URL=https://ess.mosping.com` (Production env var) so email links (invite / reset / reminder) use the domain;
  it currently falls back to `saas-ess.vercel.app` in code.

## Supabase — VERIFIED 2026-08-19

- Project ref: **`bjbqkhhziurvmjwqoitk`** (shared Postgres). Reachable via the **Supabase MCP**
  (verified: `execute_sql` / `apply_migration` work; 10 companies present).
- App uses the **service-role** client (`supabaseAdmin` from `@/lib/supabase-admin`); tenant isolation is enforced in
  app code by `company_id`, not RLS.
- Auth is the app's **own JWT** (`/api/auth/login` + localStorage tokens) — NOT Supabase Auth email/OAuth flows,
  so a domain move needs no Supabase redirect-URL changes.
- Apply migrations via the MCP `apply_migration` with paired `.sql` + `.down.sql` files under `supabase/migrations/`.
- Never modify the live `birch-foundation` tenant; use the disposable **`birch-e2e`** test tenant
  (company id `b8802761-3dcf-4707-b572-e0413c53ab23`).

## Verify / test gate (before committing non-trivial changes)

`npx tsc --noEmit` · `npx eslint` · `npx jest` · `npm run build` (**always run after route/hook changes** — a `next build`
suspense error won't show in tsc/jest) · E2E: reseed `node tests/seed-birch-e2e.mjs`, then
`E2E_BASE=http://localhost:3001 npx playwright test --project=birch`.
