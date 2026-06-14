/**
 * @jest-environment node
 */
import * as fs from 'fs';
import * as path from 'path';

const PHASE_2_TABLES = [
  'ess_onboarding_templates',
  'ess_onboarding_steps',
  'ess_onboarding_states',
];

function readMigration(): string {
  return fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/020_onboarding.sql'),
    'utf8'
  );
}

describe('Phase 2 RLS contract', () => {
  const sql = readMigration();

  it.each(PHASE_2_TABLES)('table %s has a company_id column', (table: string) => {
    const createIdx = sql.indexOf(`create table if not exists ${table}`);
    expect(createIdx).toBeGreaterThanOrEqual(0);
    const block = sql.slice(createIdx, sql.indexOf(');', createIdx));
    expect(block).toMatch(/company_id uuid not null references ess_companies\(id\)/);
  });

  it.each(PHASE_2_TABLES)('table %s enables RLS', (table: string) => {
    expect(sql).toContain(`alter table ${table} enable row level security`);
  });

  it.each(PHASE_2_TABLES)('table %s has a tenant_isolation policy', (table: string) => {
    expect(sql).toContain(`create policy tenant_isolation on ${table}`);
  });

  it('uses current_company_id() in the isolation policy', () => {
    expect(sql).toContain('company_id = current_company_id()');
  });
});
