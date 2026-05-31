'use client';

import { useEffect, useState } from 'react';
import { PeopleTable } from './people-table';
import type { PersonRow } from './people-data';

// Admin "People" dashboard. Searchable/filterable by role, org unit and
// onboarding status. Cross-phase columns degrade gracefully to "—".
export default function PeoplePage() {
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const token =
          typeof window !== 'undefined'
            ? localStorage.getItem('ess_access_token')
            : null;
        const res = await fetch('/api/people', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as { people: PersonRow[] };
        if (active) {
          setPeople(data.people ?? []);
        }
      } catch (e) {
        if (active) {
          setError(e instanceof Error ? e.message : 'failed to load');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div>
      <h1>People</h1>
      {loading ? <p>Loading…</p> : null}
      {error ? <p role="alert">Could not load people: {error}</p> : null}
      {!loading && !error ? <PeopleTable people={people} /> : null}
    </div>
  );
}
