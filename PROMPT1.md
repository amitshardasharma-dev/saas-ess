# PROMPT.md — Birch ESS: typed/linked onboarding steps + auto-complete wiring

## Mission
Implement the keystone P0 feature from the Birch ESS blueprint (§6, backlog #1):
typed onboarding steps linked to real artifacts, so completing the real action
(e-sign / cert upload / training-module completion) AUTO-COMPLETES the matching
onboarding step and advances the volunteer's status. Prove it by flipping the
existing `test.fixme` volunteer onboarding spec to a genuine pass. Iterate until
the completion criterion holds.

## HARD CONSTRAINTS (never violate)
1. LOCAL/PREVIEW only. BASE_URL must be localhost or a vercel preview. If it
   points at prod or the `birch-foundation` live tenant, STOP and emit
   <prom!se>UNSAFE_TARGET</prom!se> (write the real tag, not this placeholder).
2. Work against the disposable `birch-e2e` tenant + tests/fixtures/birch-e2e.json
   from the prior loop. Extend tests/seed-birch-e2e.mjs if new seed is needed
   (e.g. step_type/ref_id columns on the seeded template). Never touch
   `birch-foundation`.
3. NEVER weaken tests to pass: do not delete/skip specs, remove assertions,
   lower thresholds, or change a spec's expected behavior to match a shortcut
   implementation. Un-skipping the BUG-002 fixme is the goal; making it pass by
   gutting it is a failure.
4. Log every code change to RALPH_LOG.md (file, why, which step-type it wires).
5. Migrations are additive + reversible. Provide an up + down. Do not drop or
   rewrite existing onboarding rows; backfill, don't destroy.

## Promise hygiene (critical — prior loop self-terminated on a leaked tag)
Never write the literal completion tag in angle-bracket form ANYWHERE except as
the genuine final signal. When stating the task is NOT done, refer to it in prose
as "the completion promise" / "the BUILT_AND_PROVEN tag". Before ending any turn,
grep your own draft for the angle-bracket tag; if it appears outside the final
signal, rewrite before sending.

## Scope of the build (from blueprint §6)
Data model — extend `ess_onboarding_steps` (and the template definition):
- step_type: profile_field | doc_sign | doc_ack | certification | training | manual
- ref_kind + ref_id: the linked document_id / cert_type_id / training_module_id
- auto_complete: bool

Templates become first-class:
- ess_onboarding_templates: one per program, ordered list of typed steps.
- On profile creation, assign the template by the volunteer's program/role
  (use the §3.5 matrix already seeded for birch-e2e).

Auto-completion wiring — on each real artifact event, find the volunteer's
matching step by (step_type + ref_id) and complete it, then advanceOnboarding():
- e-sign signed event  -> doc_sign / doc_ack step
- certification insert  -> certification step (match cert_type_id)
- training module 100%  -> training step (match module_id)
- manual task           -> staff tick (already exists; just ensure it advances)

Status rollup: not_started -> in_progress -> completed driven by step completion.

## What is OUT of scope (flag, don't build)
If you hit anything needing a product/design call (e.g. the BUG-003 checklist
styling, or ambiguous per-role required-step disagreements with §3.5), log it to
BUGS.md with a proposed fix and move on. Don't redesign the matrix.

## The gate (the one spec that must go green)
The volunteer onboarding flow spec currently marked test.fixme (BUG-002).
Un-skip it and make it pass honestly. It must assert the FULL chain for at least
the Street Outreach volunteer:
- login -> My Onboarding renders typed steps + progress bar
- e-sign Volunteer Agreement -> signed PDF on profile AND its onboarding step
  auto-flips to done (no manual tick)
- upload Police Check + Blue Card w/ expiry -> each certification step
  auto-completes; cert lands in compliance register
- complete a training module (video ack + doc ack) + pass its quiz -> module
  hits 100% AND the training step auto-completes
- after all required steps: status == completed; before that: in_progress
- NEGATIVE: completing an artifact for a step NOT in this volunteer's template
  does NOT complete some other volunteer's step, and does NOT advance anyone
  cross-tenant (re-assert isolation around the new wiring)
If the existing fixme spec under-covers this chain, STRENGTHEN it to cover the
above — adding assertions is allowed and encouraged; removing them is not.

## Per-iteration procedure
1. Read RALPH_LOG.md, BUGS.md, REPORT.md -> see prior progress + open items.
2. Run migrations against the local birch-e2e DB; run seed if schema changed.
3. typecheck -> lint -> `playwright test` (full suite, not just the gate, to
   catch regressions in the 84 already-green tests).
4. Implement the next slice of wiring. After each change, re-run the affected
   spec(s).
5. Regenerate REPORT.md + screenshots + HTML report.
6. Append all code changes to RALPH_LOG.md; flag out-of-scope finds in BUGS.md.

## Completion criterion (machine-checkable)
Emit <prom!se>BUILT_AND_PROVEN</prom!se> (real tag) only when ALL hold:
- typecheck clean AND lint clean
- the BUG-002 onboarding spec is un-skipped and PASSES, asserting the full
  auto-complete chain above (all four step types: doc_sign, doc_ack,
  certification, training) plus the negative/isolation case
- the prior 84 tests still pass (0 regressions); any newly-red pre-existing test
  is either fixed or triaged in BUGS.md with repro + severity
- the e-sign / cert-insert / training-completion -> step auto-complete is proven
  by the spec, not by a manual tick or a test shortcut
- migration has up + down; seed updated; no `birch-foundation` rows touched
- REPORT.md + artifacts/screens/ + HTML report regenerated this run
- RALPH_LOG.md reflects every code change
- BUG-002 moved to RESOLVED in BUGS.md with the commit/range that closed it
If a tenant-isolation assertion around the new wiring fails, mark it P0 in
BUGS.md and do NOT paper over it — fix the wiring so isolation holds, then pass.