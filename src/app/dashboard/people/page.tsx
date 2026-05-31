import { createRouteClient } from '@/lib/auth-middleware';
import { loadPeople } from './people-data';
import { PeopleTable } from './people-table';

// Admin "People" dashboard. Searchable/filterable by role, org unit and
// onboarding status. Cross-phase columns degrade gracefully to "—".
export default async function PeoplePage() {
  const supabase = createRouteClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <div>Please sign in.</div>;
  }

  const { data: employee } = await supabase
    .from('ess_employees')
    .select('company_id, role')
    .eq('auth_user_id', user.id)
    .single();

  if (!employee) {
    return <div>No employee record.</div>;
  }

  const people = await loadPeople(employee.company_id);

  return (
    <div>
      <h1>People</h1>
      <PeopleTable people={people} />
    </div>
  );
}
