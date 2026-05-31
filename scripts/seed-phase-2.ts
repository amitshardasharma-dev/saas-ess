/**
 * Phase 2 seed — idempotent.
 *
 * Creates a default onboarding template + steps for each company and backfills
 * onboarding state rows for existing employees that do not yet have one.
 *
 * Run with the SERVICE ROLE key (bypasses RLS). DO NOT run automatically.
 *   npx ts-node scripts/seed-phase-2.ts
 */
import { createClient } from '@supabase/supabase-js';

const DEFAULT_TEMPLATE_NAME = 'Default onboarding';
const DEFAULT_STEPS: { title: string; description: string; sort_order: number }[] = [
  { title: 'Complete your profile', description: 'Add your personal details.', sort_order: 0 },
  { title: 'Review the volunteer handbook', description: 'Read and acknowledge the handbook.', sort_order: 1 },
  { title: 'Sign required documents', description: 'Complete any documents assigned to you.', sort_order: 2 },
  { title: 'Meet your team', description: 'Introductory session with your org unit.', sort_order: 3 },
];

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }
  const supabase = createClient(url, serviceKey);

  const { data: companies, error: companiesError } = await supabase
    .from('ess_companies')
    .select('id');
  if (companiesError) {
    throw companiesError;
  }

  for (const company of (companies ?? []) as { id: string }[]) {
    const companyId = company.id;

    // 1. Default template (idempotent on name + is_default).
    let { data: template } = await supabase
      .from('ess_onboarding_templates')
      .select('id')
      .eq('company_id', companyId)
      .eq('is_default', true)
      .maybeSingle();

    if (!template) {
      const { data: created } = await supabase
        .from('ess_onboarding_templates')
        .insert({
          company_id: companyId,
          name: DEFAULT_TEMPLATE_NAME,
          description: 'Standard onboarding checklist.',
          is_default: true,
        })
        .select('id')
        .single();
      template = created;
    }

    if (template) {
      // 2. Template steps (idempotent: only insert if none exist).
      const { data: existingSteps } = await supabase
        .from('ess_onboarding_steps')
        .select('id')
        .eq('company_id', companyId)
        .eq('template_id', template.id);

      if (!existingSteps || existingSteps.length === 0) {
        await supabase.from('ess_onboarding_steps').insert(
          DEFAULT_STEPS.map((s) => ({
            company_id: companyId,
            template_id: template!.id,
            title: s.title,
            description: s.description,
            sort_order: s.sort_order,
            status: 'pending',
          }))
        );
      }
    }

    // 3. Backfill onboarding state rows for employees missing one.
    const { data: employees } = await supabase
      .from('ess_employees')
      .select('id')
      .eq('company_id', companyId);

    for (const emp of (employees ?? []) as { id: string }[]) {
      const { data: state } = await supabase
        .from('ess_onboarding_states')
        .select('id')
        .eq('company_id', companyId)
        .eq('employee_id', emp.id)
        .maybeSingle();

      if (!state) {
        await supabase.from('ess_onboarding_states').insert({
          company_id: companyId,
          employee_id: emp.id,
          status: 'not_started',
        });
      }
    }
  }

  // eslint-disable-next-line no-console
  console.log('Phase 2 seed complete.');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
